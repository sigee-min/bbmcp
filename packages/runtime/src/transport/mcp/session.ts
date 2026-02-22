import { SseConnection } from './types';

export type McpSession = {
  id: string;
  protocolVersion: string;
  initialized: boolean;
  principalFingerprint: string | null;
  createdAt: number;
  lastSeenAt: number;
  sseConnections: Set<SseConnection>;
};

export class SessionStore {
  private readonly sessions = new Map<string, McpSession>();

  create(id: string, protocolVersion: string): McpSession {
    const now = Date.now();
    const session: McpSession = {
      id,
      protocolVersion,
      initialized: false,
      principalFingerprint: null,
      createdAt: now,
      lastSeenAt: now,
      sseConnections: new Set()
    };
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): McpSession | null {
    return this.sessions.get(id) ?? null;
  }

  touch(session: McpSession) {
    session.lastSeenAt = Date.now();
  }

  attachSse(session: McpSession, connection: SseConnection) {
    session.sseConnections.add(connection);
  }

  detachSse(session: McpSession, connection: SseConnection) {
    session.sseConnections.delete(connection);
  }

  pruneStale(ttlMs: number, now: number = Date.now()): number {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) return 0;
    const cutoff = now - ttlMs;
    let removed = 0;
    for (const session of Array.from(this.sessions.values())) {
      if (session.sseConnections.size > 0) {
        for (const conn of Array.from(session.sseConnections)) {
          if (conn.isClosed()) {
            session.sseConnections.delete(conn);
          }
        }
      }
      if (session.sseConnections.size > 0) continue;
      if (session.lastSeenAt >= cutoff) continue;
      this.close(session);
      removed += 1;
    }
    return removed;
  }

  close(session: McpSession) {
    for (const conn of session.sseConnections) {
      conn.close();
    }
    session.sseConnections.clear();
    this.sessions.delete(session.id);
  }
}


