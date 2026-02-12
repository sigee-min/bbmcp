import type { SessionState, TrackedAnimationChannel } from '../../session';
import type {
  CanonicalAnimation,
  CanonicalAnimationChannel,
  CanonicalAnimationChannelTrack,
  CanonicalAnimationTriggerTrack,
  CanonicalChannelKey,
  CanonicalCube,
  CanonicalExportModel
} from './codecs/types';

const DEFAULT_TEXTURE_SIZE = 64;

const sanitizeNumber = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return numeric;
};

const sanitizeVec3 = (value: [number, number, number] | undefined): [number, number, number] | undefined => {
  if (!value) return undefined;
  return [sanitizeNumber(value[0]), sanitizeNumber(value[1]), sanitizeNumber(value[2])];
};

const sanitizeOptionalArray = (value: unknown): unknown[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => (typeof entry === 'number' ? sanitizeNumber(entry) : entry));
};

const sanitizeRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
};

const cloneTriggerValue = (value: string | string[] | Record<string, unknown>): typeof value => {
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === 'string' ? entry : String(entry))) as typeof value;
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.parse(JSON.stringify(value)) as typeof value;
  }
  return value;
};

const sortByTime = <T extends { time: number }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.time - b.time);

const normalizeChannel = (channel: string): CanonicalAnimationChannel => {
  if (channel === 'pos') return 'pos';
  if (channel === 'scale') return 'scale';
  return 'rot';
};

const buildCanonicalCube = (cube: SessionState['cubes'][number]): CanonicalCube => ({
  id: cube.id,
  name: cube.name,
  bone: cube.bone,
  from: [
    sanitizeNumber(cube.from[0]),
    sanitizeNumber(cube.from[1]),
    sanitizeNumber(cube.from[2])
  ],
  to: [sanitizeNumber(cube.to[0]), sanitizeNumber(cube.to[1]), sanitizeNumber(cube.to[2])],
  origin: sanitizeVec3(cube.origin),
  rotation: sanitizeVec3(cube.rotation),
  uv: cube.uv ? [sanitizeNumber(cube.uv[0]), sanitizeNumber(cube.uv[1])] : undefined,
  uvOffset: cube.uvOffset
    ? [sanitizeNumber(cube.uvOffset[0]), sanitizeNumber(cube.uvOffset[1])]
    : undefined,
  inflate: cube.inflate !== undefined ? sanitizeNumber(cube.inflate) : undefined,
  mirror: cube.mirror
});

const buildChannelKeys = (
  keys: TrackedAnimationChannel['keys']
): CanonicalChannelKey[] =>
  sortByTime(
    keys.map((key: TrackedAnimationChannel['keys'][number]) => ({
      time: sanitizeNumber(key.time),
      vector: [
        sanitizeNumber(key.value[0]),
        sanitizeNumber(key.value[1]),
        sanitizeNumber(key.value[2])
      ],
      interp: key.interp,
      easing: typeof key.easing === 'string' ? key.easing : undefined,
      easingArgs: sanitizeOptionalArray(key.easingArgs),
      pre: sanitizeVec3(key.pre),
      post: sanitizeVec3(key.post),
      bezier: sanitizeRecord(key.bezier)
    }))
  );

const buildCanonicalChannels = (
  channels: SessionState['animations'][number]['channels'] | undefined
): CanonicalAnimationChannelTrack[] => {
  if (!Array.isArray(channels)) return [];
  return channels
    .map((channel) => ({
      bone: channel.bone,
      channel: normalizeChannel(channel.channel),
      keys: buildChannelKeys(channel.keys)
    }))
    .filter((track) => track.keys.length > 0);
};

const buildCanonicalTriggers = (
  triggers: SessionState['animations'][number]['triggers'] | undefined
): CanonicalAnimationTriggerTrack[] => {
  if (!Array.isArray(triggers)) return [];
  return triggers
    .map((trigger) => ({
      type: trigger.type,
      keys: sortByTime(
        trigger.keys.map((key) => ({
          time: sanitizeNumber(key.time),
          value: cloneTriggerValue(key.value)
        }))
      )
    }))
    .filter((track) => track.keys.length > 0);
};

const buildCanonicalAnimations = (
  animations: SessionState['animations']
): CanonicalAnimation[] =>
  animations.map((animation) => ({
    id: animation.id,
    name: animation.name,
    length: sanitizeNumber(animation.length),
    loop: Boolean(animation.loop),
    fps: animation.fps !== undefined ? sanitizeNumber(animation.fps) : undefined,
    channels: buildCanonicalChannels(animation.channels),
    triggers: buildCanonicalTriggers(animation.triggers)
  }));

export const buildCanonicalExportModel = (state: SessionState): CanonicalExportModel => {
  const cubes = state.cubes.map(buildCanonicalCube);
  const bones = state.bones.map((bone) => ({
    id: bone.id,
    name: bone.name,
    parent: bone.parent,
    pivot: [
      sanitizeNumber(bone.pivot[0]),
      sanitizeNumber(bone.pivot[1]),
      sanitizeNumber(bone.pivot[2])
    ] as [number, number, number],
    rotation: sanitizeVec3(bone.rotation),
    scale: sanitizeVec3(bone.scale),
    cubes: cubes.filter((cube) => cube.bone === bone.name)
  }));
  const primaryTexture = state.textures[0];
  return {
    name: String(state.name ?? 'model'),
    formatId: state.formatId ?? null,
    texture: {
      width: primaryTexture?.width ? sanitizeNumber(primaryTexture.width) : DEFAULT_TEXTURE_SIZE,
      height: primaryTexture?.height ? sanitizeNumber(primaryTexture.height) : DEFAULT_TEXTURE_SIZE
    },
    timePolicy: state.animationTimePolicy,
    bones,
    cubes,
    meshes: (state.meshes ?? []).map((mesh) => ({
      id: mesh.id,
      name: mesh.name,
      bone: mesh.bone,
      origin: sanitizeVec3(mesh.origin),
      rotation: sanitizeVec3(mesh.rotation),
      vertices: mesh.vertices.map((vertex) => ({
        id: vertex.id,
        pos: [
          sanitizeNumber(vertex.pos[0]),
          sanitizeNumber(vertex.pos[1]),
          sanitizeNumber(vertex.pos[2])
        ]
      })),
      faces: mesh.faces.map((face) => ({
        id: face.id,
        vertices: [...face.vertices],
        uv: face.uv?.map((entry) => ({
          vertexId: entry.vertexId,
          uv: [sanitizeNumber(entry.uv[0]), sanitizeNumber(entry.uv[1])]
        })),
        texture: face.texture
      }))
    })),
    textures: state.textures.map((texture) => ({
      id: texture.id,
      name: texture.name,
      path: texture.path,
      width: texture.width !== undefined ? sanitizeNumber(texture.width) : undefined,
      height: texture.height !== undefined ? sanitizeNumber(texture.height) : undefined
    })),
    animations: buildCanonicalAnimations(state.animations)
  };
};
