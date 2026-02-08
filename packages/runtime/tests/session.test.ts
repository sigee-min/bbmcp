import assert from 'node:assert/strict';

import { SessionStore } from '../src/transport/mcp/session';

const sessions = new SessionStore();
const session = sessions.create('s1', '2025-06-18');

// Attach a closed SSE connection; prune should treat it as gone.
session.sseConnections.add({
  send: () => undefined,
  close: () => undefined,
  isClosed: () => true
});

// Force staleness.
session.lastSeenAt = 0;
const removed = sessions.pruneStale(1, 10);
assert.equal(removed, 1);
assert.equal(sessions.get('s1'), null);

