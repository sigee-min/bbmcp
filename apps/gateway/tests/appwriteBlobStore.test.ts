import assert from 'node:assert/strict';
import type { AppwriteBlobStoreConfig } from '@ashfox/gateway-persistence/config';
import { AppwriteBlobStore } from '@ashfox/gateway-persistence/infrastructure/AppwriteBlobStore';
import { registerAsync } from './helpers';

type StoredFile = {
  bytes: Uint8Array;
  mimeType: string;
  updatedAt: string;
};

const readEntryBytes = async (entry: FormDataEntryValue | null): Promise<Uint8Array> => {
  if (!entry) return new Uint8Array();
  if (entry instanceof Blob) {
    return new Uint8Array(await entry.arrayBuffer());
  }
  return Buffer.from(String(entry), 'utf8');
};

registerAsync(
  (async () => {
    const projectId = 'demo-project';
    const apiKey = 'demo-key';
    const files = new Map<string, StoredFile>();
    const pendingChunks = new Map<string, { total: number; parts: Uint8Array[]; mimeType: string }>();
    const metadataDocs = new Map<string, Record<string, unknown>>();
    let deleteCount = 0;

    const fakeFetch = async (input: string, init?: RequestInit): Promise<Response> => {
      const url = new URL(input);
      const headers = new Headers(init?.headers);
      if (headers.get('x-appwrite-project') !== projectId || headers.get('x-appwrite-key') !== apiKey) {
        return Response.json({ message: 'Unauthorized', code: 401, type: 'general_unauthorized_scope' }, { status: 401 });
      }
      const method = String(init?.method ?? 'GET').toUpperCase();
      const path = url.pathname;
      const filesPrefix = '/v1/storage/buckets/ashfox_blobs/files';
      const metadataPrefix = '/v1/databases/ashfox/collections/ashfox_blob_metadata/documents';

      const readJsonBody = async (): Promise<Record<string, unknown>> => {
        const body = typeof init?.body === 'string' ? init.body : '';
        if (!body) return {};
        return JSON.parse(body) as Record<string, unknown>;
      };

      if (path === filesPrefix && method === 'POST') {
        if (!(init?.body instanceof FormData)) {
          return Response.json({ message: 'Expected multipart body', code: 400, type: 'general_argument_invalid' }, { status: 400 });
        }
        const form = init.body;
        const fileId = String(form.get('fileId') ?? '');
        const file = form.get('file');
        if (!fileId) {
          return Response.json({ message: 'fileId is required', code: 400, type: 'general_argument_invalid' }, { status: 400 });
        }
        const chunkBytes = await readEntryBytes(file);
        const mimeType = file instanceof Blob && file.type ? file.type : 'application/octet-stream';
        const range = headers.get('content-range');
        if (!range) {
          if (files.has(fileId)) {
            return Response.json({ message: 'File already exists', code: 409, type: 'storage_file_already_exists' }, { status: 409 });
          }
          const now = new Date().toISOString();
          files.set(fileId, {
            bytes: chunkBytes,
            mimeType,
            updatedAt: now
          });
          return Response.json({ $id: fileId, $updatedAt: now, mimeType }, { status: 201 });
        }

        const match = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(range);
        if (!match) {
          return Response.json({ message: 'Invalid content-range', code: 400, type: 'general_argument_invalid' }, { status: 400 });
        }
        const start = Number(match[1]);
        const end = Number(match[2]);
        const total = Number(match[3]);
        const chunkId = start > 0 ? String(headers.get('x-appwrite-id') ?? fileId) : fileId;

        if (start === 0) {
          if (files.has(chunkId)) {
            return Response.json({ message: 'File already exists', code: 409, type: 'storage_file_already_exists' }, { status: 409 });
          }
          pendingChunks.set(chunkId, { total, parts: [chunkBytes], mimeType });
        } else {
          const pending = pendingChunks.get(chunkId);
          if (!pending) {
            return Response.json({ message: 'Missing initial chunk', code: 400, type: 'storage_invalid_file' }, { status: 400 });
          }
          pending.parts.push(chunkBytes);
        }

        if (end + 1 === total) {
          const pending = pendingChunks.get(chunkId);
          if (!pending) {
            return Response.json({ message: 'Chunk state missing', code: 400, type: 'storage_invalid_file' }, { status: 400 });
          }
          pendingChunks.delete(chunkId);
          const combined = Buffer.concat(pending.parts.map((part) => Buffer.from(part)));
          const now = new Date().toISOString();
          files.set(chunkId, {
            bytes: combined,
            mimeType: pending.mimeType || mimeType,
            updatedAt: now
          });
          return Response.json({ $id: chunkId, $updatedAt: now, mimeType: pending.mimeType || mimeType }, { status: 201 });
        }
        return Response.json({ $id: chunkId, chunksTotal: total }, { status: 202 });
      }

      if (path.startsWith(`${filesPrefix}/`)) {
        const suffix = path.slice((`${filesPrefix}/`).length);
        if (suffix.endsWith('/view') && method === 'GET') {
          const fileId = decodeURIComponent(suffix.slice(0, -'/view'.length));
          const found = files.get(fileId);
          if (!found) {
            return Response.json({ message: 'File not found', code: 404, type: 'storage_file_not_found' }, { status: 404 });
          }
          return new Response(found.bytes, {
            status: 200,
            headers: {
              'content-type': found.mimeType
            }
          });
        }

        const fileId = decodeURIComponent(suffix);
        const found = files.get(fileId);
        if (method === 'GET') {
          if (!found) {
            return Response.json({ message: 'File not found', code: 404, type: 'storage_file_not_found' }, { status: 404 });
          }
          return Response.json(
            {
              $id: fileId,
              $updatedAt: found.updatedAt,
              mimeType: found.mimeType
            },
            { status: 200 }
          );
        }
        if (method === 'DELETE') {
          if (!found) {
            return Response.json({ message: 'File not found', code: 404, type: 'storage_file_not_found' }, { status: 404 });
          }
          deleteCount += 1;
          files.delete(fileId);
          return new Response(null, { status: 204 });
        }
      }

      if (path === metadataPrefix && method === 'POST') {
        const payload = await readJsonBody();
        const documentId = String(payload.documentId ?? '');
        if (metadataDocs.has(documentId)) {
          return Response.json({ message: 'Document already exists', code: 409, type: 'document_already_exists' }, { status: 409 });
        }
        metadataDocs.set(documentId, ((payload.data ?? {}) as Record<string, unknown>) || {});
        return Response.json({ $id: documentId, ...metadataDocs.get(documentId) }, { status: 201 });
      }

      if (path.startsWith(`${metadataPrefix}/`)) {
        const documentId = decodeURIComponent(path.slice((`${metadataPrefix}/`).length));
        if (method === 'GET') {
          const found = metadataDocs.get(documentId);
          if (!found) {
            return Response.json({ message: 'Document not found', code: 404, type: 'document_not_found' }, { status: 404 });
          }
          return Response.json({ $id: documentId, ...found }, { status: 200 });
        }
        if (method === 'PATCH') {
          const found = metadataDocs.get(documentId);
          if (!found) {
            return Response.json({ message: 'Document not found', code: 404, type: 'document_not_found' }, { status: 404 });
          }
          const payload = await readJsonBody();
          metadataDocs.set(documentId, {
            ...found,
            ...((payload.data ?? {}) as Record<string, unknown>)
          });
          return Response.json({ $id: documentId, ...metadataDocs.get(documentId) }, { status: 200 });
        }
        if (method === 'DELETE') {
          if (!metadataDocs.has(documentId)) {
            return Response.json({ message: 'Document not found', code: 404, type: 'document_not_found' }, { status: 404 });
          }
          metadataDocs.delete(documentId);
          return new Response(null, { status: 204 });
        }
      }

      return Response.json({ message: 'Not Found', code: 404, type: 'general_route_not_found' }, { status: 404 });
    };

    const config: AppwriteBlobStoreConfig = {
      baseUrl: 'https://cloud.appwrite.io/v1',
      projectId,
      apiKey,
      responseFormat: '1.8.0',
      requestTimeoutMs: 5000,
      bucketId: 'ashfox_blobs',
      keyPrefix: 'models',
      upsert: true,
      metadataDatabaseId: 'ashfox',
      metadataCollectionId: 'ashfox_blob_metadata',
      provider: 'appwrite'
    };
    const blobStore = new AppwriteBlobStore(config, { fetchImpl: fakeFetch });

    await blobStore.put({
      bucket: 'assets',
      key: 'demo/model.json',
      bytes: Buffer.from('{"demo":true}', 'utf8'),
      contentType: 'application/json',
      cacheControl: 'max-age=60',
      metadata: { source: 'test' }
    });

    const firstRead = await blobStore.get({
      bucket: 'assets',
      key: 'demo/model.json'
    });
    assert.ok(firstRead);
    assert.equal(Buffer.from(firstRead?.bytes ?? []).toString('utf8'), '{"demo":true}');
    assert.equal(firstRead?.contentType, 'application/json');
    assert.equal(firstRead?.cacheControl, 'max-age=60');
    assert.deepEqual(firstRead?.metadata, { source: 'test' });

    await blobStore.put({
      bucket: 'assets',
      key: 'demo/model.json',
      bytes: Buffer.from('{"demo":false}', 'utf8'),
      contentType: 'application/json',
      cacheControl: 'max-age=120',
      metadata: { source: 'overwrite' }
    });

    const secondRead = await blobStore.get({
      bucket: 'assets',
      key: 'demo/model.json'
    });
    assert.ok(secondRead);
    assert.equal(Buffer.from(secondRead?.bytes ?? []).toString('utf8'), '{"demo":false}');
    assert.equal(secondRead?.cacheControl, 'max-age=120');
    assert.deepEqual(secondRead?.metadata, { source: 'overwrite' });
    assert.equal(deleteCount, 1);

    const largePayload = Buffer.alloc(5 * 1024 * 1024 + 7, 7);
    await blobStore.put({
      bucket: 'assets',
      key: 'demo/large.bin',
      bytes: largePayload,
      contentType: 'application/octet-stream'
    });
    const largeRead = await blobStore.get({
      bucket: 'assets',
      key: 'demo/large.bin'
    });
    assert.ok(largeRead);
    assert.equal(largeRead?.bytes.byteLength, largePayload.byteLength);
    assert.equal(largeRead?.bytes[0], 7);
    assert.equal(largeRead?.bytes[largeRead.bytes.byteLength - 1], 7);

    await blobStore.delete({
      bucket: 'assets',
      key: 'demo/model.json'
    });
    const missing = await blobStore.get({
      bucket: 'assets',
      key: 'demo/model.json'
    });
    assert.equal(missing, null);

    await blobStore.delete({
      bucket: 'assets',
      key: 'demo/model.json'
    });
  })()
);
