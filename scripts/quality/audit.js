/* eslint-disable no-console */
// ashfox release gate: dependency vulnerability gate.
// We keep this separate from static checks so teams can run/triage it independently.

const { spawnSync } = require('child_process');

const npmExecPath = process.env.npm_execpath;

// Prefer invoking npm via the current npm runner to avoid platform-specific shims.
// When running under `npm run`, npm provides `npm_execpath`.
const cmd = npmExecPath ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const args = npmExecPath
  ? [npmExecPath, 'audit', '--omit=dev', '--audit-level=high']
  : ['audit', '--omit=dev', '--audit-level=high'];

const result = spawnSync(cmd, args, { stdio: 'inherit' });

if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
} else {
  console.log('ashfox audit gate ok');
}

