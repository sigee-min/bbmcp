import assert from 'node:assert/strict';

import { BlockbenchFormats } from '../src/adapters/blockbench/BlockbenchFormats';

type TestGlobals = {
  Formats?: unknown;
  ModelFormat?: unknown;
  Format?: unknown;
};

const getGlobals = (): TestGlobals => globalThis as unknown as TestGlobals;

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
        java_block: {}
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
      assert.deepEqual(formats[1], { id: 'java_block', name: 'java_block' });
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
          animated_java: { name: 'Animated Java', single_texture: false }
        },
        selected: { id: 'animated_java' }
      }
    },
    () => {
      const formats = adapter.listFormats();
      assert.equal(formats.length, 1);
      assert.deepEqual(formats[0], { id: 'animated_java', name: 'Animated Java', singleTexture: false });
      assert.equal(adapter.getActiveFormatId(), 'animated_java');
    }
  );
}

{
  const adapter = new BlockbenchFormats();
  withGlobals(
    {
      Formats: {
        free: {
          name: 'Generic Model',
          meshes: true,
          armature_rig: true,
          bone_rig: true,
          animation_mode: true,
          optional_box_uv: true,
          uv_rotation: true
        },
        image: {
          name: 'Image',
          image_editor: true,
          animation_mode: false
        }
      },
      Format: { id: 'free' }
    },
    () => {
      const formats = adapter.listFormats();
      assert.equal(formats.length, 2);
      assert.deepEqual(formats[0], {
        id: 'free',
        name: 'Generic Model',
        optionalBoxUv: true,
        uvRotation: true,
        animationMode: true,
        boneRig: true,
        armatureRig: true,
        meshes: true
      });
      assert.deepEqual(formats[1], {
        id: 'image',
        name: 'Image',
        animationMode: false,
        imageEditor: true
      });
      assert.equal(adapter.getActiveFormatId(), 'free');
    }
  );
}
