/* eslint-disable no-console */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const policyPath = path.resolve(repoRoot, 'config/quality/version-marker-policy.json');

const readPolicy = () => {
  if (!fs.existsSync(policyPath)) {
    throw new Error(`version marker policy file not found: ${path.relative(repoRoot, policyPath)}`);
  }
  return JSON.parse(fs.readFileSync(policyPath, 'utf8'));
};

const listScopeFiles = (scopes) => {
  const result = spawnSync(
    'rg',
    ['--files', ...scopes, '--glob', '!**/node_modules/**', '--glob', '!**/dist/**'],
    {
      cwd: repoRoot,
      encoding: 'utf8'
    }
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || 'failed to enumerate files with rg');
  }
  return (result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

const normalizeAllowByPath = (entries) =>
  Array.isArray(entries)
    ? entries
        .filter((entry) => entry && typeof entry === 'object' && typeof entry.path === 'string')
        .map((entry) => ({
          path: String(entry.path).replace(/\\/g, '/'),
          allowAll: entry.allowAll === true,
          patterns: Array.isArray(entry.patterns) ? entry.patterns.map((pattern) => String(pattern)) : []
        }))
    : [];

const compileRegexes = (patterns) =>
  (Array.isArray(patterns) ? patterns : []).map((pattern) => {
    const source = String(pattern);
    try {
      return { source, regex: new RegExp(source, 'u') };
    } catch (error) {
      throw new Error(`invalid deny regex "${source}": ${error instanceof Error ? error.message : String(error)}`);
    }
  });

const isPathMatch = (relativePath, candidatePath) =>
  relativePath === candidatePath || relativePath.endsWith(`/${candidatePath}`);

const isAllowedLine = (relativePath, line, globalAllowPatterns, allowByPath, matchedValue) => {
  const lower = line.toLowerCase();
  if (globalAllowPatterns.some((pattern) => lower.includes(pattern))) {
    return true;
  }

  for (const rule of allowByPath) {
    if (!isPathMatch(relativePath, rule.path)) {
      continue;
    }
    if (rule.allowAll) {
      return true;
    }
    if (
      rule.patterns.some((pattern) => {
        const normalizedPattern = pattern.toLowerCase();
        return lower.includes(normalizedPattern) || matchedValue.toLowerCase().includes(normalizedPattern);
      })
    ) {
      return true;
    }
  }

  return false;
};

const run = () => {
  const policy = readPolicy();
  const scopes = Array.isArray(policy.scopes) ? policy.scopes.map((scope) => String(scope)) : [];
  if (scopes.length === 0) {
    throw new Error('version marker policy must define at least one scope');
  }

  const denyTokens = Array.isArray(policy?.deny?.tokens) ? policy.deny.tokens.map((token) => String(token)) : [];
  const denyRegexes = compileRegexes(policy?.deny?.regex);
  const globalAllowPatterns = (Array.isArray(policy.allow) ? policy.allow : [])
    .map((entry) => (entry && typeof entry === 'object' && typeof entry.pattern === 'string' ? entry.pattern : ''))
    .filter((pattern) => pattern.length > 0)
    .map((pattern) => pattern.toLowerCase());
  const allowByPath = normalizeAllowByPath(policy.allowByPath);

  const files = listScopeFiles(scopes);
  const violations = [];

  for (const relativePath of files) {
    const absolutePath = path.resolve(repoRoot, relativePath);
    let content = '';
    try {
      content = fs.readFileSync(absolutePath, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line) {
        continue;
      }

      for (const token of denyTokens) {
        if (!line.includes(token)) {
          continue;
        }
        if (isAllowedLine(relativePath, line, globalAllowPatterns, allowByPath, token)) {
          continue;
        }
        violations.push({
          file: relativePath,
          line: index + 1,
          kind: 'token',
          pattern: token,
          content: line.trim()
        });
      }

      for (const { source, regex } of denyRegexes) {
        if (!regex.test(line)) {
          continue;
        }
        if (isAllowedLine(relativePath, line, globalAllowPatterns, allowByPath, source)) {
          continue;
        }
        violations.push({
          file: relativePath,
          line: index + 1,
          kind: 'regex',
          pattern: source,
          content: line.trim()
        });
      }
    }
  }

  if (violations.length > 0) {
    console.error(`ashfox version marker gate failed: ${violations.length} violation(s)`);
    for (const violation of violations) {
      console.error(
        `- ${violation.file}:${violation.line} [${violation.kind}] ${violation.pattern} :: ${violation.content}`
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log('ashfox version marker gate ok');
};

try {
  run();
} catch (error) {
  console.error(`ashfox version marker gate failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
