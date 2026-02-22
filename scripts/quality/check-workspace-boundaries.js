/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..', '..');
const workspaceParents = ['apps', 'packages'];
const candidateDirs = ['src', 'tests'];
const fileExtPattern = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

// Keep an explicit allowlist hook for temporary waivers.
// Intentionally empty: no boundary bypass exceptions are currently allowed.
const importAllowlist = new Set([]);

const toPosix = (value) => value.replace(/\\/g, '/');
const relFromRepo = (filePath) => toPosix(path.relative(repoRoot, filePath));

const walkFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') continue;
      out.push(...walkFiles(full));
      continue;
    }
    if (entry.isFile() && fileExtPattern.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

const listWorkspaceRoots = () => {
  const roots = [];
  for (const parent of workspaceParents) {
    const parentDir = path.join(repoRoot, parent);
    if (!fs.existsSync(parentDir)) continue;
    for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      roots.push({
        workspace: `${parent}/${entry.name}`,
        slug: entry.name,
        root: path.join(parentDir, entry.name)
      });
    }
  }
  return roots;
};

const workspaceRoots = listWorkspaceRoots();
const workspaceBySlug = new Map(workspaceRoots.map((entry) => [entry.slug, entry.workspace]));

const collectSourceFiles = () => {
  const files = [];
  for (const workspaceRoot of workspaceRoots) {
    for (const sourceDir of candidateDirs) {
      files.push(...walkFiles(path.join(workspaceRoot.root, sourceDir)));
    }
  }
  return files;
};

const resolveWorkspace = (filePath) => {
  const rel = relFromRepo(filePath);
  const match = rel.match(/^(apps|packages)\/([^/]+)/);
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
};

const resolveModuleSpecifiers = (filePath) => {
  const text = fs.readFileSync(filePath, 'utf8');
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.ESNext, true);
  const specs = [];

  const pushSpecifier = (specifier, node) => {
    if (typeof specifier !== 'string' || specifier.length === 0) return;
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    specs.push({ specifier, line });
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      pushSpecifier(node.moduleSpecifier.text, node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      pushSpecifier(node.moduleSpecifier.text, node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      pushSpecifier(node.arguments[0].text, node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);
  return specs;
};

const resolveAbsoluteSpecifier = (fromFile, specifier) => {
  if (specifier.startsWith('.')) {
    return path.resolve(path.dirname(fromFile), specifier);
  }
  if (path.isAbsolute(specifier)) {
    return specifier;
  }
  if (specifier.startsWith('apps/') || specifier.startsWith('packages/')) {
    return path.join(repoRoot, specifier);
  }
  return null;
};

const parseWorkspaceSrcTarget = (absoluteTarget) => {
  const normalized = toPosix(path.normalize(absoluteTarget));
  for (const workspaceRoot of workspaceParents) {
    const marker = `/${workspaceRoot}/`;
    const start = normalized.indexOf(marker);
    if (start < 0) continue;

    const tail = normalized.slice(start + marker.length);
    const parts = tail.split('/').filter(Boolean);
    if (parts.length < 2) continue;
    if (parts[1] !== 'src') continue;

    return `${workspaceRoot}/${parts[0]}`;
  }
  return null;
};

const parseAliasWorkspaceTarget = (specifier) => {
  const match = /^@ashfox\/([^/]+)\/(src|tests)(?:\/|$)/.exec(specifier);
  if (!match) return null;
  return workspaceBySlug.get(match[1]) ?? null;
};

const isGatewayServiceMcpSpecifier = (specifier) =>
  typeof specifier === 'string' &&
  (specifier.includes('apps/gateway/src/mcp/serviceTool') ||
    specifier.includes('@ashfox/gateway/src/mcp/serviceTool') ||
    specifier.includes('@ashfox/gateway/mcp/serviceTool'));

const collectViolations = () => {
  const files = collectSourceFiles();
  const violations = [];

  for (const filePath of files) {
    const sourceWorkspace = resolveWorkspace(filePath);
    if (!sourceWorkspace) continue;

    const entries = resolveModuleSpecifiers(filePath);
    for (const entry of entries) {
      if (sourceWorkspace !== 'apps/gateway' && isGatewayServiceMcpSpecifier(entry.specifier)) {
        const relFile = relFromRepo(filePath);
        const allowKey = `${relFile}::${entry.specifier}`;
        if (!importAllowlist.has(allowKey)) {
          violations.push({
            file: relFile,
            line: entry.line,
            sourceWorkspace,
            targetWorkspace: 'apps/gateway',
            specifier: entry.specifier,
            reason: 'service_mcp_tools_gateway_scope_only'
          });
          continue;
        }
      }

      if (
        sourceWorkspace === 'apps/gateway' &&
        (entry.specifier === '@ashfox/backend-blockbench' ||
          entry.specifier.startsWith('@ashfox/backend-blockbench/'))
      ) {
        const relFile = relFromRepo(filePath);
        const allowKey = `${relFile}::${entry.specifier}`;
        if (importAllowlist.has(allowKey)) continue;
        violations.push({
          file: relFile,
          line: entry.line,
          sourceWorkspace,
          targetWorkspace: 'packages/backend-blockbench',
          specifier: entry.specifier,
          reason: 'gateway_blockbench_dependency_forbidden'
        });
        continue;
      }

      const aliasWorkspaceTarget = parseAliasWorkspaceTarget(entry.specifier);
      if (aliasWorkspaceTarget && aliasWorkspaceTarget !== sourceWorkspace) {
        const relFile = relFromRepo(filePath);
        const allowKey = `${relFile}::${entry.specifier}`;
        if (importAllowlist.has(allowKey)) continue;
        violations.push({
          file: relFile,
          line: entry.line,
          sourceWorkspace,
          targetWorkspace: aliasWorkspaceTarget,
          specifier: entry.specifier,
          reason: 'alias_source_bypass'
        });
        continue;
      }

      const isWorkspaceSourcePathSpecifier =
        entry.specifier.includes('/apps/') ||
        entry.specifier.includes('/packages/') ||
        entry.specifier.startsWith('apps/') ||
        entry.specifier.startsWith('packages/') ||
        entry.specifier.includes('../apps/') ||
        entry.specifier.includes('../packages/');
      if (!isWorkspaceSourcePathSpecifier) continue;

      const resolved = resolveAbsoluteSpecifier(filePath, entry.specifier);
      if (!resolved) continue;

      const targetWorkspace = parseWorkspaceSrcTarget(resolved);
      if (!targetWorkspace) continue;
      if (targetWorkspace === sourceWorkspace) continue;

      const relFile = relFromRepo(filePath);
      const allowKey = `${relFile}::${entry.specifier}`;
      if (importAllowlist.has(allowKey)) continue;

      violations.push({
        file: relFile,
        line: entry.line,
        sourceWorkspace,
        targetWorkspace,
        specifier: entry.specifier,
        reason: 'relative_source_bypass'
      });
    }
  }

  return violations;
};

const main = () => {
  const violations = collectViolations();
  if (violations.length > 0) {
    console.error('ashfox workspace-boundary gate failed. Direct apps/*/src or packages/*/src imports detected:');
    for (const violation of violations) {
      console.error(
        `- ${violation.file}:${violation.line} (${violation.sourceWorkspace} -> ${violation.targetWorkspace}) :: ${violation.specifier}`
      );
      if (violation.reason) {
        console.error(`  reason: ${violation.reason}`);
      }
    }
    process.exitCode = 1;
    return;
  }

  console.log('ashfox workspace-boundary gate ok');
};

main();
