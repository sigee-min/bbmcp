import type { CanonicalChannelKey, CanonicalExportModel } from '../types';
import type { BuiltSampler, GltfAnimation, GltfAnimationChannel, GltfAnimationSampler } from './document';
import type { Vec3, Vec4 } from './primitives';
import { quatFromEulerDegXYZ, quatMul, quatNormalize, sanitizeNumber, vec3Add, vec3Mul } from './primitives';

const channelOrder = (channel: 'pos' | 'rot' | 'scale'): number => {
  if (channel === 'pos') return 0;
  if (channel === 'rot') return 1;
  return 2;
};

const normalizeTimeEpsilon = (value: unknown): number => {
  const eps = sanitizeNumber(value);
  return eps === 0 ? 1e-9 : eps;
};

const quantizeTime = (t: unknown, epsilon: number): number => {
  const time = sanitizeNumber(t);
  const factor = 1 / epsilon;
  return Math.round(time * factor) / factor;
};

const timeBucket = (t: number, epsilon: number): number => Math.round(quantizeTime(t, epsilon) / epsilon);

type DecodedChannelKey = CanonicalChannelKey & { bucket: number; timeN: number };

const decodeTrackKeys = (keys: CanonicalChannelKey[], epsilon: number): DecodedChannelKey[] => {
  const buckets = new Map<number, DecodedChannelKey>();
  for (const key of keys) {
    const timeN = quantizeTime(key.time, epsilon);
    const bucket = timeBucket(key.time, epsilon);
    // Same bucket => last key wins.
    buckets.set(bucket, { ...key, bucket, timeN } as DecodedChannelKey);
  }
  return [...buckets.values()].sort((a, b) => a.bucket - b.bucket);
};

const pickInterpolation = (
  keys: Array<{ interp?: 'linear' | 'step' | 'catmullrom' }>,
  warnings: Set<string>
): 'STEP' | 'LINEAR' => {
  const set = new Set<'linear' | 'step' | 'catmullrom'>();
  let hasCatmull = false;
  for (const key of keys) {
    const interp = key.interp ?? 'linear';
    if (interp === 'catmullrom') hasCatmull = true;
    set.add(interp);
  }
  if (set.size > 1) warnings.add('GLT-WARN-MIXED_INTERP');
  if (hasCatmull) warnings.add('GLT-WARN-INTERP_DEGRADED');
  if (set.size === 1 && set.has('step')) return 'STEP';
  return 'LINEAR';
};

export const buildAnimations = (params: {
  model: CanonicalExportModel;
  rootBoneIndex: number;
  boneIndexByName: Map<string, number>;
  boneLocalTranslation: (idx: number) => Vec3;
  boneBaseRotationQuat: (idx: number) => Vec4;
  boneBaseScale: (idx: number) => Vec3;
  warnings: Set<string>;
}): {
  animations: GltfAnimation[];
  samplersByAnimation: BuiltSampler[][];
} => {
  const {
    model,
    rootBoneIndex,
    boneIndexByName,
    boneLocalTranslation,
    boneBaseRotationQuat,
    boneBaseScale,
    warnings
  } = params;

  const epsilon = normalizeTimeEpsilon(model.timePolicy.timeEpsilon);
  const samplersByAnimation: BuiltSampler[][] = [];
  const animations: GltfAnimation[] = [];
  let anyTriggers = false;
  model.animations.forEach((clip) => {
    if (clip.triggers.length > 0) anyTriggers = true;

    const builtSamplers: BuiltSampler[] = [];
    const tracks = [...clip.channels].sort((a, b) => {
      const ai = boneIndexByName.get(a.bone) ?? rootBoneIndex;
      const bi = boneIndexByName.get(b.bone) ?? rootBoneIndex;
      if (ai !== bi) return ai - bi;
      return channelOrder(a.channel) - channelOrder(b.channel);
    });

    tracks.forEach((track) => {
      const boneIdx = boneIndexByName.get(track.bone);
      const nodeIndex = boneIdx === undefined ? rootBoneIndex : boneIdx;
      if (boneIdx === undefined) warnings.add('GLT-WARN-ORPHAN_GEOMETRY');

      const baseT = boneLocalTranslation(nodeIndex);
      const baseR = boneBaseRotationQuat(nodeIndex);
      const baseS = boneBaseScale(nodeIndex);

      const decoded = decodeTrackKeys(track.keys, epsilon);
      if (decoded.length === 0) return;

      const interpolation = pickInterpolation(decoded, warnings);

      if (track.channel === 'pos') {
        const inputTimes = decoded.map((k) => k.timeN);
        const outputValues: number[] = [];
        decoded.forEach((k) => {
          const vKey = (k.vector ?? [0, 0, 0]) as Vec3;
          const t = vec3Add(baseT, vKey);
          outputValues.push(t[0], t[1], t[2]);
        });
        builtSamplers.push({
          inputTimes,
          outputValues,
          outputType: 'VEC3',
          interpolation,
          nodeIndex,
          path: 'translation'
        });
        return;
      }

      if (track.channel === 'scale') {
        const inputTimes = decoded.map((k) => k.timeN);
        const outputValues: number[] = [];
        decoded.forEach((k) => {
          const vKey = (k.vector ?? [1, 1, 1]) as Vec3;
          const s = vec3Mul(baseS, vKey);
          outputValues.push(s[0], s[1], s[2]);
        });
        builtSamplers.push({
          inputTimes,
          outputValues,
          outputType: 'VEC3',
          interpolation,
          nodeIndex,
          path: 'scale'
        });
        return;
      }

      // rot
      const inputTimes = decoded.map((k) => k.timeN);
      const outputValues: number[] = [];
      decoded.forEach((k) => {
        const vKey = (k.vector ?? [0, 0, 0]) as Vec3;
        const delta = quatFromEulerDegXYZ(vKey);
        const q = quatNormalize(quatMul(baseR, delta));
        outputValues.push(q[0], q[1], q[2], q[3]);
      });
      builtSamplers.push({
        inputTimes,
        outputValues,
        outputType: 'VEC4',
        interpolation,
        nodeIndex,
        path: 'rotation'
      });
    });

    const samplers: GltfAnimationSampler[] = [];
    const channels: GltfAnimationChannel[] = [];
    builtSamplers.forEach((sampler, idx) => {
      // Accessor indices are assigned later during packing.
      samplers.push({
        input: -1,
        output: -1,
        interpolation: sampler.interpolation
      });
      channels.push({
        sampler: idx,
        target: { node: sampler.nodeIndex, path: sampler.path }
      });
    });

    animations.push({
      name: clip.name,
      samplers,
      channels,
      extras: {
        ashfox: {
          loop: Boolean(clip.loop),
          length: sanitizeNumber(clip.length),
          ...(clip.fps !== undefined ? { fps: sanitizeNumber(clip.fps) } : {})
        }
      }
    });
    samplersByAnimation.push(builtSamplers);
  });

  if (anyTriggers) warnings.add('GLT-WARN-TRIGGERS_DROPPED');

  return {
    animations,
    samplersByAnimation
  };
};
