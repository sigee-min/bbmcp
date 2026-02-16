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
  getProject(projectId: string): Promise<NativeProjectSnapshot | null>;
  getProjectEventsSince(projectId: string, lastSeq: number): Promise<NativeProjectEvent[]>;
};

type EventPushContext = {
  cursor: number;
  sentInitialSnapshot: boolean;
};

const pushInitialSnapshotIfNeeded = async (
  store: StreamStore,
  projectId: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  context: EventPushContext
): Promise<void> => {
  if (context.sentInitialSnapshot) {
    return;
  }
  const current = await store.getProject(projectId);
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

const pushPendingEvents = async (
  store: StreamStore,
  projectId: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  context: EventPushContext
): Promise<void> => {
  const pending = await store.getProjectEventsSince(projectId, context.cursor);
  if (pending.length === 0) {
    await pushInitialSnapshotIfNeeded(store, projectId, controller, context);
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

      const pumpEvents = async (): Promise<void> => {
        try {
          const project = await store.getProject(projectId);
          if (!project) {
            pushUnavailableError(controller, projectId, context.cursor + 1);
            return;
          }
          await pushPendingEvents(store, projectId, controller, context);
        } catch {
          pushUnavailableError(controller, projectId, context.cursor + 1);
        }
      };

      void pumpEvents();

      const eventTimer = setInterval(() => {
        void pumpEvents();
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
