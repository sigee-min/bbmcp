/* eslint-disable no-console */
// ashfox release gate: coverage regression gate.
// We intentionally use a committed baseline (config/quality/coverage-baseline.json) and fail on regressions.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const summaryPath = path.join(repoRoot, 'coverage', 'coverage-summary.json');
const baselinePath = path.join(repoRoot, 'config', 'quality', 'coverage-baseline.json');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const pickTotals = (summary) => {
  const total = summary && summary.total ? summary.total : null;
  if (!total) throw new Error('coverage: invalid summary (missing total)');
  const metrics = ['lines', 'statements', 'functions', 'branches'];
  const out = {};
  for (const key of metrics) {
    const entry = total[key];
    const pct = entry && typeof entry.pct === 'number' ? entry.pct : null;
    if (pct === null) throw new Error(`coverage: invalid summary (missing total.${key}.pct)`);
    out[key] = pct;
  }
  return out;
};

const format = (n) => `${Number(n).toFixed(2)}%`;

const FLOOR = {
  // ashfox release bar: absolute minimums (ratchet upward over time).
  // Keep these slightly below the current baseline when first introduced.
  lines: 65,
  statements: 65,
  functions: 42,
  branches: 50
};

const main = () => {
  const args = new Set(process.argv.slice(2));
  const updateBaseline = args.has('--update-baseline');

  if (!fs.existsSync(summaryPath)) {
    throw new Error('coverage: missing coverage/coverage-summary.json (run `npm run test:cov` first)');
  }

  const current = pickTotals(readJson(summaryPath));

  if (updateBaseline) {
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify({ totals: current }, null, 2) + '\n', 'utf8');
    console.log('coverage baseline updated:', path.relative(repoRoot, baselinePath));
    return;
  }

  if (!fs.existsSync(baselinePath)) {
    throw new Error(
      'coverage: missing config/quality/coverage-baseline.json (run `npm run test:cov && node scripts/quality/coverage.js --update-baseline`)'
    );
  }

  const baselineRaw = readJson(baselinePath);
  const baseline = baselineRaw && baselineRaw.totals ? baselineRaw.totals : null;
  if (!baseline) throw new Error('coverage: invalid baseline (missing totals)');

  const metrics = ['lines', 'statements', 'functions', 'branches'];
  const eps = 0.01;
  /** @type {string[]} */
  const regressions = [];
  /** @type {string[]} */
  const floorFails = [];

  for (const key of metrics) {
    const base = Number(baseline[key]);
    const cur = Number(current[key]);
    if (!Number.isFinite(base) || !Number.isFinite(cur)) {
      throw new Error(`coverage: invalid numbers for ${key}`);
    }
    if (cur + eps < base) {
      regressions.push(`${key}: ${format(cur)} < baseline ${format(base)}`);
    }

    const floor = Number(FLOOR[key]);
    if (!Number.isFinite(floor)) {
      throw new Error(`coverage: invalid floor for ${key}`);
    }
    if (cur + eps < floor) {
      floorFails.push(`${key}: ${format(cur)} < floor ${format(floor)}`);
    }
  }

  if (floorFails.length > 0) {
    console.error('ashfox coverage gate failed (below floor):');
    for (const line of floorFails) console.error(`- ${line}`);
    process.exitCode = 1;
    return;
  }

  if (regressions.length > 0) {
    console.error('ashfox coverage gate failed (regression vs baseline):');
    for (const line of regressions) console.error(`- ${line}`);
    console.error('To update baseline intentionally:');
    console.error('  npm run test:cov && node scripts/quality/coverage.js --update-baseline');
    process.exitCode = 1;
    return;
  }

  console.log(
    `ashfox coverage gate ok: lines ${format(current.lines)}, statements ${format(current.statements)}, functions ${format(
      current.functions
    )}, branches ${format(current.branches)}`
  );
};

main();

