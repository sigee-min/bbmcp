import assert from 'node:assert/strict';

import {
  DEFAULT_SERVER_HOST,
  DEFAULT_SERVER_PATH,
  DEFAULT_SERVER_PORT,
  PLUGIN_ID,
  computeCapabilities
} from '../src/config';
import type { FormatDescriptor } from '../src/ports/formats';

{
  assert.equal(PLUGIN_ID, 'ashfox');
  assert.equal(DEFAULT_SERVER_HOST, '0.0.0.0');
  assert.equal(DEFAULT_SERVER_PORT, 8787);
  assert.equal(DEFAULT_SERVER_PATH, '/mcp');
}

{
  const capabilities = computeCapabilities(undefined, []);
  assert.equal(capabilities.blockbenchVersion, 'unknown');
  assert.equal(capabilities.formats.length, 5);
  assert.equal(capabilities.formats.every((format) => format.enabled === false), true);
  assert.equal(capabilities.guidance?.retryPolicy?.maxAttempts, 2);
}

{
  const formats: FormatDescriptor[] = [
    {
      id: 'java_block',
      name: 'Java Block',
      singleTexture: true,
      perTextureUvSize: false,
      boxUv: true,
      optionalBoxUv: true,
      uvRotation: true
    },
    {
      id: 'geckolib',
      name: 'GeckoLib',
      singleTexture: false,
      perTextureUvSize: true,
      animationMode: true,
      boneRig: true
    },
    { id: 'animated_java', name: 'Animated Java', animationMode: true },
    { id: 'free', name: 'Generic Model', animationMode: true, meshes: true, armatureRig: true },
    { id: 'image', name: 'Image', imageEditor: true, animationMode: false }
  ];
  const capabilities = computeCapabilities('5.0.7', formats, { 'Java Block/Item': 'java_block' }, { mode: 'fixed' });
  assert.equal(capabilities.blockbenchVersion, '5.0.7');
  assert.equal(capabilities.preview?.mode, 'fixed');

  const java = capabilities.formats.find((entry) => entry.format === 'Java Block/Item');
  const gecko = capabilities.formats.find((entry) => entry.format === 'geckolib');
  const animated = capabilities.formats.find((entry) => entry.format === 'animated_java');
  const generic = capabilities.formats.find((entry) => entry.format === 'Generic Model');
  const image = capabilities.formats.find((entry) => entry.format === 'Image');
  assert.equal(java?.enabled, true);
  assert.equal(java?.flags?.singleTexture, true);
  assert.equal(java?.flags?.perTextureUvSize, false);
  assert.equal(java?.flags?.boxUv, true);
  assert.equal(java?.flags?.optionalBoxUv, true);
  assert.equal(java?.flags?.uvRotation, true);
  assert.equal(gecko?.enabled, true);
  assert.equal(gecko?.flags?.singleTexture, false);
  assert.equal(gecko?.flags?.perTextureUvSize, true);
  assert.equal(gecko?.flags?.animationMode, true);
  assert.equal(gecko?.flags?.boneRig, true);
  assert.equal(animated?.enabled, true);
  assert.equal(animated?.animations, true);
  assert.equal(generic?.enabled, true);
  assert.equal(generic?.animations, true);
  assert.equal(generic?.flags?.meshes, true);
  assert.equal(generic?.flags?.armatureRig, true);
  assert.equal(image?.enabled, true);
  assert.equal(image?.animations, false);
  assert.equal(image?.flags?.imageEditor, true);
}

