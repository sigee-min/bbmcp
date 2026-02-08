/* eslint-disable no-console */
// ashfox release gate: lightweight static checks.
// Intentionally dependency-free: Node fs + regex scanning.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

const readText = (filePath) => fs.readFileSync(filePath, 'utf8');

const walk = (dir, predicate) => {
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...walk(full, predicate));
      continue;
    }
    if (predicate(full)) out.push(full);
  }
  return out;
};

const rel = (filePath) => path.relative(repoRoot, filePath).replace(/\\/g, '/');

const scanFile = (filePath, rules) => {
  const text = readText(filePath);
  const lines = text.split(/\r?\n/);
  /** @type {Array<{file:string,line:number,rule:string,snippet:string}>} */
  const findings = [];

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const line = lines[i];
    for (const rule of rules) {
      if (rule.appliesTo && !rule.appliesTo(filePath)) continue;
      if (rule.allow && rule.allow(filePath, line)) continue;
      if (rule.pattern.test(line)) {
        findings.push({
          file: rel(filePath),
          line: lineNo,
          rule: rule.id,
          snippet: line.trim().slice(0, 200)
        });
      }
    }
  }
  return findings;
};

const assertVersionConsistency = () => {
  const pkgPath = path.join(repoRoot, 'package.json');
  const cfgPath = path.join(repoRoot, 'packages', 'runtime', 'src', 'config.ts');
  const pkg = JSON.parse(readText(pkgPath));
  const configText = readText(cfgPath);
  const match = configText.match(/export const PLUGIN_VERSION = '([^']+)'/);
  const pluginVersion = match ? match[1] : null;
  if (!pluginVersion) {
    throw new Error('quality: cannot read PLUGIN_VERSION from packages/runtime/src/config.ts');
  }
  if (pkg.version !== pluginVersion) {
    throw new Error(
      `quality: version mismatch: package.json(${pkg.version}) != packages/runtime/src/config.ts PLUGIN_VERSION(${pluginVersion})`
    );
  }
};

const main = () => {
  assertVersionConsistency();

  const srcDir = path.join(repoRoot, 'packages', 'runtime', 'src');
  const tsFiles = walk(srcDir, (p) => p.endsWith('.ts'));

  const rules = [
    {
      id: 'ts-ignore',
      pattern: /@ts-ignore|@ts-expect-error/
    },
    {
      id: 'as-any',
      pattern: /\bas any\b/
    },
    {
      id: 'as-unknown-as',
      pattern: /\bas unknown as\b/,
      // No allowlist: remove unsafe double assertions.
    },
    {
      id: 'console-in-src',
      pattern: /\bconsole\.(log|warn|error|info|debug)\(/,
      allow: (filePath) => rel(filePath) === 'packages/runtime/src/logging.ts'
    },
    {
      id: 'bare-document',
      // Detect identifier access only (avoid matching strings/types):
      // - document?.foo
      // - document.foo
      // - document[...]
      // - document(...)
      pattern: /(^|[^\w.])document\s*(\.|\?\.|\[|\()/
    },
    {
      id: 'bare-window',
      pattern: /(^|[^\w.])window\s*(\.|\?\.|\[|\()/
    },
    {
      id: 'throw-in-proxy',
      pattern: /\bthrow\b/,
      appliesTo: (filePath) => rel(filePath).startsWith('packages/runtime/src/proxy/'),
      // No allowlist: proxy must be throw-free.
    }
    ,
    {
      id: 'proxy-globalThis-document',
      pattern: /\bglobalThis\.document\b/,
      appliesTo: (filePath) => rel(filePath).startsWith('packages/runtime/src/proxy/')
    },
    {
      id: 'throw-in-src',
      pattern: /\bthrow\b/,
      appliesTo: (filePath) => rel(filePath).startsWith('packages/runtime/src/'),
      // Allow a narrow exception for Blockbench codec compile contract.
      allow: (filePath, line) =>
        rel(filePath) === 'packages/runtime/src/plugin/runtime.ts' && line.includes('throw new Error(')
    },
    {
      id: 'todo-fixme-comment',
      pattern: /\/\/\s*(TODO|FIXME)\b|\/\*\s*(TODO|FIXME)\b/,
      appliesTo: (filePath) => rel(filePath).startsWith('packages/runtime/src/')
    },
    {
      id: 'catch-without-binding',
      pattern: /catch\s*\{/,
      appliesTo: (filePath) => rel(filePath).startsWith('packages/runtime/src/')
    },
    {
      id: 'globalThis-as',
      pattern: /\bglobalThis\s+as\b/,
      appliesTo: (filePath) => rel(filePath).startsWith('packages/runtime/src/'),
      allow: (filePath) => {
        const p = rel(filePath);
        return p === 'packages/runtime/src/types/blockbench.ts' || p === 'packages/runtime/src/shared/globalState.ts';
      }
    }
  ];

  /** @type {Array<{file:string,line:number,rule:string,snippet:string}>} */
  const findings = [];
  for (const filePath of tsFiles) {
    findings.push(...scanFile(filePath, rules));
  }

  if (findings.length > 0) {
    console.error('ashfox quality gate failed. Violations:');
    for (const f of findings) {
      console.error(`- ${f.rule}: ${f.file}:${f.line} :: ${f.snippet}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('ashfox quality gate ok');
};

main();

