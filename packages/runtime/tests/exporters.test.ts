import assert from 'node:assert/strict';

import type { SessionState } from '../src/session';
import { resolveAnimationTimePolicy } from '../src/domain/animation/timePolicy';
import { buildInternalExport } from '../src/domain/exporters';

const buildState = (): SessionState => ({
  id: 'p1',
  format: 'geckolib',
  formatId: 'geckolib',
  name: 'draco',
  bones: [
    { name: 'body', pivot: [0, 0, 0], rotation: [0, 45, 0] },
    { name: 'head', parent: 'body', pivot: [0, 8, 0], rotation: [10, 0, 0] }
  ],
  cubes: [
    { name: 'body_main', bone: 'body', from: [-4, 0, -4], to: [4, 8, 4], uv: [0, 0], mirror: false },
    { name: 'head_main', bone: 'head', from: [-3, 8, -3], to: [3, 14, 3], uv: [16, 0], mirror: true }
  ],
  meshes: [
    {
      name: 'wing_mesh',
      bone: 'body',
      vertices: [
        { id: 'v0', pos: [0, 0, 0] },
        { id: 'v1', pos: [2, 0, 0] },
        { id: 'v2', pos: [0, 2, 0] }
      ],
      faces: [{ vertices: ['v0', 'v1', 'v2'] }]
    }
  ],
  textures: [{ name: 'dragon_tex', width: 64, height: 64 }],
  animations: [
    {
      name: 'idle',
      length: 2,
      loop: true,
      fps: 20,
      channels: [
        {
          bone: 'head',
          channel: 'rot',
          keys: [
            { time: 0, value: [0, 0, 0] },
            { time: 1, value: [5, 0, 0] }
          ]
        }
      ],
      triggers: [
        { type: 'sound', keys: [{ time: 0.5, value: 'dragon.growl' }] },
        { type: 'timeline', keys: [{ time: 1.5, value: 'beat' }] }
      ]
    }
  ],
  animationTimePolicy: resolveAnimationTimePolicy()
});

{
  const state = buildState();
  const bundle = buildInternalExport('java_block_item_json', state);
  const payload = bundle.data as {
    format: string;
    name: string;
    elements: Array<{ name: string; rotation?: { axis: string; angle: number } }>;
    ashfox_meta: { schema: string; format: string; name: string | null };
  };

  assert.equal(bundle.format, 'java_block_item_json');
  assert.equal(payload.format, 'ashfox_java_block_item');
  assert.equal(payload.name, 'draco');
  assert.equal(payload.elements.length, 2);
  assert.equal(payload.elements[0].rotation?.axis, 'y');
  assert.equal(payload.elements[0].rotation?.angle, 45);
  assert.equal(payload.ashfox_meta.schema, 'internal');
}

{
  const state = buildState();
  const bundle = buildInternalExport('gecko_geo_anim', state);
  const payload = bundle.data as {
    format_version: string;
    minecraft: {
      geometry: Array<{ description: { identifier: string }; bones: Array<{ name: string; cubes: unknown[] }> }>;
      animations: Record<string, Record<string, unknown>>;
    };
  };
  const idle = payload.minecraft.animations.idle as {
    loop: string;
    animation_length: number;
    bones: Record<string, { rot: Record<string, number[]> }>;
    sound_effects?: Record<string, unknown>;
    timeline?: Record<string, unknown>;
  };

  assert.equal(bundle.format, 'gecko_geo_anim');
  assert.equal(payload.format_version, '1.12.0');
  assert.equal(payload.minecraft.geometry[0].description.identifier, 'draco');
  assert.equal(payload.minecraft.geometry[0].bones.length, 2);
  assert.equal(idle.loop, 'loop');
  assert.equal(idle.animation_length, 2);
  assert.deepEqual(idle.bones.head.rot['1'], [5, 0, 0]);
  assert.equal(idle.sound_effects?.['0.5'], 'dragon.growl');
  assert.equal(idle.timeline?.['1.5'], 'beat');
}

{
  const state = buildState();
  const bundle = buildInternalExport('animated_java', state);
  const payload = bundle.data as {
    format: string;
    name: string;
    bones: unknown[];
    cubes: unknown[];
    animations: Array<{ name: string; fps?: number }>;
  };
  assert.equal(bundle.format, 'animated_java');
  assert.equal(payload.format, 'ashfox_animated_java');
  assert.equal(payload.name, 'draco');
  assert.equal(payload.bones.length, 2);
  assert.equal(payload.cubes.length, 2);
  assert.equal(payload.animations.length, 1);
  assert.equal(payload.animations[0].fps, 20);
}

{
  const state = buildState();
  const bundle = buildInternalExport('generic_model_json', state);
  const payload = bundle.data as {
    format: string;
    formatId: string | null;
    meshes: unknown[];
    animations: unknown[];
  };
  assert.equal(bundle.format, 'generic_model_json');
  assert.equal(payload.format, 'ashfox_generic_model');
  assert.equal(payload.formatId, 'geckolib');
  assert.equal(payload.meshes.length, 1);
  assert.equal(payload.animations.length, 1);
}

{
  const state = buildState();
  const bundle = buildInternalExport('custom_format' as unknown as 'java_block_item_json', {
    ...state,
    name: null
  });
  const payload = bundle.data as {
    meta: { format: string | null };
    bones: unknown[];
    cubes: unknown[];
    meshes: unknown[];
    textures: unknown[];
    animations: unknown[];
    ashfox_meta: { name: string | null; format: string };
  };
  assert.equal(payload.meta.format, 'geckolib');
  assert.equal(payload.bones.length, 2);
  assert.equal(payload.cubes.length, 2);
  assert.equal(payload.meshes.length, 1);
  assert.equal(payload.textures.length, 1);
  assert.equal(payload.animations.length, 1);
  assert.equal(payload.ashfox_meta.name, null);
  assert.equal(payload.ashfox_meta.format, 'custom_format');
}

