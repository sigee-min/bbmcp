import assert from 'node:assert/strict';

import { buildStreamPayload, getProject, listProjects } from '../src/lib/mockProjectStore';

{
  const projects = listProjects();
  assert.ok(projects.length >= 2);
  const first = projects[0];
  assert.ok(first);
  assert.equal(typeof first.projectId, 'string');
}

{
  const project = getProject('project-a');
  assert.ok(project);
  assert.equal(project?.projectId, 'project-a');
}

{
  const unknown = getProject('missing-project');
  assert.equal(unknown, null);
}

{
  const payload = buildStreamPayload('project-b', 99);
  assert.ok(payload);
  assert.equal(payload?.projectId, 'project-b');
  assert.equal(payload?.revision, 99);
}

{
  const payload = buildStreamPayload('missing-project', 20);
  assert.equal(payload, null);
}

{
  const projects = listProjects();
  const first = projects[0];
  assert.ok(first);

  const mutated = listProjects() as { name: string }[];
  mutated[0].name = 'mutated-name';

  const reloaded = listProjects();
  assert.notEqual(reloaded[0]?.name, 'mutated-name');
}
