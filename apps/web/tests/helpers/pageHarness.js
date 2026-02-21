const assert = require('node:assert/strict');

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { JSDOM } = require('jsdom');

const HomePage = require('../../src/app/page').default;

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

const flushUpdates = async (turns = 6) => {
  await act(async () => {
    await flushMicrotasks(turns);
  });
};

const dispatchInAct = async (target, event) => {
  await act(async () => {
    target.dispatchEvent(event);
  });
};

const emitMessageInAct = async (eventSource, payload) => {
  await act(async () => {
    eventSource.emitMessage(payload);
  });
};

const emitErrorInAct = async (eventSource) => {
  await act(async () => {
    eventSource.emitError();
  });
};

const installImmediateTimers = () => {
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

  globalThis.clearTimeout = (timerId) => {
    scheduledTimers.delete(timerId);
  };

  return () => {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  };
};

const mountHomePage = async ({ fetchImpl, EventSourceImpl, beforeRender }) => {
  const originalFetch = globalThis.fetch;
  const originalEventSource = globalThis.EventSource;

  globalThis.fetch = fetchImpl;
  globalThis.EventSource = EventSourceImpl;

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/'
  });
  // Keep unit tests deterministic: disable WebGL-dependent preview path.
  dom.window.WebGLRenderingContext = undefined;
  dom.window.WebGL2RenderingContext = undefined;

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

  if (typeof beforeRender === 'function') {
    beforeRender(dom.window);
  }

  const container = dom.window.document.getElementById('root');
  assert.ok(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(HomePage));
  });

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

  return {
    container,
    dom,
    cleanup
  };
};

module.exports = {
  MockEventSource,
  dispatchInAct,
  emitErrorInAct,
  emitMessageInAct,
  flushMicrotasks,
  flushUpdates,
  installImmediateTimers,
  mountHomePage
};
