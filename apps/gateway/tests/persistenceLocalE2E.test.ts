import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ProjectRepositoryWithRevisionGuard } from '@ashfox/backend-core';
import { closeGatewayPersistence, createGatewayPersistence } from '@ashfox/gateway-persistence/createPersistence';
import { registerAsync } from './helpers';

const hasSqliteDriver = (): boolean => {
  try {
    type SqliteDriverConstructor = new (location: string) => unknown;
    type SqliteModule = SqliteDriverConstructor | { default?: SqliteDriverConstructor };
    const sqliteModule = require('better-sqlite3') as SqliteModule;
    const constructor = typeof sqliteModule === 'function' ? sqliteModule : sqliteModule.default;
    return typeof constructor === 'function';
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
    if (!hasSqliteDriver()) {
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

      const initialWorkspacesForUnknown = await persistence.workspaceRepository.listWorkspaces('any-account');
      assert.equal(initialWorkspacesForUnknown.length, 0);
      const initialWorkspaces = await persistence.workspaceRepository.listWorkspaces('');
      assert.ok(initialWorkspaces.length >= 1);
      assert.equal(initialWorkspaces[0]?.mode, 'all_open');

      const initialDefault = await persistence.workspaceRepository.getWorkspace('ws_default');
      assert.ok(initialDefault);
      assert.equal(initialDefault?.workspaceId, 'ws_default');

      const workspaceRecord = {
        workspaceId: 'ws_local_test',
        tenantId: 'tenant-local',
        name: 'Local Test Workspace',
        mode: 'rbac' as const,
        createdBy: 'tester',
        createdAt: '2026-02-09T01:00:00.000Z',
        updatedAt: '2026-02-09T01:00:00.000Z'
      };
      await persistence.workspaceRepository.upsertWorkspace(workspaceRecord);
      const workspaceFound = await persistence.workspaceRepository.getWorkspace(workspaceRecord.workspaceId);
      assert.equal(workspaceFound?.name, workspaceRecord.name);
      assert.equal(workspaceFound?.mode, 'rbac');

      await persistence.workspaceRepository.upsertWorkspaceRole({
        workspaceId: workspaceRecord.workspaceId,
        roleId: 'role_editor',
        name: 'Editor',
        builtin: null,
        permissions: ['workspace.read', 'folder.read', 'folder.write', 'project.read', 'project.write'],
        createdAt: '2026-02-09T01:05:00.000Z',
        updatedAt: '2026-02-09T01:05:00.000Z'
      });
      const roleList = await persistence.workspaceRepository.listWorkspaceRoles(workspaceRecord.workspaceId);
      assert.ok(roleList.some((role) => role.roleId === 'role_editor'));

      await persistence.workspaceRepository.upsertWorkspaceMember({
        workspaceId: workspaceRecord.workspaceId,
        accountId: 'account-local',
        roleIds: ['role_editor'],
        joinedAt: '2026-02-09T01:10:00.000Z'
      });
      const memberList = await persistence.workspaceRepository.listWorkspaceMembers(workspaceRecord.workspaceId);
      assert.ok(memberList.some((member) => member.accountId === 'account-local'));

      await persistence.workspaceRepository.upsertWorkspaceFolderAcl({
        workspaceId: workspaceRecord.workspaceId,
        folderId: null,
        roleId: 'role_editor',
        read: 'allow',
        write: 'allow',
        updatedAt: '2026-02-09T01:15:00.000Z'
      });
      const aclList = await persistence.workspaceRepository.listWorkspaceFolderAcl(workspaceRecord.workspaceId);
      assert.ok(aclList.some((acl) => acl.roleId === 'role_editor'));

      const workspaceListForMember = await persistence.workspaceRepository.listWorkspaces('account-local');
      assert.ok(workspaceListForMember.some((workspace) => workspace.workspaceId === workspaceRecord.workspaceId));

      await persistence.workspaceRepository.removeWorkspaceFolderAcl(workspaceRecord.workspaceId, null, 'role_editor');
      await persistence.workspaceRepository.removeWorkspaceMember(workspaceRecord.workspaceId, 'account-local');
      await persistence.workspaceRepository.removeWorkspaceRole(workspaceRecord.workspaceId, 'role_editor');

      const roleListAfterDelete = await persistence.workspaceRepository.listWorkspaceRoles(workspaceRecord.workspaceId);
      assert.ok(roleListAfterDelete.every((role) => role.roleId !== 'role_editor'));
      const memberListAfterDelete = await persistence.workspaceRepository.listWorkspaceMembers(workspaceRecord.workspaceId);
      assert.ok(memberListAfterDelete.every((member) => member.accountId !== 'account-local'));
      const aclListAfterDelete = await persistence.workspaceRepository.listWorkspaceFolderAcl(workspaceRecord.workspaceId);
      assert.ok(aclListAfterDelete.every((acl) => acl.roleId !== 'role_editor'));

      await closeGatewayPersistence(persistence);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  })()
);
