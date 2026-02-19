const assert = require('node:assert/strict');

const { createAuthSessionFixture, createProjectsFixture, createProjectTreeFixture, createWorkspacesFixture } = require('./fixtures/projects');
const { MockEventSource, dispatchInAct, flushUpdates, mountHomePage } = require('./helpers/pageHarness');

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
        assert.equal(url, '/api/projects/tree?workspaceId=ws_default');
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
        assert.equal(url, '/api/projects/tree?workspaceId=ws_default');
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
      const text = mounted.container.textContent ?? '';
      assert.match(text, /표시할 프로젝트가 없습니다/);
      const reloadButton = Array.from(mounted.container.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('프로젝트 다시 불러오기')
      );
      assert.ok(reloadButton, 'empty state should expose reload CTA');
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
        assert.equal(url, '/api/projects/tree?workspaceId=ws_default');
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
          workspaceId: 'ws_default',
          name: 'Current Workspace',
          mode: 'rbac',
          capabilities: {
            canManageWorkspace: true,
            canManageMembers: true,
            canManageRoles: true,
            canManageFolderAcl: true
          }
        },
        {
          workspaceId: 'ws_readonly',
          name: 'Readonly Workspace',
          mode: 'rbac',
          capabilities: {
            canManageWorkspace: false,
            canManageMembers: false,
            canManageRoles: false,
            canManageFolderAcl: false
          }
        }
      ]
    };

    const workspaceSettingsPayload = {
      ok: true,
      workspace: workspacesPayload.workspaces[0],
      roles: [],
      members: [],
      folderAcl: []
    };

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
        if (url === '/api/projects/tree?workspaceId=ws_default' || url === '/api/projects/tree?workspaceId=ws_readonly') {
          return new Response(JSON.stringify(projectsPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === '/api/workspaces/ws_default/settings') {
          return new Response(JSON.stringify(workspaceSettingsPayload), {
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

      const sidebarMenuButton = container.querySelector('button[aria-label=\"사이드바 설정\"]');
      assert.ok(sidebarMenuButton);
      await dispatchInAct(sidebarMenuButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      assert.match(container.textContent ?? '', /워크스페이스 관리/);

      const openSettingsButton = Array.from(container.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('워크스페이스 관리')
      );
      assert.ok(openSettingsButton);
      await dispatchInAct(openSettingsButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const dialog = container.querySelector('[role=\"dialog\"][aria-label=\"워크스페이스 관리\"]');
      assert.ok(dialog);

      const closeDialogButton = dialog.querySelector('button[aria-label=\"닫기\"]');
      assert.ok(closeDialogButton);
      await dispatchInAct(closeDialogButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const workspaceSelectorButton = Array.from(container.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('Current Workspace')
      );
      assert.ok(workspaceSelectorButton);
      await dispatchInAct(workspaceSelectorButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const readonlyWorkspaceButton = Array.from(container.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('Readonly Workspace')
      );
      assert.ok(readonlyWorkspaceButton);
      await dispatchInAct(readonlyWorkspaceButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const currentStream = MockEventSource.instances.at(-1);
      assert.ok(currentStream);
      assert.match(currentStream.url, /workspaceId=ws_readonly/);

      await dispatchInAct(sidebarMenuButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();
      const menuText = container.textContent ?? '';
      assert.doesNotMatch(menuText, /워크스페이스 관리/);
    } finally {
      await mounted.cleanup();
      MockEventSource.reset();
    }
  }
};
