import assert from 'node:assert/strict';

import { createHandlerResolver } from '../src/dispatcher/handlerResolver';
import type { Handler } from '../src/dispatcher/responseHelpers';

const asHandler = (fn: (payload: unknown) => unknown): Handler => fn as Handler;

{
  const calls: string[] = [];
  const resolver = createHandlerResolver({
    statefulRetryHandlers: {
      add_cube: ((payload: unknown) => {
        calls.push(`retry:${String((payload as { id?: string }).id ?? 'none')}`);
        return { ok: true, value: { ok: true } };
      }) as never
    },
    statefulHandlers: {
      add_cube: ((payload: unknown) => {
        calls.push(`stateful:${String((payload as { id?: string }).id ?? 'none')}`);
        return { ok: true, value: { ok: true } };
      }) as never
    },
    responseHandlers: {},
    wrapRetryHandler: (_name, handler) =>
      asHandler((payload) => {
        calls.push('wrapRetry');
        return (handler as (x: unknown) => unknown)(payload);
      }),
    wrapStatefulHandler: (_name, handler) =>
      asHandler((payload) => {
        calls.push('wrapStateful');
        return (handler as (x: unknown) => unknown)(payload);
      })
  });
  const handler = resolver('add_cube');
  assert.ok(handler);
  handler?.({ id: 'a' } as never);
  assert.deepEqual(calls, ['wrapRetry', 'retry:a']);
}

{
  const calls: string[] = [];
  const resolver = createHandlerResolver({
    statefulRetryHandlers: {},
    statefulHandlers: {
      add_cube: ((payload: unknown) => {
        calls.push(`stateful:${String((payload as { id?: string }).id ?? 'none')}`);
        return { ok: true, value: { ok: true } };
      }) as never
    },
    responseHandlers: {},
    wrapRetryHandler: (_name, handler) =>
      asHandler((payload) => (handler as (x: unknown) => unknown)(payload)),
    wrapStatefulHandler: (_name, handler) =>
      asHandler((payload) => {
        calls.push('wrapStateful');
        return (handler as (x: unknown) => unknown)(payload);
      })
  });
  const handler = resolver('add_cube');
  assert.ok(handler);
  handler?.({ id: 'b' } as never);
  assert.deepEqual(calls, ['wrapStateful', 'stateful:b']);
}

{
  const calls: string[] = [];
  const resolver = createHandlerResolver({
    statefulRetryHandlers: {},
    statefulHandlers: {},
    responseHandlers: {
      list_capabilities: ((payload: unknown) => {
        calls.push(`response:${String(payload ?? 'none')}`);
        return { ok: true, data: {} };
      }) as never
    },
    wrapRetryHandler: (_name, handler) =>
      asHandler((payload) => (handler as (x: unknown) => unknown)(payload)),
    wrapStatefulHandler: (_name, handler) =>
      asHandler((payload) => (handler as (x: unknown) => unknown)(payload))
  });
  const handler = resolver('list_capabilities');
  assert.ok(handler);
  handler?.({} as never);
  assert.deepEqual(calls, ['response:[object Object]']);
}

{
  const resolver = createHandlerResolver({
    statefulRetryHandlers: {},
    statefulHandlers: {},
    responseHandlers: {},
    wrapRetryHandler: (_name, handler) =>
      asHandler((payload) => (handler as (x: unknown) => unknown)(payload)),
    wrapStatefulHandler: (_name, handler) =>
      asHandler((payload) => (handler as (x: unknown) => unknown)(payload))
  });
  assert.equal(resolver('list_capabilities'), null);
}
