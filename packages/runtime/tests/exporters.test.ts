import assert from 'node:assert/strict';

import type { SessionState } from '../src/session';
import { resolveAnimationTimePolicy } from '../src/domain/animation/timePolicy';
import { buildInternalExport } from '../src/domain/exporters';

const buildState = (): SessionState => ({
  id: 'p1',
  formatId: 'entity_rig',
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
            { time: 1, value: [5, 0, 0], easing: 'easeInOutSine', easingArgs: [0.42] }
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
  const bundle = buildInternalExport('gecko_geo_anim', state);
  const geo = bundle.data as {
    format_version: string;
    'minecraft:geometry': Array<{ description: { identifier: string }; bones: Array<{ name: string; cubes: unknown[] }> }>;
  };
  const animArtifact = bundle.artifacts.find((artifact) => artifact.id === 'animation');
  const anim = (animArtifact?.data ?? {}) as {
    animations: Record<
      string,
      {
        loop?: boolean;
        animation_length: number;
        bones: Record<string, { rotation: Record<string, unknown> }>;
        sound_effects?: Record<string, unknown>;
        timeline?: Record<string, unknown>;
      }
    >;
  };
  const idle = anim.animations.idle;

  assert.equal(bundle.format, 'gecko_geo_anim');
  assert.equal(bundle.artifacts.length, 2);
  assert.equal(geo.format_version, '1.12.0');
  assert.equal(geo['minecraft:geometry'][0].description.identifier, 'geometry.draco');
  assert.equal(geo['minecraft:geometry'][0].bones.length, 2);
  assert.equal(idle.loop, true);
  assert.equal(idle.animation_length, 2);
  assert.deepEqual(idle.bones.head.rotation['0.0'], [0, 0, 0]);
  assert.deepEqual(idle.sound_effects?.['0.5'], { effect: 'dragon.growl' });
  assert.equal(idle.timeline?.['1.5'], 'beat');
  assert.equal(typeof idle.bones.head.rotation['1.0'], 'object');
}
