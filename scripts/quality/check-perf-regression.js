/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const baselineFile = process.env.ASHFOX_PERF_BASELINE_FILE ?? 'config/quality/perf-baseline.json';
const baselinePath = path.resolve(repoRoot, baselineFile);

if (!fs.existsSync(baselinePath)) {
  console.error(`ashfox perf regression gate failed: baseline file not found (${path.relative(repoRoot, baselinePath)})`);
  process.exitCode = 1;
} else {
  const command = [
    'scripts/perf/persistence-benchmark.js',
    '--assert-baseline',
    path.relative(repoRoot, baselinePath)
  ];
  const result = spawnSync('node', command, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env
  });
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exitCode = result.status;
  } else if (result.error) {
    console.error(`ashfox perf regression gate failed: ${result.error.message}`);
    process.exitCode = 1;
  } else {
    console.log('ashfox perf regression gate ok');
  }
}
