'use client';

import { startTransition, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

import {
  applyProjectStreamPayload,
  buildStreamUrl,
  isProjectStreamPayload,
  markStreamConnecting,
  markStreamOpen,
  markStreamReconnecting,
  type DashboardState,
  type ProjectStreamPayload
} from '../../lib/dashboardModel';

interface UseDashboardStreamOptions {
  workspaceId: string;
  state: DashboardState;
  setState: Dispatch<SetStateAction<DashboardState>>;
  reconnectDelayMs?: number;
}

interface StreamContext {
  activeProjectId: string | null;
  lastEventId: number;
  generation: number;
}

const DEFAULT_RECONNECT_DELAY_MS = 1200;

export const useDashboardStream = ({
  workspaceId,
  state,
  setState,
  reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS
}: UseDashboardStreamOptions): void => {
  const streamRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduledFrameRef = useRef<number | null>(null);
  const flushQueuedRef = useRef(false);
  const pendingPayloadRef = useRef<ProjectStreamPayload | null>(null);
  const pendingEventIdRef = useRef(-1);
  const contextRef = useRef<StreamContext>({
    activeProjectId: null,
    lastEventId: -1,
    generation: 0
  });

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const closeActiveStream = () => {
    streamRef.current?.close();
    streamRef.current = null;
  };

  const clearPendingSnapshot = () => {
    pendingPayloadRef.current = null;
    pendingEventIdRef.current = -1;
  };

  const cancelScheduledFlush = () => {
    if (scheduledFrameRef.current !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(scheduledFrameRef.current);
    }
    scheduledFrameRef.current = null;
    flushQueuedRef.current = false;
    clearPendingSnapshot();
  };

  const openStream = (projectId: string, lastEventId: number, selectedWorkspaceId: string) => {
    clearReconnectTimer();
    cancelScheduledFlush();
    contextRef.current.generation += 1;
    const generation = contextRef.current.generation;

    const stream = new EventSource(buildStreamUrl(projectId, lastEventId, selectedWorkspaceId));
    closeActiveStream();
    streamRef.current = stream;
    setState((prev) => markStreamConnecting(prev));

    const flushPendingSnapshot = () => {
      scheduledFrameRef.current = null;
      flushQueuedRef.current = false;

      if (contextRef.current.activeProjectId !== projectId || contextRef.current.generation !== generation) {
        clearPendingSnapshot();
        return;
      }

      const payload = pendingPayloadRef.current;
      const pendingEventId = pendingEventIdRef.current;
      clearPendingSnapshot();
      if (!payload) {
        return;
      }

      startTransition(() => {
        setState((prev) => {
          const next = applyProjectStreamPayload(prev, payload);
          if (next !== prev) {
            contextRef.current.lastEventId = pendingEventId >= 0 ? pendingEventId : next.lastAppliedRevision;
          }
          return next;
        });
      });
    };

    const schedulePendingFlush = () => {
      if (flushQueuedRef.current) {
        return;
      }
      flushQueuedRef.current = true;

      if (typeof requestAnimationFrame === 'function') {
        scheduledFrameRef.current = requestAnimationFrame(() => {
          flushPendingSnapshot();
        });
        return;
      }

      queueMicrotask(() => {
        flushPendingSnapshot();
      });
    };

    const onSnapshot = (event: MessageEvent<string>) => {
      let parsedPayload: unknown;
      try {
        parsedPayload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!isProjectStreamPayload(parsedPayload)) {
        return;
      }

      const parsedEventId = Number.parseInt(event.lastEventId, 10);
      const eventRevision = Number.isFinite(parsedEventId) ? parsedEventId : parsedPayload.revision;
      if (eventRevision <= contextRef.current.lastEventId) {
        return;
      }

      const pending = pendingPayloadRef.current;
      if (pending && parsedPayload.revision <= pending.revision) {
        return;
      }

      pendingPayloadRef.current = parsedPayload;
      pendingEventIdRef.current = eventRevision;
      schedulePendingFlush();
    };

    stream.addEventListener('project_snapshot', onSnapshot as EventListener);
    stream.onmessage = onSnapshot;
    stream.onopen = () => {
      if (contextRef.current.activeProjectId !== projectId || contextRef.current.generation !== generation) {
        return;
      }
      setState((prev) => markStreamOpen(prev, projectId));
    };
    stream.onerror = () => {
      if (contextRef.current.activeProjectId !== projectId || contextRef.current.generation !== generation) {
        return;
      }
      cancelScheduledFlush();
      setState((prev) => markStreamReconnecting(prev, projectId));
      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(() => {
        if (contextRef.current.activeProjectId !== projectId || contextRef.current.generation !== generation) {
          return;
        }
        openStream(projectId, contextRef.current.lastEventId, selectedWorkspaceId);
      }, reconnectDelayMs);
    };
  };

  useEffect(() => {
    contextRef.current.generation += 1;
    contextRef.current.activeProjectId = null;
    contextRef.current.lastEventId = -1;
    clearReconnectTimer();
    cancelScheduledFlush();
    closeActiveStream();
  }, [workspaceId]);

  useEffect(() => {
    contextRef.current.lastEventId = state.lastAppliedRevision;
  }, [state.lastAppliedRevision]);

  useEffect(() => {
    if (state.status !== 'success' || state.selectedProjectId === null) {
      contextRef.current.activeProjectId = null;
      clearReconnectTimer();
      cancelScheduledFlush();
      closeActiveStream();
      return;
    }

    contextRef.current.activeProjectId = state.selectedProjectId;
    contextRef.current.lastEventId = state.lastAppliedRevision;
    openStream(state.selectedProjectId, state.lastAppliedRevision, workspaceId);

    return () => {
      clearReconnectTimer();
      cancelScheduledFlush();
      closeActiveStream();
    };
    // selectedProjectId defines the active stream; revisions are tracked through contextRef.
  }, [state.status, state.selectedProjectId, workspaceId]);

  useEffect(
    () => () => {
      clearReconnectTimer();
      cancelScheduledFlush();
      closeActiveStream();
    },
    []
  );
};
