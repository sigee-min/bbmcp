#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const imagesRoot = path.join(repoRoot, 'images');

const sourceAssets = {
  faviconSource: path.join(imagesRoot, 'logo_fullbackground.png')
};

const faviconSpecs = [
  { size: 16, target: 'images/favicon-16x16.png' },
  { size: 24, target: 'images/favicon-24x24.png' },
  { size: 32, target: 'images/favicon-32x32.png' },
  { size: 48, target: 'images/favicon-48x48.png' },
  { size: 64, target: 'images/favicon-64x64.png' },
  { size: 96, target: 'images/favicon-96x96.png' },
  { size: 128, target: 'images/favicon-128x128.png' },
  { size: 180, target: 'images/favicon-180x180.png' },
  { size: 192, target: 'images/favicon-192x192.png' },
  { size: 512, target: 'images/favicon-512x512.png' }
];

const artifactSpecs = [
  ...faviconSpecs.map(({ size, target }) => ({
    type: 'png',
    source: sourceAssets.faviconSource,
    size,
    target
  })),
  { type: 'ico', source: sourceAssets.faviconSource, size: 256, target: 'images/favicon.ico' }
];

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

const generateArtifacts = (outputRoot) => {
  const tempWorkDir = mkdtempSync(path.join(os.tmpdir(), 'ashfox-brand-sync-'));
  try {
    for (const spec of artifactSpecs) {
      const targetPath = path.join(outputRoot, spec.target);
      if (spec.type === 'png') {
        resizePng(spec.source, spec.size, targetPath);
        continue;
      }
      if (spec.type === 'ico') {
        const tempPng = path.join(tempWorkDir, `${path.basename(spec.target)}.png`);
        resizePng(spec.source, spec.size, tempPng);
        writeIcoFromPng(tempPng, targetPath);
        continue;
      }
      throw new Error(`Unsupported artifact type: ${spec.type}`);
    }
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

    for (const spec of artifactSpecs) {
      const expected = path.join(tempRoot, spec.target);
      const actual = path.join(repoRoot, spec.target);
      if (!existsSync(actual)) {
        mismatches.push(`missing target: ${spec.target}`);
        continue;
      }
      const expectedHash = sha256(expected);
      const actualHash = sha256(actual);
      if (expectedHash !== actualHash) {
        mismatches.push(`outdated target: ${spec.target}`);
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

    console.log(`brand assets check ok (${artifactSpecs.length} files)`);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

const runSync = () => {
  generateArtifacts(repoRoot);
  console.log(`brand assets synced (${artifactSpecs.length} files)`);
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
