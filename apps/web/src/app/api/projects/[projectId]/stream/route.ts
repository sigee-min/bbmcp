import { getNativePipelineStore } from '../../../../../lib/nativePipelineStore';
import { createProjectStream } from './projectStream';
import {
  normalizeLastEventId,
  streamResponseHeaders,
  toIntegerOrNull
} from './sse';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      projectId: string;
    }>;
  }
) {
  const store = getNativePipelineStore();
  const { projectId } = await context.params;
  const project = store.getProject(projectId);

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
  const cursor = normalizeLastEventId(lastEventIdFromHeader ?? lastEventIdFromQuery);
  const stream = createProjectStream({ request, store, projectId, cursor });

  return new Response(stream, {
    headers: streamResponseHeaders
  });
}
