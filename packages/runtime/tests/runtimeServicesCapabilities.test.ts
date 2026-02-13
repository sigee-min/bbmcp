import assert from 'node:assert/strict';

import { InMemoryResourceStore } from '../src/adapters/resources/resourceStore';
import { createDefaultPolicies } from '../src/plugin/runtimeDefaults';
import { buildRuntimeServices } from '../src/plugin/runtimeServices';
import { noopLog } from './helpers';
import { withGlobals } from './support/withGlobals';

const buildRuntime = (overrides: Record<string, unknown>) => {
  let runtime: ReturnType<typeof buildRuntimeServices> | null = null;
  withGlobals(overrides, () => {
    runtime = buildRuntimeServices({
      blockbenchVersion: '5.0.7',
      formatOverrides: {},
      policies: createDefaultPolicies({}),
      resourceStore: new InMemoryResourceStore(),
      logger: noopLog,
      traceLog: { enabled: false }
    });
  });
  if (!runtime) throw new Error('runtime build failed');
  return runtime;
};

{
  const runtime = buildRuntime({
    Formats: {
      geckolib: { name: 'GeckoLib', animation_mode: true },
      java_block: { name: 'Java Block/Item', animation_mode: false },
      free: { name: 'Generic Model', animation_mode: true, meshes: true }
    },
    Codecs: {
      gltf: { id: 'gltf', name: 'glTF', extension: 'gltf glb' },
      obj: { id: 'obj', name: 'OBJ', extension: 'obj' }
    }
  });

  const targets = runtime.capabilities.exportTargets ?? [];
  const gltf = targets.find((target) => target.id === 'gltf');
  const native = targets.find((target) => target.id === 'native_codec');
  const obj = targets.find((target) => target.id === 'obj' && target.kind === 'native_codec');

  assert.equal(gltf?.kind, 'gltf');
  assert.equal(gltf?.available, true);
  assert.equal(native?.kind, 'native_codec');
  assert.equal(native?.available, true);
  assert.equal(Boolean(obj), true);
}

{
  const runtime = buildRuntime({
    Formats: {
      geckolib: { name: 'GeckoLib', animation_mode: true },
      java_block: { name: 'Java Block/Item', animation_mode: false },
      free: { name: 'Generic Model', animation_mode: true, meshes: true }
    },
    Codecs: {}
  });

  const targets = runtime.capabilities.exportTargets ?? [];
  const gltf = targets.find((target) => target.id === 'gltf');
  const native = targets.find((target) => target.id === 'native_codec');

  assert.equal(gltf?.available, true);
  assert.equal(native?.available, false);
}
