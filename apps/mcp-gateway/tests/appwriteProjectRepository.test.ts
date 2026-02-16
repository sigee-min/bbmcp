import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { PersistedProjectRecord } from '@ashfox/backend-core';
import type { AppwriteDatabaseConfig } from '../src/persistence/config';
import { AppwriteProjectRepository } from '../src/persistence/infrastructure/AppwriteProjectRepository';
import { registerAsync } from './helpers';

type StoredDocument = {
  id: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

const toLockDocumentId = (tenantId: string, projectId: string): string => {
  const key = `${tenantId}::${projectId}`;
  const digest = createHash('sha256').update(key).digest('hex');
  return `l${digest.slice(0, 35)}`;
};

registerAsync(
  (async () => {
    const projectId = 'demo-project';
    const apiKey = 'demo-key';
    const documents = new Map<string, StoredDocument>();

    const fakeFetch = async (input: string, init?: RequestInit): Promise<Response> => {
      const url = new URL(input);
      const headers = new Headers(init?.headers);
      if (headers.get('x-appwrite-project') !== projectId || headers.get('x-appwrite-key') !== apiKey) {
        return Response.json({ message: 'Unauthorized', code: 401, type: 'general_unauthorized_scope' }, { status: 401 });
      }
      const path = url.pathname;
      const method = String(init?.method ?? 'GET').toUpperCase();
      const prefix = '/v1/databases/ashfox/collections/ashfox_projects/documents';
      if (!path.startsWith(prefix)) {
        return Response.json({ message: 'Not Found', code: 404, type: 'general_route_not_found' }, { status: 404 });
      }

      const readJsonBody = async (): Promise<Record<string, unknown>> => {
        const body = typeof init?.body === 'string' ? init.body : '';
        if (!body) return {};
        return JSON.parse(body) as Record<string, unknown>;
      };

      if (path === prefix && method === 'POST') {
        const payload = await readJsonBody();
        const documentId = String(payload.documentId ?? '');
        const data = (payload.data ?? {}) as Record<string, unknown>;
        if (!documentId) {
          return Response.json({ message: 'documentId is required', code: 400, type: 'general_argument_invalid' }, { status: 400 });
        }
        if (documents.has(documentId)) {
          return Response.json({ message: 'Document already exists', code: 409, type: 'document_already_exists' }, { status: 409 });
        }
        const now = new Date().toISOString();
        const stored: StoredDocument = {
          id: documentId,
          data: { ...data },
          createdAt: now,
          updatedAt: now
        };
        documents.set(documentId, stored);
        return Response.json(
          {
            $id: documentId,
            $createdAt: stored.createdAt,
            $updatedAt: stored.updatedAt,
            ...stored.data
          },
          { status: 201 }
        );
      }

      const idPrefix = `${prefix}/`;
      if (path.startsWith(idPrefix)) {
        const documentId = decodeURIComponent(path.slice(idPrefix.length));
        const existing = documents.get(documentId);
        if (method === 'GET') {
          if (!existing) {
            return Response.json({ message: 'Document not found', code: 404, type: 'document_not_found' }, { status: 404 });
          }
          return Response.json(
            {
              $id: existing.id,
              $createdAt: existing.createdAt,
              $updatedAt: existing.updatedAt,
              ...existing.data
            },
            { status: 200 }
          );
        }
        if (method === 'PATCH') {
          if (!existing) {
            return Response.json({ message: 'Document not found', code: 404, type: 'document_not_found' }, { status: 404 });
          }
          const payload = await readJsonBody();
          const data = (payload.data ?? {}) as Record<string, unknown>;
          existing.data = {
            ...existing.data,
            ...data
          };
          existing.updatedAt = new Date().toISOString();
          return Response.json(
            {
              $id: existing.id,
              $createdAt: existing.createdAt,
              $updatedAt: existing.updatedAt,
              ...existing.data
            },
            { status: 200 }
          );
        }
        if (method === 'DELETE') {
          if (!existing) {
            return Response.json({ message: 'Document not found', code: 404, type: 'document_not_found' }, { status: 404 });
          }
          documents.delete(documentId);
          return new Response(null, { status: 204 });
        }
      }

      return Response.json({ message: 'Method not allowed', code: 405, type: 'general_method_unsupported' }, { status: 405 });
    };

    const config: AppwriteDatabaseConfig = {
      baseUrl: 'https://cloud.appwrite.io/v1',
      projectId,
      apiKey,
      requestTimeoutMs: 5000,
      responseFormat: '1.8.0',
      databaseId: 'ashfox',
      collectionId: 'ashfox_projects',
      provider: 'appwrite'
    };
    const repository = new AppwriteProjectRepository(config, { fetchImpl: fakeFetch });

    const scope = { tenantId: 'tenant-appwrite', projectId: 'project-appwrite' };
    const initial: PersistedProjectRecord = {
      scope,
      revision: 'rev-1',
      state: { ok: true, items: [1, 2, 3] },
      createdAt: '2026-02-09T00:00:00.000Z',
      updatedAt: '2026-02-09T00:00:00.000Z'
    };

    await repository.save(initial);
    const found = await repository.find(scope);
    assert.ok(found);
    assert.equal(found?.revision, 'rev-1');
    assert.deepEqual(found?.state, { ok: true, items: [1, 2, 3] });

    await repository.save({
      ...initial,
      revision: 'rev-2',
      state: { ok: false, items: [9] },
      updatedAt: '2026-02-09T01:00:00.000Z'
    });
    const updated = await repository.find(scope);
    assert.ok(updated);
    assert.equal(updated?.revision, 'rev-2');
    assert.deepEqual(updated?.state, { ok: false, items: [9] });
    assert.equal(updated?.createdAt, '2026-02-09T00:00:00.000Z');
    assert.equal(updated?.updatedAt, '2026-02-09T01:00:00.000Z');

    const mismatchResult = await repository.saveIfRevision(
      {
        ...initial,
        revision: 'rev-3',
        state: { ok: 'mismatch' },
        updatedAt: '2026-02-09T02:00:00.000Z'
      },
      'wrong-revision'
    );
    assert.equal(mismatchResult, false);

    const guardedUpdateResult = await repository.saveIfRevision(
      {
        ...initial,
        revision: 'rev-3',
        state: { ok: 'guarded-update' },
        updatedAt: '2026-02-09T03:00:00.000Z'
      },
      'rev-2'
    );
    assert.equal(guardedUpdateResult, true);
    const guardedUpdated = await repository.find(scope);
    assert.equal(guardedUpdated?.revision, 'rev-3');

    const guardedCreateFail = await repository.saveIfRevision(
      {
        ...initial,
        revision: 'rev-4',
        state: { ok: 'already-exists' },
        updatedAt: '2026-02-09T04:00:00.000Z'
      },
      null
    );
    assert.equal(guardedCreateFail, false);

    await repository.remove(scope);
    const removed = await repository.find(scope);
    assert.equal(removed, null);

    const guardedCreateSuccess = await repository.saveIfRevision(
      {
        ...initial,
        revision: 'rev-created',
        state: { ok: 'created' },
        updatedAt: '2026-02-09T05:00:00.000Z'
      },
      null
    );
    assert.equal(guardedCreateSuccess, true);
    const recreated = await repository.find(scope);
    assert.equal(recreated?.revision, 'rev-created');

    const lockScope = { tenantId: 'tenant-lock', projectId: 'project-lock' };
    const lockDocumentId = toLockDocumentId(lockScope.tenantId, lockScope.projectId);
    documents.set(lockDocumentId, {
      id: lockDocumentId,
      data: {
        tenantId: `__lock__:${lockScope.tenantId}`,
        projectId: lockScope.projectId,
        revision: 'existing-lock',
        stateJson: JSON.stringify({ owner: 'existing-lock-owner', expiresAt: '2000-01-01T00:00:00.000Z' }),
        createdAt: '2000-01-01T00:00:00.000Z',
        updatedAt: '2000-01-01T00:00:00.000Z'
      },
      createdAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z'
    });

    const staleLockWrite = await repository.saveIfRevision(
      {
        scope: lockScope,
        revision: 'rev-stale-lock',
        state: { ok: 'stale-lock-recovered' },
        createdAt: '2026-02-09T00:00:00.000Z',
        updatedAt: '2026-02-09T00:00:00.000Z'
      },
      null
    );
    assert.equal(staleLockWrite, true);
    const staleLockRecord = await repository.find(lockScope);
    assert.equal(staleLockRecord?.revision, 'rev-stale-lock');

    const activeLockScope = { tenantId: 'tenant-active-lock', projectId: 'project-active-lock' };
    const activeLockDocumentId = toLockDocumentId(activeLockScope.tenantId, activeLockScope.projectId);
    documents.set(activeLockDocumentId, {
      id: activeLockDocumentId,
      data: {
        tenantId: `__lock__:${activeLockScope.tenantId}`,
        projectId: activeLockScope.projectId,
        revision: 'active-lock',
        stateJson: JSON.stringify({ owner: 'active-lock-owner', expiresAt: '2999-01-01T00:00:00.000Z' }),
        createdAt: '2026-02-09T00:00:00.000Z',
        updatedAt: '2026-02-09T00:00:00.000Z'
      },
      createdAt: '2026-02-09T00:00:00.000Z',
      updatedAt: '2026-02-09T00:00:00.000Z'
    });

    const lockBoundRepository = new AppwriteProjectRepository(config, {
      fetchImpl: fakeFetch,
      lockTimeoutMs: 20,
      lockRetryMs: 1,
      sleepImpl: async () => Promise.resolve()
    });

    await assert.rejects(
      () =>
        lockBoundRepository.saveIfRevision(
          {
            scope: activeLockScope,
            revision: 'rev-active-lock',
            state: { ok: 'should-timeout' },
            createdAt: '2026-02-09T00:00:00.000Z',
            updatedAt: '2026-02-09T00:00:00.000Z'
          },
          null
        ),
      /lock acquisition timed out/i
    );
  })()
);
