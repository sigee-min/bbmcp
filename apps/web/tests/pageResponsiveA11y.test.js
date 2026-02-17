const assert = require('node:assert/strict');

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { JSDOM } = require('jsdom');

const HomePage = require('../src/app/page').default;
const { getNativePipelineStore } = require('../src/lib/nativePipelineStore');

class MockEventSource {
  static instances = [];

  constructor(url) {
    this.url = String(url);
    this.onmessage = null;
    this.onopen = null;
    this.onerror = null;
    this.closed = false;
    this.listeners = new Map();
    MockEventSource.instances.push(this);
  }

  static reset() {
    MockEventSource.instances.length = 0;
  }

  addEventListener(eventName, listener) {
    const bucket = this.listeners.get(eventName) ?? new Set();
    bucket.add(listener);
    this.listeners.set(eventName, bucket);
  }

  close() {
    this.closed = true;
  }
}

const flushMicrotasks = async (turns = 6) => {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
};

const flushUpdates = async () => {
  await act(async () => {
    await flushMicrotasks();
  });
};

const mountPage = async ({ fetchImpl, EventSourceImpl }) => {
  const originalFetch = globalThis.fetch;
  const originalEventSource = globalThis.EventSource;

  globalThis.fetch = fetchImpl;
  globalThis.EventSource = EventSourceImpl;

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/'
  });

  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousNavigator = globalThis.navigator;
  const previousHTMLElement = globalThis.HTMLElement;
  const previousMouseEvent = globalThis.MouseEvent;
  const previousKeyboardEvent = globalThis.KeyboardEvent;
  const previousEvent = globalThis.Event;
  const previousActFlag = globalThis.IS_REACT_ACT_ENVIRONMENT;

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.navigator = dom.window.navigator;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.Event = dom.window.Event;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const container = dom.window.document.getElementById('root');
  assert.ok(container);
  const root = createRoot(container);

  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
    globalThis.fetch = originalFetch;
    globalThis.EventSource = originalEventSource;
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.navigator = previousNavigator;
    globalThis.HTMLElement = previousHTMLElement;
    globalThis.MouseEvent = previousMouseEvent;
    globalThis.KeyboardEvent = previousKeyboardEvent;
    globalThis.Event = previousEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActFlag;
    dom.window.close();
  };

  await act(async () => {
    root.render(React.createElement(HomePage));
  });

  return {
    container,
    dom,
    cleanup
  };
};

module.exports = async () => {
  const store = getNativePipelineStore();
  await store.reset();

  {
    const projectsPayload = { ok: true, projects: await store.listProjects() };
    const mounted = await mountPage({
      fetchImpl: async (requestUrl) => {
        assert.equal(String(requestUrl), '/api/projects');
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
      assert.ok(initialTransform.includes('rotateY(0deg)'));

      await act(async () => {
        viewport.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      await flushUpdates();

      const nextTransform = frame.style.transform;
      assert.notEqual(nextTransform, initialTransform);
      assert.match(nextTransform, /rotateY/);
    } finally {
      await mounted.cleanup();
      MockEventSource.reset();
    }
  }

  {
    const projectsPayload = { ok: true, projects: await store.listProjects() };
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

    const mounted = await mountPage({
      fetchImpl: async () => {
        fetchCount += 1;
        if (fetchCount === 1) {
          return new Response(JSON.stringify({ ok: true, projects: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        return new Response(JSON.stringify(projectsPayload), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      }
      ,
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

      await act(async () => {
        reloadButton.dispatchEvent(new mounted.dom.window.MouseEvent('click', { bubbles: true }));
      });
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
    const projectsPayload = { ok: true, projects: await store.listProjects() };
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

    const mounted = await mountPage({
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

      await act(async () => {
        retryButton.dispatchEvent(new mounted.dom.window.MouseEvent('click', { bubbles: true }));
      });
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
