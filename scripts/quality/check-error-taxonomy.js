/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const SOURCE_EXT_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

const parseMode = () => {
  const raw = process.argv.slice(2).find((arg) => arg.startsWith('--mode='));
  const mode = raw ? raw.split('=')[1] : 'strict';
  if (mode !== 'strict' && mode !== 'report') {
    throw new Error(`Unsupported mode: ${mode}. Use --mode=strict or --mode=report.`);
  }
  return mode;
};

const readTrackedFiles = () => {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot });
  return out
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
};

const isSourceFile = (relPath) => {
  if (!relPath.includes('/src/')) return false;
  if (!SOURCE_EXT_RE.test(relPath)) return false;
  if (relPath.includes('/dist/') || relPath.includes('/node_modules/')) return false;
  return true;
};

const layerOf = (relPath) => {
  if (relPath.includes('/adapters/')) return 'adapter';
  if (relPath.includes('/usecases/')) return 'usecase';
  if (relPath.includes('/plugin/')) return 'plugin';
  if (relPath.includes('/shared/tooling/')) return 'shared_tooling';
  if (relPath.startsWith('packages/contracts/src/')) return 'contract';
  return 'other';
};

const isAllowedBoundary = (_relPath) => false;

const collectFindings = () => {
  const tracked = readTrackedFiles().filter(isSourceFile);
  const findings = [];

  for (const relPath of tracked) {
    const absPath = path.join(repoRoot, relPath);
    if (!fs.existsSync(absPath)) {
      continue;
    }
    const text = fs.readFileSync(absPath, 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const matches = line.match(/\bnot_implemented\b/g);
      if (!matches || matches.length === 0) continue;
      findings.push({
        file: relPath,
        line: i + 1,
        count: matches.length,
        layer: layerOf(relPath),
        allowed: isAllowedBoundary(relPath),
        snippet: line.trim().slice(0, 220)
      });
    }
  }

  return findings;
};

const formatLayerSummary = (findings) => {
  const byLayer = new Map();
  for (const finding of findings) {
    byLayer.set(finding.layer, (byLayer.get(finding.layer) ?? 0) + finding.count);
  }
  return [...byLayer.entries()].sort((a, b) => b[1] - a[1]);
};

const formatFileSummary = (findings) => {
  const byFile = new Map();
  for (const finding of findings) {
    byFile.set(finding.file, (byFile.get(finding.file) ?? 0) + finding.count);
  }
  return [...byFile.entries()].sort((a, b) => b[1] - a[1]);
};

const main = () => {
  let mode;
  try {
    mode = parseMode();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const findings = collectFindings();
  const totalOccurrences = findings.reduce((sum, finding) => sum + finding.count, 0);
  const filesWithOccurrences = new Set(findings.map((finding) => finding.file)).size;
  const disallowed = findings.filter((finding) => !finding.allowed);

  console.log('ashfox error taxonomy report');
  console.log(`- mode: ${mode}`);
  console.log(`- total_occurrences: ${totalOccurrences}`);
  console.log(`- files_with_occurrences: ${filesWithOccurrences}`);
  console.log(`- disallowed_occurrences: ${disallowed.reduce((sum, finding) => sum + finding.count, 0)}`);

  const layerSummary = formatLayerSummary(findings);
  if (layerSummary.length > 0) {
    console.log('- by_layer:');
    for (const [layer, count] of layerSummary) {
      console.log(`  - ${layer}: ${count}`);
    }
  }

  const topFiles = formatFileSummary(findings).slice(0, 20);
  if (topFiles.length > 0) {
    console.log('- top_files:');
    for (const [file, count] of topFiles) {
      const boundary = isAllowedBoundary(file) ? 'allowed' : 'disallowed';
      console.log(`  - ${boundary}: ${file} (${count})`);
    }
  }

  if (mode === 'report') return;

  if (disallowed.length > 0) {
    console.error('ashfox error taxonomy gate failed. Disallowed not_implemented usage:');
    for (const finding of disallowed) {
      console.error(`- ${finding.file}:${finding.line} :: ${finding.snippet}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('ashfox error taxonomy gate ok');
};

main();
