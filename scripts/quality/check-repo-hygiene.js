/* eslint-disable no-console */

const { execFileSync } = require('child_process');
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

  if (violations.length > 0) {
    console.error('ashfox repo hygiene gate failed. Forbidden tracked paths:');
    for (const violation of violations) {
      console.error(`- ${violation.rule}: ${violation.filePath}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('ashfox repo hygiene gate ok');
};

main();
