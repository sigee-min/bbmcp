/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const webSrcRoot = path.join(repoRoot, 'apps', 'web', 'src');
const SOURCE_EXT_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

const rel = (filePath) => path.relative(repoRoot, filePath).replace(/\\/g, '/');

const walk = (dir) => {
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      out.push(...walk(fullPath));
      continue;
    }
    if (!SOURCE_EXT_RE.test(entry.name)) {
      continue;
    }
    out.push(fullPath);
  }
  return out;
};

const RULES = [
  {
    id: 'duplicate-optional-json-parser',
    pattern: /\bparseOptionalJsonPayload\b/
  },
  {
    id: 'duplicate-response-message-parser',
    pattern: /\bparse[A-Za-z0-9_]*ResponseMessage\b/
  },
  {
    id: 'raw-request-failed-string',
    pattern: /Request failed \(/,
    allow: (filePath) => rel(filePath) === 'apps/web/src/lib/gatewayApiClient.ts'
  }
];

const scanFile = (filePath) => {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  /** @type {Array<{ruleId:string,file:string,line:number,snippet:string}>} */
  const findings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNo = index + 1;
    for (const rule of RULES) {
      if (rule.allow && rule.allow(filePath, line)) {
        continue;
      }
      if (!rule.pattern.test(line)) {
        continue;
      }
      findings.push({
        ruleId: rule.id,
        file: rel(filePath),
        line: lineNo,
        snippet: line.trim().slice(0, 220)
      });
    }
  }
  return findings;
};

const main = () => {
  const files = walk(webSrcRoot);
  const findings = files.flatMap((filePath) => scanFile(filePath));

  if (findings.length > 0) {
    console.error('ui error contract gate failed. Violations:');
    for (const finding of findings) {
      console.error(`- ${finding.ruleId}: ${finding.file}:${finding.line} :: ${finding.snippet}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('ui error contract gate ok');
};

main();
