const assert = require('node:assert/strict');

const { createProjectsFixture, createProjectTreeFixture } = require('./fixtures/projects');
const { MockEventSource, flushUpdates, mountHomePage } = require('./helpers/pageHarness');

module.exports = async () => {
  {
    const projectsPayload = { ok: true, projects: createProjectsFixture(), tree: createProjectTreeFixture() };
    const mounted = await mountHomePage({
      fetchImpl: async (requestUrl) => {
        assert.equal(String(requestUrl), '/api/projects/tree');
        return new Response(JSON.stringify(projectsPayload), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      },
      EventSourceImpl: MockEventSource
    });

    try {
      await flushUpdates();
      const { container, dom } = mounted;
      const layoutMain = container.querySelector('main');
      assert.ok(layoutMain);
      assert.match(layoutMain.className, /layout/);
      assert.ok(container.querySelector('.sidebarArea'));
      assert.ok(container.querySelector('.centerArea'));
      assert.ok(container.querySelector('.inspectorArea'));
      const streamStatus = container.querySelector('[role="status"][aria-live="polite"]');
      assert.ok(streamStatus);

      const viewport = container.querySelector('[aria-label="Model viewport. Drag or use arrow keys to rotate."]');
      assert.ok(viewport);

      const frame = viewport.firstElementChild;
      assert.ok(frame);
      const initialTransform = frame.style.transform;
      assert.equal(initialTransform, '');
      const yawReadout = container.querySelector('.font-mono');
      assert.ok(yawReadout);
      const initialYawText = yawReadout.textContent;
      assert.match(initialYawText, /yaw 0 \/ pitch 0/);

      viewport.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await flushUpdates();

      const nextYawText = yawReadout.textContent;
      assert.notEqual(nextYawText, initialYawText);
      assert.match(nextYawText, /yaw 4 \/ pitch 0/);
    } finally {
      await mounted.cleanup();
      MockEventSource.reset();
    }
  }

  {
    const projectsPayload = { ok: true, projects: createProjectsFixture(), tree: createProjectTreeFixture() };
    let fetchCount = 0;
    let streamCreated = false;
    class PassiveEventSource {
      constructor() {
        streamCreated = true;
        this.onmessage = null;
        this.onopen = null;
        this.onerror = null;
      }

      addEventListener() {}

      close() {}
    }

    const mounted = await mountHomePage({
      fetchImpl: async () => {
        fetchCount += 1;
        if (fetchCount === 1) {
          return new Response(JSON.stringify({ ok: true, projects: [], tree: { maxFolderDepth: 3, roots: [] } }), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        return new Response(JSON.stringify(projectsPayload), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      },
      EventSourceImpl: PassiveEventSource
    });

    try {
      await flushUpdates();
      const text = mounted.container.textContent ?? '';
      assert.match(text, /표시할 프로젝트가 없습니다/);
      const reloadButton = Array.from(mounted.container.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('프로젝트 다시 불러오기')
      );
      assert.ok(reloadButton, 'empty state should expose reload CTA');
      assert.equal(streamCreated, false);

      reloadButton.dispatchEvent(new mounted.dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const reloadedText = mounted.container.textContent ?? '';
      assert.match(reloadedText, /Desert Lynx/);
      assert.equal(streamCreated, true);
      assert.equal(fetchCount >= 2, true);
    } finally {
      await mounted.cleanup();
    }
  }

  {
    const projectsPayload = { ok: true, projects: createProjectsFixture(), tree: createProjectTreeFixture() };
    let fetchCount = 0;
    let streamCreated = false;
    class PassiveEventSource {
      constructor() {
        streamCreated = true;
        this.onmessage = null;
        this.onopen = null;
        this.onerror = null;
      }

      addEventListener() {}

      close() {}
    }

    const mounted = await mountHomePage({
      fetchImpl: async () => {
        fetchCount += 1;
        if (fetchCount === 1) {
          throw new Error('network down');
        }
        return new Response(JSON.stringify(projectsPayload), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      },
      EventSourceImpl: PassiveEventSource
    });

    try {
      await flushUpdates();
      const text = mounted.container.textContent ?? '';
      assert.match(text, /프로젝트를 불러오지 못했습니다/);
      const retryButton = Array.from(mounted.container.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('다시 시도')
      );
      assert.ok(retryButton, 'error state should expose retry CTA');

      retryButton.dispatchEvent(new mounted.dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const retriedText = mounted.container.textContent ?? '';
      assert.match(retriedText, /Desert Lynx/);
      assert.equal(streamCreated, true);
      assert.equal(fetchCount >= 2, true);
    } finally {
      await mounted.cleanup();
    }
  }
};
