import type { NativeProjectEvent, NativeProjectSnapshot } from '../../../../../lib/nativePipelineStore';
import { buildSnapshotPayload } from './snapshotPayload';
import {
  encodeSseChunk,
  EVENT_POLL_MS,
  formatSseMessage,
  KEEPALIVE_MS
} from './sse';

type CreateProjectStreamArgs = {
  request: Request;
  store: StreamStore;
  projectId: string;
  cursor: number;
};

type StreamStore = {
  getProject(projectId: string): NativeProjectSnapshot | null;
  getProjectEventsSince(projectId: string, lastSeq: number): NativeProjectEvent[];
};

type EventPushContext = {
  cursor: number;
  sentInitialSnapshot: boolean;
};

const pushInitialSnapshotIfNeeded = (
  store: StreamStore,
  projectId: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  context: EventPushContext
): void => {
  if (context.sentInitialSnapshot) {
    return;
  }
  const current = store.getProject(projectId);
  if (!current) {
    return;
  }

  const nextEventId = context.cursor + 1;
  const nextRevision = Math.max(current.revision, nextEventId);
  controller.enqueue(
    encodeSseChunk(formatSseMessage('project_snapshot', nextEventId, buildSnapshotPayload(current, nextRevision)))
  );
  context.cursor = nextEventId;
  context.sentInitialSnapshot = true;
};

const pushPendingEvents = (
  store: StreamStore,
  projectId: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  context: EventPushContext
): void => {
  const pending = store.getProjectEventsSince(projectId, context.cursor);
  if (pending.length === 0) {
    pushInitialSnapshotIfNeeded(store, projectId, controller, context);
    return;
  }

  for (const event of pending) {
    context.cursor = event.seq;
    controller.enqueue(encodeSseChunk(formatSseMessage(event.event, event.seq, event.data)));
  }
  context.sentInitialSnapshot = true;
};

const pushUnavailableError = (
  controller: ReadableStreamDefaultController<Uint8Array>,
  projectId: string,
  nextEventId: number
): void => {
  controller.enqueue(
    encodeSseChunk(
      formatSseMessage('stream_error', nextEventId, {
        code: 'stream_unavailable',
        projectId
      })
    )
  );
};

export const createProjectStream = ({ request, store, projectId, cursor }: CreateProjectStreamArgs): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const context: EventPushContext = {
        cursor,
        sentInitialSnapshot: false
      };

      pushPendingEvents(store, projectId, controller, context);

      const eventTimer = setInterval(() => {
        const project = store.getProject(projectId);
        if (!project) {
          pushUnavailableError(controller, projectId, context.cursor + 1);
          return;
        }
        pushPendingEvents(store, projectId, controller, context);
      }, EVENT_POLL_MS);

      const keepAliveTimer = setInterval(() => {
        controller.enqueue(encodeSseChunk(': keepalive\n\n'));
      }, KEEPALIVE_MS);

      request.signal.addEventListener(
        'abort',
        () => {
          clearInterval(eventTimer);
          clearInterval(keepAliveTimer);
          controller.close();
        },
        { once: true }
      );
    }
  });
