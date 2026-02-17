import assert from 'node:assert/strict';
import {
  buildAppwriteError,
  createAppwriteTransport,
  normalizeAppwriteBaseUrl
} from '../src/persistence/infrastructure/appwrite/transport';
import { registerAsync } from './helpers';

registerAsync(
  (async () => {
    assert.equal(normalizeAppwriteBaseUrl('https://cloud.appwrite.io/v1///'), 'https://cloud.appwrite.io/v1');

    const captured: Array<{ url: string; init?: RequestInit }> = [];
    const transport = createAppwriteTransport(
      {
        baseUrl: 'https://cloud.appwrite.io/v1/',
        projectId: 'p-demo',
        apiKey: 'k-demo',
        responseFormat: '1.8.0',
        requestTimeoutMs: 5000
      },
      {
        fetchImpl: async (input: string, init?: RequestInit): Promise<Response> => {
          captured.push({ url: input, init });
          return Response.json({ ok: true }, { status: 200 });
        }
      }
    );

    const res = await transport.request('POST', '/databases/demo/documents', {
      json: { hello: 'world' },
      headers: { 'x-extra': '1' }
    });
    assert.equal(res.ok, true);
    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.url, 'https://cloud.appwrite.io/v1/databases/demo/documents');

    const sentHeaders = new Headers(captured[0]?.init?.headers);
    assert.equal(sentHeaders.get('x-appwrite-project'), 'p-demo');
    assert.equal(sentHeaders.get('x-appwrite-key'), 'k-demo');
    assert.equal(sentHeaders.get('x-appwrite-response-format'), '1.8.0');
    assert.equal(sentHeaders.get('content-type'), 'application/json');
    assert.equal(sentHeaders.get('x-extra'), '1');
    assert.equal(captured[0]?.init?.body, JSON.stringify({ hello: 'world' }));

    const timeoutTransport = createAppwriteTransport(
      {
        baseUrl: 'https://cloud.appwrite.io/v1',
        projectId: 'p-demo',
        apiKey: 'k-demo',
        responseFormat: '1.8.0',
        requestTimeoutMs: 7
      },
      {
        fetchImpl: async (): Promise<Response> => {
          const abortError = new Error('aborted');
          abortError.name = 'AbortError';
          throw abortError;
        }
      }
    );
    await assert.rejects(
      () => timeoutTransport.request('GET', '/storage/buckets/demo/files'),
      /timed out after 7ms/
    );

    const structuredError = await buildAppwriteError(
      Response.json(
        { message: 'Unauthorized', code: 401, type: 'general_unauthorized_scope' },
        { status: 401, statusText: 'Unauthorized' }
      ),
      'request'
    );
    assert.equal(structuredError.message, 'Appwrite request failed: Unauthorized (general_unauthorized_scope/401)');

    const rawError = await buildAppwriteError(
      new Response('service unavailable', { status: 503, statusText: 'Service Unavailable' }),
      'request'
    );
    assert.equal(rawError.message, 'Appwrite request failed: 503 Service Unavailable :: service unavailable');
  })()
);
