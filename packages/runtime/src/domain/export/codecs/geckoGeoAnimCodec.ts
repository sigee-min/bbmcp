import type {
  CanonicalAnimation,
  CanonicalAnimationTriggerTrack,
  CanonicalChannelKey,
  CanonicalExportModel,
  CodecEncodeResult,
  ExportCodecStrategy
} from './types';

const GEO_FORMAT_VERSION = '1.12.0';
const ANIMATION_FORMAT_VERSION = '1.8.0';
const GECKO_ANIMATION_FORMAT_VERSION = 2;

const sanitizeNumber = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (Object.is(numeric, -0)) return 0;
  return numeric;
};

const sanitizeVec3 = (value: [number, number, number]): [number, number, number] => [
  sanitizeNumber(value[0]),
  sanitizeNumber(value[1]),
  sanitizeNumber(value[2])
];

const isZeroVec3 = (value: [number, number, number] | undefined): boolean => {
  if (!value) return true;
  return sanitizeNumber(value[0]) === 0 && sanitizeNumber(value[1]) === 0 && sanitizeNumber(value[2]) === 0;
};

const isOneVec3 = (value: [number, number, number] | undefined): boolean => {
  if (!value) return false;
  return sanitizeNumber(value[0]) === 1 && sanitizeNumber(value[1]) === 1 && sanitizeNumber(value[2]) === 1;
};

const channelName = (channel: 'rot' | 'pos' | 'scale'): 'rotation' | 'position' | 'scale' => {
  if (channel === 'pos') return 'position';
  if (channel === 'scale') return 'scale';
  return 'rotation';
};

const sanitizeIdentifier = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'model';

const normalizeTimeKey = (timeSeconds: number): string => {
  const t = sanitizeNumber(timeSeconds);
  let s = t.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  if (!s.includes('.')) s = `${s}.0`;
  return s;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

type AxisValue = number | string;
type AxisVec3 = [AxisValue, AxisValue, AxisValue];

const invertMolangExprV1 = (expr: string): string => {
  const raw = String(expr ?? '');
  if (raw === '' || raw === '0') return raw;
  if (/^-?\d+(\.\d+f?)?$/.test(raw)) {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? String(-parsed) : raw;
  }

  let out = '';
  let depth = 0;
  let pending = true;
  let lastOp: string | undefined = undefined;

  const isWhitespace = (ch: string) => ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r';
  const isOp = (ch: string) => '+-*/&|?:'.includes(ch);

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (depth !== 0) {
      out += ch;
    } else if (isWhitespace(ch)) {
      out += ch;
    } else if (ch === '?' || ch === ':') {
      pending = true;
      out += ch;
      lastOp = ch;
    } else if (ch === '+' && lastOp !== '*' && lastOp !== '/') {
      out += '-';
      pending = false;
      lastOp = '+';
    } else if (ch === '-' && lastOp !== '*' && lastOp !== '/') {
      if (pending === false && lastOp === undefined) {
        out += '+';
      }
      pending = false;
      lastOp = '-';
    } else {
      if (pending) {
        out += '-';
        pending = false;
      }
      out += ch;
      if (isOp(ch)) {
        lastOp = ch;
      } else {
        lastOp = undefined;
      }
    }

    if (ch === '{' || ch === '(' || ch === '[') depth += 1;
    if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
  }

  return out;
};

const invertAxis = (value: AxisValue): AxisValue => {
  if (typeof value === 'string') return invertMolangExprV1(value);
  return -sanitizeNumber(value);
};

const flipVector = (channel: 'rot' | 'pos' | 'scale', value: AxisVec3): AxisVec3 => {
  const x = value[0];
  const y = value[1];
  const z = value[2];
  if (channel === 'pos') return [invertAxis(x), y, z];
  if (channel === 'scale') return [x, y, z];
  return [invertAxis(x), invertAxis(y), z];
};

const normalizeAxisValue = (value: AxisValue): AxisValue =>
  typeof value === 'string' ? value : sanitizeNumber(value);

const normalizeAxisVec3 = (value: AxisVec3): AxisVec3 => [
  normalizeAxisValue(value[0]),
  normalizeAxisValue(value[1]),
  normalizeAxisValue(value[2])
];

