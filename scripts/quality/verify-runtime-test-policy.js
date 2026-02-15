/* eslint-disable no-console */
// Guard policy: runtime tests must resolve ts-node from repo root.
// This catches package drift that can break workspace test runners.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const rootPackagePath = path.join(repoRoot, 'package.json');
const lockfilePath = path.join(repoRoot, 'package-lock.json');
const runtimePackagePath = path.join(repoRoot, 'packages', 'runtime', 'package.json');
const runtimeRunnerPath = path.join(repoRoot, 'packages', 'runtime', 'tests', 'run.js');

const rootPackage = readJson(rootPackagePath);
const lockfile = readJson(lockfilePath);
const runtimePackage = readJson(runtimePackagePath);
const runtimeRunner = fs.readFileSync(runtimeRunnerPath, 'utf8');

/** @type {string[]} */
const violations = [];

const rootTsNodeVersion = rootPackage?.devDependencies?.['ts-node'];
if (!rootTsNodeVersion || typeof rootTsNodeVersion !== 'string') {
  violations.push('root package.json must declare devDependencies.ts-node');
}

const lockRoot = lockfile?.packages?.[''];
const lockTsNodeVersion = lockRoot?.devDependencies?.['ts-node'];
if (!lockTsNodeVersion || typeof lockTsNodeVersion !== 'string') {
  violations.push('package-lock.json root package entry must pin devDependencies.ts-node');
}

if (
  typeof rootTsNodeVersion === 'string' &&
  typeof lockTsNodeVersion === 'string' &&
  rootTsNodeVersion !== lockTsNodeVersion
) {
  violations.push(
    `ts-node version drift detected (package.json=${rootTsNodeVersion}, package-lock.json=${lockTsNodeVersion})`
  );
}

for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
  const deps = runtimePackage?.[field];
  if (deps && Object.prototype.hasOwnProperty.call(deps, 'ts-node')) {
    violations.push(`packages/runtime/package.json must not declare ts-node in ${field}`);
  }
}

if (!/require\((['"])ts-node\1\)/.test(runtimeRunner)) {
  violations.push("packages/runtime/tests/run.js must load ts-node via require('ts-node')");
}

if (violations.length > 0) {
  console.error('runtime test policy verification failed:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log(`runtime test policy ok (ts-node@${rootTsNodeVersion})`);
}
