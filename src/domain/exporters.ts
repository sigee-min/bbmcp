import { ExportPayload } from '@ashfox/contracts/types/internal';
import { SessionState, TrackedAnimationChannel, TrackedAnimationTrigger } from '../session';

export type ExportKind = ExportPayload['format'];

export interface ExportBundle {
  format: ExportKind;
  data: unknown;
}

export function buildInternalExport(format: ExportKind, state: SessionState): ExportBundle {
  const data = buildInternalPayload(format, state);
  return {
    format,
    data: {
      ...data,
      ashfox_meta: {
        schema: 'internal',
        format,
        name: state.name ?? null
      }
    }
  };
}

function buildInternalPayload(format: ExportKind, state: SessionState) {
  switch (format) {
    case 'java_block_item_json':
      return buildJavaBlockItemModel(state);
    case 'gecko_geo_anim':
      return buildGeckoModel(state);
    case 'animated_java':
      return buildAnimatedJavaModel(state);
    case 'generic_model_json':
      return buildGenericModel(state);
    default:
      return buildSnapshotFallback(state);
  }
}

function buildSnapshotFallback(state: SessionState) {
  return {
    meta: { format: state.format, name: state.name },
    bones: state.bones,
    cubes: state.cubes,
    meshes: state.meshes ?? [],
    textures: state.textures,
    animations: state.animations
  };
}

function buildJavaBlockItemModel(state: SessionState) {
  const elements = state.cubes.map((cube) => {
    const bone = state.bones.find((b) => b.name === cube.bone);
    const rotation = bone?.rotation ? pickVanillaRotation(bone.rotation, bone.pivot) : null;
    return {
      name: cube.name,
      from: cube.from,
      to: cube.to,
      rotation: rotation ?? undefined
    };
  });

  return {
    format: 'ashfox_java_block_item',
    name: state.name ?? 'model',
    elements
  };
}

function pickVanillaRotation(
  rotation: [number, number, number],
  origin: [number, number, number]
) {
  const axes = [
    { axis: 'x', angle: rotation[0] },
    { axis: 'y', angle: rotation[1] },
    { axis: 'z', angle: rotation[2] }
  ];
  const active = axes.filter((a) => Number.isFinite(a.angle) && Math.abs(a.angle) > 0.0001);
  if (active.length === 0) return null;
  const primary = active.reduce((max, cur) => (Math.abs(cur.angle) > Math.abs(max.angle) ? cur : max));
  return {
    origin,
    axis: primary.axis,
    angle: primary.angle
  };
}

function buildGeckoModel(state: SessionState) {
  const bones = state.bones.map((bone) => {
    const cubes = state.cubes
      .filter((cube) => cube.bone === bone.name)
      .map((cube) => ({
        origin: cube.from,
        size: [
          cube.to[0] - cube.from[0],
          cube.to[1] - cube.from[1],
          cube.to[2] - cube.from[2]
        ],
        uv: cube.uv,
        inflate: cube.inflate,
        mirror: cube.mirror
      }));
    return {
      name: bone.name,
      parent: bone.parent,
      pivot: bone.pivot,
      rotation: bone.rotation,
      cubes
    };
  });

  const animations = buildGeckoAnimations(state);

  return {
    format_version: '1.12.0',
    minecraft: {
      geometry: [
        {
          description: {
            identifier: state.name ?? 'ashfox_model'
          },
          bones
        }
      ],
      animations
    }
  };
}

function buildGeckoAnimations(state: SessionState) {
  const animations: Record<string, unknown> = {};
  state.animations.forEach((anim) => {
    const bones: Record<string, unknown> = {};
    anim.channels?.forEach((channel) => {
      const boneEntry = (bones[channel.bone] ?? {}) as Record<string, unknown>;
      boneEntry[channel.channel] = buildGeckoChannelKeys(channel);
      bones[channel.bone] = boneEntry;
    });
    const triggerEntries = buildGeckoTriggerEntries(anim.triggers);
    animations[anim.name] = {
      loop: anim.loop ? 'loop' : 'once',
      animation_length: anim.length,
      bones,
      ...triggerEntries
    };
  });
  return animations;
}

function buildGeckoChannelKeys(channel: TrackedAnimationChannel) {
  const keys: Record<string, unknown> = {};
  channel.keys.forEach((key) => {
    const time = String(key.time);
    keys[time] = key.value;
  });
  return keys;
}

function buildGeckoTriggerEntries(triggers: TrackedAnimationTrigger[] | undefined) {
  if (!triggers || triggers.length === 0) return {};
  const sound: Record<string, unknown> = {};
  const particle: Record<string, unknown> = {};
  const timeline: Record<string, unknown> = {};
  triggers.forEach((trigger) => {
    const target =
      trigger.type === 'sound' ? sound : trigger.type === 'particle' ? particle : timeline;
    trigger.keys.forEach((key) => {
      target[String(key.time)] = key.value;
    });
  });
  const entries: Record<string, unknown> = {};
  if (Object.keys(sound).length > 0) entries.sound_effects = sound;
  if (Object.keys(particle).length > 0) entries.particle_effects = particle;
  if (Object.keys(timeline).length > 0) entries.timeline = timeline;
  return entries;
}

function buildAnimatedJavaModel(state: SessionState) {
  return {
    format: 'ashfox_animated_java',
    name: state.name ?? 'model',
    bones: state.bones,
    cubes: state.cubes,
    animations: state.animations.map((anim) => ({
      name: anim.name,
      length: anim.length,
      loop: anim.loop,
      fps: anim.fps,
      channels: anim.channels,
      triggers: anim.triggers
    }))
  };
}

function buildGenericModel(state: SessionState) {
  return {
    format: 'ashfox_generic_model',
    name: state.name ?? 'model',
    formatId: state.formatId ?? null,
    bones: state.bones,
    cubes: state.cubes,
    meshes: state.meshes ?? [],
    textures: state.textures,
    animations: state.animations
  };
}





