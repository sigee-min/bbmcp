import assert from 'node:assert/strict';

import { buildProjectDialogDefaults } from '../src/domain/project/projectDialogDefaults';

{
  const defaults = buildProjectDialogDefaults({
    format: 'Java Block/Item',
    formatId: 'java_block',
    name: 'flowerpot_block'
  });
  assert.equal(defaults.format, 'java_block');
  assert.equal(defaults.parent, 'block/cube');
}

{
  const defaults = buildProjectDialogDefaults({
    format: 'Java Block/Item',
    formatId: 'java_block',
    name: 'flowerpot_item'
  });
  assert.equal(defaults.parent, 'item/generated');
}

{
  const defaults = buildProjectDialogDefaults({
    format: 'geckolib',
    formatId: 'geckolib_model',
    name: 'dragon'
  });
  assert.equal(defaults.format, 'geckolib_model');
  assert.equal(defaults.parent, undefined);
}

{
  const defaults = buildProjectDialogDefaults({
    format: 'animated_java',
    formatId: null,
    name: 'anim'
  });
  assert.equal(defaults.format, 'animated_java');
}
