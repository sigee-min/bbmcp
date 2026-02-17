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

  emitMessage(payload) {
    const event = {
      data: JSON.stringify(payload)
    };
    const bucket = this.listeners.get('project_snapshot');
    if (bucket) {
      for (const listener of bucket) {
        listener(event);
      }
    }
    if (typeof this.onmessage === 'function') {
      this.onmessage(event);
    }
  }

  emitError() {
    if (typeof this.onerror === 'function') {
      this.onerror({ type: 'error' });
    }
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

module.exports = async () => {
  const originalFetch = globalThis.fetch;
  const originalEventSource = globalThis.EventSource;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  const scheduledTimers = new Map();
  let nextTimerId = 1;

  globalThis.setTimeout = (handler, _delay, ...args) => {
    const timerId = nextTimerId++;
    scheduledTimers.set(timerId, { handler, args });
    Promise.resolve().then(() => {
      const scheduled = scheduledTimers.get(timerId);
      if (!scheduled) {
        return;
      }
      scheduledTimers.delete(timerId);
      if (typeof scheduled.handler === 'function') {
        scheduled.handler(...scheduled.args);
      }
    });
    return timerId;
  };

  const store = getNativePipelineStore();
  await store.reset();
  globalThis.clearTimeout = (timerId) => {
    scheduledTimers.delete(timerId);
  };

  globalThis.fetch = async (requestUrl) => {
    assert.equal(String(requestUrl), '/api/projects');
    return new Response(
      JSON.stringify({
        ok: true,
        projects: await store.listProjects()
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8'
        }
      }
    );
  };
  globalThis.EventSource = MockEventSource;

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/'
  });

  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousNavigator = globalThis.navigator;
  const previousHTMLElement = globalThis.HTMLElement;
  const previousMouseEvent = globalThis.MouseEvent;
  const previousEvent = globalThis.Event;
  const previousActFlag = globalThis.IS_REACT_ACT_ENVIRONMENT;

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.navigator = dom.window.navigator;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.Event = dom.window.Event;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.setTimeout = globalThis.setTimeout;
  dom.window.clearTimeout = globalThis.clearTimeout;

  const container = dom.window.document.getElementById('root');
  assert.ok(container);
  const root = createRoot(container);

  try {
    await act(async () => {
      root.render(React.createElement(HomePage));
    });
    await flushUpdates();

    const viewport = container.querySelector('[aria-label="Model viewport. Drag or use arrow keys to rotate."]');
    assert.ok(viewport, 'viewport should remain keyboard reachable after stream reconnect');
    const streamStatus = container.querySelector('[role="status"][aria-live="polite"]');
    assert.ok(streamStatus, 'stream status should expose live updates');

    const firstStream = MockEventSource.instances.at(-1);
    assert.ok(firstStream);
    assert.match(firstStream.url, /\/api\/projects\/project-a\/stream\?lastEventId=10$/);

    await act(async () => {
      firstStream.emitMessage({
        projectId: 'project-a',
        revision: 14,
        hasGeometry: true,
        focusAnchor: [0, 24, 0],
        hierarchy: [],
        animations: [],
        stats: { bones: 8, cubes: 21 }
      });
    });
    await flushUpdates();

    await act(async () => {
      firstStream.emitError();
    });
    await flushUpdates();

    const resumedStream = MockEventSource.instances.at(-1);
    assert.ok(resumedStream);
    assert.notEqual(resumedStream, firstStream);
    assert.match(resumedStream.url, /\/api\/projects\/project-a\/stream\?lastEventId=14$/);
  } finally {
    await act(async () => {
      root.unmount();
    });
    globalThis.fetch = originalFetch;
    globalThis.EventSource = originalEventSource;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.navigator = previousNavigator;
    globalThis.HTMLElement = previousHTMLElement;
    globalThis.MouseEvent = previousMouseEvent;
    globalThis.Event = previousEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActFlag;
    MockEventSource.reset();
    dom.window.close();
  }
};