const serializeChannelKeyValue = (channel: 'rot' | 'pos' | 'scale', key: CanonicalChannelKey): unknown => {
  const vector = normalizeAxisVec3(flipVector(channel, key.vector));
  const easing = key.easing ?? key.interp;
  const hasObjectForm =
    key.pre !== undefined ||
    key.post !== undefined ||
    easing !== undefined ||
    (Array.isArray(key.easingArgs) && key.easingArgs.length > 0) ||
    key.bezier !== undefined;
  if (!hasObjectForm) return vector;
  const payload: Record<string, unknown> = { vector };
  if (key.pre) payload.pre = normalizeAxisVec3(flipVector(channel, key.pre));
  if (key.post) payload.post = normalizeAxisVec3(flipVector(channel, key.post));
  if (easing) payload.easing = easing;
  if (Array.isArray(key.easingArgs) && key.easingArgs.length > 0) {
    payload.easingArgs = key.easingArgs;
  }
  if (key.bezier && isRecord(key.bezier)) {
    payload.bezier = key.bezier;
  }
  return payload;
};

const serializeEffectValue = (value: unknown): unknown | null => {
  if (typeof value === 'string') return { effect: value };
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return value.map((entry) => ({ effect: entry }));
  }
  if (isRecord(value) && typeof value.effect === 'string') return value;
  return null;
};

const serializeTimelineValue = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return value.join('\n');
  }
  return null;
};

const serializeTriggers = (
  triggers: CanonicalAnimationTriggerTrack[]
): Partial<Record<'sound_effects' | 'particle_effects' | 'timeline', unknown>> => {
  const sound: Record<string, unknown> = {};
  const particle: Record<string, unknown> = {};
  const timeline: Record<string, unknown> = {};
  triggers.forEach((track) => {
    const target =
      track.type === 'sound'
        ? sound
        : track.type === 'particle'
          ? particle
          : timeline;
    track.keys.forEach((key) => {
      if (track.type === 'timeline') {
        const serialized = serializeTimelineValue(key.value);
        if (serialized === null) return;
        target[normalizeTimeKey(key.time)] = serialized;
        return;
      }

      const serialized = serializeEffectValue(key.value);
      if (serialized === null) return;
      target[normalizeTimeKey(key.time)] = serialized;
    });
  });
  const entries: Partial<Record<'sound_effects' | 'particle_effects' | 'timeline', unknown>> = {};
  if (Object.keys(sound).length > 0) entries.sound_effects = sound;
  if (Object.keys(particle).length > 0) entries.particle_effects = particle;
  if (Object.keys(timeline).length > 0) entries.timeline = timeline;
  return entries;
};

const buildAnimationClip = (animation: CanonicalAnimation): Record<string, unknown> => {
  const bones: Record<string, Record<string, unknown>> = {};
  animation.channels.forEach((track) => {
    const target = (bones[track.bone] ?? {}) as Record<string, unknown>;
    const keys: Record<string, unknown> = {};
    track.keys.forEach((key) => {
      keys[normalizeTimeKey(key.time)] = serializeChannelKeyValue(track.channel, key);
    });
    target[channelName(track.channel)] = keys;
    bones[track.bone] = target;
  });
  const triggerEntries = serializeTriggers(animation.triggers);
  const clip: Record<string, unknown> = {
    animation_length: sanitizeNumber(animation.length),
    ...(animation.loop ? { loop: true } : {}),
    bones,
    ...(triggerEntries.sound_effects ? { sound_effects: triggerEntries.sound_effects } : {}),
    ...(triggerEntries.particle_effects ? { particle_effects: triggerEntries.particle_effects } : {}),
    ...(triggerEntries.timeline ? { timeline: triggerEntries.timeline } : {})
  };
  return clip;
};

const flipGeoBonePivot = (pivot: [number, number, number]): [number, number, number] => [
  -sanitizeNumber(pivot[0]),
  sanitizeNumber(pivot[1]),
  sanitizeNumber(pivot[2])
];

const flipGeoBoneRotation = (rotation: [number, number, number]): [number, number, number] => [
  -sanitizeNumber(rotation[0]),
  -sanitizeNumber(rotation[1]),
  sanitizeNumber(rotation[2])
];

