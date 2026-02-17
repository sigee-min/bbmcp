/* eslint-disable no-console */
// ashfox maintainability gate: report complexity hotspots in production source paths.
// Dependency-free (Node fs/path only).

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const sourceRoots = ['apps', 'packages'];
const ignoredDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage']);
const branchPattern = /\bif\s*\(|\bswitch\s*\(|\bfor\s*\(|\bwhile\s*\(|\?[^:]+:/g;

const topN = Number.parseInt(process.env.ASHFOX_COMPLEXITY_TOP_N ?? '20', 10);
const maxLines = Number.parseInt(process.env.ASHFOX_COMPLEXITY_MAX_LINES ?? '1200', 10);
const maxBranches = Number.parseInt(process.env.ASHFOX_COMPLEXITY_MAX_BRANCHES ?? '140', 10);
const hotspotLineThreshold = Number.parseInt(process.env.ASHFOX_COMPLEXITY_HOTSPOT_LINE_THRESHOLD ?? '500', 10);
const hotspotBranchThreshold = Number.parseInt(process.env.ASHFOX_COMPLEXITY_HOTSPOT_BRANCH_THRESHOLD ?? '70', 10);
const maxLineHotspots = Number.parseInt(process.env.ASHFOX_COMPLEXITY_MAX_LINE_HOTSPOTS ?? '2', 10);
const maxBranchHotspots = Number.parseInt(process.env.ASHFOX_COMPLEXITY_MAX_BRANCH_HOTSPOTS ?? '3', 10);
const summaryFile = process.env.ASHFOX_COMPLEXITY_SUMMARY_FILE;

const toRelative = (filePath) => path.relative(repoRoot, filePath).replace(/\\/g, '/');

const isSourceFile = (filePath) => {
  const rel = toRelative(filePath);
  if (!/\.tsx?$/.test(rel)) return false;
  if (!rel.includes('/src/')) return false;
  if (rel.includes('/tests/')) return false;
  if (rel.includes('/test/')) return false;
  if (/\.test\.[cm]?tsx?$/.test(rel)) return false;
  if (/\.spec\.[cm]?tsx?$/.test(rel)) return false;
  return true;
};

const walk = (dir, out) => {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
      continue;
    }
    const full = path.join(dir, entry.name);
    if (isSourceFile(full)) out.push(full);
  }
};

const computeMetrics = (filePath) => {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).length;
  const branches = (text.match(branchPattern) ?? []).length;
  return {
    file: toRelative(filePath),
    lines,
    branches,
    density: lines > 0 ? branches / lines : 0
  };
};

const printRows = (label, rows) => {
  console.log(label);
  for (const row of rows) {
    console.log(
      `- ${row.file} :: lines=${row.lines}, branches=${row.branches}, density=${row.density.toFixed(3)}`
    );
  }
};

const main = () => {
  const files = [];
  for (const root of sourceRoots) {
    walk(path.join(repoRoot, root), files);
  }

  const rows = files.map(computeMetrics);
  const topByLines = [...rows].sort((a, b) => b.lines - a.lines).slice(0, topN);
  const topByBranches = [...rows].sort((a, b) => b.branches - a.branches).slice(0, topN);
  const lineHotspots = rows.filter((row) => row.lines >= hotspotLineThreshold);
  const branchHotspots = rows.filter((row) => row.branches >= hotspotBranchThreshold);
  const offenders = rows
    .filter((row) => row.lines > maxLines || row.branches > maxBranches)
    .sort((a, b) => b.lines - a.lines);
  const maxObservedLines = rows.reduce((max, row) => Math.max(max, row.lines), 0);
  const maxObservedBranches = rows.reduce((max, row) => Math.max(max, row.branches), 0);
  const summary = {
    files: rows.length,
    thresholds: {
      maxLines,
      maxBranches,
      hotspotLineThreshold,
      hotspotBranchThreshold
    },
    budgets: {
      maxLineHotspots,
      maxBranchHotspots
    },
    counts: {
      thresholdOffenders: offenders.length,
      lineHotspots: lineHotspots.length,
      branchHotspots: branchHotspots.length
    },
    observed: {
      maxLines: maxObservedLines,
      maxBranches: maxObservedBranches
    }
  };

  console.log(
    `ashfox complexity report (files=${rows.length}, topN=${topN}, maxLines=${maxLines}, maxBranches=${maxBranches})`
  );
  printRows('top-by-lines', topByLines);
  printRows('top-by-branches', topByBranches);
  console.log(`ashfox complexity summary: ${JSON.stringify(summary)}`);
  if (summaryFile) {
    fs.writeFileSync(path.resolve(repoRoot, summaryFile), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }

  if (offenders.length > 0) {
    console.error('ashfox complexity gate failed (threshold exceeded):');
    for (const offender of offenders) {
      console.error(
        `- ${offender.file} :: lines=${offender.lines} (limit ${maxLines}), branches=${offender.branches} (limit ${maxBranches})`
      );
    }
    process.exitCode = 1;
    return;
  }
  if (lineHotspots.length > maxLineHotspots || branchHotspots.length > maxBranchHotspots) {
    console.error('ashfox complexity gate failed (non-regression budget exceeded):');
    if (lineHotspots.length > maxLineHotspots) {
      console.error(
        `- line hotspots: ${lineHotspots.length} exceeds budget ${maxLineHotspots} (threshold=${hotspotLineThreshold})`
      );
    }
    if (branchHotspots.length > maxBranchHotspots) {
      console.error(
        `- branch hotspots: ${branchHotspots.length} exceeds budget ${maxBranchHotspots} (threshold=${hotspotBranchThreshold})`
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log('ashfox complexity gate ok');
};

main();
