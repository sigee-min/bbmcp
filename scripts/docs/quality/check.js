/* eslint-disable no-console */
const { checkFrontmatter } = require('./check-frontmatter');
const { checkLinks } = require('./check-links');
const { checkLocalePairs } = require('./check-locale-pairs');
const { checkLinkLocale } = require('./check-link-locale');
const { checkCommandScripts } = require('./check-command-scripts');
const { checkTaskTemplate } = require('./check-task-template');
const { checkContentThresholds } = require('./check-content-thresholds');

function reportViolations(title, violations) {
  if (violations.length === 0) {
    console.log(`${title}: ok`);
    return 0;
  }

  console.error(`${title}: failed (${violations.length})`);
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  return violations.length;
}

function main() {
  const frontmatterViolations = checkFrontmatter();
  const linkViolations = checkLinks();
  const localePairViolations = checkLocalePairs();
  const linkLocaleViolations = checkLinkLocale();
  const commandViolations = checkCommandScripts();
  const taskTemplateViolations = checkTaskTemplate();
  const { violations: contentThresholdViolations, metrics: contentMetrics } = checkContentThresholds();

  let totalViolations = 0;
  totalViolations += reportViolations('docs frontmatter check', frontmatterViolations);
  totalViolations += reportViolations('docs link check', linkViolations);
  totalViolations += reportViolations('docs link locale check', linkLocaleViolations);
  totalViolations += reportViolations('docs locale pair check', localePairViolations);
  totalViolations += reportViolations('docs command validity check', commandViolations);
  totalViolations += reportViolations('docs task template check', taskTemplateViolations);
  totalViolations += reportViolations('docs content thresholds check', contentThresholdViolations);

  for (const metric of contentMetrics) {
    console.log(`docs content metric: ${metric}`);
  }

  if (totalViolations > 0) {
    throw new Error(`docs quality gate failed with ${totalViolations} violation(s)`);
  }

  console.log('docs quality gate ok');
}

main();
