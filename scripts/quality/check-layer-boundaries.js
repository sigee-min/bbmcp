/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..', '..');
const runtimeSrcRoot = path.join(repoRoot, 'packages', 'runtime', 'src');

const runtimeLayers = new Set([
  'adapters',
  'domain',
  'local',
  'plugin',
  'transport',
  'usecases'
]);

const forbiddenTargetsByLayer = {
  domain: new Set(['adapters', 'local', 'plugin', 'transport', 'usecases']),
  usecases: new Set(['adapters', 'local', 'plugin', 'transport'])
};

const walk = (dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (entry.isFile() && full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
};

const toPosix = (value) => value.replace(/\\/g, '/');

const relFromRepo = (filePath) => toPosix(path.relative(repoRoot, filePath));

const layerOf = (filePath) => {
  const rel = toPosix(path.relative(runtimeSrcRoot, filePath));
  if (rel.startsWith('../') || rel === '..') return null;
  const layer = rel.split('/')[0];
  return runtimeLayers.has(layer) ? layer : null;
};

const resolveRuntimeImport = (fromFile, specifier) => {
  if (!specifier) return null;
  let base;
  if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else if (specifier.startsWith('@ashfox/runtime/')) {
    base = path.join(runtimeSrcRoot, specifier.slice('@ashfox/runtime/'.length));
  } else {
    return null;
  }

  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
  for (const candidate of candidates) {
    if (!candidate.startsWith(runtimeSrcRoot)) continue;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
};

const collectImports = (filePath) => {
  const text = fs.readFileSync(filePath, 'utf8');
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const imports = [];

  for (const statement of source.statements) {
    let specifier = null;
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      specifier = statement.moduleSpecifier.text;
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      specifier = statement.moduleSpecifier.text;
    }
    if (!specifier) continue;
    const line = source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1;
    imports.push({ specifier, line });
  }

  return imports;
};

const collectViolations = () => {
  const files = walk(runtimeSrcRoot);
  const violations = [];

  for (const filePath of files) {
    const fromLayer = layerOf(filePath);
    const forbidden = fromLayer ? forbiddenTargetsByLayer[fromLayer] : null;
    if (!forbidden || forbidden.size === 0) continue;

    const imports = collectImports(filePath);
    for (const entry of imports) {
      const targetPath = resolveRuntimeImport(filePath, entry.specifier);
      if (!targetPath) continue;
      const targetLayer = layerOf(targetPath);
      if (!targetLayer) continue;
      if (!forbidden.has(targetLayer)) continue;

      violations.push({
        file: relFromRepo(filePath),
        line: entry.line,
        fromLayer,
        targetLayer,
        specifier: entry.specifier
      });
    }
  }

  return violations;
};

const main = () => {
  const violations = collectViolations();
  if (violations.length > 0) {
    console.error('ashfox layer-boundary gate failed. Forbidden runtime layer imports:');
    for (const item of violations) {
      console.error(
        `- ${item.file}:${item.line} (${item.fromLayer} -> ${item.targetLayer}) :: ${item.specifier}`
      );
    }
    process.exitCode = 1;
    return;
  }
  console.log('ashfox layer-boundary gate ok');
};

main();
