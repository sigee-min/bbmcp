const assert = require('node:assert/strict');

const DEFAULT_WORKSPACE_ID = 'ws_auto_admin-en845w';

const clone = (value) => JSON.parse(JSON.stringify(value));

const createProjectsFixture = () =>
  clone([
    {
      projectId: 'prj_0990edef709a',
      name: 'Forest Fox',
      parentFolderId: 'fld_samples',
      revision: 10,
      hasGeometry: true,
      hierarchy: [
        {
          id: 'bone-root',
          name: 'root',
          kind: 'bone',
          children: [
            {
              id: 'bone-body',
              name: 'body',
              kind: 'bone',
              children: []
            }
          ]
        }
      ],
      animations: [],
      stats: {
        bones: 8,
        cubes: 21
      },
      textures: []
    },
    {
      projectId: 'prj_95cb32d1c4f6',
      name: 'Desert Lynx',
      parentFolderId: 'fld_samples',
      revision: 21,
      hasGeometry: true,
      hierarchy: [],
      animations: [],
      stats: {
        bones: 5,
        cubes: 13
      },
      textures: []
    },
    {
      projectId: 'prj_2ca5f18b3df5',
      name: 'Empty Template',
      parentFolderId: 'fld_templates',
      revision: 3,
      hasGeometry: false,
      hierarchy: [],
      animations: [],
      stats: {
        bones: 0,
        cubes: 0
      },
      textures: []
    }
  ]);

const createProjectTreeFixture = () =>
  clone({
    maxFolderDepth: 3,
    roots: [
      {
        kind: 'folder',
        folderId: 'fld_samples',
        name: 'Samples',
        parentFolderId: null,
        depth: 1,
        children: [
          {
            kind: 'project',
            projectId: 'prj_0990edef709a',
            name: 'Forest Fox',
            parentFolderId: 'fld_samples',
            depth: 2,
            activeJobStatus: null
          },
          {
            kind: 'project',
            projectId: 'prj_95cb32d1c4f6',
            name: 'Desert Lynx',
            parentFolderId: 'fld_samples',
            depth: 2,
            activeJobStatus: null
          },
          {
            kind: 'folder',
            folderId: 'fld_templates',
            name: 'Templates',
            parentFolderId: 'fld_samples',
            depth: 2,
            children: [
              {
                kind: 'project',
                projectId: 'prj_2ca5f18b3df5',
                name: 'Empty Template',
                parentFolderId: 'fld_templates',
                depth: 3,
                activeJobStatus: null
              }
            ]
          }
        ]
      }
    ]
  });

const createWorkspacesFixture = () =>
  clone([
    {
      workspaceId: DEFAULT_WORKSPACE_ID,
      name: 'Administrator Workspace',
      defaultMemberRoleId: 'role_user',
      capabilities: {
        canManageWorkspaceSettings: true
      }
    }
  ]);

const createServiceWorkspacesFixture = () =>
  clone(
    createWorkspacesFixture().map((workspace) => ({
      workspaceId: workspace.workspaceId,
      name: workspace.name,
      defaultMemberRoleId: workspace.defaultMemberRoleId,
      createdBy: 'system',
      createdAt: '2026-02-21T00:00:00.000Z',
      updatedAt: '2026-02-21T00:00:00.000Z'
    }))
  );

const createAuthSessionFixture = () =>
  clone({
    ok: true,
    githubEnabled: true,
    user: {
      accountId: 'admin',
      displayName: 'Administrator',
      email: 'admin@ashfox.local',
      systemRoles: ['system_admin'],
      localLoginId: 'admin',
      githubLogin: null,
      hasPassword: true,
      canSetPassword: false
    }
  });

const { MockEventSource, dispatchInAct, flushUpdates, mountHomePage } = require('./helpers/pageHarness');

const assertMenuWithinViewport = (menuElement, windowObject) => {
  const left = Number.parseFloat(menuElement.style.left);
  const top = Number.parseFloat(menuElement.style.top);
  assert.ok(Number.isFinite(left), 'menu left should be a finite number');
  assert.ok(Number.isFinite(top), 'menu top should be a finite number');
  assert.ok(left >= 8, `menu left should stay inside viewport margin: left=${left}`);
  assert.ok(top >= 8, `menu top should stay inside viewport margin: top=${top}`);
  assert.ok(left <= windowObject.innerWidth - 8, `menu left should not overflow viewport: left=${left}`);
  assert.ok(top <= windowObject.innerHeight - 8, `menu top should not overflow viewport: top=${top}`);
};

const setViewportSize = (windowObject, width, height) => {
  Object.defineProperty(windowObject, 'innerWidth', {
    configurable: true,
    value: width
  });
  Object.defineProperty(windowObject, 'innerHeight', {
    configurable: true,
    value: height
  });
  windowObject.dispatchEvent(new windowObject.Event('resize'));
};

