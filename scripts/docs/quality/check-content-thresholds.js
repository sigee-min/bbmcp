/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const { listDocFiles, locales, parseFrontmatter, toPosixPath } = require('./shared');

const MIN_SUMMARY_COVERAGE = 0.7;
const disallowedPhrases = [
  'Not specified in schema.',
  '스키마에 별도 설명이 없습니다.',
  'No additional constraints declared.',
  '추가 제약이 선언되지 않았습니다.',
];

function hasFrontmatterSummary(frontmatterLines) {
  return frontmatterLines.some((line) => line.trimStart().startsWith('summary:'));
}

function checkContentThresholds() {
  const violations = [];
  const metrics = [];

  for (const locale of locales) {
    const files = listDocFiles(locale);
    let summaryCount = 0;
    let validFrontmatterCount = 0;
    let disallowedCount = 0;

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      const frontmatter = parseFrontmatter(content);
      const relativePath = toPosixPath(path.relative(process.cwd(), filePath));

      if (frontmatter && hasFrontmatterSummary(frontmatter.values)) {
        summaryCount += 1;
      }
      if (frontmatter) validFrontmatterCount += 1;

      for (const phrase of disallowedPhrases) {
        if (content.includes(phrase)) {
          disallowedCount += 1;
          violations.push(`${relativePath}: contains disallowed placeholder phrase "${phrase}"`);
        }
      }
    }

    const denominator = validFrontmatterCount || files.length || 1;
    const coverage = summaryCount / denominator;
    metrics.push(
      `${locale}: summary coverage ${(coverage * 100).toFixed(1)}% (${summaryCount}/${denominator}), placeholder hits ${disallowedCount}`
    );

    if (coverage < MIN_SUMMARY_COVERAGE) {
      violations.push(
        `${locale}: summary coverage ${(coverage * 100).toFixed(1)}% is below ${(MIN_SUMMARY_COVERAGE * 100).toFixed(0)}%`
      );
    }
  }

  return {
    violations,
    metrics,
  };
}

module.exports = {
  checkContentThresholds,
};
