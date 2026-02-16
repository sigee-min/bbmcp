import assert from 'node:assert/strict';

import { getNativePipelineStore } from '../src/lib/nativePipelineStore';

module.exports = async () => {
  const store = getNativePipelineStore();
  await store.reset();

  const projects = await store.listProjects();
  assert.ok(projects.length >= 3);
  const first = projects[0];
  assert.ok(first);

  const mutated = (await store.listProjects()) as Array<{ name: string }>;
  mutated[0].name = 'mutated-name';
  const reloaded = await store.listProjects();
  assert.notEqual(reloaded[0]?.name, 'mutated-name');

  const query = await store.listProjects('lynx');
  assert.equal(query.length, 1);
  assert.equal(query[0]?.name, 'Desert Lynx');
};
