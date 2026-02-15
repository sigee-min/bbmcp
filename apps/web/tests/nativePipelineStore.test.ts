import assert from 'node:assert/strict';

import { getNativePipelineStore } from '../src/lib/nativePipelineStore';

module.exports = () => {
  const store = getNativePipelineStore();
  store.reset();

  const projects = store.listProjects();
  assert.ok(projects.length >= 3);
  const first = projects[0];
  assert.ok(first);

  const mutated = store.listProjects() as Array<{ name: string }>;
  mutated[0].name = 'mutated-name';
  const reloaded = store.listProjects();
  assert.notEqual(reloaded[0]?.name, 'mutated-name');

  const query = store.listProjects('lynx');
  assert.equal(query.length, 1);
  assert.equal(query[0]?.name, 'Desert Lynx');
};
