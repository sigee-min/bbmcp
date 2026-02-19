const assert = require('node:assert/strict');

const { createProjectsFixture, createProjectTreeFixture } = require('./fixtures/projects');
const { MockEventSource, flushUpdates, mountHomePage } = require('./helpers/pageHarness');

const findProjectButtonByName = (root, projectName) => {
  const buttons = root.querySelectorAll('button');
  for (const button of buttons) {
    if (button.textContent && button.textContent.includes(projectName)) {
      return button;
    }
  }
  return null;
};

module.exports = async () => {
  const projectPayload = { ok: true, projects: createProjectsFixture(), tree: createProjectTreeFixture() };
  const forestFoxProject = projectPayload.projects.find((project) => project.name === 'Forest Fox');
  assert.ok(forestFoxProject, 'missing seeded project: Forest Fox');
  const forestFoxProjectId = forestFoxProject.projectId;
  const desertLynxProject = projectPayload.projects.find((project) => project.name === 'Desert Lynx');
  assert.ok(desertLynxProject, 'missing seeded project: Desert Lynx');
  const desertLynxProjectId = desertLynxProject.projectId;

  const mounted = await mountHomePage({
    fetchImpl: async (requestUrl) => {
      assert.equal(String(requestUrl), '/api/projects/tree');
      return new Response(JSON.stringify(projectPayload), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8'
        }
      });
    },
    EventSourceImpl: MockEventSource
  });

  try {
    await flushUpdates();

    const { container, dom } = mounted;
    const viewport = container.querySelector('[aria-label="Model viewport. Drag or use arrow keys to rotate."]');
    assert.ok(viewport, 'viewport should expose keyboard-accessible aria label');
    assert.equal(viewport.getAttribute('aria-describedby'), 'dashboard-viewport-assist');
    const streamStatus = container.querySelector('[role="status"][aria-live="polite"]');
    assert.ok(streamStatus, 'stream status should be exposed as live region');
    assert.match(streamStatus.textContent ?? '', /스트림 상태/);

    assert.ok(MockEventSource.instances.length >= 1);
    const firstStream = MockEventSource.instances.at(-1);
    assert.ok(firstStream);
    assert.equal(firstStream.url, `/api/projects/${forestFoxProjectId}/stream?lastEventId=10`);

    await firstStream.emitError();
    await flushUpdates();

    const beforeClickText = container.textContent ?? '';
    assert.match(beforeClickText, /자동으로 다시 연결하는 중입니다/);

    const projectBButton = findProjectButtonByName(container, 'Desert Lynx');
    assert.ok(projectBButton, 'project list should stay visible while stream error banner is shown');
    assert.equal(projectBButton.disabled, false, 'project button should remain clickable while error is shown');

    projectBButton.dispatchEvent(new mounted.dom.window.MouseEvent('click', { bubbles: true }));
    await flushUpdates();

    const afterClickText = container.textContent ?? '';
    assert.doesNotMatch(afterClickText, /자동으로 다시 연결하는 중입니다/);

    const nextStream = MockEventSource.instances.at(-1);
    assert.ok(nextStream);
    assert.notEqual(nextStream, firstStream);
    assert.equal(firstStream.closed, true);
    assert.equal(nextStream.url, `/api/projects/${desertLynxProjectId}/stream?lastEventId=21`);
  } finally {
    await mounted.cleanup();
    MockEventSource.reset();
  }
};
