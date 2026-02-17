import assert from 'node:assert/strict';

import { TraceLogStore } from '../src/trace/traceLogStore';
import type { TraceLogWriter } from '../src/ports/traceLog';
import type { ToolError } from '/contracts/types/internal';

class QueueWriter implements TraceLogWriter {
  readonly writes: string[] = [];
  private readonly queue: Array<ToolError | null>;

  constructor(queue: Array<ToolError | null> = []) {
    this.queue = [...queue];
  }

  write(text: string): ToolError | null {
    this.writes.push(text);
    if (this.queue.length === 0) return null;
    return this.queue.shift() ?? null;
  }
}

const record = (seq: number) => ({
  kind: 'step' as const,
  seq,
  ts: new Date(1_700_000_000_000 + seq).toISOString(),
  route: 'tool' as const,
  op: `op_${seq}`,
  response: { ok: true as const }
});

// append() returns writer error when autoFlush is enabled.
{
  const writeError: ToolError = { code: 'unknown', message: 'write failed' };
  const writer = new QueueWriter([writeError]);
  const store = new TraceLogStore({ writer, autoFlush: true, maxEntries: 10 });
  const appended = store.append(record(1));
  assert.equal(appended.error?.code, 'unknown');
  assert.equal(writer.writes.length, 1);
  assert.equal(writer.writes[0].includes('"op":"op_1"'), true);
}

// flush() supports writer override and no-writer fallback.
{
  const defaultWriter = new QueueWriter();
  const overrideError: ToolError = { code: 'invalid_state', message: 'override failed' };
  const overrideWriter = new QueueWriter([overrideError]);
  const store = new TraceLogStore({ writer: defaultWriter, autoFlush: false, maxEntries: 10 });
  store.append(record(1));
  const flushed = store.flush(overrideWriter);
  assert.equal(flushed?.code, 'invalid_state');
  assert.equal(defaultWriter.writes.length, 0);
  assert.equal(overrideWriter.writes.length, 1);
  assert.equal(new TraceLogStore({ autoFlush: false }).flush(), null);
}

// maxEntries trimming eventually compacts internal buffer and keeps latest entry.
{
  const store = new TraceLogStore({ autoFlush: false, maxEntries: 1 });
  for (let i = 1; i <= 1205; i += 1) store.append(record(i));
  const text = store.getText();
  assert.equal(store.size(), 1);
  assert.equal(text.includes('"seq":1,"ts"'), false);
  assert.equal(text.includes('"seq":1205,"ts"'), true);
}

// maxBytes trimming respects minEntries floor and allows disabling with 0.
{
  const store = new TraceLogStore({ autoFlush: false, maxEntries: 10, maxBytes: 1, minEntries: 2 });
  store.append(record(1));
  store.append(record(2));
  store.append(record(3));
  assert.equal(store.size(), 2);

  store.update({ minEntries: 0 });
  store.append(record(4));
  assert.equal(store.size(), 0);

  store.update({ maxBytes: 0 });
  store.append(record(5));
  assert.equal(store.size(), 1);
}

// clear() resets all in-memory state.
{
  const store = new TraceLogStore({ autoFlush: false, maxEntries: 10 });
  store.append(record(1));
  assert.equal(store.size(), 1);
  assert.equal(store.getText().length > 0, true);
  store.clear();
  assert.equal(store.size(), 0);
  assert.equal(store.getText(), '');
}

