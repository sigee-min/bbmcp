import assert from 'node:assert/strict';

import {
  runLocalDown,
  runLocalStart,
  type LocalRuntime,
  type CommandResult,
  type OrchestrationDeps,
  type ServiceStatus,
  type SmokeSummary
} from './support/local/orchestration';
import { registerAsync } from './helpers';

const requiredEnv = [
  'ASHFOX_PERSISTENCE_PRESET',
  'ASHFOX_PERSISTENCE_FAIL_FAST',
  'ASHFOX_STORAGE_PROVIDER',
  'ASHFOX_STORAGE_FS_ROOT',
  'ASHFOX_GATEWAY_BACKEND',
  'ASHFOX_HOST',
  'ASHFOX_PORT',
  'ASHFOX_PATH',
  'ASHFOX_GATEWAY_URL',
  'ASHFOX_WORKER_HEARTBEAT_MS'
];

const buildEnv = (overrides: Record<string, string> = {}) =>
  requiredEnv.map((key) => `${key}=${overrides[key] ?? 'value'}`).join('\n');

const okServices = (running = ['web', 'mcp-gateway', 'worker', 'redis', 'postgres']): ServiceStatus => ({
  required: ['web', 'mcp-gateway', 'worker', 'redis', 'postgres'],
  running,
  failed: ['web', 'mcp-gateway', 'worker', 'redis', 'postgres'].filter((service) => !running.includes(service))
});

const okSmoke: SmokeSummary = {
  checks: [
    { id: 'web_root', url: 'http://127.0.0.1:3000/', ok: true, status: 204 },
    { id: 'gateway_metrics', url: 'http://127.0.0.1:8790/metrics', ok: true, status: 200 }
  ],
  failed: []
};

const baseDeps = (overrides: Partial<OrchestrationDeps> = {}): OrchestrationDeps => ({
  fs: {
    exists: () => true,
    readFile: () => buildEnv()
  },
  runner: {
    run: async () => ({ exitCode: 0, stdout: '', stderr: '' })
  },
  http: {
    get: async () => ({ status: 200, body: 'ashfox_mcp_requests_total' })
  },
  probeRuntime: async (runtime: LocalRuntime) => ({ ok: runtime === 'docker' }),
  listRunningServices: async (_runtime, _composePath, _envPath, _runner, _requiredServices) => okServices(),
  smokeChecksRunner: async () => okSmoke,
  ...overrides
});

const createCommandRecorder = (results: CommandResult[] = [{ exitCode: 0, stdout: '', stderr: '' }]) => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const queue = [...results];
  return {
    calls,
    runner: {
      run: async (command: string, args: string[]) => {
        calls.push({ command, args: [...args] });
        return queue.shift() ?? { exitCode: 0, stdout: '', stderr: '' };
      }
    }
  };
};

