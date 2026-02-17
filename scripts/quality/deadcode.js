/* eslint-disable no-console */
// ashfox release gate: dead export check with a small intentional allowlist.
// We skip public barrels that are meant for external consumers.

const { spawnSync } = require('child_process');

const npmExecPath = process.env.npm_execpath;
const cmd = npmExecPath ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const args = npmExecPath
  ? [npmExecPath, 'exec', '--', 'ts-prune', '-p', 'tsconfig.json']
  : ['exec', '--', 'ts-prune', '-p', 'tsconfig.json'];

const run = spawnSync(cmd, args, { encoding: 'utf8' });

if (run.status !== 0) {
  console.error('deadcode gate failed to run ts-prune');
  if (run.stderr) process.stderr.write(run.stderr);
  process.exitCode = run.status ?? 1;
  return;
}

const output = run.stdout || '';
const ignoredDeadcodePaths = [
  '/packages/runtime/src/conformance/',
  '/packages/runtime/src/types.ts:',
  '/packages/runtime/src/types/',
  '/packages/contracts/src/types/'
];
const lines = output
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((line) => !line.includes('(used in module)'))
  .filter((line) => {
    const normalized = `/${line.replace(/\\/g, '/').replace(/^\//, '')}`;
    return !ignoredDeadcodePaths.some((path) => normalized.includes(path));
  });

if (lines.length > 0) {
  console.error('ashfox deadcode gate failed (unused exports):');
  for (const line of lines) {
    console.error(`- ${line}`);
  }
  process.exitCode = 1;
  return;
}

console.log('ashfox deadcode gate ok');
