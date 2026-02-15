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

  removeEventListener(eventName, listener) {
    const bucket = this.listeners.get(eventName);
    if (!bucket) {
      return;
    }
    bucket.delete(listener);
    if (bucket.size === 0) {
      this.listeners.delete(eventName);
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

const flushMicrotasks = async (turns = 3) => {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
};

const flushUpdates = async () => {
  await act(async () => {
    await flushMicrotasks(5);
  });
};

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
  const originalFetch = globalThis.fetch;
  const originalEventSource = globalThis.EventSource;
  const store = getNativePipelineStore();
  store.reset();
  const projectPayload = { ok: true, projects: store.listProjects() };

  globalThis.fetch = async (requestUrl) => {
    assert.equal(String(requestUrl), '/api/projects');
    return new Response(JSON.stringify(projectPayload), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8'
      }
    });
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

  const container = dom.window.document.getElementById('root');
  assert.ok(container);
  const root = createRoot(container);

  try {
    await act(async () => {
      root.render(React.createElement(HomePage));
    });
    await flushUpdates();

    assert.ok(MockEventSource.instances.length >= 1);
    const firstStream = MockEventSource.instances.at(-1);
    assert.ok(firstStream);
    assert.match(firstStream.url, /\/api\/projects\/project-a\/stream\?lastEventId=10$/);

    await act(async () => {
      firstStream.emitError();
    });
    await flushUpdates();

    const beforeClickText = container.textContent ?? '';
    assert.match(beforeClickText, /stream_unavailable: reconnecting/);

    const projectBButton = findProjectButtonByName(container, 'Desert Lynx');
    assert.ok(projectBButton, 'project list should stay visible while stream error banner is shown');
    assert.equal(projectBButton.disabled, false, 'project button should remain clickable while error is shown');

    await act(async () => {
      projectBButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    await flushUpdates();

    const afterClickText = container.textContent ?? '';
    assert.doesNotMatch(afterClickText, /stream_unavailable: reconnecting/);

    const nextStream = MockEventSource.instances.at(-1);
    assert.ok(nextStream);
    assert.notEqual(nextStream, firstStream);
    assert.equal(firstStream.closed, true);
    assert.match(nextStream.url, /\/api\/projects\/project-b\/stream\?lastEventId=21$/);
  } finally {
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
    globalThis.Event = previousEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActFlag;
    MockEventSource.reset();
    dom.window.close();
  }
};