registerAsync(
  (async () => {
    {
      const summary = await runLocalStart(
        { envPath: '/tmp/local.env', composePath: '/tmp/docker-compose.yml', runtime: 'kubernetes' },
        baseDeps()
      );
      assert.equal(summary.resultCode, 'local_runtime_unavailable');
      assert.equal(summary.requestedRuntime, 'kubernetes');
    }

    {
      const summary = await runLocalStart(
        { envPath: '/tmp/missing.env', composePath: '/tmp/docker-compose.yml' },
        baseDeps({ fs: { exists: () => false, readFile: () => '' } })
      );
      assert.equal(summary.resultCode, 'local_env_missing');
    }

    {
      const recorder = createCommandRecorder([{ exitCode: 0, stdout: '', stderr: '' }, { exitCode: 0, stdout: 'web\nmcp-gateway\nworker\nredis\npostgres\n', stderr: '' }]);
      const summary = await runLocalStart(
        { envPath: '/tmp/local.env', composePath: '/tmp/docker-compose.yml' },
        baseDeps({
          runner: recorder.runner,
          probeRuntime: async (runtime) => ({ ok: runtime === 'container' })
        })
      );
      assert.equal(summary.resultCode, 'ok');
      assert.equal(summary.runtime, 'container');
      assert.equal(summary.runtimeSource, 'auto');
      assert.deepEqual(summary.runtimesTried, ['docker', 'container']);
      assert.equal(summary.session?.runtime, 'container');
      assert.equal(summary.session?.runtimeSource, 'auto');
      assert.deepEqual(recorder.calls[0], { command: 'container-compose', args: ['-f', '/tmp/docker-compose.yml', '--env-file', '/tmp/local.env', 'up', '-d', '--build'] });
    }

    {
      const recorder = createCommandRecorder([{ exitCode: 0, stdout: '', stderr: '' }]);
      const summary = await runLocalStart(
        { envPath: '/tmp/local.env', composePath: '/tmp/docker-compose.yml', runtime: 'docker' },
        baseDeps({
          runner: recorder.runner,
          listRunningServices: async () => okServices(),
          smokeChecksRunner: async () => okSmoke
        })
      );
      assert.equal(summary.resultCode, 'ok');
      assert.deepEqual(recorder.calls[0], {
        command: 'docker',
        args: ['compose', '-f', '/tmp/docker-compose.yml', '--env-file', '/tmp/local.env', 'up', '-d', '--build']
      });
    }

    {
      const summary = await runLocalStart(
        { envPath: '/tmp/local.env', composePath: '/tmp/docker-compose.yml', runtime: 'docker' },
        baseDeps({
          probeRuntime: async () => ({ ok: false, reason: 'missing' })
        })
      );
      assert.equal(summary.resultCode, 'local_runtime_unavailable');
      assert.equal(summary.runtimeSource, 'explicit');
      assert.equal(summary.requestedRuntime, 'docker');
    }

    {
      const summary = await runLocalStart(
        { envPath: '/tmp/local.env', composePath: '/tmp/docker-compose.yml', runtime: 'docker' },
        baseDeps({ runner: { run: async () => ({ exitCode: 1, stdout: '', stderr: 'boom' }) } })
      );
      assert.equal(summary.resultCode, 'local_stack_start_failed');
    }

    {
      const summary = await runLocalStart(
        { envPath: '/tmp/local.env', composePath: '/tmp/docker-compose.yml', runtime: 'docker' },
        baseDeps({
          listRunningServices: async (_runtime, _composePath, _envPath, _runner, _requiredServices) => ({
            ...okServices(['web']),
            failed: ['mcp-gateway']
          })
        })
      );
      assert.equal(summary.resultCode, 'local_service_unhealthy');
      assert.deepEqual(summary.services?.failed, ['mcp-gateway']);
    }

    {
      const summary = await runLocalStart(
        { envPath: '/tmp/local.env', composePath: '/tmp/docker-compose.yml', runtime: 'docker' },
        baseDeps({
          smokeChecksRunner: async () => ({
            checks: [{ id: 'web_root', url: 'http://127.0.0.1:3000/', ok: false }],
            failed: ['web_root']
          })
        })
      );
      assert.equal(summary.resultCode, 'local_smoke_failed');
      assert.deepEqual(summary.smoke?.failed, ['web_root']);
    }

    {
      const recorder = createCommandRecorder([{ exitCode: 0, stdout: '', stderr: '' }, { exitCode: 0, stdout: '', stderr: '' }]);
      const summary = await runLocalDown(
        { envPath: '/tmp/local.env', composePath: '/tmp/docker-compose.yml', runtime: 'docker' },
        baseDeps({
          runner: recorder.runner,
          listRunningServices: async (_runtime, _composePath, _envPath, _runner, _requiredServices) => okServices([])
        })
      );
      assert.equal(summary.resultCode, 'ok');
      assert.deepEqual(recorder.calls[0], {
        command: 'docker',
        args: ['compose', '-f', '/tmp/docker-compose.yml', '--env-file', '/tmp/local.env', 'down']
      });
    }

    {
      const recorder = createCommandRecorder([{ exitCode: 0, stdout: '', stderr: '' }]);
      const summary = await runLocalDown(
        { envPath: '/tmp/local.env', composePath: '/tmp/docker-compose.yml', runtime: 'container' },
        baseDeps({
          runner: recorder.runner,
          probeRuntime: async (runtime) => ({ ok: runtime === 'container' }),
          listRunningServices: async () => okServices([])
        })
      );
      assert.equal(summary.resultCode, 'ok');
      assert.deepEqual(recorder.calls[0], {
        command: 'container-compose',
        args: ['-f', '/tmp/docker-compose.yml', '--env-file', '/tmp/local.env', 'down']
      });
    }

    {
      const summary = await runLocalDown(
        { envPath: '/tmp/local.env', composePath: '/tmp/docker-compose.yml', runtime: 'docker' },
        baseDeps({
          listRunningServices: async (_runtime, _composePath, _envPath, _runner, _requiredServices) =>
            okServices(['web'])
        })
      );
      assert.equal(summary.resultCode, 'local_service_unhealthy');
    }

    {
      let probeCalled = false;
      const summary = await runLocalDown(
        {
          envPath: '/tmp/local.env',
          composePath: '/tmp/docker-compose.yml',
          session: {
            runtime: 'container',
            runtimeSource: 'auto',
            runtimesTried: ['docker', 'container'],
            envPath: '/tmp/local.env',
            composePath: '/tmp/docker-compose.yml'
          }
        },
        baseDeps({
          probeRuntime: async () => {
            probeCalled = true;
            return { ok: false };
          },
          listRunningServices: async (_runtime, _composePath, _envPath, _runner, _requiredServices) => okServices([])
        })
      );
      assert.equal(summary.resultCode, 'ok');
      assert.equal(summary.runtime, 'container');
      assert.equal(probeCalled, false);
    }

    {
      const summary = await runLocalDown(
        {
          envPath: '/tmp/local.env',
          composePath: '/tmp/docker-compose.yml',
          session: {
            runtime: 'docker',
            runtimeSource: 'explicit',
            runtimesTried: ['docker'],
            envPath: '/tmp/other.env',
            composePath: '/tmp/docker-compose.yml'
          }
        },
        baseDeps()
      );
      assert.equal(summary.resultCode, 'local_runtime_unavailable');
    }
  })()
);
