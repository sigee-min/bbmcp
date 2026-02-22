#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_COLOR_TRANSFORM_FORMULA, transformPngFile } from './brandColorTransform.mjs';
import { brandAssetConfig, buildFaviconArtifactSpecs } from './brand-assets.config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const sourceAssets = {
  logo: path.join(repoRoot, brandAssetConfig.sourceAssets.logo),
  logoFullBackground: path.join(repoRoot, brandAssetConfig.sourceAssets.logoFullBackground)
};

const logoThemeSpecs = [
  {
    source: sourceAssets.logo,
    target: brandAssetConfig.logoThemeTargets.logo.light,
    formula: null,
    transformOptions: {}
  },
  {
    source: sourceAssets.logo,
    target: brandAssetConfig.logoThemeTargets.logo.dark,
    formula: brandAssetConfig.colorTransform?.formula ?? DEFAULT_COLOR_TRANSFORM_FORMULA,
    transformOptions: brandAssetConfig.colorTransform?.darkVariantOptions ?? {}
  },
  {
    source: sourceAssets.logoFullBackground,
    target: brandAssetConfig.logoThemeTargets.logoFullBackground.light,
    formula: null,
    transformOptions: {}
  },
  {
    source: sourceAssets.logoFullBackground,
    target: brandAssetConfig.logoThemeTargets.logoFullBackground.dark,
    formula: brandAssetConfig.colorTransform?.formula ?? DEFAULT_COLOR_TRANSFORM_FORMULA,
    transformOptions: brandAssetConfig.colorTransform?.darkVariantOptions ?? {}
  }
];

const faviconSpecs = buildFaviconArtifactSpecs({ includeThemeVariants: true, includeBaseSet: true });
const generatedTargets = [...logoThemeSpecs.map((spec) => spec.target), ...faviconSpecs.map((spec) => spec.target)];

const checkMode = process.argv.includes('--check');

const runSips = (args) => {
  const command = spawnSync('sips', args, { encoding: 'utf8' });
  if (command.status !== 0) {
    const message = command.stderr?.trim() || command.stdout?.trim() || 'unknown error';
    throw new Error(`sips ${args.join(' ')} failed: ${message}`);
  }
};

const ensureSips = () => {
  const command = spawnSync('sips', ['--help'], { encoding: 'utf8' });
  if (command.status !== 0) {
    throw new Error('sips command is required for brand asset sync.');
  }
};

const ensureParent = (filePath) => {
  mkdirSync(path.dirname(filePath), { recursive: true });
};

const resizePng = (sourcePath, size, outputPath) => {
  ensureParent(outputPath);
  runSips(['-s', 'format', 'png', '-z', String(size), String(size), sourcePath, '--out', outputPath]);
};

const writeIcoFromPng = (pngPath, icoPath) => {
  const png = readFileSync(pngPath);
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = 0;
  header[7] = 0;
  header[8] = 0;
  header[9] = 0;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  ensureParent(icoPath);
  writeFileSync(icoPath, Buffer.concat([header, png]));
};

const sha256 = (filePath) => createHash('sha256').update(readFileSync(filePath)).digest('hex');

const removeRootFaviconArtifacts = (outputRoot) => {
  const imagesRoot = path.join(outputRoot, brandAssetConfig.imagesRoot);
  const faviconOutputDir = brandAssetConfig.favicon.outputDir.replace(/\\/g, '/').replace(/\/+$/, '');
  if (faviconOutputDir === brandAssetConfig.imagesRoot || !existsSync(imagesRoot)) {
    return 0;
  }

  let removed = 0;
  for (const entry of readdirSync(imagesRoot, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    if (!/^favicon(?:-[^/]+)?\.(?:png|ico)$/.test(entry.name)) {
      continue;
    }
    rmSync(path.join(imagesRoot, entry.name), { force: true });
    removed += 1;
  }
  return removed;
};

const resolveThemedLogoSourcePath = (outputRoot, theme) => {
  const resolvedTheme = theme ?? brandAssetConfig.favicon.defaultThemeVariant;
  const target = brandAssetConfig.logoThemeTargets.logoFullBackground[resolvedTheme];
  if (!target) {
    throw new Error(`Unsupported favicon theme variant: ${resolvedTheme}`);
  }
  return path.join(outputRoot, target);
};

const generateThemeLogos = (outputRoot) => {
  for (const spec of logoThemeSpecs) {
    const targetPath = path.join(outputRoot, spec.target);
    ensureParent(targetPath);
    if (spec.formula === null) {
      copyFileSync(spec.source, targetPath);
      continue;
    }
    transformPngFile({
      inputPath: spec.source,
      outputPath: targetPath,
      formula: spec.formula,
      ...spec.transformOptions
    });
  }
};

const generateFavicons = (outputRoot, tempWorkDir) => {
  for (const spec of faviconSpecs) {
    const sourcePath = resolveThemedLogoSourcePath(outputRoot, spec.theme);
    const targetPath = path.join(outputRoot, spec.target);
    if (spec.type === 'png') {
      resizePng(sourcePath, spec.size, targetPath);
      continue;
    }
    if (spec.type === 'ico') {
      const tempPng = path.join(tempWorkDir, `${path.basename(spec.target)}.png`);
      resizePng(sourcePath, spec.size, tempPng);
      writeIcoFromPng(tempPng, targetPath);
      continue;
    }
    throw new Error(`Unsupported artifact type: ${spec.type}`);
  }
};

const generateArtifacts = (outputRoot) => {
  const tempWorkDir = mkdtempSync(path.join(os.tmpdir(), 'ashfox-brand-sync-'));
  try {
    generateThemeLogos(outputRoot);
    generateFavicons(outputRoot, tempWorkDir);
  } finally {
    rmSync(tempWorkDir, { recursive: true, force: true });
  }
};

const verifySourceAssets = () => {
  for (const [name, assetPath] of Object.entries(sourceAssets)) {
    if (!existsSync(assetPath)) {
      throw new Error(`Missing source asset: ${name} (${assetPath})`);
    }
  }
};

const runCheck = () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'ashfox-brand-check-'));
  try {
    generateArtifacts(tempRoot);
    const mismatches = [];

    for (const target of generatedTargets) {
      const expected = path.join(tempRoot, target);
      const actual = path.join(repoRoot, target);
      if (!existsSync(actual)) {
        mismatches.push(`missing target: ${target}`);
        continue;
      }
      const expectedHash = sha256(expected);
      const actualHash = sha256(actual);
      if (expectedHash !== actualHash) {
        mismatches.push(`outdated target: ${target}`);
      }
    }

    if (mismatches.length > 0) {
      console.error('brand asset check failed:');
      for (const mismatch of mismatches) {
        console.error(`- ${mismatch}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log(`brand assets check ok (${generatedTargets.length} files)`);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

const runSync = () => {
  const removedRootArtifacts = removeRootFaviconArtifacts(repoRoot);
  generateArtifacts(repoRoot);
  console.log(`brand assets synced (${generatedTargets.length} files, removed root artifacts: ${removedRootArtifacts})`);
};

const main = () => {
  verifySourceAssets();
  ensureSips();
  if (checkMode) {
    runCheck();
    return;
  }
  runSync();
};

main();
