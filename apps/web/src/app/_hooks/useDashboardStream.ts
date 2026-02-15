'use client';

import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

import {
  applyProjectStreamPayload,
  buildStreamUrl,
  isProjectStreamPayload,
  markStreamConnecting,
  markStreamOpen,
  markStreamReconnecting,
  type DashboardState
} from '../../lib/dashboardModel';

interface UseDashboardStreamOptions {
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
  state,
  setState,
  reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS
}: UseDashboardStreamOptions): void => {
  const streamRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const openStream = (projectId: string, lastEventId: number) => {
    clearReconnectTimer();
    contextRef.current.generation += 1;
    const generation = contextRef.current.generation;

    const stream = new EventSource(buildStreamUrl(projectId, lastEventId));
    closeActiveStream();
    streamRef.current = stream;
    setState((prev) => markStreamConnecting(prev));

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
      setState((prev) => {
        const next = applyProjectStreamPayload(prev, parsedPayload);
        if (next !== prev) {
          const parsedEventId = Number.parseInt(event.lastEventId, 10);
          contextRef.current.lastEventId = Number.isFinite(parsedEventId) ? parsedEventId : next.lastAppliedRevision;
        }
        return next;
      });
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
      setState((prev) => markStreamReconnecting(prev, projectId));
      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(() => {
        if (contextRef.current.activeProjectId !== projectId || contextRef.current.generation !== generation) {
          return;
        }
        openStream(projectId, contextRef.current.lastEventId);
      }, reconnectDelayMs);
    };
  };

  useEffect(() => {
    contextRef.current.lastEventId = state.lastAppliedRevision;
  }, [state.lastAppliedRevision]);

  useEffect(() => {
    if (state.status !== 'success' || state.selectedProjectId === null) {
      contextRef.current.activeProjectId = null;
      clearReconnectTimer();
      closeActiveStream();
      return;
    }

    contextRef.current.activeProjectId = state.selectedProjectId;
    contextRef.current.lastEventId = state.lastAppliedRevision;
    openStream(state.selectedProjectId, state.lastAppliedRevision);

    return () => {
      clearReconnectTimer();
      closeActiveStream();
    };
    // selectedProjectId defines the active stream; revisions are tracked through contextRef.
  }, [state.status, state.selectedProjectId]);

  useEffect(
    () => () => {
      clearReconnectTimer();
      closeActiveStream();
    },
    []
  );
};