const flipGeoCubePivot = (pivot: [number, number, number]): [number, number, number] => [
  -sanitizeNumber(pivot[0]),
  sanitizeNumber(pivot[1]),
  sanitizeNumber(pivot[2])
];

const flipGeoCubeRotation = (rotation: [number, number, number]): [number, number, number] => [
  -sanitizeNumber(rotation[0]),
  -sanitizeNumber(rotation[1]),
  sanitizeNumber(rotation[2])
];

const buildGeoCube = (cube: CanonicalExportModel['cubes'][number]): Record<string, unknown> => {
  const size: [number, number, number] = [
    sanitizeNumber(cube.to[0] - cube.from[0]),
    sanitizeNumber(cube.to[1] - cube.from[1]),
    sanitizeNumber(cube.to[2] - cube.from[2])
  ];
  const origin: [number, number, number] = [
    -(sanitizeNumber(cube.from[0]) + size[0]),
    sanitizeNumber(cube.from[1]),
    sanitizeNumber(cube.from[2])
  ];

  const entry: Record<string, unknown> = {
    origin: sanitizeVec3(origin),
    size: sanitizeVec3(size)
  };

  if (cube.uv) {
    entry.uv = [sanitizeNumber(cube.uv[0]), sanitizeNumber(cube.uv[1])];
  }

  const inflate = cube.inflate !== undefined ? sanitizeNumber(cube.inflate) : 0;
  if (inflate !== 0) {
    entry.inflate = inflate;
  }
  if (cube.mirror === true) {
    entry.mirror = true;
  }

  const hasRotation = cube.rotation !== undefined && !isZeroVec3(cube.rotation);
  if (hasRotation && cube.origin) {
    entry.pivot = sanitizeVec3(flipGeoCubePivot(cube.origin));
    entry.rotation = sanitizeVec3(flipGeoCubeRotation(cube.rotation!));
  }

  return entry;
};

const buildGeoArtifact = (model: CanonicalExportModel): Record<string, unknown> => ({
  format_version: GEO_FORMAT_VERSION,
  'minecraft:geometry': [
    {
      description: {
        identifier: `geometry.${sanitizeIdentifier(model.name)}`,
        texture_width: sanitizeNumber(model.texture.width),
        texture_height: sanitizeNumber(model.texture.height)
      },
      bones: model.bones.map((bone) => ({
        name: bone.name,
        ...(bone.parent ? { parent: bone.parent } : {}),
        pivot: sanitizeVec3(flipGeoBonePivot(bone.pivot)),
        ...(bone.rotation && !isZeroVec3(bone.rotation)
          ? { rotation: sanitizeVec3(flipGeoBoneRotation(bone.rotation)) }
          : {}),
        ...(bone.scale && !isOneVec3(bone.scale) ? { scale: sanitizeVec3(bone.scale) } : {}),
        ...(bone.cubes.length > 0
          ? {
              cubes: bone.cubes.map((cube) => buildGeoCube(cube))
            }
          : {})
      }))
    }
  ]
});

const buildAnimationArtifact = (model: CanonicalExportModel): Record<string, unknown> => {
  const clips: Record<string, unknown> = {};
  model.animations.forEach((animation) => {
    clips[animation.name] = buildAnimationClip(animation);
  });
  return {
    format_version: ANIMATION_FORMAT_VERSION,
    geckolib_format_version: GECKO_ANIMATION_FORMAT_VERSION,
    animations: clips
  };
};

export class GeckoGeoAnimCodec implements ExportCodecStrategy {
  readonly format = 'gecko_geo_anim' as const;

  encode(model: CanonicalExportModel): CodecEncodeResult {
    return {
      artifacts: [
        {
          id: 'geo',
          data: buildGeoArtifact(model),
          path: { mode: 'base_suffix', suffix: '.geo.json' },
          primary: true
        },
        {
          id: 'animation',
          data: buildAnimationArtifact(model),
          path: { mode: 'base_suffix', suffix: '.animation.json' }
        }
      ],
      warnings: [],
      lossy: false
    };
  }
}
