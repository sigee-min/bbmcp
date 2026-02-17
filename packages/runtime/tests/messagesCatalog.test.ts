import assert from 'node:assert/strict';

import * as animation from '../src/shared/messages/animation';
import * as model from '../src/shared/messages/model';
import * as project from '../src/shared/messages/project';
import * as paint from '../src/shared/messages/texture/paint';
import * as tool from '../src/shared/messages/tool';
import * as uv from '../src/shared/messages/texture/uv';
import * as validation from '../src/shared/messages/validation';

{
  assert.equal(animation.TRIGGER_TIME_INVALID('timeline').includes('timeline'), true);
  assert.equal(animation.TRIGGER_VALUE_INVALID('particle').includes('particle'), true);
  assert.equal(animation.ANIMATION_LENGTH_EXCEEDS_MAX(12).includes('12'), true);
  assert.equal(animation.ANIMATION_CLIP_EXISTS('idle').includes('idle'), true);
  assert.equal(animation.ANIMATION_ID_EXISTS('clip-id').includes('clip-id'), true);
  assert.equal(animation.ANIMATION_CLIP_NOT_FOUND('missing').includes('missing'), true);
}

{
  assert.equal(model.MODEL_PARENT_BONE_NOT_FOUND('root').includes('root'), true);
  assert.equal(model.MODEL_BONE_EXISTS('body').includes('body'), true);
  assert.equal(model.MODEL_BONE_ID_EXISTS('b1').includes('b1'), true);
  assert.equal(model.MODEL_BONE_NOT_FOUND('arm').includes('arm'), true);
  assert.equal(model.MODEL_CUBE_EXISTS('head').includes('head'), true);
  assert.equal(model.MODEL_CUBE_ID_EXISTS('c1').includes('c1'), true);
  assert.equal(model.MODEL_CUBE_NOT_FOUND('leg').includes('leg'), true);
  assert.equal(model.MODEL_CUBE_LIMIT_EXCEEDED(100).includes('100'), true);
}

{
  assert.equal(project.PROJECT_UNSUPPORTED_FORMAT('custom').includes('custom'), true);
  assert.equal(project.PROJECT_AUTHORING_FORMAT_ID_MISSING.includes('authoring'), true);
  assert.equal(project.EXPORT_CODEC_UNSUPPORTED('entity_rig').includes('entity_rig'), true);
}

{
  assert.equal(tool.DIMENSION_POSITIVE_MESSAGE('size').includes('size'), true);
  assert.equal(tool.DIMENSION_INTEGER_MESSAGE('size').includes('size'), true);
  assert.equal(tool.NON_EMPTY_STRING_MESSAGE('name').includes('name'), true);
  assert.equal(
    tool.ID_NAME_MISMATCH_MESSAGE('texture', 'id', 'name', 'textures', 'a', 'b').includes('textures'),
    true
  );
  assert.equal(tool.TARGET_NAME_AMBIGUOUS('cube', 'body').includes('body'), true);
}

