/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const matrixPath = path.join(repoRoot, 'docs', 'qa', 'mcp-worker-web-pipeline-completeness-matrix.md');

const REQUIRED_MATRIX_TOKENS = [
  'add_bone',
  'add_cube',
  'create_animation_clip',
  'set_frame_pose',
  'paint_faces',
  'preflight_texture',
  'read_texture',
  'POST /folders',
  'PATCH /folders/:folderId',
  'DELETE /projects/:projectId'
];

const STEPS = [
  'ASHFOX_TEST_FILTER=toolRegistry npm --workspace @ashfox/runtime run test',
  'npm --workspace @ashfox/worker run test',
  'ASHFOX_TEST_FILTER=nativePipelineStore npm --workspace @ashfox/gateway run test',
  'ASHFOX_TEST_FILTER=engineBackendNativeE2E npm --workspace @ashfox/gateway run test',
  'npm --workspace @ashfox/web run test'
];

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const validateMatrix = () => {
  if (!fs.existsSync(matrixPath)) {
    fail(`pipeline completeness matrix missing: ${path.relative(repoRoot, matrixPath)}`);
    return false;
  }
  const text = fs.readFileSync(matrixPath, 'utf8');
  const missing = REQUIRED_MATRIX_TOKENS.filter((token) => !text.includes(token));
  if (missing.length > 0) {
    fail(`pipeline completeness matrix missing required token(s): ${missing.join(', ')}`);
    return false;
  }
  console.log(`pipeline completeness matrix ok: ${path.relative(repoRoot, matrixPath)}`);
  return true;
};

const runStep = (command) => {
  console.log(`\n[pipeline-completeness] running: ${command}`);
  const result = spawnSync(command, {
    cwd: repoRoot,
    shell: true,
    encoding: 'utf8',
    env: process.env
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    fail(`[pipeline-completeness] failed: ${command}`);
    return false;
  }
  return true;
};

const main = () => {
  if (!validateMatrix()) {
    return;
  }
  for (const step of STEPS) {
    if (!runStep(step)) {
      return;
    }
  }
  console.log('\npipeline completeness gate ok');
};

main();
