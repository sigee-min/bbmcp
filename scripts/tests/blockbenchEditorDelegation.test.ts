import assert from 'node:assert/strict';

import type { Logger } from '../../src/logging';
import { BlockbenchEditor } from '../../src/adapters/blockbench/BlockbenchEditor';

const logger: Logger = {
  log: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

{
  const editor = new BlockbenchEditor(logger) as unknown as Record<string, unknown>;
  const calls: string[] = [];

  const projectResult = { code: 'io_error', message: 'x' };
  const textureResult = { code: 'invalid_payload', message: 'x' };
  const geometryResult = { code: 'invalid_state', message: 'x' };
  const animationResult = { code: 'unknown', message: 'x' };
  const previewResult = { error: { code: 'invalid_payload', message: 'x' } };

  editor.project = {
    createProject: () => {
      calls.push('project.createProject');
      return projectResult;
    },
    closeProject: () => {
      calls.push('project.closeProject');
      return projectResult;
    },
    writeFile: () => {
      calls.push('project.writeFile');
      return projectResult;
    },
    getProjectTextureResolution: () => {
      calls.push('project.getProjectTextureResolution');
      return { width: 64, height: 32 };
    },
    setProjectTextureResolution: () => {
      calls.push('project.setProjectTextureResolution');
      return projectResult;
    },
    setProjectUvPixelsPerBlock: () => {
      calls.push('project.setProjectUvPixelsPerBlock');
      return projectResult;
    }
  };
  editor.textures = {
    importTexture: () => {
      calls.push('textures.importTexture');
      return textureResult;
    },
    updateTexture: () => {
      calls.push('textures.updateTexture');
      return textureResult;
    },
    deleteTexture: () => {
      calls.push('textures.deleteTexture');
      return textureResult;
    },
    readTexture: () => {
      calls.push('textures.readTexture');
      return { error: textureResult };
    },
    listTextures: () => {
      calls.push('textures.listTextures');
      return [{ name: 'atlas', width: 16, height: 16 }];
    }
  };
  editor.geometry = {
    assignTexture: () => {
      calls.push('geometry.assignTexture');
      return geometryResult;
    },
    setFaceUv: () => {
      calls.push('geometry.setFaceUv');
      return geometryResult;
    },
    addBone: () => {
      calls.push('geometry.addBone');
      return geometryResult;
    },
    updateBone: () => {
      calls.push('geometry.updateBone');
      return geometryResult;
    },
    deleteBone: () => {
      calls.push('geometry.deleteBone');
      return geometryResult;
    },
    addCube: () => {
      calls.push('geometry.addCube');
      return geometryResult;
    },
    updateCube: () => {
      calls.push('geometry.updateCube');
      return geometryResult;
    },
    deleteCube: () => {
      calls.push('geometry.deleteCube');
      return geometryResult;
    },
    addMesh: () => {
      calls.push('geometry.addMesh');
      return geometryResult;
    },
    updateMesh: () => {
      calls.push('geometry.updateMesh');
      return geometryResult;
    },
    deleteMesh: () => {
      calls.push('geometry.deleteMesh');
      return geometryResult;
    },
    getTextureUsage: () => {
      calls.push('geometry.getTextureUsage');
      return { error: geometryResult };
    }
  };
  editor.animation = {
    createAnimation: () => {
      calls.push('animation.createAnimation');
      return animationResult;
    },
    updateAnimation: () => {
      calls.push('animation.updateAnimation');
      return animationResult;
    },
    deleteAnimation: () => {
      calls.push('animation.deleteAnimation');
      return animationResult;
    },
    setKeyframes: () => {
      calls.push('animation.setKeyframes');
      return animationResult;
    },
    setTriggerKeyframes: () => {
      calls.push('animation.setTriggerKeyframes');
      return animationResult;
    }
  };
  editor.preview = {
    renderPreview: () => {
      calls.push('preview.renderPreview');
      return previewResult;
    }
  };

  const typedEditor = editor as unknown as BlockbenchEditor;

  assert.equal(typedEditor.createProject('a', 'b', 'geckolib'), projectResult);
  assert.equal(typedEditor.closeProject(), projectResult);
  assert.equal(typedEditor.importTexture({ name: 'x', image: {} as CanvasImageSource }), textureResult);
  assert.equal(typedEditor.updateTexture({ name: 'x', image: {} as CanvasImageSource }), textureResult);
  assert.equal(typedEditor.deleteTexture({ name: 'x' }), textureResult);
  assert.deepEqual(typedEditor.readTexture({ name: 'x' }), { error: textureResult });
  assert.deepEqual(typedEditor.listTextures(), [{ name: 'atlas', width: 16, height: 16 }]);
  assert.equal(typedEditor.assignTexture({ textureName: 'x' }), geometryResult);
  assert.equal(typedEditor.setFaceUv({ cubeName: 'c', faces: { north: [0, 0, 1, 1] } }), geometryResult);
  assert.equal(typedEditor.addBone({ name: 'b' }), geometryResult);
  assert.equal(typedEditor.updateBone({ name: 'b' }), geometryResult);
  assert.equal(typedEditor.deleteBone({ name: 'b' }), geometryResult);
  assert.equal(typedEditor.addCube({ name: 'c', from: [0, 0, 0], to: [1, 1, 1] }), geometryResult);
  assert.equal(typedEditor.updateCube({ name: 'c' }), geometryResult);
  assert.equal(typedEditor.deleteCube({ name: 'c' }), geometryResult);
  assert.equal(
    typedEditor.addMesh({
      name: 'm',
      vertices: [
        { id: 'v0', pos: [0, 0, 0] },
        { id: 'v1', pos: [1, 0, 0] },
        { id: 'v2', pos: [0, 1, 0] }
      ],
      faces: [{ vertices: ['v0', 'v1', 'v2'] }]
    }),
    geometryResult
  );
  assert.equal(typedEditor.updateMesh({ name: 'm' }), geometryResult);
  assert.equal(typedEditor.deleteMesh({ name: 'm' }), geometryResult);
  assert.equal(typedEditor.createAnimation({ name: 'idle', length: 1, loop: true, fps: 20 }), animationResult);
  assert.equal(typedEditor.updateAnimation({ name: 'idle' }), animationResult);
  assert.equal(typedEditor.deleteAnimation({ name: 'idle' }), animationResult);
  assert.equal(
    typedEditor.setKeyframes({
      clip: 'idle',
      bone: 'body',
      channel: 'rot',
      keys: [{ time: 0, value: [0, 0, 0] }]
    }),
    animationResult
  );
  assert.equal(
    typedEditor.setTriggerKeyframes({ clip: 'idle', channel: 'sound', keys: [{ time: 0, value: 'x' }] }),
    animationResult
  );
  assert.deepEqual(typedEditor.renderPreview({ mode: 'fixed' }), previewResult);
  assert.deepEqual(typedEditor.getTextureUsage({}), { error: geometryResult });
  assert.equal(typedEditor.writeFile('out.json', '{}'), projectResult);
  assert.deepEqual(typedEditor.getProjectTextureResolution(), { width: 64, height: 32 });
  assert.equal(typedEditor.setProjectTextureResolution(64, 64, true), projectResult);
  assert.equal(typedEditor.setProjectUvPixelsPerBlock(16), projectResult);

  assert.deepEqual(calls, [
    'project.createProject',
    'project.closeProject',
    'textures.importTexture',
    'textures.updateTexture',
    'textures.deleteTexture',
    'textures.readTexture',
    'textures.listTextures',
    'geometry.assignTexture',
    'geometry.setFaceUv',
    'geometry.addBone',
    'geometry.updateBone',
    'geometry.deleteBone',
    'geometry.addCube',
    'geometry.updateCube',
    'geometry.deleteCube',
    'geometry.addMesh',
    'geometry.updateMesh',
    'geometry.deleteMesh',
    'animation.createAnimation',
    'animation.updateAnimation',
    'animation.deleteAnimation',
    'animation.setKeyframes',
    'animation.setTriggerKeyframes',
    'preview.renderPreview',
    'geometry.getTextureUsage',
    'project.writeFile',
    'project.getProjectTextureResolution',
    'project.setProjectTextureResolution',
    'project.setProjectUvPixelsPerBlock'
  ]);
}
