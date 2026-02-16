import assert from 'node:assert/strict';

import { BlockbenchFormats } from '../src/adapters/blockbench/BlockbenchFormats';

type TestGlobals = {
  Formats?: unknown;
  ModelFormat?: unknown;
  Format?: unknown;
};

const getGlobals = (): TestGlobals => globalThis as TestGlobals;

const withGlobals = (overrides: TestGlobals, run: () => void) => {
  const globals = getGlobals();
  const before = {
    Formats: globals.Formats,
    ModelFormat: globals.ModelFormat,
    Format: globals.Format
  };
  globals.Formats = overrides.Formats;
  globals.ModelFormat = overrides.ModelFormat;
  globals.Format = overrides.Format;
  try {
    run();
  } finally {
    globals.Formats = before.Formats;
    globals.ModelFormat = before.ModelFormat;
    globals.Format = before.Format;
  }
};

{
  const adapter = new BlockbenchFormats();
  withGlobals({}, () => {
    assert.deepEqual(adapter.listFormats(), []);
    assert.equal(adapter.getActiveFormatId(), null);
  });
}

{
  const adapter = new BlockbenchFormats();
  withGlobals(
    {
      Formats: {
        geckolib: {
          name: 'GeckoLib',
          single_texture: true,
          per_texture_uv_size: false,
          animation_mode: true,
          bone_rig: true
        },
        entity_rig: {}
      },
      Format: { id: 'geckolib' }
    },
    () => {
      const formats = adapter.listFormats();
      assert.equal(formats.length, 2);
      assert.deepEqual(formats[0], {
        id: 'geckolib',
        name: 'GeckoLib',
        singleTexture: true,
        perTextureUvSize: false,
        animationMode: true,
        boneRig: true
      });
      assert.deepEqual(formats[1], { id: 'entity_rig', name: 'entity_rig' });
      assert.equal(adapter.getActiveFormatId(), 'geckolib');
    }
  );
}

{
  const adapter = new BlockbenchFormats();
  withGlobals(
    {
      ModelFormat: {
        formats: {
          entity_alt: { name: 'Entity Alt', single_texture: false }
        },
        selected: { id: 'entity_alt' }
      }
    },
    () => {
      const formats = adapter.listFormats();
      assert.equal(formats.length, 1);
      assert.deepEqual(formats[0], { id: 'entity_alt', name: 'Entity Alt', singleTexture: false });
      assert.equal(adapter.getActiveFormatId(), 'entity_alt');
    }
  );
}

{
  const adapter = new BlockbenchFormats();
  withGlobals(
    {
      Formats: {
        entity_rig: {
          name: 'Entity Rig',
          armature_rig: true,
          bone_rig: true,
          animation_mode: true,
          optional_box_uv: true,
          uv_rotation: true
        }
      },
      Format: { id: 'entity_rig' }
    },
    () => {
      const formats = adapter.listFormats();
      assert.equal(formats.length, 1);
      assert.deepEqual(formats[0], {
        id: 'entity_rig',
        name: 'Entity Rig',
        optionalBoxUv: true,
        uvRotation: true,
        animationMode: true,
        boneRig: true,
        armatureRig: true
      });
      assert.equal(adapter.getActiveFormatId(), 'entity_rig');
    }
  );
}
