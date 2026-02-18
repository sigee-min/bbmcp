#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..', '..');
const defaultSqlitePath = path.join(rootDir, '.ashfox', 'local', 'shared-dev.sqlite');

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

const processes = [
  {
    name: 'gateway',
    cmd: 'npm',
    args: ['run', 'dev:gateway']
  },
  {
    name: 'worker',
    cmd: 'npm',
    args: ['run', 'dev:worker']
  },
  {
    name: 'web',
    cmd: 'npm',
    args: ['--workspace', '@ashfox/web', 'run', 'dev']
  }
];

console.log(`[dev] shared sqlite path: ${resolvedSqlitePath}`);
console.log(`[dev] web gateway api base: ${gatewayApiBaseUrl}`);
console.log('[dev] starting: gateway, worker, web');

let shuttingDown = false;
let requestedStop = false;
let firstNonZeroExitCode = 0;

const children = processes.map((processDef) =>
  spawn(processDef.cmd, processDef.args, {
    cwd: rootDir,
    env,
    stdio: 'inherit'
  })
);

const stopAll = (signal = 'SIGTERM') => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }
  }, 3000).unref();
};

process.on('SIGINT', () => {
  requestedStop = true;
  stopAll('SIGINT');
});

process.on('SIGTERM', () => {
  requestedStop = true;
  stopAll('SIGTERM');
});

let remaining = children.length;
for (const [index, child] of children.entries()) {
  const name = processes[index].name;
  child.on('exit', (code, signal) => {
    remaining -= 1;
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

    if (remaining === 0) {
      process.exit(requestedStop ? 0 : firstNonZeroExitCode);
    }
  });
}
