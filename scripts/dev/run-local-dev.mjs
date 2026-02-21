#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..', '..');
const defaultSqlitePath = path.join(rootDir, '.ashfox', 'local', 'ashfox.sqlite');

const resolvedSqlitePath = process.env.ASHFOX_DB_SQLITE_PATH || defaultSqlitePath;
const resolvedStorageSqlitePath = process.env.ASHFOX_STORAGE_DB_SQLITE_PATH || resolvedSqlitePath;
const gatewayPort = process.env.ASHFOX_PORT || '8787';
const gatewayApiBaseUrl = process.env.VITE_ASHFOX_GATEWAY_API_BASE_URL || '/api';

mkdirSync(path.dirname(resolvedSqlitePath), { recursive: true });
mkdirSync(path.dirname(resolvedStorageSqlitePath), { recursive: true });

const env = {
  ...process.env,
  ASHFOX_PERSISTENCE_PRESET: process.env.ASHFOX_PERSISTENCE_PRESET || 'local',
  ASHFOX_DB_SQLITE_PATH: resolvedSqlitePath,
  ASHFOX_STORAGE_DB_SQLITE_PATH: resolvedStorageSqlitePath,
  ASHFOX_NATIVE_PIPELINE_BACKEND: process.env.ASHFOX_NATIVE_PIPELINE_BACKEND || 'persistence',
  ASHFOX_GATEWAY_PROXY_TARGET: process.env.ASHFOX_GATEWAY_PROXY_TARGET || `http://127.0.0.1:${gatewayPort}`,
  VITE_ASHFOX_GATEWAY_API_BASE_URL: gatewayApiBaseUrl
};

const processes = {
  gateway: {
    cmd: 'npm',
    args: ['run', 'dev:gateway']
  },
  worker: {
    cmd: 'npm',
    args: ['run', 'dev:worker']
  },
  web: {
    cmd: 'npm',
    args: ['--workspace', '@ashfox/web', 'run', 'dev']
  }
};

const sleep = async (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const healthUrl = new URL('/api/health', env.ASHFOX_GATEWAY_PROXY_TARGET).toString();
const gatewayReadyTimeoutMs = Number.parseInt(env.ASHFOX_DEV_GATEWAY_READY_TIMEOUT_MS || '20000', 10);
const gatewayReadyPollMs = Number.parseInt(env.ASHFOX_DEV_GATEWAY_READY_POLL_MS || '300', 10);

console.log(`[dev] sqlite path: ${resolvedSqlitePath}`);
console.log(`[dev] web gateway api base: ${gatewayApiBaseUrl}`);
console.log('[dev] starting: gateway -> (wait health) -> worker, web');

let shuttingDown = false;
let requestedStop = false;
let firstNonZeroExitCode = 0;
const children = new Map();

const maybeExit = () => {
  if (children.size === 0) {
    process.exit(requestedStop ? 0 : firstNonZeroExitCode);
  }
};

const stopAll = (signal = 'SIGTERM') => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.values()) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
  setTimeout(() => {
    for (const child of children.values()) {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }
    maybeExit();
  }, 3000).unref();
  maybeExit();
};

const registerChild = (name, child) => {
  children.set(name, child);
  child.on('exit', (code, signal) => {
    children.delete(name);
    if (!requestedStop && !shuttingDown) {
      if (code !== 0) {
        firstNonZeroExitCode = code ?? 1;
        console.error(`[dev] ${name} exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
      }
      stopAll('SIGTERM');
    }

    if (code && code !== 0 && firstNonZeroExitCode === 0) {
      firstNonZeroExitCode = code;
    }

    maybeExit();
  });
};

const spawnManaged = (name) => {
  const processDef = processes[name];
  const child = spawn(processDef.cmd, processDef.args, {
    cwd: rootDir,
    env,
    stdio: 'inherit'
  });
  registerChild(name, child);
  return child;
};

const waitForGatewayReady = async (gatewayChild) => {
  const timeoutMs = Number.isFinite(gatewayReadyTimeoutMs) && gatewayReadyTimeoutMs > 0 ? gatewayReadyTimeoutMs : 20000;
  const pollMs = Number.isFinite(gatewayReadyPollMs) && gatewayReadyPollMs > 0 ? gatewayReadyPollMs : 300;
  const startedAt = Date.now();
  console.log(`[dev] waiting for gateway health: ${healthUrl}`);

  while (Date.now() - startedAt < timeoutMs) {
    if (gatewayChild.exitCode !== null) {
      return false;
    }
    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        cache: 'no-store'
      });
      if (response.ok) {
        console.log('[dev] gateway health check passed');
        return true;
      }
    } catch {
      // keep polling until timeout
    }
    await sleep(pollMs);
  }
  return false;
};

process.on('SIGINT', () => {
  requestedStop = true;
  stopAll('SIGINT');
});

process.on('SIGTERM', () => {
  requestedStop = true;
  stopAll('SIGTERM');
});

const bootstrap = async () => {
  const gatewayChild = spawnManaged('gateway');
  const gatewayReady = await waitForGatewayReady(gatewayChild);
  if (!gatewayReady) {
    if (firstNonZeroExitCode === 0) {
      firstNonZeroExitCode = 1;
    }
    console.error(`[dev] gateway did not become healthy within timeout (${healthUrl})`);
    stopAll('SIGTERM');
    return;
  }
  spawnManaged('worker');
  spawnManaged('web');
};

void bootstrap().catch((error) => {
  if (firstNonZeroExitCode === 0) {
    firstNonZeroExitCode = 1;
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[dev] bootstrap failed: ${message}`);
  stopAll('SIGTERM');
});
