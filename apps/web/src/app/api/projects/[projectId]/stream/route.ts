import { buildStreamPayload, getProject } from '../../../../../lib/mockProjectStore';

export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

const toIntegerOrNull = (value: string | null): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatSseMessage = (eventName: string, eventId: number, data: unknown): string =>
  `id: ${eventId}\nevent: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      projectId: string;
    }>;
  }
) {
  const { projectId } = await context.params;
  const project = getProject(projectId);

  if (!project) {
    return new Response(
      JSON.stringify({
        ok: false,
        code: 'project_load_failed',
        message: `Project not found: ${projectId}`
      }),
      {
        status: 404,
        headers: {
          'content-type': 'application/json; charset=utf-8'
        }
      }
    );
  }

  const url = new URL(request.url);
  const lastEventIdFromQuery = toIntegerOrNull(url.searchParams.get('lastEventId'));
  const lastEventIdFromHeader = toIntegerOrNull(request.headers.get('last-event-id'));
  const lastEventId = lastEventIdFromHeader ?? lastEventIdFromQuery;

  const initialRevision = lastEventId === null ? project.revision : Math.max(project.revision, lastEventId + 1);
  let currentRevision = initialRevision - 1;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const pushEvent = () => {
        currentRevision += 1;
        const payload = buildStreamPayload(projectId, currentRevision);
        if (!payload) {
          controller.enqueue(
            encoder.encode(
              formatSseMessage('stream_error', currentRevision, {
                code: 'stream_unavailable',
                projectId
              })
            )
          );
          return;
        }
        controller.enqueue(encoder.encode(formatSseMessage('project_snapshot', currentRevision, payload)));
      };

      pushEvent();
      const eventTimer = setInterval(pushEvent, 4500);
      const keepAliveTimer = setInterval(() => {
        controller.enqueue(encoder.encode(': keepalive\n\n'));
      }, 15000);

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

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    }
  });
}
