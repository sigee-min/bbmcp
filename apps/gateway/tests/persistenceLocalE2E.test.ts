import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluateWorkspaceFolderPermission, toAutoProvisionedWorkspaceId } from '@ashfox/backend-core';
import type { ProjectRepositoryWithRevisionGuard } from '@ashfox/backend-core';
import { closeGatewayPersistence, createGatewayPersistence } from '@ashfox/gateway-persistence/createPersistence';
import { PersistentNativePipelineStore } from '@ashfox/native-pipeline/persistent';
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

        const [concurrentA, concurrentB] = await Promise.all([
          persistence.projectRepository.saveIfRevision(
            {
              ...record,
              revision: 'rev-3-a',
              state: { mesh: { cubes: 6 }, source: 'concurrent-a' },
              updatedAt: '2026-02-09T00:30:00.000Z'
            },
            'rev-2'
          ),
          persistence.projectRepository.saveIfRevision(
            {
              ...record,
              revision: 'rev-3-b',
              state: { mesh: { cubes: 7 }, source: 'concurrent-b' },
              updatedAt: '2026-02-09T00:30:00.000Z'
            },
            'rev-2'
          )
        ]);
        assert.equal([concurrentA, concurrentB].filter(Boolean).length, 1, 'only one optimistic concurrent update should succeed');
        const conflictFound = await persistence.projectRepository.find(scope);
        assert.ok(conflictFound);
        assert.ok(conflictFound?.revision === 'rev-3-a' || conflictFound?.revision === 'rev-3-b');
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

      const initialWorkspacesForUnknown = await persistence.workspaceRepository.listAccountWorkspaces('any-account');
      assert.equal(initialWorkspacesForUnknown.length, 0);
      const initialWorkspaces = await persistence.workspaceRepository.listAllWorkspaces();
      assert.ok(initialWorkspaces.length >= 1);

      const initialAdminWorkspaceId = toAutoProvisionedWorkspaceId('admin');
      const initialAdminWorkspace = await persistence.workspaceRepository.getWorkspace(initialAdminWorkspaceId);
      assert.ok(initialAdminWorkspace);
      assert.equal(initialAdminWorkspace?.workspaceId, initialAdminWorkspaceId);
      assert.equal(initialAdminWorkspace?.defaultMemberRoleId, 'role_user');
      const initialAdminRoles = await persistence.workspaceRepository.listWorkspaceRoles(initialAdminWorkspaceId);
      assert.equal(
        initialAdminRoles.some((role) => role.roleId === 'role_admin' && role.builtin === 'workspace_admin'),
        true
      );
      assert.equal(initialAdminRoles.some((role) => role.roleId === 'role_user' && role.builtin === null), true);
      const initialAdminMembers = await persistence.workspaceRepository.listWorkspaceMembers(initialAdminWorkspaceId);
      const seededAdminMember = initialAdminMembers.find((member) => member.accountId === 'admin');
      assert.ok(seededAdminMember);
      assert.equal(seededAdminMember?.roleIds.includes('role_admin'), true);
      assert.equal(seededAdminMember?.roleIds.includes('role_user'), false);
      const initialAdminAcl = await persistence.workspaceRepository.listWorkspaceFolderAcl(initialAdminWorkspaceId);
      const hasUserRootAcl = initialAdminAcl.some(
        (rule) => rule.roleIds.includes('role_user') && rule.folderId === null && rule.read === 'allow' && rule.write === 'allow'
      );
      assert.equal(hasUserRootAcl, true);
      const initialServiceSettings = await persistence.workspaceRepository.getServiceSettings();
      assert.ok(initialServiceSettings);
      assert.equal(initialServiceSettings?.smtp.enabled, false);
      assert.equal(initialServiceSettings?.githubAuth.enabled, false);

      const workspaceRecord = {
        workspaceId: 'ws_local_test',
        tenantId: 'tenant-local',
        name: 'Local Test Workspace',
        defaultMemberRoleId: 'role_user',
        createdBy: 'tester',
        createdAt: '2026-02-09T01:00:00.000Z',
        updatedAt: '2026-02-09T01:00:00.000Z'
      };
      await persistence.workspaceRepository.upsertWorkspace(workspaceRecord);
      const workspaceFound = await persistence.workspaceRepository.getWorkspace(workspaceRecord.workspaceId);
      assert.equal(workspaceFound?.name, workspaceRecord.name);
      assert.equal(workspaceFound?.defaultMemberRoleId, workspaceRecord.defaultMemberRoleId);

      await persistence.workspaceRepository.upsertWorkspaceRole({
        workspaceId: workspaceRecord.workspaceId,
        roleId: 'role_editor',
        name: 'Editor',
        builtin: null,
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
        ruleId: 'acl_workspace_editor_rw',
        scope: 'folder',
        folderId: null,
        roleIds: ['role_editor'],
        read: 'allow',
        write: 'allow',
        updatedAt: '2026-02-09T01:15:00.000Z'
      });
      const aclList = await persistence.workspaceRepository.listWorkspaceFolderAcl(workspaceRecord.workspaceId);
      assert.ok(aclList.some((acl) => acl.roleIds.includes('role_editor')));

      await persistence.workspaceRepository.upsertWorkspaceRole({
        workspaceId: workspaceRecord.workspaceId,
        roleId: 'role_auditor',
        name: 'Auditor',
        builtin: null,
        createdAt: '2026-02-09T01:16:00.000Z',
        updatedAt: '2026-02-09T01:16:00.000Z'
      });
      await persistence.workspaceRepository.upsertWorkspaceMember({
        workspaceId: workspaceRecord.workspaceId,
        accountId: 'account-role-cleanup',
        roleIds: ['role_auditor', 'role_editor'],
        joinedAt: '2026-02-09T01:17:00.000Z'
      });
      await persistence.workspaceRepository.upsertWorkspaceFolderAcl({
        workspaceId: workspaceRecord.workspaceId,
        ruleId: 'acl_folder_audit_rw',
        scope: 'folder',
        folderId: 'folder-audit',
        roleIds: ['role_auditor'],
        read: 'allow',
        write: 'deny',
        updatedAt: '2026-02-09T01:18:00.000Z'
      });
      await persistence.workspaceRepository.upsertWorkspaceFolderAcl({
        workspaceId: workspaceRecord.workspaceId,
        ruleId: 'acl_folder_audit_rw',
        scope: 'folder',
        folderId: 'folder-audit',
        roleIds: ['role_editor'],
        read: 'allow',
        write: 'allow',
        updatedAt: '2026-02-09T01:18:30.000Z'
      });

      const allowWinsPermission = evaluateWorkspaceFolderPermission(
        {
          workspaceId: workspaceRecord.workspaceId,
          accountId: 'account-role-cleanup',
          roleAssignments: [
            {
              accountId: 'account-role-cleanup',
              roleIds: ['role_auditor', 'role_editor']
            }
          ],
          aclRules: await persistence.workspaceRepository.listWorkspaceFolderAcl(workspaceRecord.workspaceId)
        },
        [null, 'folder-audit']
      );
      assert.equal(allowWinsPermission.read, true);
      assert.equal(allowWinsPermission.write, true);

      await persistence.workspaceRepository.removeWorkspaceRole(workspaceRecord.workspaceId, 'role_auditor');
      const membersAfterRoleRemoval = await persistence.workspaceRepository.listWorkspaceMembers(workspaceRecord.workspaceId);
      const roleCleanupMember = membersAfterRoleRemoval.find((member) => member.accountId === 'account-role-cleanup');
      assert.ok(roleCleanupMember);
      assert.equal(roleCleanupMember?.roleIds.includes('role_auditor'), false);
      const aclAfterRoleRemoval = await persistence.workspaceRepository.listWorkspaceFolderAcl(workspaceRecord.workspaceId);
      assert.equal(aclAfterRoleRemoval.some((acl) => acl.roleIds.includes('role_auditor')), false);

      const workspaceListForMember = await persistence.workspaceRepository.listAccountWorkspaces('account-local');
      assert.ok(workspaceListForMember.some((workspace) => workspace.workspaceId === workspaceRecord.workspaceId));

      await persistence.workspaceRepository.removeWorkspaceFolderAcl(workspaceRecord.workspaceId, null, 'role_editor');
      await persistence.workspaceRepository.removeWorkspaceMember(workspaceRecord.workspaceId, 'account-local');
      await persistence.workspaceRepository.removeWorkspaceMember(workspaceRecord.workspaceId, 'account-role-cleanup');
      await persistence.workspaceRepository.removeWorkspaceRole(workspaceRecord.workspaceId, 'role_editor');

      const roleListAfterDelete = await persistence.workspaceRepository.listWorkspaceRoles(workspaceRecord.workspaceId);
      assert.ok(roleListAfterDelete.every((role) => role.roleId !== 'role_editor'));
      const memberListAfterDelete = await persistence.workspaceRepository.listWorkspaceMembers(workspaceRecord.workspaceId);
      assert.ok(memberListAfterDelete.every((member) => member.accountId !== 'account-local'));
      const aclListAfterDelete = await persistence.workspaceRepository.listWorkspaceFolderAcl(workspaceRecord.workspaceId);
      assert.ok(aclListAfterDelete.every((acl) => !acl.roleIds.includes('role_editor')));

      const adminStateScope = {
        tenantId: 'native-pipeline',
        projectId: `pipeline-state:${initialAdminWorkspaceId}`
      };
      const isolatedWorkspaceId = 'workspace-isolated-empty';

      const seedStore = new PersistentNativePipelineStore(persistence.projectRepository);
      const seededProject = await seedStore.createProject({
        workspaceId: initialAdminWorkspaceId,
        name: 'Persistent Store Seed Check'
      });

      const adminStateRecord = await persistence.projectRepository.find(adminStateScope);
      assert.ok(adminStateRecord);
      if (!adminStateRecord) {
        throw new Error('Expected admin workspace native pipeline state to be persisted.');
      }

      const isolatedStore = new PersistentNativePipelineStore(persistence.projectRepository);
      const isolatedProjects = await isolatedStore.listProjects(undefined, isolatedWorkspaceId);
      assert.deepEqual(isolatedProjects, []);

      const seededProjects = await isolatedStore.listProjects(undefined, initialAdminWorkspaceId);
      assert.equal(seededProjects.some((project) => project.projectId === seededProject.projectId), true);

      await closeGatewayPersistence(persistence);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  })()
);
