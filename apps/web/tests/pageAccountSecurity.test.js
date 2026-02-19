const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;

const { createAuthSessionFixture, createProjectTreeFixture, createProjectsFixture, createWorkspacesFixture } = require('./fixtures/projects');
const { MockEventSource, flushUpdates, mountHomePage } = require('./helpers/pageHarness');

module.exports = async () => {
  const projectsPayload = { ok: true, projects: createProjectsFixture(), tree: createProjectTreeFixture() };
  const workspacesPayload = { ok: true, workspaces: createWorkspacesFixture() };
  {
    const authSessionPayload = createAuthSessionFixture();
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
        if (url === '/api/projects/tree?workspaceId=ws_default') {
          return new Response(JSON.stringify(projectsPayload), {
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
      const sidebarMenuButton = container.querySelector('button[aria-label="사이드바 설정"]');
      assert.ok(sidebarMenuButton);
      await act(async () => {
        sidebarMenuButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      });
      await flushUpdates();

      const accountSecurityButton = Array.from(container.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('계정 보안')
      );
      assert.ok(accountSecurityButton);
      await act(async () => {
        accountSecurityButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      });
      await flushUpdates();

      const dialog = container.querySelector('[role="dialog"][aria-label="계정 보안"]');
      assert.ok(dialog);
      assert.match(container.textContent ?? '', /변경할 항목이 없습니다/);

      const saveButton = Array.from(dialog.querySelectorAll('button')).find((button) => (button.textContent ?? '').includes('저장'));
      assert.ok(saveButton);
      assert.equal(saveButton.disabled, true);
    } finally {
      await mounted.cleanup();
      MockEventSource.reset();
    }
  }

  {
    const authSessionPayload = createAuthSessionFixture();
    authSessionPayload.user.localLoginId = null;
    authSessionPayload.user.githubLogin = 'octocat';
    authSessionPayload.user.hasPassword = false;
    authSessionPayload.user.canSetPassword = true;
    const credentialRequests = [];

    const mounted = await mountHomePage({
      fetchImpl: async (requestUrl, init = {}) => {
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
        if (url === '/api/projects/tree?workspaceId=ws_default') {
          return new Response(JSON.stringify(projectsPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === '/api/auth/local-credential') {
          const body = JSON.parse(String(init.body ?? '{}'));
          credentialRequests.push(body);
          return new Response(
            JSON.stringify({
              ok: true,
              user: {
                ...authSessionPayload.user,
                localLoginId: body.loginId ?? null,
                hasPassword: true
              }
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json; charset=utf-8' }
            }
          );
        }
        throw new Error(`unexpected url: ${url}`);
      },
      EventSourceImpl: MockEventSource
    });

    try {
      await flushUpdates();
      const { container, dom } = mounted;
      const sidebarMenuButton = container.querySelector('button[aria-label="사이드바 설정"]');
      assert.ok(sidebarMenuButton);
      await act(async () => {
        sidebarMenuButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      });
      await flushUpdates();

      const accountSecurityButton = Array.from(container.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('계정 보안')
      );
      assert.ok(accountSecurityButton);
      await act(async () => {
        accountSecurityButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      });
      await flushUpdates();

      const dialog = container.querySelector('[role="dialog"][aria-label="계정 보안"]');
      assert.ok(dialog);
      const saveButton = Array.from(dialog.querySelectorAll('button')).find((button) => (button.textContent ?? '').includes('저장'));
      assert.ok(saveButton);
      assert.equal(saveButton.disabled, false);

      await act(async () => {
        saveButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      });
      await flushUpdates();

      assert.equal(credentialRequests.length, 1);
      assert.deepEqual(credentialRequests[0], { loginId: 'octocat' });
      assert.match(container.textContent ?? '', /로컬 로그인 정보가 저장되었습니다/);
    } finally {
      await mounted.cleanup();
      MockEventSource.reset();
    }
  }
};
