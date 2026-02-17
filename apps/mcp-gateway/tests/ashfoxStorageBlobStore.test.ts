import assert from 'node:assert/strict';
import type { AshfoxBlobStoreConfig } from '../src/persistence/config';
import { AshfoxStorageBlobStore } from '../src/persistence/infrastructure/AshfoxStorageBlobStore';
import { registerAsync } from './helpers';

type StoredObject = {
  bytes: Uint8Array;
  contentType: string;
  cacheControl?: string;
  updatedAt: string;
};

registerAsync(
  (async () => {
    const serviceKey = 'service-key';
    const objects = new Map<string, StoredObject>();

    const fakeFetch = async (input: string, init?: RequestInit): Promise<Response> => {
      const url = new URL(input);
      const auth = new Headers(init?.headers).get('authorization');
      const apiKey = new Headers(init?.headers).get('apikey');
      if (auth !== `Bearer ${serviceKey}` || apiKey !== serviceKey) {
        return new Response('unauthorized', { status: 401 });
      }
      const prefix = '/storage/v1/object/';
      if (!url.pathname.startsWith(prefix)) {
        return new Response('not found', { status: 404 });
      }
      const pathParts = url.pathname.slice(prefix.length).split('/').filter(Boolean);
      if (pathParts.length < 2) {
        return new Response('not found', { status: 404 });
      }
      const bucket = decodeURIComponent(pathParts[0]);
      const key = pathParts.slice(1).map((part) => decodeURIComponent(part)).join('/');
      const storageKey = `${bucket}::${key}`;
      const method = String(init?.method ?? 'GET').toUpperCase();

      if (method === 'POST') {
        const raw = init?.body;
        const bytes =
          raw instanceof Uint8Array
            ? raw
            : typeof raw === 'string'
              ? Buffer.from(raw, 'utf8')
              : Buffer.alloc(0);
        objects.set(storageKey, {
          bytes,
          contentType: new Headers(init?.headers).get('content-type') ?? 'application/octet-stream',
          cacheControl: new Headers(init?.headers).get('cache-control') ?? undefined,
          updatedAt: new Date().toUTCString()
        });
        return new Response('ok', { status: 200 });
      }

      if (method === 'GET') {
        const found = objects.get(storageKey);
        if (!found) return new Response('missing', { status: 404 });
        return new Response(found.bytes, {
          status: 200,
          headers: {
            'content-type': found.contentType,
            ...(found.cacheControl ? { 'cache-control': found.cacheControl } : {}),
            'last-modified': found.updatedAt
          }
        });
      }

      if (method === 'DELETE') {
        if (!objects.has(storageKey)) return new Response('missing', { status: 404 });
        objects.delete(storageKey);
        return new Response('deleted', { status: 200 });
      }

      return new Response('method not allowed', { status: 405 });
    };

    const config: AshfoxBlobStoreConfig = {
      baseUrl: 'https://database.sigee.xyx',
      serviceKey,
      keyPrefix: 'models',
      requestTimeoutMs: 5000,
      upsert: true
    };
    const blobStore = new AshfoxStorageBlobStore(config, { fetchImpl: fakeFetch });

    await blobStore.put({
      bucket: 'assets',
      key: 'demo/model.json',
      bytes: Buffer.from('{"demo":true}', 'utf8'),
      contentType: 'application/json',
      cacheControl: 'max-age=60'
    });

    const found = await blobStore.get({
      bucket: 'assets',
      key: 'demo/model.json'
    });
    assert.ok(found);
    assert.equal(found?.contentType, 'application/json');
    assert.equal(Buffer.from(found?.bytes ?? []).toString('utf8'), '{"demo":true}');

    await blobStore.delete({
      bucket: 'assets',
      key: 'demo/model.json'
    });
    const missing = await blobStore.get({
      bucket: 'assets',
      key: 'demo/model.json'
    });
    assert.equal(missing, null);

    await assert.rejects(
      () =>
        blobStore.put({
          bucket: '',
          key: 'demo/model.json',
          bytes: Buffer.from('x', 'utf8'),
          contentType: 'application/json'
        }),
      /bucket must be a non-empty string\./
    );
  })()
);
