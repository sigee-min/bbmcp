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

const toJsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });

const findButtonByText = (root, text) =>
  Array.from(root.querySelectorAll('button')).find((button) => (button.textContent ?? '').includes(text));
const countOccurrences = (text, token) => text.split(token).length - 1;

const openServiceManagementDialog = async (container, dom) => {
  const sidebarMenuButton = container.querySelector('button[aria-label="사이드바 설정"]');
  assert.ok(sidebarMenuButton);
  await dispatchInAct(sidebarMenuButton, new dom.window.MouseEvent('click', { bubbles: true }));
  await flushUpdates();
  const sidebarSettingsMenu = container.querySelector('[role="menu"][aria-label="사이드바 설정 메뉴"]');
  assert.ok(sidebarSettingsMenu);
  const openServiceManagementButton = findButtonByText(sidebarSettingsMenu, '서비스 관리');
  assert.ok(openServiceManagementButton);
  await dispatchInAct(openServiceManagementButton, new dom.window.MouseEvent('click', { bubbles: true }));
  await flushUpdates();
  await flushUpdates();
  const dialog = container.querySelector('[role="dialog"][aria-label="서비스 관리"]');
  assert.ok(dialog);
  return dialog;
};

module.exports = async () => {
  const projectsPayload = { ok: true, projects: createProjectsFixture(), tree: createProjectTreeFixture() };
  const workspacesPayload = { ok: true, workspaces: createWorkspacesFixture() };
  const serviceWorkspacesPayload = { ok: true, workspaces: createServiceWorkspacesFixture() };

  {
    const authSessionPayload = createAuthSessionFixture();
    const roleRequests = [];
    const userSearchRequests = [];
    const workspaceSearchRequests = [];
    const userWorkspaceRequests = [];
    const serviceApiKeyCreateRequests = [];
    const serviceApiKeyRevokeRequests = [];
    let serviceUsers = [
      {
        accountId: 'admin',
        displayName: 'Administrator',
        email: 'admin@ashfox.local',
        localLoginId: 'admin',
        githubLogin: null,
        systemRoles: ['system_admin'],
        createdAt: '2026-02-21T00:00:00.000Z',
        updatedAt: '2026-02-21T00:00:00.000Z'
      },
      {
        accountId: 'cs1',
        displayName: 'CS One',
        email: 'cs1@ashfox.local',
        localLoginId: 'cs1',
        githubLogin: null,
        systemRoles: ['cs_admin'],
        createdAt: '2026-02-21T00:00:00.000Z',
        updatedAt: '2026-02-21T00:00:00.000Z'
      }
    ];
    let serviceSettings = {
      smtp: {
        enabled: false,
        host: null,
        port: null,
        secure: false,
        username: null,
        fromEmail: null,
        fromName: null,
        hasPassword: false,
        updatedAt: '2026-02-21T00:00:00.000Z'
      },
      githubAuth: {
        enabled: true,
        clientId: 'gh-client',
        callbackUrl: 'http://localhost:8686/api/auth/github/callback',
        scopes: 'read:user user:email',
        hasClientSecret: true,
        updatedAt: '2026-02-21T00:00:00.000Z'
      }
    };
    let serviceApiKeys = [];

    const mounted = await mountHomePage({
      fetchImpl: async (requestUrl, init = {}) => {
        const url = String(requestUrl);
        const method = String(init.method ?? 'GET').toUpperCase();
        if (url === '/api/auth/me') {
          return toJsonResponse(authSessionPayload);
        }
        if (url === '/api/workspaces') {
          return toJsonResponse(workspacesPayload);
        }
        if (url === `/api/projects/tree?workspaceId=${DEFAULT_WORKSPACE_ID}`) {
          return toJsonResponse(projectsPayload);
        }
        if (url.startsWith('/api/service/workspaces')) {
          const parsed = new URL(url, 'http://localhost');
          const q = (parsed.searchParams.get('q') ?? '').toLowerCase();
          const field = parsed.searchParams.get('field') ?? 'any';
          const match = parsed.searchParams.get('match') ?? 'contains';
          workspaceSearchRequests.push(parsed.search);
          const matchToken = (candidate) => {
            const normalized = String(candidate ?? '').toLowerCase();
            if (!q) return true;
            if (match === 'exact') return normalized === q;
            if (match === 'prefix') return normalized.startsWith(q);
            return normalized.includes(q);
          };
          const filtered = (serviceWorkspacesPayload.workspaces ?? []).filter((workspace) => {
            if (!q) {
              return true;
            }
            if (field === 'workspaceId') return matchToken(workspace.workspaceId);
            if (field === 'name') return matchToken(workspace.name);
            if (field === 'createdBy') return matchToken(workspace.createdBy);
            return (
              matchToken(workspace.workspaceId) ||
              matchToken(workspace.name) ||
              matchToken(workspace.createdBy)
            );
          });
          return toJsonResponse({
            ok: true,
            workspaces: filtered,
            search: {
              q: q || null,
              field,
              match,
              limit: 25,
              cursor: null,
              nextCursor: null,
              memberAccountId: null,
              total: filtered.length
            }
          });
        }
        if (url === '/api/service/users/admin/system-roles' && method === 'PUT') {
          const body = JSON.parse(String(init.body ?? '{}'));
          roleRequests.push(body);
          serviceUsers = serviceUsers.map((user) =>
            user.accountId === 'admin'
              ? {
                  ...user,
                  systemRoles: Array.isArray(body.systemRoles) ? body.systemRoles : user.systemRoles,
                  updatedAt: '2026-02-21T01:00:00.000Z'
                }
              : user
          );
          const updated = serviceUsers.find((user) => user.accountId === 'admin');
          return toJsonResponse({ ok: true, user: updated });
        }
        if (url.startsWith('/api/service/users/') && url.endsWith('/workspaces')) {
          userWorkspaceRequests.push(url);
          return toJsonResponse({
            ok: true,
            account: serviceUsers.find((user) => user.accountId === 'admin') ?? null,
            workspaces: [
              {
                workspaceId: 'ws_admin',
                name: 'Administrator Workspace',
                defaultMemberRoleId: 'role_user',
                createdBy: 'system',
                createdAt: '2026-02-21T00:00:00.000Z',
                updatedAt: '2026-02-21T00:00:00.000Z',
                membership: {
                  accountId: 'admin',
                  workspaceId: 'ws_admin',
                  roleIds: ['system_admin'],
                  joinedAt: '2026-02-21T00:00:00.000Z'
                }
              }
            ]
          });
        }
        if (url.startsWith('/api/service/users')) {
          const parsed = new URL(url, 'http://localhost');
          const q = (parsed.searchParams.get('q') ?? '').toLowerCase();
          const field = parsed.searchParams.get('field') ?? 'any';
          const match = parsed.searchParams.get('match') ?? 'contains';
          userSearchRequests.push(parsed.search);
          const matchToken = (candidate) => {
            const normalized = String(candidate ?? '').toLowerCase();
            if (!q) return true;
            if (match === 'exact') return normalized === q;
            if (match === 'prefix') return normalized.startsWith(q);
            return normalized.includes(q);
          };
          const filtered = serviceUsers.filter((user) => {
            if (!q) {
              return true;
            }
            if (field === 'accountId') return matchToken(user.accountId);
            if (field === 'displayName') return matchToken(user.displayName);
            if (field === 'email') return matchToken(user.email);
            if (field === 'localLoginId') return matchToken(user.localLoginId);
            if (field === 'githubLogin') return matchToken(user.githubLogin);
            return (
              matchToken(user.accountId) ||
              matchToken(user.displayName) ||
              matchToken(user.email) ||
              matchToken(user.localLoginId) ||
              matchToken(user.githubLogin)
            );
          });
          const currentSystemAdminCount = serviceUsers.filter((user) => user.systemRoles.includes('system_admin')).length;
          return toJsonResponse({
            ok: true,
            users: filtered,
            guards: {
              minimumSystemAdminCount: 1,
              currentSystemAdminCount
            },
            search: {
              q: q || null,
              field,
              match,
              limit: 25,
              cursor: null,
              nextCursor: null,
              workspaceId: null,
              total: filtered.length
            }
          });
        }
        if (url === '/api/service/config') {
          return toJsonResponse({
            ok: true,
            permissions: {
              canEdit: true
            },
            settings: serviceSettings
          });
        }
        if (url === '/api/service/api-keys' && method === 'GET') {
          return toJsonResponse({
            ok: true,
            apiKeys: serviceApiKeys
          });
        }
        if (url === '/api/service/api-keys' && method === 'POST') {
          const body = JSON.parse(String(init.body ?? '{}'));
          serviceApiKeyCreateRequests.push(body);
          const suffix = String(serviceApiKeys.length + 1).padStart(2, '0');
          const createdApiKey = {
            keyId: `svc_key_${suffix}`,
            name: typeof body.name === 'string' && body.name.trim().length > 0 ? body.name.trim() : 'API key',
            keyPrefix: `ash_svc_${suffix}`,
            createdBy: 'admin',
            createdAt: '2026-02-21T01:00:00.000Z',
            updatedAt: '2026-02-21T01:00:00.000Z',
            lastUsedAt: null,
            expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
            revokedAt: null
          };
          serviceApiKeys = [createdApiKey, ...serviceApiKeys.filter((apiKey) => apiKey.keyId !== createdApiKey.keyId)];
          return toJsonResponse({
            ok: true,
            apiKey: createdApiKey,
            secret: `ashfox_service_secret_${suffix}`
          });
        }
        if (url === '/api/service/api-keys' && method === 'DELETE') {
          const body = JSON.parse(String(init.body ?? '{}'));
          serviceApiKeyRevokeRequests.push(body);
          serviceApiKeys = serviceApiKeys.map((apiKey) =>
            apiKey.keyId === body.keyId
              ? {
                  ...apiKey,
                  revokedAt: '2026-02-21T01:30:00.000Z',
                  updatedAt: '2026-02-21T01:30:00.000Z'
                }
              : apiKey
          );
          return toJsonResponse({
            ok: true,
            apiKeys: serviceApiKeys
          });
        }
        if (url === '/api/service/config/smtp' && method === 'PUT') {
          const body = JSON.parse(String(init.body ?? '{}'));
          serviceSettings = {
            ...serviceSettings,
            smtp: {
              ...serviceSettings.smtp,
              ...body,
              hasPassword:
                typeof body.password === 'string' && body.password.trim().length > 0
                  ? true
                  : serviceSettings.smtp.hasPassword,
              updatedAt: '2026-02-21T01:00:00.000Z'
            }
          };
          return toJsonResponse({ ok: true, settings: serviceSettings });
        }
        if (url === '/api/service/config/github' && method === 'PUT') {
          const body = JSON.parse(String(init.body ?? '{}'));
          serviceSettings = {
            ...serviceSettings,
            githubAuth: {
              ...serviceSettings.githubAuth,
              ...body,
              hasClientSecret:
                typeof body.clientSecret === 'string' && body.clientSecret.trim().length > 0
                  ? true
                  : serviceSettings.githubAuth.hasClientSecret,
              updatedAt: '2026-02-21T01:00:00.000Z'
            }
          };
          return toJsonResponse({ ok: true, settings: serviceSettings });
        }
        throw new Error(`unexpected url: ${method} ${url}`);
      },
      EventSourceImpl: MockEventSource
    });

    try {
      await flushUpdates();
      const { container, dom } = mounted;
      const dialog = await openServiceManagementDialog(container, dom);
      assert.match(dialog.textContent ?? '', /Administrator Workspace/);
      assert.doesNotMatch(dialog.textContent ?? '', /mode:/);

      const usersNavButton = findButtonByText(dialog, '유저');
      assert.ok(usersNavButton);
      await dispatchInAct(usersNavButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const userSearchInput = dialog.querySelector('input[aria-label="서비스 유저 검색어"]');
      assert.ok(userSearchInput);
      await dispatchInAct(userSearchInput, new dom.window.Event('focus', { bubbles: true }));
      userSearchInput.value = 'admin';
      await dispatchInAct(userSearchInput, new dom.window.Event('input', { bubbles: true }));
      await flushUpdates();
      const userSearchRequestCountBefore = userSearchRequests.length;
      const runUserSearchButton = dialog.querySelector('button[aria-label="서비스 유저 검색 실행"]');
      assert.ok(runUserSearchButton);
      await dispatchInAct(runUserSearchButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      assert.ok(userSearchRequests.length > userSearchRequestCountBefore);

      const openMembershipButton = dialog.querySelector('button[aria-label="admin 소속 워크스페이스 보기"]');
      assert.ok(openMembershipButton);
      await dispatchInAct(openMembershipButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const membershipDialog = container.querySelector('[role="dialog"][aria-label="유저 소속 워크스페이스"]');
      assert.ok(membershipDialog);
      assert.match(membershipDialog.textContent ?? '', /Administrator Workspace/);
      assert.equal(userWorkspaceRequests.includes('/api/service/users/admin/workspaces'), true);
      const closeMembershipButton = membershipDialog.querySelector('button[aria-label="유저 소속 워크스페이스 닫기"]');
      assert.ok(closeMembershipButton);
      await dispatchInAct(closeMembershipButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const editAdminRolesButton = dialog.querySelector('button[aria-label="admin 시스템 역할 수정"]');
      assert.ok(editAdminRolesButton);
      assert.equal(editAdminRolesButton.disabled, false);
      await dispatchInAct(editAdminRolesButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const editDialog = container.querySelector('[role="dialog"][aria-label="시스템 역할 수정"]');
      assert.ok(editDialog);
      const addCsAdminRoleButton = findButtonByText(editDialog, 'CS Admin');
      assert.ok(addCsAdminRoleButton);
      await dispatchInAct(addCsAdminRoleButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const saveRoleButton = editDialog.querySelector('button[aria-label="시스템 역할 수정 저장"]');
      assert.ok(saveRoleButton);
      await dispatchInAct(saveRoleButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      await flushUpdates();
      assert.equal(roleRequests.length, 1);
      assert.deepEqual(roleRequests[0].systemRoles.sort(), ['cs_admin', 'system_admin']);
      assert.ok(workspaceSearchRequests.length >= 1);

      const apiKeysNavButton = findButtonByText(dialog, 'API 키');
      assert.ok(apiKeysNavButton);
      await dispatchInAct(apiKeysNavButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const createApiKeyButton = dialog.querySelector('button[aria-label="API 키 발급"]');
      assert.ok(createApiKeyButton);
      await dispatchInAct(createApiKeyButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const createApiKeyDialog = container.querySelector('[role="dialog"][aria-label="API 키 발급"]');
      assert.ok(createApiKeyDialog);
      const apiKeyNameInput = createApiKeyDialog.querySelector('input[aria-label="API 키 이름 입력"]');
      assert.ok(apiKeyNameInput);
      assert.equal(apiKeyNameInput.disabled, false);
      apiKeyNameInput.value = 'service-ci';
      await dispatchInAct(
        apiKeyNameInput,
        new dom.window.InputEvent('input', { bubbles: true, data: 'service-ci', inputType: 'insertText' })
      );
      await dispatchInAct(apiKeyNameInput, new dom.window.Event('change', { bubbles: true }));
      await flushUpdates();
      const saveApiKeyButton = createApiKeyDialog.querySelector('button[aria-label="API 키 발급 저장"]');
      assert.ok(saveApiKeyButton);
      const createApiKeyForm = createApiKeyDialog.querySelector('form');
      assert.ok(createApiKeyForm);
      await dispatchInAct(createApiKeyForm, new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      await flushUpdates();
      await flushUpdates();
      assert.equal(serviceApiKeyCreateRequests.length, 1);
      assert.equal(serviceApiKeyCreateRequests[0].name, 'service-ci');

      const createdApiKeyId = serviceApiKeys[0]?.keyId ?? null;
      assert.ok(createdApiKeyId);
      const issuedApiKeyDialog = container.querySelector('[role="dialog"][aria-label="API 키 발급 완료"]');
      assert.ok(issuedApiKeyDialog);
      assert.match(issuedApiKeyDialog.textContent ?? '', /service-ci/);
      const issuedApiKeyConfirmButton = issuedApiKeyDialog.querySelector('button[aria-label="API 키 발급 완료 확인"]');
      assert.ok(issuedApiKeyConfirmButton);
      await dispatchInAct(issuedApiKeyConfirmButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      assert.match(dialog.textContent ?? '', /service-ci/);

      const openGuideButton = dialog.querySelector('button[aria-label="MCP 연결 가이드 열기"]');
      assert.ok(openGuideButton);
      await dispatchInAct(openGuideButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const guideDialog = container.querySelector('[role="dialog"][aria-label="MCP 연결 가이드"]');
      assert.ok(guideDialog);
      assert.match(guideDialog.textContent ?? '', /Codex/);
      const claudeTabButton = findButtonByText(guideDialog, 'Claude');
      assert.ok(claudeTabButton);
      await dispatchInAct(claudeTabButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      assert.match(guideDialog.textContent ?? '', /ASHFOX_MCP_API_KEY/);
      const guideConfirmButton = guideDialog.querySelector('button[aria-label="MCP 연결 가이드 확인"]');
      assert.ok(guideConfirmButton);
      await dispatchInAct(guideConfirmButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      assert.equal(container.querySelector('[role="dialog"][aria-label="MCP 연결 가이드"]'), null);

      const revokeApiKeyButton = dialog.querySelector('button[aria-label="service-ci API 키 폐기"]');
      assert.ok(revokeApiKeyButton);
      await dispatchInAct(revokeApiKeyButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      assert.equal(serviceApiKeyRevokeRequests.length, 1);
      assert.equal(serviceApiKeyRevokeRequests[0].keyId, createdApiKeyId);
      assert.match(dialog.textContent ?? '', /폐기됨/);

      const integrationsNavButton = findButtonByText(dialog, '시스템 설정');
      assert.ok(integrationsNavButton);
      await dispatchInAct(integrationsNavButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const smtpHostInput = dialog.querySelector('input[aria-label="SMTP host"]');
      assert.ok(smtpHostInput);
      const saveSmtpButton = dialog.querySelector('button[aria-label="SMTP 변경 저장"]');
      assert.ok(saveSmtpButton);
    } finally {
      await mounted.cleanup();
      MockEventSource.reset();
    }
  }

  {
    const authSessionPayload = createAuthSessionFixture();
    authSessionPayload.user.systemRoles = ['cs_admin'];
    const mounted = await mountHomePage({
      fetchImpl: async (requestUrl) => {
        const url = String(requestUrl);
        if (url === '/api/auth/me') {
          return toJsonResponse(authSessionPayload);
        }
        if (url === '/api/workspaces') {
          return toJsonResponse(workspacesPayload);
        }
        if (url === `/api/projects/tree?workspaceId=${DEFAULT_WORKSPACE_ID}`) {
          return toJsonResponse(projectsPayload);
        }
        if (url === '/api/service/workspaces') {
          return toJsonResponse(serviceWorkspacesPayload);
        }
        if (url === '/api/service/users') {
          return toJsonResponse({
            ok: true,
            users: [
              {
                accountId: 'admin',
                displayName: 'Administrator',
                email: 'admin@ashfox.local',
                localLoginId: 'admin',
                githubLogin: null,
                systemRoles: ['system_admin'],
                createdAt: '2026-02-21T00:00:00.000Z',
                updatedAt: '2026-02-21T00:00:00.000Z'
              }
            ],
            guards: {
              minimumSystemAdminCount: 1,
              currentSystemAdminCount: 1
            }
          });
        }
        if (url === '/api/service/config') {
          return toJsonResponse({
            ok: true,
            permissions: {
              canEdit: false
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
                updatedAt: '2026-02-21T00:00:00.000Z'
              },
              githubAuth: {
                enabled: false,
                clientId: null,
                callbackUrl: null,
                scopes: 'read:user user:email',
                hasClientSecret: false,
                updatedAt: '2026-02-21T00:00:00.000Z'
              }
            }
          });
        }
        if (url === '/api/service/api-keys') {
          return toJsonResponse({
            ok: true,
            apiKeys: []
          });
        }
        throw new Error(`unexpected url: ${url}`);
      },
      EventSourceImpl: MockEventSource
    });

    try {
      await flushUpdates();
      const { container, dom } = mounted;
      const dialog = await openServiceManagementDialog(container, dom);
      assert.match(dialog.textContent ?? '', /Administrator Workspace/);

      const usersNavButton = findButtonByText(dialog, '유저');
      assert.ok(usersNavButton);
      await dispatchInAct(usersNavButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const editAdminRolesButton = dialog.querySelector('button[aria-label="admin 시스템 역할 수정"]');
      assert.equal(editAdminRolesButton, null);

      const integrationsNavButton = findButtonByText(dialog, '시스템 설정');
      assert.ok(integrationsNavButton);
      await dispatchInAct(integrationsNavButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const saveSmtpButton = dialog.querySelector('button[aria-label="SMTP 변경 저장"]');
      const saveGithubButton = dialog.querySelector('button[aria-label="GitHub 설정 변경 저장"]');
      assert.ok(saveSmtpButton);
      assert.ok(saveGithubButton);
      assert.equal(saveSmtpButton.disabled, true);
      assert.equal(saveGithubButton.disabled, true);
    } finally {
      await mounted.cleanup();
      MockEventSource.reset();
    }
  }

  {
    const authSessionPayload = createAuthSessionFixture();
    const mounted = await mountHomePage({
      fetchImpl: async (requestUrl) => {
        const url = String(requestUrl);
        if (url === '/api/auth/me') {
          return toJsonResponse(authSessionPayload);
        }
        if (url === '/api/workspaces') {
          return toJsonResponse(workspacesPayload);
        }
        if (url === `/api/projects/tree?workspaceId=${DEFAULT_WORKSPACE_ID}`) {
          return toJsonResponse(projectsPayload);
        }
        if (url === '/api/service/workspaces') {
          return toJsonResponse(serviceWorkspacesPayload);
        }
        if (url === '/api/service/users') {
          return toJsonResponse({
            ok: true,
            users: [],
            guards: {
              minimumSystemAdminCount: 1,
              currentSystemAdminCount: 1
            },
            search: {
              q: null,
              field: 'any',
              match: 'contains',
              limit: 25,
              cursor: null,
              nextCursor: null,
              workspaceId: null,
              total: 0
            }
          });
        }
        if (url === '/api/service/config') {
          return toJsonResponse(
            {
              ok: false,
              code: 'forbidden_service_management',
              message: 'forbidden'
            },
            403
          );
        }
        if (url === '/api/service/api-keys') {
          return toJsonResponse({
            ok: true,
            apiKeys: []
          });
        }
        throw new Error(`unexpected url: ${url}`);
      },
      EventSourceImpl: MockEventSource
    });

    try {
      await flushUpdates();
      const { container, dom } = mounted;
      const dialog = await openServiceManagementDialog(container, dom);
      const dialogText = dialog.textContent ?? '';
      assert.match(dialogText, /서비스 관리 접근 권한이 없습니다\./);
      assert.equal(countOccurrences(dialogText, '서비스 관리 접근 권한이 없습니다.'), 1);
      const panelErrors = dialog.querySelectorAll('[data-ui-error-channel="panel"]');
      assert.equal(panelErrors.length, 1);
      assert.match(dialogText, /서비스 관리 정보를 다시 불러와 주세요\./);
    } finally {
      await mounted.cleanup();
      MockEventSource.reset();
    }
  }
};