{
  assert.equal(paint.TEXTURE_OPS_TOO_MANY(5, 'demo').includes('5'), true);
  assert.equal(paint.TEXTURE_OP_INVALID('demo').includes('demo'), true);
  assert.equal(paint.TEXTURE_PAINT_MODE_INVALID('new').includes('new'), true);
  assert.equal(paint.TEXTURE_PAINT_SIZE_EXCEEDS_MAX(64).includes('64'), true);
  assert.equal(paint.TEXTURE_PAINT_SIZE_EXCEEDS_MAX_FIX(64).includes('64'), true);
  assert.equal(paint.TEXTURE_OP_COLOR_INVALID('op').includes('op'), true);
  assert.equal(paint.TEXTURE_OP_LINEWIDTH_INVALID('op').includes('op'), true);
  assert.equal(
    paint.TEXTURE_FACES_TEXTURE_COORDS_SIZE_MISMATCH(64, 64, 32, 32).includes('64x64'),
    true
  );
  assert.equal(paint.TEXTURE_FACES_OP_OUTSIDE_SOURCE('face', 16, 16).includes('16x16'), true);
  assert.equal(paint.UV_PAINT_USAGE_MISSING('atlas').includes('atlas'), true);
  assert.equal(paint.UV_PAINT_TARGET_CUBES_NOT_FOUND('atlas').includes('atlas'), true);
  assert.equal(paint.UV_PAINT_TARGET_FACES_NOT_FOUND('atlas').includes('atlas'), true);
  assert.equal(paint.UV_PAINT_NO_RECTS('atlas').includes('atlas'), true);
  assert.equal(paint.UV_PAINT_NO_BOUNDS('atlas').includes('atlas'), true);
  assert.equal(paint.UV_PAINT_OBJECT_REQUIRED('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_SCOPE_INVALID('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_MAPPING_INVALID('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_PADDING_INVALID('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_ANCHOR_FORMAT('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_ANCHOR_NUMBERS('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_SOURCE_OBJECT('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_SOURCE_REQUIRED('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_SOURCE_POSITIVE('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_SOURCE_EXCEEDS_MAX(64, 'paint').includes('64'), true);
  assert.equal(paint.UV_PAINT_SOURCE_AXIS_POSITIVE('width', 'paint').includes('width'), true);
  assert.equal(paint.UV_PAINT_SOURCE_AXIS_INTEGER('height', 'paint').includes('height'), true);
  assert.equal(paint.UV_PAINT_TARGET_OBJECT('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_TARGET_CUBE_IDS_REQUIRED('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_TARGET_CUBE_IDS_STRING('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_TARGET_CUBE_NAMES_REQUIRED('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_TARGET_CUBE_NAMES_STRING('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_TARGET_FACES_REQUIRED('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_TARGET_FACES_INVALID('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_RECTS_REQUIRED('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_SOURCE_TARGET_POSITIVE('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_SOURCE_DATA_MISMATCH('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_RECT_INVALID('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_PADDING_EXCEEDS_RECT('paint').includes('paint'), true);
  assert.equal(paint.UV_PAINT_RECT_OUTSIDE_BOUNDS('paint').includes('paint'), true);
}

{
  assert.equal(uv.UV_BOUNDS_OUT_OF_BOUNDS(32, 64).includes('32x64'), true);
  assert.equal(uv.UV_ATLAS_CUBE_MISSING('body').includes('body'), true);
  assert.equal(uv.UV_ATLAS_DERIVE_SIZE_FAILED('cube', 'north').includes('north'), true);
  assert.equal(uv.UV_ATLAS_UV_SIZE_EXCEEDS('cube', 'south').includes('south'), true);
  assert.equal(uv.TEXTURE_AUTO_UV_UNRESOLVED_REFS(3).includes('3'), true);
  assert.equal(uv.TEXTURE_AUTO_UV_SOURCE_MISSING('atlas').includes('atlas'), true);
  assert.equal(uv.TEXTURE_AUTO_UV_SOURCE_SIZE_MISSING('atlas').includes('atlas'), true);
  assert.equal(uv.UV_ASSIGNMENT_INVALID_FACE('north').includes('north'), true);
  assert.equal(uv.UV_ASSIGNMENT_UV_FORMAT('north').includes('north'), true);
  assert.equal(uv.UV_ASSIGNMENT_UV_NUMBERS('north').includes('north'), true);
  assert.equal(uv.TEXTURE_FACE_UV_SMALL_RECTS('body', 2, 4, ' ex').includes('body'), true);
  assert.equal(uv.TEXTURE_FACE_UV_SKEWED_RECTS('body', 2, 8, ' ex').includes('8:1'), true);
  assert.equal(uv.UV_OVERLAP_MESSAGE('atlas', '', '', false).includes('atlas'), true);
  assert.equal(uv.UV_SCALE_MESSAGE('atlas', '', '', false).includes('atlas'), true);
}

{
  assert.equal(validation.VALIDATION_ORPHAN_CUBE('cube', 'root').includes('cube'), true);
  assert.equal(validation.VALIDATION_DUPLICATE_BONE('root').includes('root'), true);
  assert.equal(validation.VALIDATION_DUPLICATE_CUBE('cube').includes('cube'), true);
  assert.equal(validation.VALIDATION_MAX_CUBES_EXCEEDED(10, 5).includes('10'), true);
  assert.equal(validation.VALIDATION_ANIMATION_TOO_LONG('idle', 12).includes('idle'), true);
  assert.equal(validation.VALIDATION_TEXTURE_TOO_LARGE('atlas', 128).includes('128'), true);
  assert.equal(validation.VALIDATION_TEXTURE_SIZE_MISMATCH('atlas', 16, 16, 64, 64).includes('64x64'), true);
  assert.equal(validation.VALIDATION_UV_OUT_OF_BOUNDS('cube', 1, 2, 16, 16).includes('cube'), true);
  assert.equal(validation.VALIDATION_TEXTURE_UNRESOLVED_REFS(3).includes('3'), true);
  assert.equal(validation.VALIDATION_TEXTURE_UNASSIGNED('atlas').includes('atlas'), true);
  assert.equal(validation.VALIDATION_CUBE_CONTAINMENT('inner', 'outer').includes('outer'), true);
  assert.equal(
    validation
      .VALIDATION_FACE_UV_OUT_OF_BOUNDS('cube', 'north', 16, 16, 0, 0, 17, 17)
      .includes('north'),
    true
  );
  assert.equal(validation.VALIDATION_UV_OVERLAP('atlas', 2, ' ex').includes('2'), true);
  assert.equal(validation.VALIDATION_UV_SCALE_MISMATCH('atlas', 2, ' ex').includes('2'), true);
  assert.equal(validation.VALIDATION_UV_SCALE_MISMATCH_SUMMARY(4, 10).includes('4/10'), true);
}
