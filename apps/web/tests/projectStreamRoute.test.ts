import assert from 'node:assert/strict';

import { GET } from '../src/app/api/projects/[projectId]/stream/route';
import { getNativePipelineStore } from '../src/lib/nativePipelineStore';

const decoder = new TextDecoder();

const parseFrame = (frame: string): { eventId: number; eventName: string; payload: unknown } => {
  const trimmed = frame.trim();
  const lines = trimmed.split('\n');
  const idLine = lines.find((line) => line.startsWith('id: '));
  const eventLine = lines.find((line) => line.startsWith('event: '));
  const dataLine = lines.find((line) => line.startsWith('data: '));

  assert.ok(idLine, 'SSE frame must include id line');
  assert.ok(eventLine, 'SSE frame must include event line');
  assert.ok(dataLine, 'SSE frame must include data line');

  const eventId = Number.parseInt(idLine.slice('id: '.length), 10);
  assert.ok(Number.isFinite(eventId), 'SSE id must be numeric');

  return {
    eventId,
    eventName: eventLine.slice('event: '.length),
    payload: JSON.parse(dataLine.slice('data: '.length))
  };
};

const readFirstFrame = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader();
  assert.ok(reader, 'SSE response body must be readable');

  let chunkText = '';
  for (let readCount = 0; readCount < 4; readCount += 1) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    chunkText += decoder.decode(chunk.value, { stream: true });
    if (chunkText.includes('\n\n')) {
      break;
    }
  }

  const frameEnd = chunkText.indexOf('\n\n');
  assert.notEqual(frameEnd, -1, 'SSE stream must emit a frame terminator');

  return chunkText.slice(0, frameEnd + 2);
};

const getProjectStream = async (
  projectId: string,
  options: {
    queryLastEventId?: number;
    headerLastEventId?: number;
  } = {}
): Promise<{ response: Response; abortController: AbortController }> => {
  const abortController = new AbortController();
  const url = new URL(`http://localhost/api/projects/${projectId}/stream`);
  if (typeof options.queryLastEventId === 'number') {
    url.searchParams.set('lastEventId', String(options.queryLastEventId));
  }
  const headers = new Headers();
  if (typeof options.headerLastEventId === 'number') {
    headers.set('last-event-id', String(options.headerLastEventId));
  }

  const response = await GET(new Request(url, { headers, signal: abortController.signal }), {
    params: Promise.resolve({ projectId })
  });

  return { response, abortController };
};

module.exports = async () => {
  const store = getNativePipelineStore();
  await store.reset();

  {
    const response = await GET(new Request('http://localhost/api/projects/missing-project/stream'), {
      params: Promise.resolve({ projectId: 'missing-project' })
    });
    assert.equal(response.status, 404);
    const body = (await response.json()) as { code?: string };
    assert.equal(body.code, 'project_load_failed');
  }

  {
    const { response, abortController } = await getProjectStream('project-a');
    try {
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', /^text\/event-stream\b/);
      const frame = await readFirstFrame(response);
      const parsed = parseFrame(frame);
      assert.equal(parsed.eventName, 'project_snapshot');
      const payload = parsed.payload as { projectId?: string; revision?: number };
      assert.equal(payload.projectId, 'project-a');
      assert.equal(typeof payload.revision, 'number');
    } finally {
      abortController.abort();
    }
  }

  {
    const { response, abortController } = await getProjectStream('project-a', { queryLastEventId: 15 });
    try {
      const frame = await readFirstFrame(response);
      const parsed = parseFrame(frame);
      assert.equal(parsed.eventId, 16);
    } finally {
      abortController.abort();
    }
  }

  {
    const { response, abortController } = await getProjectStream('project-a', {
      queryLastEventId: 15,
      headerLastEventId: 30
    });
    try {
      const frame = await readFirstFrame(response);
      const parsed = parseFrame(frame);
      assert.equal(parsed.eventId, 31);
    } finally {
      abortController.abort();
    }
  }
};
