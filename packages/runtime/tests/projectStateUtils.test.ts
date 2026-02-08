import assert from 'node:assert/strict';

import { hasUnsavedChanges, markProjectSaved } from '../src/adapters/blockbench/utils/projectState';

const withGlobalProject = (project: unknown, fn: () => void) => {
  const globals = globalThis as { Project?: unknown };
  const hadOwn = Object.prototype.hasOwnProperty.call(globals, 'Project');
  const prev = globals.Project;
  globals.Project = project;
  try {
    fn();
  } finally {
    if (hadOwn) globals.Project = prev;
    else delete globals.Project;
  }
};

{
  assert.equal(hasUnsavedChanges({ hasUnsavedChanges: () => true } as never), true);
  assert.equal(hasUnsavedChanges({ hasUnsavedChanges: () => false } as never), false);
}

{
  const project = { saved: false };
  const blockbench = { hasUnsavedChanges: () => 'unknown', project };
  assert.equal(hasUnsavedChanges(blockbench as never), true);
}

{
  assert.equal(hasUnsavedChanges({ project: { isSaved: false } } as never), true);
  assert.equal(hasUnsavedChanges({ project: { dirty: true } } as never), true);
  assert.equal(hasUnsavedChanges({ project: { isDirty: true } } as never), true);
  assert.equal(hasUnsavedChanges({ project: { unsaved: true } } as never), true);
  assert.equal(hasUnsavedChanges({ project: { hasUnsavedChanges: () => 1 } } as never), true);
}

{
  withGlobalProject({ isDirty: true }, () => {
    assert.equal(hasUnsavedChanges(undefined), true);
  });
}

{
  const blockbench = {
    hasUnsavedChanges: () => {
      throw new Error('boom');
    }
  };
  assert.equal(hasUnsavedChanges(blockbench as never), false);
}

{
  let markCalled = 0;
  const project = {
    markSaved: () => {
      markCalled += 1;
    },
    saved: false,
    isSaved: false,
    dirty: true,
    isDirty: true,
    unsaved: true
  };
  markProjectSaved({ project } as never);
  assert.equal(markCalled, 1);
  assert.equal(project.saved, true);
  assert.equal(project.isSaved, true);
  assert.equal(project.dirty, false);
  assert.equal(project.isDirty, false);
  assert.equal(project.unsaved, false);
}

{
  withGlobalProject({ saved: false, dirty: true }, () => {
    markProjectSaved(undefined);
    const project = (globalThis as { Project?: { saved?: boolean; dirty?: boolean } }).Project;
    assert.equal(project?.saved, true);
    assert.equal(project?.dirty, false);
  });
}

{
  assert.doesNotThrow(() => markProjectSaved(undefined));
  assert.doesNotThrow(() =>
    markProjectSaved({
      get project() {
        throw new Error('access denied');
      }
    } as never)
  );
}

