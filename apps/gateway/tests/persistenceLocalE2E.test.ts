import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ProjectRepositoryWithRevisionGuard } from '@ashfox/backend-core';
import { closeGatewayPersistence, createGatewayPersistence } from '@ashfox/gateway-persistence/createPersistence';
import { registerAsync } from './helpers';

const hasNodeSqlite = (): boolean => {
  try {
    type SqliteModule = { DatabaseSync?: unknown };
    const sqliteModule = require('node:sqlite') as SqliteModule;
    return typeof sqliteModule.DatabaseSync === 'function';
  } catch {
    return false;
  }
};

const isRevisionGuardRepository = (
  repository: unknown
): repository is ProjectRepositoryWithRevisionGuard =>
  Boolean(repository) &&
  typeof repository === 'object' &&
  typeof (repository as { saveIfRevision?: unknown }).saveIfRevision === 'function';

registerAsync(
  (async () => {
    if (!hasNodeSqlite()) {
      return;
    }
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ashfox-local-persistence-'));
    try {
      const sqlitePath = path.join(tempRoot, 'state', 'ashfox.sqlite');
      const persistence = createGatewayPersistence(
        {
          ASHFOX_PERSISTENCE_PRESET: 'local',
          ASHFOX_DB_SQLITE_PATH: sqlitePath
        },
        { failFast: true }
      );

      const scope = { tenantId: 'tenant-local', projectId: 'project-local' };
      const record = {
        scope,
        revision: 'rev-1',
        state: { mesh: { cubes: 3 } },
        createdAt: '2026-02-09T00:00:00.000Z',
        updatedAt: '2026-02-09T00:00:00.000Z'
      };

      await persistence.projectRepository.save(record);
      const found = await persistence.projectRepository.find(scope);
      assert.ok(found);
      assert.equal(found?.revision, 'rev-1');
      assert.deepEqual(found?.state, { mesh: { cubes: 3 } });

      if (isRevisionGuardRepository(persistence.projectRepository)) {
        const mismatch = await persistence.projectRepository.saveIfRevision(
          {
            ...record,
            revision: 'rev-mismatch',
            state: { mesh: { cubes: 5 } },
            updatedAt: '2026-02-09T00:10:00.000Z'
          },
          'wrong-revision'
        );
        assert.equal(mismatch, false);

        const guardedUpdate = await persistence.projectRepository.saveIfRevision(
          {
            ...record,
            revision: 'rev-2',
            state: { mesh: { cubes: 4 } },
            updatedAt: '2026-02-09T00:20:00.000Z'
          },
          'rev-1'
        );
        assert.equal(guardedUpdate, true);

        const guardedFound = await persistence.projectRepository.find(scope);
        assert.equal(guardedFound?.revision, 'rev-2');
        assert.deepEqual(guardedFound?.state, { mesh: { cubes: 4 } });
      }

      await persistence.blobStore.put({
        bucket: 'models',
        key: 'tenant-local/project-local/model.json',
        bytes: Buffer.from('{"ok":true}', 'utf8'),
        contentType: 'application/json',
        metadata: { source: 'test' }
      });
      const blob = await persistence.blobStore.get({
        bucket: 'models',
        key: 'tenant-local/project-local/model.json'
      });
      assert.ok(blob);
      assert.equal(blob?.contentType, 'application/json');
      assert.equal(Buffer.from(blob?.bytes ?? []).toString('utf8'), '{"ok":true}');

      await persistence.blobStore.delete({
        bucket: 'models',
        key: 'tenant-local/project-local/model.json'
      });
      const afterDelete = await persistence.blobStore.get({
        bucket: 'models',
        key: 'tenant-local/project-local/model.json'
      });
      assert.equal(afterDelete, null);

      await persistence.projectRepository.remove(scope);
      const afterRemove = await persistence.projectRepository.find(scope);
      assert.equal(afterRemove, null);

      await closeGatewayPersistence(persistence);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  })()
);
