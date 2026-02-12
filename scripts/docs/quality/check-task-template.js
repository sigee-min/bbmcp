/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const { listDocFiles, locales, toPosixPath } = require('./shared');

const headingRules = {
  en: [
    '## Purpose',
    '## Prerequisites',
    '## Quick Start',
    '## Detailed Steps',
    '## Failure and Recovery',
    '## Related Docs',
  ],
  ko: [
    '## 목적',
    '## 사전 준비',
    '## 빠른 시작',
    '## 상세 단계',
    '## 실패와 복구',
    '## 관련 문서',
  ],
};

function isTaskLeaf(filePath) {
  const normalized = toPosixPath(filePath);
  return normalized.includes('/tasks/') && !normalized.endsWith('/index.mdx') && !normalized.endsWith('/index.md');
}

function hasOrderedListAfterHeading(content, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionPattern = new RegExp(`${escaped}\\n([\\s\\S]*?)(?:\\n## |$)`, 'm');
  const match = content.match(sectionPattern);
  if (!match) return false;
  return /^\d+\.\s+/m.test(match[1]);
}

function checkTaskTemplate() {
  const violations = [];

  for (const locale of locales) {
    const rules = headingRules[locale];
    const files = listDocFiles(locale).filter((filePath) => isTaskLeaf(filePath));

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = toPosixPath(path.relative(process.cwd(), filePath));

      for (const requiredHeading of rules) {
        if (!content.includes(requiredHeading)) {
          violations.push(`${relativePath}: missing required heading "${requiredHeading}"`);
        }
      }

      const quickStartHeading = locale === 'ko' ? '## 빠른 시작' : '## Quick Start';
      const detailHeading = locale === 'ko' ? '## 상세 단계' : '## Detailed Steps';

      if (content.includes(quickStartHeading) && !hasOrderedListAfterHeading(content, quickStartHeading)) {
        violations.push(`${relativePath}: quick-start section must contain an ordered list`);
      }

      if (content.includes(detailHeading) && !hasOrderedListAfterHeading(content, detailHeading)) {
        violations.push(`${relativePath}: detailed-steps section must contain an ordered list`);
      }
    }
  }

  return violations;
}

module.exports = {
  checkTaskTemplate,
};
