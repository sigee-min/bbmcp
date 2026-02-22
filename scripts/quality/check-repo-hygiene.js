/* eslint-disable no-console */

const { execFileSync } = require('child_process');
const { existsSync, lstatSync, readlinkSync, readdirSync } = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

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

const loadBrandAssetsConfig = async () => {
  const configPath = path.join(repoRoot, 'scripts/assets/brand-assets.config.mjs');
  const configModule = await import(pathToFileURL(configPath).href);
  return configModule;
};

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

const collectLegacyBrandAssetViolations = (forbiddenLegacyBrandAssets) => {
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

const collectRootFaviconLayoutViolations = ({
  brandAssetConfig,
  isRootFaviconArtifact,
  getAllowedRootFaviconArtifacts
}) => {
  const imagesDir = path.join(repoRoot, brandAssetConfig.imagesRoot);
  if (!existsSync(imagesDir)) {
    return [];
  }
  const rootFaviconFiles = readdirSync(imagesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.posix.join(brandAssetConfig.imagesRoot, entry.name))
    .filter((relativePath) => isRootFaviconArtifact(relativePath));

  if (rootFaviconFiles.length === 0) {
    return [];
  }

  const violations = [];
  const outputDir = brandAssetConfig.favicon.outputDir.replace(/\\/g, '/').replace(/\/+$/, '');
  if (outputDir !== brandAssetConfig.imagesRoot) {
    for (const relativePath of rootFaviconFiles) {
      violations.push({
        rule: 'root-favicon-layout-forbidden',
        filePath: relativePath
      });
    }
    return violations;
  }

  const allowed = new Set(getAllowedRootFaviconArtifacts());
  for (const relativePath of rootFaviconFiles) {
    if (allowed.has(relativePath)) {
      continue;
    }
    violations.push({
      rule: 'root-favicon-layout-unexpected',
      filePath: relativePath
    });
  }
  return violations;
};

const collectFaviconDirectoryViolations = ({ brandAssetConfig }) => {
  const outputDir = brandAssetConfig.favicon.outputDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const absoluteDir = path.join(repoRoot, outputDir);
  if (!existsSync(absoluteDir)) {
    return [{ rule: 'favicon-directory-required', filePath: outputDir }];
  }
  return [];
};

const main = async () => {
  const {
    brandAssetConfig,
    forbiddenLegacyBrandAssets,
    getAllowedRootFaviconArtifacts,
    isRootFaviconArtifact
  } = await loadBrandAssetsConfig();
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
  violations.push(...collectLegacyBrandAssetViolations(forbiddenLegacyBrandAssets));
  violations.push(
    ...collectRootFaviconLayoutViolations({
      brandAssetConfig,
      isRootFaviconArtifact,
      getAllowedRootFaviconArtifacts
    })
  );
  violations.push(...collectFaviconDirectoryViolations({ brandAssetConfig }));
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

main().catch((error) => {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
  console.error(`ashfox repo hygiene gate failed: ${message}`);
  process.exitCode = 1;
});