module.exports = async () => {
  const authSessionPayload = createAuthSessionFixture();
  {
    const mounted = await mountHomePage({
      fetchImpl: async (requestUrl) => {
        const url = String(requestUrl);
        assert.equal(url, '/api/auth/me');
        return new Response(
          JSON.stringify({
            ok: false,
            code: 'unauthorized',
            message: '로그인이 필요합니다.'
          }),
          {
            status: 401,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          }
        );
      },
      EventSourceImpl: MockEventSource
    });

    try {
      await flushUpdates();
      const { container } = mounted;
      const githubButton = container.querySelector('button[aria-label="GitHub로 로그인"]');
      assert.ok(githubButton);
      assert.match(githubButton.textContent ?? '', /Continue with GitHub/);
      const localButton = Array.from(container.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('로컬 계정 로그인')
      );
      assert.ok(localButton);
      assert.doesNotMatch(container.textContent ?? '', /admin \/ admin/);
    } finally {
      await mounted.cleanup();
      MockEventSource.reset();
    }
  }

  {
    const mounted = await mountHomePage({
      fetchImpl: async (requestUrl) => {
        const url = String(requestUrl);
        assert.equal(url, '/api/auth/me');
        return new Response('', {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8' }
        });
      },
      EventSourceImpl: MockEventSource
    });

    try {
      await flushUpdates();
      const { container } = mounted;
      assert.match(container.textContent ?? '', /백엔드 연결이 필요합니다\. gateway 서버를 실행한 뒤 다시 시도해 주세요\./);
      assert.doesNotMatch(container.textContent ?? '', /세션을 확인하지 못했습니다/);
      const authErrorNotices = container.querySelectorAll('[data-ui-error-channel]');
      assert.equal(authErrorNotices.length, 1);
      assert.equal(authErrorNotices[0].getAttribute('data-ui-error-channel'), 'blocking');
      const localButton = Array.from(container.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('로컬 계정 로그인')
      );
      assert.ok(localButton);
    } finally {
      await mounted.cleanup();
      MockEventSource.reset();
    }
  }

  {
    const projectsPayload = { ok: true, projects: createProjectsFixture(), tree: createProjectTreeFixture() };
    const workspacesPayload = { ok: true, workspaces: createWorkspacesFixture() };
    const mounted = await mountHomePage({
      fetchImpl: async (requestUrl) => {
        const url = String(requestUrl);
        if (url === '/api/auth/me') {
          return new Response(JSON.stringify(authSessionPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === '/api/workspaces') {
          return new Response(JSON.stringify(workspacesPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        assert.equal(url, `/api/projects/tree?workspaceId=${DEFAULT_WORKSPACE_ID}`);
        return new Response(JSON.stringify(projectsPayload), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      },
      EventSourceImpl: MockEventSource
    });

    try {
      await flushUpdates();
      const { container, dom } = mounted;
      const layoutMain = container.querySelector('main');
      assert.ok(layoutMain);
      assert.match(layoutMain.className, /layout/);
      assert.ok(container.querySelector('.sidebarArea'));
      assert.ok(container.querySelector('.centerArea'));
      assert.ok(container.querySelector('.inspectorArea'));
      const streamStatus = container.querySelector('[role="status"][aria-live="polite"]');
      assert.ok(streamStatus);

      const viewport = container.querySelector('[aria-label="Model viewport. Drag or use arrow keys to rotate."]');
      assert.ok(viewport);

      const frame = viewport.firstElementChild;
      assert.ok(frame);
      const initialTransform = frame.style.transform;
      assert.equal(initialTransform, '');
      const yawReadout = container.querySelector('.font-mono');
      assert.ok(yawReadout);
      const initialYawText = yawReadout.textContent;
      assert.match(initialYawText, /yaw 0 \/ pitch 0/);

      await dispatchInAct(viewport, new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await flushUpdates();

      const nextYawText = yawReadout.textContent;
      assert.notEqual(nextYawText, initialYawText);
      assert.match(nextYawText, /yaw 4 \/ pitch 0/);
    } finally {
      await mounted.cleanup();
      MockEventSource.reset();
    }
  }

  {
    const projectsPayload = { ok: true, projects: createProjectsFixture(), tree: createProjectTreeFixture() };
    const workspacesPayload = { ok: true, workspaces: createWorkspacesFixture() };
    let projectFetchCount = 0;
    let streamCreated = false;
    class PassiveEventSource {
      constructor() {
        streamCreated = true;
        this.onmessage = null;
        this.onopen = null;
        this.onerror = null;
      }

      addEventListener() {}

      close() {}
    }

    const mounted = await mountHomePage({
      fetchImpl: async (requestUrl) => {
        const url = String(requestUrl);
        if (url === '/api/auth/me') {
          return new Response(JSON.stringify(authSessionPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === '/api/workspaces') {
          return new Response(JSON.stringify(workspacesPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        assert.equal(url, `/api/projects/tree?workspaceId=${DEFAULT_WORKSPACE_ID}`);
        projectFetchCount += 1;
        if (projectFetchCount === 1) {
          return new Response(JSON.stringify({ ok: true, projects: [], tree: { maxFolderDepth: 3, roots: [] } }), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        return new Response(JSON.stringify(projectsPayload), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      },
      EventSourceImpl: PassiveEventSource
    });

    try {
      await flushUpdates();
      const { container } = mounted;
      const text = container.textContent ?? '';
      assert.ok(container.querySelector('.sidebarArea'));
      assert.ok(container.querySelector('.centerArea'));
      assert.ok(container.querySelector('.inspectorArea'));
      assert.match(text, /프로젝트\/폴더가 없습니다/);
      assert.doesNotMatch(text, /표시할 프로젝트가 없습니다/);
      assert.ok(container.querySelector('button[aria-label="루트 프로젝트 생성"]'));
      const reloadButton = container.querySelector('button[aria-label="프로젝트 트리 새로고침"]');
      assert.ok(reloadButton, 'empty workspace should keep toolbar reload action');
      assert.equal(streamCreated, false);

      await dispatchInAct(reloadButton, new mounted.dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const reloadedText = mounted.container.textContent ?? '';
      assert.match(reloadedText, /Desert Lynx/);
      assert.equal(streamCreated, true);
      assert.equal(projectFetchCount >= 2, true);
    } finally {
      await mounted.cleanup();
    }
  }

  {
    const projectsPayload = { ok: true, projects: createProjectsFixture(), tree: createProjectTreeFixture() };
    const workspacesPayload = { ok: true, workspaces: createWorkspacesFixture() };
    let projectFetchCount = 0;
    let streamCreated = false;
    class PassiveEventSource {
      constructor() {
        streamCreated = true;
        this.onmessage = null;
        this.onopen = null;
        this.onerror = null;
      }

      addEventListener() {}

      close() {}
    }

    const mounted = await mountHomePage({
      fetchImpl: async (requestUrl) => {
        const url = String(requestUrl);
        if (url === '/api/auth/me') {
          return new Response(JSON.stringify(authSessionPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === '/api/workspaces') {
          return new Response(JSON.stringify(workspacesPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        assert.equal(url, `/api/projects/tree?workspaceId=${DEFAULT_WORKSPACE_ID}`);
        projectFetchCount += 1;
        if (projectFetchCount === 1) {
          throw new Error('project network down');
        }
        return new Response(JSON.stringify(projectsPayload), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      },
      EventSourceImpl: PassiveEventSource
    });

    try {
      await flushUpdates();
      const text = mounted.container.textContent ?? '';
      assert.ok(mounted.container.querySelector('.sidebarArea'));
      assert.ok(mounted.container.querySelector('.centerArea'));
      assert.ok(mounted.container.querySelector('.inspectorArea'));
      assert.match(text, /프로젝트를 불러오지 못했습니다/);
      const retryButton = Array.from(mounted.container.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('다시 시도')
      );
      assert.ok(retryButton, 'error state should expose retry CTA');

      await dispatchInAct(retryButton, new mounted.dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const retriedText = mounted.container.textContent ?? '';
      assert.match(retriedText, /Desert Lynx/);
      assert.equal(streamCreated, true);
      assert.equal(projectFetchCount >= 2, true);
    } finally {
      await mounted.cleanup();
    }
  }

  {
    const projectsPayload = { ok: true, projects: createProjectsFixture(), tree: createProjectTreeFixture() };
    const workspacesPayload = {
      ok: true,
      workspaces: [
        {
          workspaceId: DEFAULT_WORKSPACE_ID,
          name: 'Administrator Workspace',
          defaultMemberRoleId: 'role_user',
          capabilities: {
            canManageWorkspaceSettings: true
          }
        },
        {
          workspaceId: 'ws_readonly',
          name: 'Readonly Workspace',
          defaultMemberRoleId: 'role_user',
          capabilities: {
            canManageWorkspaceSettings: false
          }
        }
      ]
    };
    const serviceWorkspacesPayload = {
      ok: true,
      workspaces: workspacesPayload.workspaces.map((workspace) => ({
        workspaceId: workspace.workspaceId,
        name: workspace.name,
        defaultMemberRoleId: workspace.defaultMemberRoleId,
        createdBy: 'system',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }))
    };
    const serviceUsersPayload = {
      ok: true,
      users: [
        {
          accountId: 'admin',
          displayName: 'Administrator',
          email: 'admin@ashfox.local',
          localLoginId: 'admin',
          githubLogin: null,
          systemRoles: ['system_admin'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      guards: {
        minimumSystemAdminCount: 1,
        currentSystemAdminCount: 1
      }
    };
    const serviceConfigPayload = {
      ok: true,
      permissions: {
        canEdit: true
      },
      settings: {
        smtp: {
          enabled: false,
          host: null,
          port: null,
          secure: false,
          username: null,
          fromEmail: null,
          fromName: null,
          hasPassword: false,
          updatedAt: '2026-01-01T00:00:00.000Z'
        },
        githubAuth: {
          enabled: false,
          clientId: null,
          callbackUrl: null,
          scopes: 'read:user user:email',
          hasClientSecret: false,
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      }
    };

    const workspaceSettingsPayload = {
      ok: true,
      workspace: workspacesPayload.workspaces[0],
      roles: [
        {
          workspaceId: DEFAULT_WORKSPACE_ID,
          roleId: 'role_workspace_admin',
          name: '어드민',
          builtin: 'workspace_admin',
          permissions: [
            'workspace.settings.manage',
            'workspace.members.manage',
            'workspace.roles.manage',
            'folder.read',
            'folder.write'
          ],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        },
        {
          workspaceId: DEFAULT_WORKSPACE_ID,
          roleId: 'role_user',
          name: '유저',
          builtin: null,
          permissions: ['folder.read', 'folder.write'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        },
        {
          workspaceId: DEFAULT_WORKSPACE_ID,
          roleId: 'role_editor',
          name: 'Editor',
          builtin: null,
          permissions: ['folder.read'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      members: [
        {
          workspaceId: DEFAULT_WORKSPACE_ID,
          accountId: 'admin',
          roleIds: ['role_workspace_admin'],
          joinedAt: '2026-01-01T00:00:00.000Z'
        },
        {
          workspaceId: DEFAULT_WORKSPACE_ID,
          accountId: 'member_existing',
          roleIds: ['role_user'],
          joinedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      aclRules: [
        {
          workspaceId: DEFAULT_WORKSPACE_ID,
          ruleId: 'acl_rule_user_root_allow',
          scope: 'folder',
          folderId: null,
          roleIds: ['role_user'],
          read: 'allow',
          write: 'allow',
          locked: false,
          updatedAt: '2026-01-01T00:00:00.000Z'
        },
        {
          workspaceId: DEFAULT_WORKSPACE_ID,
          ruleId: 'acl_rule_user_workspace',
          scope: 'folder',
          folderId: null,
          roleIds: ['role_user'],
          read: 'allow',
          write: 'inherit',
          locked: false,
          updatedAt: '2026-01-01T00:00:00.000Z'
        },
        {
          workspaceId: DEFAULT_WORKSPACE_ID,
          ruleId: 'acl_rule_admin_locked',
          scope: 'folder',
          folderId: null,
          roleIds: ['role_workspace_admin'],
          read: 'allow',
          write: 'allow',
          locked: true,
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    };
    const workspaceMemberCandidatesPayload = {
      ok: true,
      candidates: [
        {
          accountId: 'member_new',
          displayName: '새 멤버',
          email: 'member_new@ashfox.local',
          localLoginId: 'member_new',
          githubLogin: null,
          systemRoles: []
        }
      ]
    };
    const readonlyWorkspaceSettingsPayload = {
      ok: true,
      workspace: workspacesPayload.workspaces[1],
      roles: workspaceSettingsPayload.roles,
      members: [],
      aclRules: []
    };
    const resolveHeaderValue = (headers, key) => {
      if (!headers) {
        return '';
      }
      if (typeof Headers !== 'undefined' && headers instanceof Headers) {
        return headers.get(key) ?? '';
      }
      if (Array.isArray(headers)) {
        const match = headers.find(([name]) => String(name).toLowerCase() === key.toLowerCase());
        return match ? String(match[1] ?? '') : '';
      }
      if (typeof headers === 'object') {
        const normalizedKey = key.toLowerCase();
        for (const [name, value] of Object.entries(headers)) {
          if (name.toLowerCase() === normalizedKey) {
            return String(value ?? '');
          }
        }
      }
      return '';
    };
    const resolveAccountIdFromInit = (init) => {
      const accountId = resolveHeaderValue(init.headers, 'x-ashfox-account-id').trim();
      return accountId || 'admin';
    };
    const workspaceApiKeyLimit = 10;
    let workspaceApiKeysByWorkspace = {
      [DEFAULT_WORKSPACE_ID]: [
        {
          workspaceId: DEFAULT_WORKSPACE_ID,
          keyId: 'key_default',
          name: 'default-key',
          keyPrefix: 'ak_default_pr',
          createdBy: 'admin',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          lastUsedAt: null,
          expiresAt: null,
          revokedAt: null
        },
        {
          workspaceId: DEFAULT_WORKSPACE_ID,
          keyId: 'key_member_hidden',
          name: 'member-hidden-key',
          keyPrefix: 'ak_member_hi',
          createdBy: 'member_existing',
          createdAt: '2026-01-01T00:05:00.000Z',
          updatedAt: '2026-01-01T00:05:00.000Z',
          lastUsedAt: null,
          expiresAt: null,
          revokedAt: null
        }
      ],
      ws_readonly: []
    };
    const createWorkspaceRequests = [];
    const upsertMemberRequests = [];
    const setDefaultRoleRequests = [];
    const upsertAclRuleRequests = [];
    const createApiKeyRequests = [];
    const revokeApiKeyRequests = [];
    const createdWorkspacePayload = {
      workspaceId: 'ws_team',
      name: 'Team Workspace',
      defaultMemberRoleId: 'role_user',
      capabilities: {
        canManageWorkspaceSettings: true
      }
    };
    const emptyTeamProjectsPayload = {
      ok: true,
      projects: [],
      tree: { maxFolderDepth: 3, roots: [] }
    };

    const mounted = await mountHomePage({
      fetchImpl: async (requestUrl, init = {}) => {
        const url = String(requestUrl);
        if (url === '/api/auth/me') {
          return new Response(JSON.stringify(authSessionPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === '/api/projects/tree?workspaceId=ws_team') {
          return new Response(JSON.stringify(emptyTeamProjectsPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === `/api/projects/tree?workspaceId=${DEFAULT_WORKSPACE_ID}` || url === '/api/projects/tree?workspaceId=ws_readonly') {
          return new Response(JSON.stringify(projectsPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === '/api/workspaces' && String(init.method ?? '').toUpperCase() === 'POST') {
          createWorkspaceRequests.push(JSON.parse(String(init.body ?? '{}')));
          return new Response(JSON.stringify({ ok: true, workspace: createdWorkspacePayload }), {
            status: 201,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === '/api/workspaces') {
          return new Response(JSON.stringify(workspacesPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === `/api/workspaces/${DEFAULT_WORKSPACE_ID}/members` && String(init.method ?? '').toUpperCase() === 'PUT') {
          const payload = JSON.parse(String(init.body ?? '{}'));
          upsertMemberRequests.push(payload);
          const nextMember = {
            workspaceId: DEFAULT_WORKSPACE_ID,
            accountId: String(payload.accountId ?? ''),
            roleIds: Array.isArray(payload.roleIds) ? payload.roleIds : [],
            joinedAt: '2026-01-01T00:00:00.000Z'
          };
          const existingMemberIndex = workspaceSettingsPayload.members.findIndex((member) => member.accountId === nextMember.accountId);
          if (existingMemberIndex >= 0) {
            workspaceSettingsPayload.members[existingMemberIndex] = {
              ...workspaceSettingsPayload.members[existingMemberIndex],
              roleIds: nextMember.roleIds
            };
          } else {
            workspaceSettingsPayload.members.push(nextMember);
          }
          return new Response(JSON.stringify({ ok: true, members: workspaceSettingsPayload.members }), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (
          url === `/api/workspaces/${DEFAULT_WORKSPACE_ID}/default-member-role` &&
          String(init.method ?? '').toUpperCase() === 'PATCH'
        ) {
          const payload = JSON.parse(String(init.body ?? '{}'));
          setDefaultRoleRequests.push(payload);
          workspaceSettingsPayload.workspace.defaultMemberRoleId = payload.roleId;
          workspacesPayload.workspaces[0].defaultMemberRoleId = payload.roleId;
          return new Response(
            JSON.stringify({
              ok: true,
              workspace: workspaceSettingsPayload.workspace,
              roles: workspaceSettingsPayload.roles
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json; charset=utf-8' }
            }
          );
        }
        if (url === `/api/workspaces/${DEFAULT_WORKSPACE_ID}/acl-rules` && String(init.method ?? '').toUpperCase() === 'PUT') {
          const payload = JSON.parse(String(init.body ?? '{}'));
          upsertAclRuleRequests.push(payload);
          const normalizedFolderId = payload.folderId ?? null;
          const nextRule = {
            workspaceId: DEFAULT_WORKSPACE_ID,
            ruleId: String(payload.ruleId ?? `acl_generated_${upsertAclRuleRequests.length}`),
            scope: 'folder',
            folderId: normalizedFolderId,
            roleIds: Array.isArray(payload.roleIds) ? payload.roleIds : [],
            read: payload.read ?? 'inherit',
            write: payload.write ?? 'inherit',
            locked: false,
            updatedAt: '2026-01-01T00:00:00.000Z'
          };
          const existingIndex = workspaceSettingsPayload.aclRules.findIndex((entry) => entry.ruleId === nextRule.ruleId);
          if (existingIndex >= 0) {
            workspaceSettingsPayload.aclRules[existingIndex] = {
              ...workspaceSettingsPayload.aclRules[existingIndex],
              ...nextRule
            };
          } else {
            workspaceSettingsPayload.aclRules.push(nextRule);
          }
          return new Response(JSON.stringify({ ok: true, aclRules: workspaceSettingsPayload.aclRules }), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === `/api/workspaces/${DEFAULT_WORKSPACE_ID}/acl-rules` && String(init.method ?? '').toUpperCase() === 'DELETE') {
          const payload = JSON.parse(String(init.body ?? '{}'));
          const targetRuleId = String(payload.ruleId ?? '');
          workspaceSettingsPayload.aclRules = workspaceSettingsPayload.aclRules.filter((entry) => entry.ruleId !== targetRuleId);
          return new Response(JSON.stringify({ ok: true, aclRules: workspaceSettingsPayload.aclRules }), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        const apiKeyRouteMatch = /^\/api\/workspaces\/([^/]+)\/api-keys$/.exec(url);
        if (apiKeyRouteMatch) {
          const workspaceId = decodeURIComponent(apiKeyRouteMatch[1]);
          const accountId = resolveAccountIdFromInit(init);
          const method = String(init.method ?? '').toUpperCase() || 'GET';
          const currentWorkspaceKeys = workspaceApiKeysByWorkspace[workspaceId] ?? [];
          const listOwnKeys = () => currentWorkspaceKeys.filter((apiKey) => apiKey.createdBy === accountId);

          if (method === 'POST') {
            const payload = JSON.parse(String(init.body ?? '{}'));
            createApiKeyRequests.push(payload);
            const ownActiveCount = listOwnKeys().filter((apiKey) => !apiKey.revokedAt).length;
            if (ownActiveCount >= workspaceApiKeyLimit) {
              return new Response(
                JSON.stringify({
                  ok: false,
                  code: 'workspace_api_key_limit_exceeded',
                  message: `활성 API 키는 계정당 최대 ${workspaceApiKeyLimit}개까지 발급할 수 있습니다.`
                }),
                {
                  status: 409,
                  headers: { 'content-type': 'application/json; charset=utf-8' }
                }
              );
            }
            const now = '2026-01-01T00:10:00.000Z';
            const created = {
              workspaceId,
              keyId: `key_generated_${createApiKeyRequests.length}`,
              name: String(payload.name ?? ''),
              keyPrefix: `ak_new_${createApiKeyRequests.length}`,
              createdBy: accountId,
              createdAt: now,
              updatedAt: now,
              lastUsedAt: null,
              expiresAt: payload.expiresAt ?? null,
              revokedAt: null
            };
            workspaceApiKeysByWorkspace = {
              ...workspaceApiKeysByWorkspace,
              [workspaceId]: [created, ...currentWorkspaceKeys]
            };
            return new Response(JSON.stringify({ ok: true, apiKey: created, secret: `ak_secret_${createApiKeyRequests.length}` }), {
              status: 201,
              headers: { 'content-type': 'application/json; charset=utf-8' }
            });
          }

          if (method === 'DELETE') {
            const payload = JSON.parse(String(init.body ?? '{}'));
            revokeApiKeyRequests.push(payload);
            const targetKeyId = String(payload.keyId ?? '');
            const target = currentWorkspaceKeys.find((apiKey) => apiKey.keyId === targetKeyId && apiKey.createdBy === accountId);
            if (!target) {
              return new Response(
                JSON.stringify({
                  ok: false,
                  code: 'workspace_api_key_not_found',
                  message: '요청한 API 키를 찾을 수 없습니다.'
                }),
                {
                  status: 404,
                  headers: { 'content-type': 'application/json; charset=utf-8' }
                }
              );
            }
            const nextKeys = currentWorkspaceKeys.map((apiKey) =>
              apiKey.keyId === targetKeyId
                ? {
                    ...apiKey,
                    revokedAt: '2026-01-01T00:20:00.000Z',
                    updatedAt: '2026-01-01T00:20:00.000Z'
                  }
                : apiKey
            );
            workspaceApiKeysByWorkspace = {
              ...workspaceApiKeysByWorkspace,
              [workspaceId]: nextKeys
            };
            return new Response(JSON.stringify({ ok: true, apiKeys: nextKeys.filter((apiKey) => apiKey.createdBy === accountId) }), {
              status: 200,
              headers: { 'content-type': 'application/json; charset=utf-8' }
            });
          }

          return new Response(JSON.stringify({ ok: true, apiKeys: listOwnKeys() }), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === `/api/workspaces/${DEFAULT_WORKSPACE_ID}/settings`) {
          return new Response(JSON.stringify(workspaceSettingsPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === `/api/workspaces/${DEFAULT_WORKSPACE_ID}/member-candidates?limit=100`) {
          return new Response(JSON.stringify(workspaceMemberCandidatesPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === '/api/workspaces/ws_readonly/settings') {
          return new Response(JSON.stringify(readonlyWorkspaceSettingsPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === '/api/workspaces/ws_readonly/member-candidates?limit=100') {
          return new Response(
            JSON.stringify({
              ok: false,
              code: 'forbidden_workspace',
              message: 'Workspace permission denied.'
            }),
            {
              status: 403,
              headers: { 'content-type': 'application/json; charset=utf-8' }
            }
          );
        }
        if (url === '/api/service/workspaces') {
          return new Response(JSON.stringify(serviceWorkspacesPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === '/api/service/users') {
          return new Response(JSON.stringify(serviceUsersPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === '/api/service/config') {
          return new Response(JSON.stringify(serviceConfigPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        throw new Error(`unexpected url: ${url}`);
      },
      EventSourceImpl: MockEventSource
    });

    try {
      await flushUpdates();
      const { container, dom } = mounted;
      setViewportSize(dom.window, 390, 760);

      const quickWorkspaceSettingsButton = container.querySelector('button[aria-label=\"현재 워크스페이스 설정\"]');
      assert.ok(quickWorkspaceSettingsButton);
      await dispatchInAct(quickWorkspaceSettingsButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const quickSettingsDialog = container.querySelector('[role=\"dialog\"][aria-label=\"워크스페이스 관리\"]');
      assert.ok(quickSettingsDialog);
      const quickSettingsNav = quickSettingsDialog.querySelector('[aria-label=\"워크스페이스 설정 메뉴\"]');
      const quickSettingsPanel = quickSettingsDialog.querySelector('.workspaceDialogPanel');
      assert.ok(quickSettingsNav);
      assert.ok(quickSettingsPanel);
      assert.ok((quickSettingsPanel.className ?? '').includes('workspaceDialogPanel'));
      assert.match(quickSettingsDialog.textContent ?? '', /워크스페이스 관리/);

      const membersNavButton = Array.from(quickSettingsDialog.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('멤버')
      );
      assert.ok(membersNavButton);
      await dispatchInAct(membersNavButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const memberDeleteButtons = Array.from(quickSettingsDialog.querySelectorAll('button')).filter(
        (button) => (button.getAttribute('aria-label') ?? '').includes('멤버 삭제')
      );
      assert.equal(memberDeleteButtons.length >= 2, true);
      assert.equal(memberDeleteButtons.every((button) => button.disabled), true);
      const memberSearchInput = quickSettingsDialog.querySelector('input[aria-label="워크스페이스 멤버 검색"]');
      assert.ok(memberSearchInput);
      memberSearchInput.value = 'member_existing';
      await dispatchInAct(memberSearchInput, new dom.window.Event('input', { bubbles: true }));
      await flushUpdates();
      assert.match(quickSettingsDialog.textContent ?? '', /등록된 멤버 1\/2명/);
      memberSearchInput.value = '';
      await dispatchInAct(memberSearchInput, new dom.window.Event('input', { bubbles: true }));
      await flushUpdates();
      const openMemberComposerButton = quickSettingsDialog.querySelector('button[aria-label="멤버 추가"]');
      assert.ok(openMemberComposerButton);
      await dispatchInAct(openMemberComposerButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      assert.match(quickSettingsDialog.textContent ?? '', /계정 선택/);
      assert.doesNotMatch(quickSettingsDialog.textContent ?? '', /account id/);
      const memberRoleSelector = quickSettingsDialog.querySelector('[aria-label="멤버 역할 선택"]');
      assert.ok(memberRoleSelector);
      const memberRows = Array.from(quickSettingsDialog.querySelectorAll('[data-dashboard-list-row="true"]'));
      assert.equal(memberRows.length >= 2, true);
      assert.equal(memberRows.every((row) => (row.className ?? '').includes('dashboardListRow')), true);
      const treePatternRow = container.querySelector('[data-dashboard-list-context="tree-project"]');
      assert.ok(treePatternRow);
      assert.match(treePatternRow.className ?? '', /dashboardListRow/);
      const treePatternActions = treePatternRow.querySelector('[class*="dashboardListRowActions"]');
      const dialogPatternActions = memberRows[0].querySelector('[class*="dashboardListRowActions"]');
      assert.ok(treePatternActions);
      assert.ok(dialogPatternActions);
      const adminMemberRow = memberRows.find((article) =>
        (article.textContent ?? '').includes('admin')
      );
      assert.ok(adminMemberRow);
      const editAdminMemberButton = adminMemberRow.querySelector('button[aria-label="admin 멤버 역할 수정"]');
      assert.ok(editAdminMemberButton);
      assert.equal(editAdminMemberButton.disabled, true);
      const existingMemberRow = memberRows.find((article) =>
        (article.textContent ?? '').includes('member_existing')
      );
      assert.ok(existingMemberRow);
      const editExistingMemberButton = existingMemberRow.querySelector('button[aria-label="member_existing 멤버 역할 수정"]');
      assert.ok(editExistingMemberButton);
      assert.equal(editExistingMemberButton.disabled, false);
      await dispatchInAct(editExistingMemberButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      assert.match(quickSettingsDialog.textContent ?? '', /멤버 역할 수정/);
      assert.match(quickSettingsDialog.textContent ?? '', /\(기본\)/);
      const saveMemberButton = quickSettingsDialog.querySelector('button[aria-label="멤버 저장"]');
      assert.ok(saveMemberButton);
      await dispatchInAct(saveMemberButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      assert.equal(upsertMemberRequests.length, 1);
      assert.equal(upsertMemberRequests[0].accountId, 'member_existing');
      assert.ok(upsertMemberRequests[0].roleIds.includes('role_user'));

      const rolesNavButton = Array.from(quickSettingsDialog.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('역할')
      );
      assert.ok(rolesNavButton);
      await dispatchInAct(rolesNavButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const newRoleButton = quickSettingsDialog.querySelector('button[aria-label="역할 추가"]');
      assert.ok(newRoleButton);
      assert.equal(container.querySelector('[role="dialog"][aria-label="역할 생성"]'), null);
      assert.ok(quickSettingsDialog.querySelector('[aria-label="기본 가입자 역할"]'));
      assert.ok(quickSettingsDialog.querySelector('[aria-label="어드민 고정 역할"]'));
      assert.match(quickSettingsDialog.textContent ?? '', /어드민/);
      assert.match(quickSettingsDialog.textContent ?? '', /유저/);
      assert.equal(quickSettingsDialog.querySelector('input[placeholder="role name"]'), null);
      await dispatchInAct(newRoleButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const roleCreateDialog = container.querySelector('[role="dialog"][aria-label="역할 생성"]');
      assert.ok(roleCreateDialog);
      const closeRoleCreateDialogButton = roleCreateDialog.querySelector('button[aria-label="역할 생성 취소"]');
      assert.ok(closeRoleCreateDialogButton);
      await dispatchInAct(closeRoleCreateDialogButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      assert.equal(container.querySelector('[role="dialog"][aria-label="역할 생성"]'), null);
      assert.doesNotMatch(quickSettingsDialog.textContent ?? '', /유저 템플릿 적용/);
      assert.doesNotMatch(quickSettingsDialog.textContent ?? '', /어드민 템플릿 적용/);
      const adminRoleActionButton = quickSettingsDialog.querySelector('button[aria-label="어드민 역할 액션"]');
      assert.ok(adminRoleActionButton);
      await dispatchInAct(adminRoleActionButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      assert.match(quickSettingsDialog.textContent ?? '', /기본 가입자 권한으로 지정/);
      assert.match(quickSettingsDialog.textContent ?? '', /삭제/);
      const editorRoleActionButton = quickSettingsDialog.querySelector('button[aria-label="Editor 역할 액션"]');
      assert.ok(editorRoleActionButton);
      await dispatchInAct(editorRoleActionButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const editEditorRoleButton = Array.from(quickSettingsDialog.querySelectorAll('button[role="menuitem"]')).find(
        (button) => (button.textContent ?? '').trim() === '수정' && button.disabled === false
      );
      assert.ok(editEditorRoleButton);
      await dispatchInAct(editEditorRoleButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const roleEditDialog = container.querySelector('[role="dialog"][aria-label="역할 수정"]');
      assert.ok(roleEditDialog);
      const roleEditNameInput = roleEditDialog.querySelector('input[aria-label="역할 수정 이름 입력"]');
      assert.ok(roleEditNameInput);
      assert.equal(roleEditNameInput.value, 'Editor');
      const roleEditCancelButton = roleEditDialog.querySelector('button[aria-label="역할 수정 취소"]');
      assert.ok(roleEditCancelButton);
      await dispatchInAct(roleEditCancelButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      await dispatchInAct(editorRoleActionButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const setEditorDefaultButton = Array.from(quickSettingsDialog.querySelectorAll('button')).find(
        (button) => (button.textContent ?? '').trim() === '기본 가입자 권한으로 지정'
      );
      assert.ok(setEditorDefaultButton);
      await dispatchInAct(setEditorDefaultButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      assert.equal(setDefaultRoleRequests.length, 1);
      assert.equal(setDefaultRoleRequests[0].roleId, 'role_editor');
      const roleRows = Array.from(quickSettingsDialog.querySelectorAll('[data-dashboard-list-row="true"]'));
      const editorRoleRow = roleRows.find((article) => (article.textContent ?? '').includes('Editor'));
      const userRoleRow = roleRows.find((article) => (article.textContent ?? '').includes('유저'));
      const adminRoleRow = roleRows.find((article) => (article.textContent ?? '').includes('어드민'));
      assert.ok(editorRoleRow);
      assert.ok(userRoleRow);
      assert.ok(adminRoleRow);
      assert.ok(editorRoleRow.querySelector('[aria-label="기본 가입자 역할"]'));
      assert.equal(userRoleRow.querySelector('[aria-label="기본 가입자 역할"]'), null);
      const roleCountBadges = quickSettingsDialog.querySelectorAll('[aria-label*="역할 멤버 수"]');
      assert.equal(roleCountBadges.length >= 3, true);
      assert.match(editorRoleRow.textContent ?? '', /0명/);
      assert.match(adminRoleRow.textContent ?? '', /1명/);

      const folderAclNavButton = Array.from(quickSettingsDialog.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('ACL 규칙')
      );
      assert.ok(folderAclNavButton);
      await dispatchInAct(folderAclNavButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      assert.equal(container.querySelector('[role="dialog"][aria-label="ACL 규칙 추가"]'), null);
      assert.match(quickSettingsDialog.textContent ?? '', /루트 \(모든 폴더\)/);
      assert.doesNotMatch(quickSettingsDialog.textContent ?? '', /folder id/);
      assert.equal(quickSettingsDialog.querySelector('[aria-label="ACL 추가 범위 선택"]'), null);
      const createAclRuleButton = quickSettingsDialog.querySelector('button[aria-label="ACL 규칙 추가"]');
      assert.ok(createAclRuleButton);
      await dispatchInAct(createAclRuleButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const aclCreateDialog = container.querySelector('[role="dialog"][aria-label="ACL 규칙 추가"]');
      assert.ok(aclCreateDialog);
      const cancelAclCreateDialogButton = aclCreateDialog.querySelector('button[aria-label="ACL 규칙 추가 취소"]');
      assert.ok(cancelAclCreateDialogButton);
      await dispatchInAct(cancelAclCreateDialogButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      assert.equal(container.querySelector('[role="dialog"][aria-label="ACL 규칙 추가"]'), null);
      const editableAclEditButton = quickSettingsDialog.querySelector('button[aria-label="acl_rule_user_root_allow ACL 규칙 수정"]');
      assert.ok(editableAclEditButton);
      assert.equal(editableAclEditButton.disabled, false);
      const lockedAclEditButton = quickSettingsDialog.querySelector('button[aria-label="acl_rule_admin_locked ACL 규칙 수정"]');
      assert.ok(lockedAclEditButton);
      assert.equal(lockedAclEditButton.disabled, true);
      const aclRows = Array.from(quickSettingsDialog.querySelectorAll('[data-dashboard-list-row="true"]'));
      const lockedAclRow = aclRows.find((article) => (article.textContent ?? '').includes('고정'));
      assert.ok(lockedAclRow);
      assert.ok(lockedAclRow.querySelector('[class*="workspaceAclTitleRow"] [class*="workspaceAclLockedBadge"]'));
      await dispatchInAct(editableAclEditButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const aclEditDialog = container.querySelector('[role="dialog"][aria-label="ACL 규칙 수정"]');
      assert.ok(aclEditDialog);
      const aclEditWriteEffectSelect = aclEditDialog.querySelector('select[aria-label="ACL 수정 write 효과 선택"]');
      assert.ok(aclEditWriteEffectSelect);
      aclEditWriteEffectSelect.value = 'deny';
      await dispatchInAct(aclEditWriteEffectSelect, new dom.window.Event('change', { bubbles: true }));
      await flushUpdates();
      const saveAclRuleButton = aclEditDialog.querySelector('button[aria-label="ACL 규칙 수정 저장"]');
      assert.ok(saveAclRuleButton);
      await dispatchInAct(saveAclRuleButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      await flushUpdates();
      assert.equal(upsertAclRuleRequests.length, 1);
      assert.equal(upsertAclRuleRequests[0].ruleId, 'acl_rule_user_root_allow');
      assert.deepEqual(upsertAclRuleRequests[0].roleIds, ['role_user']);
      assert.equal(upsertAclRuleRequests[0].write, 'deny');
      assert.equal(container.querySelector('[role="dialog"][aria-label="ACL 규칙 수정"]'), null);

      const apiKeysNavButton = Array.from(quickSettingsDialog.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('API 키')
      );
      assert.ok(apiKeysNavButton);
      assert.match(apiKeysNavButton.textContent ?? '', /0\/10/);
      await dispatchInAct(apiKeysNavButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      await flushUpdates();
      const createApiKeyButton = quickSettingsDialog.querySelector('button[aria-label="API 키 발급"]');
      assert.ok(createApiKeyButton);
      assert.doesNotMatch(quickSettingsDialog.textContent ?? '', /member-hidden-key/);
      const copyDefaultPrefixButton = quickSettingsDialog.querySelector('button[aria-label="default-key API 키 접두사 복사"]');
      assert.ok(copyDefaultPrefixButton);
      await dispatchInAct(createApiKeyButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const createApiKeyDialog = container.querySelector('[role="dialog"][aria-label="API 키 발급"]');
      assert.ok(createApiKeyDialog);
      const closeCreateApiKeyDialogButton = createApiKeyDialog.querySelector('button[aria-label="API 키 발급 취소"]');
      assert.ok(closeCreateApiKeyDialogButton);
      await dispatchInAct(closeCreateApiKeyDialogButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      assert.equal(container.querySelector('[role="dialog"][aria-label="API 키 발급"]'), null);
      const revokeApiKeyButton = quickSettingsDialog.querySelector('button[aria-label="default-key API 키 폐기"]');
      assert.ok(revokeApiKeyButton);
      await dispatchInAct(revokeApiKeyButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      assert.equal(revokeApiKeyRequests.length, 1);
      assert.equal(revokeApiKeyRequests[0].keyId, 'key_default');

      const closeQuickDialogButton = quickSettingsDialog.querySelector('button[aria-label=\"닫기\"]');
      assert.ok(closeQuickDialogButton);
      await dispatchInAct(closeQuickDialogButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const sidebarMenuButton = container.querySelector('button[aria-label=\"사이드바 설정\"]');
      assert.ok(sidebarMenuButton);
      await dispatchInAct(sidebarMenuButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const sidebarSettingsMenu = container.querySelector('[role=\"menu\"][aria-label=\"사이드바 설정 메뉴\"]');
      assert.ok(sidebarSettingsMenu);
      assertMenuWithinViewport(sidebarSettingsMenu, dom.window);
      const sidebarSettingsMenuText = sidebarSettingsMenu.textContent ?? '';
      assert.match(sidebarSettingsMenuText, /서비스 관리/);
      assert.match(sidebarSettingsMenuText, /워크스페이스 생성/);
      assert.match(sidebarSettingsMenuText, /로그아웃/);
      assert.doesNotMatch(sidebarSettingsMenuText, /워크스페이스 관리/);
      const openServiceManagementButton = Array.from(sidebarSettingsMenu.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('서비스 관리')
      );
      assert.ok(openServiceManagementButton);
      await dispatchInAct(openServiceManagementButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const serviceManagementDialog = container.querySelector('[role="dialog"][aria-label="서비스 관리"]');
      assert.ok(serviceManagementDialog);
      assert.ok(serviceManagementDialog.querySelector('[aria-label="서비스 관리 메뉴"]'));
      assert.ok(serviceManagementDialog.querySelector('.workspaceDialogPanel'));
      assert.match(serviceManagementDialog.textContent ?? '', /Administrator Workspace/);
      assert.doesNotMatch(serviceManagementDialog.textContent ?? '', /서비스 관리 정보를 불러오지 못했습니다/);
      const closeServiceDialogButton = serviceManagementDialog.querySelector('button[aria-label="닫기"]');
      assert.ok(closeServiceDialogButton);
      await dispatchInAct(closeServiceDialogButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      await dispatchInAct(sidebarMenuButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const sidebarSettingsMenuAfterService = container.querySelector('[role="menu"][aria-label="사이드바 설정 메뉴"]');
      assert.ok(sidebarSettingsMenuAfterService);

      const openCreateWorkspaceButton = Array.from(sidebarSettingsMenuAfterService.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('워크스페이스 생성')
      );
      assert.ok(openCreateWorkspaceButton);
      await dispatchInAct(openCreateWorkspaceButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const createDialog = container.querySelector('[role=\"dialog\"][aria-label=\"워크스페이스 생성\"]');
      assert.ok(createDialog);

      const createForm = createDialog.querySelector('form');
      assert.ok(createForm);
      await dispatchInAct(createForm, new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      await flushUpdates();

      assert.equal(createWorkspaceRequests.length, 1);
      assert.deepEqual(createWorkspaceRequests[0], {
        name: '새 워크스페이스'
      });

      const selectedWorkspaceButtonAfterCreate = Array.from(container.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('Team Workspace')
      );
      assert.ok(selectedWorkspaceButtonAfterCreate);
      const emptyWorkspaceText = container.textContent ?? '';
      assert.match(emptyWorkspaceText, /프로젝트\/폴더가 없습니다/);
      assert.doesNotMatch(emptyWorkspaceText, /표시할 프로젝트가 없습니다/);
      assert.equal(
        MockEventSource.instances.some((instance) => instance.url.includes('workspaceId=ws_team')),
        false,
        'empty workspace should not open project stream'
      );

      const workspaceSelectorButton = Array.from(container.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('Team Workspace')
      );
      assert.ok(workspaceSelectorButton);
      await dispatchInAct(workspaceSelectorButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const workspaceSelectorMenu = container.querySelector('[role=\"menu\"][aria-label=\"워크스페이스 목록\"]');
      assert.ok(workspaceSelectorMenu);
      assertMenuWithinViewport(workspaceSelectorMenu, dom.window);

      const readonlyWorkspaceButton = Array.from(container.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('Readonly Workspace')
      );
      assert.ok(readonlyWorkspaceButton);
      await dispatchInAct(readonlyWorkspaceButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const currentStream = MockEventSource.instances.at(-1);
      assert.ok(currentStream);
      assert.match(currentStream.url, /workspaceId=ws_readonly/);

      const quickWorkspaceSettingsButtonAfterSwitch = container.querySelector('button[aria-label=\"현재 워크스페이스 설정\"]');
      assert.ok(quickWorkspaceSettingsButtonAfterSwitch);
      await dispatchInAct(quickWorkspaceSettingsButtonAfterSwitch, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const readonlyDialog = container.querySelector('[role=\"dialog\"][aria-label=\"워크스페이스 관리\"]');
      assert.ok(readonlyDialog);
      assert.doesNotMatch(readonlyDialog.textContent ?? '', /읽기 전용/);
      const readonlyNav = readonlyDialog.querySelector('[aria-label=\"워크스페이스 설정 메뉴\"]');
      assert.ok(readonlyNav);
      assert.match(readonlyNav.textContent ?? '', /API 키/);
      assert.doesNotMatch(readonlyNav.textContent ?? '', /일반/);
      assert.doesNotMatch(readonlyNav.textContent ?? '', /멤버/);
      assert.doesNotMatch(readonlyNav.textContent ?? '', /역할/);
      assert.doesNotMatch(readonlyNav.textContent ?? '', /ACL 규칙/);
      const readonlyDialogCloseButton = readonlyDialog.querySelector('button[aria-label=\"닫기\"]');
      assert.ok(readonlyDialogCloseButton);
      await dispatchInAct(readonlyDialogCloseButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const sidebarMenuButtonAfterReadonly = container.querySelector('button[aria-label=\"사이드바 설정\"]');
      assert.ok(sidebarMenuButtonAfterReadonly);
      await dispatchInAct(sidebarMenuButtonAfterReadonly, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      let sidebarSettingsMenuAfterSwitch = container.querySelector('[role=\"menu\"][aria-label=\"사이드바 설정 메뉴\"]');
      if (!sidebarSettingsMenuAfterSwitch) {
        await dispatchInAct(sidebarMenuButtonAfterReadonly, new dom.window.MouseEvent('click', { bubbles: true }));
        await flushUpdates();
        sidebarSettingsMenuAfterSwitch = container.querySelector('[role=\"menu\"][aria-label=\"사이드바 설정 메뉴\"]');
      }
      assert.ok(sidebarSettingsMenuAfterSwitch);
      assert.match(sidebarSettingsMenuAfterSwitch.textContent ?? '', /서비스 관리/);
      assert.doesNotMatch(sidebarSettingsMenuAfterSwitch.textContent ?? '', /워크스페이스 관리/);
    } finally {
      await mounted.cleanup();
      MockEventSource.reset();
    }
  }

  {
    const authSessionPayload = createAuthSessionFixture();
    authSessionPayload.user.systemRoles = [];
    const projectsPayload = { ok: true, projects: createProjectsFixture(), tree: createProjectTreeFixture() };
    const workspacesPayload = { ok: true, workspaces: createWorkspacesFixture() };
    const mounted = await mountHomePage({
      fetchImpl: async (requestUrl) => {
        const url = String(requestUrl);
        if (url === '/api/auth/me') {
          return new Response(JSON.stringify(authSessionPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === '/api/workspaces') {
          return new Response(JSON.stringify(workspacesPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        assert.equal(url, `/api/projects/tree?workspaceId=${DEFAULT_WORKSPACE_ID}`);
        return new Response(JSON.stringify(projectsPayload), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      },
      EventSourceImpl: MockEventSource
    });

    try {
      await flushUpdates();
      const { container, dom } = mounted;
      const sidebarMenuButton = container.querySelector('button[aria-label="사이드바 설정"]');
      assert.ok(sidebarMenuButton);
      await dispatchInAct(sidebarMenuButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const sidebarSettingsMenu = container.querySelector('[role="menu"][aria-label="사이드바 설정 메뉴"]');
      assert.ok(sidebarSettingsMenu);
      const sidebarSettingsMenuText = sidebarSettingsMenu.textContent ?? '';
      assert.doesNotMatch(sidebarSettingsMenuText, /서비스 관리/);
      assert.doesNotMatch(sidebarSettingsMenuText, /워크스페이스 생성/);
    } finally {
      await mounted.cleanup();
      MockEventSource.reset();
    }
  }
};
