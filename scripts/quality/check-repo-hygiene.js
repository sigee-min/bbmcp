/* eslint-disable no-console */

const { execFileSync } = require('child_process');
const { existsSync, lstatSync, readlinkSync } = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

const readTrackedFiles = () => {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot });
  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
};

const forbiddenMatchers = [
  {
    id: '.sisyphus-tracked',
    test: (filePath) => filePath === '.sisyphus' || filePath.startsWith('.sisyphus/')
  },
  {
    id: '.sys-prefix-tracked',
    test: (filePath) => filePath === '.sys' || filePath.startsWith('.sys')
  }
];

const requiredPublicSymlinks = [
  ['apps/web/public', '../../images'],
  ['apps/docs/public', '../../images']
];

const forbiddenLegacyBrandAssets = [
  'images/logo-32.png',
  'images/logo-180.png',
  'images/logo-192.png',
  'images/logo-256.png',
  'images/logo-512.png',
  'images/apple-touch-icon.png',
  'images/android-chrome-192x192.png',
  'images/android-chrome-512x512.png',
  'images/assets/images/ashfox.png'
];

const collectPublicSymlinkViolations = () => {
  const violations = [];

  for (const [relativePath, expectedTarget] of requiredPublicSymlinks) {
    const absolutePath = path.join(repoRoot, relativePath);
    if (!existsSync(absolutePath)) {
      violations.push({ rule: 'public-link-missing', filePath: relativePath });
      continue;
    }
    const stat = lstatSync(absolutePath);
    if (!stat.isSymbolicLink()) {
      violations.push({ rule: 'public-link-required', filePath: relativePath });
      continue;
    }
    const actualTarget = readlinkSync(absolutePath);
    if (actualTarget !== expectedTarget) {
      violations.push({
        rule: 'public-link-target-mismatch',
        filePath: `${relativePath} -> ${actualTarget} (expected: ${expectedTarget})`
      });
    }
  }

  return violations;
};

const collectBrandSyncViolations = () => {
  try {
    execFileSync('node', ['scripts/assets/sync-brand-assets.mjs', '--check'], {
      cwd: repoRoot,
      stdio: 'pipe'
    });
    return [];
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr ?? '').trim() : '';
    const stdout = error && typeof error === 'object' && 'stdout' in error ? String(error.stdout ?? '').trim() : '';
    const detail = stderr || stdout || 'brand asset check failed';
    return [{ rule: 'brand-asset-check-failed', filePath: detail }];
  }
};

const collectLegacyBrandAssetViolations = () => {
  const violations = [];
  for (const relativePath of forbiddenLegacyBrandAssets) {
    const absolutePath = path.join(repoRoot, relativePath);
    if (existsSync(absolutePath)) {
      violations.push({
        rule: 'legacy-brand-asset-forbidden',
        filePath: relativePath
      });
    }
  }
  return violations;
};

const main = () => {
  const tracked = readTrackedFiles();
  const violations = [];

  for (const filePath of tracked) {
    for (const matcher of forbiddenMatchers) {
      if (!matcher.test(filePath)) continue;
      violations.push({ filePath, rule: matcher.id });
      break;
    }
  }

  violations.push(...collectPublicSymlinkViolations());
  violations.push(...collectLegacyBrandAssetViolations());
  violations.push(...collectBrandSyncViolations());

  if (violations.length > 0) {
    console.error('ashfox repo hygiene gate failed. Hygiene violations:');
    for (const violation of violations) {
      console.error(`- ${violation.rule}: ${violation.filePath}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('ashfox repo hygiene gate ok');
};

main();
