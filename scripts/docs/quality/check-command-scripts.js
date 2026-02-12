/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const { listDocFiles, locales, toPosixPath } = require('./shared');

const rootPackagePath = path.join(process.cwd(), 'package.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeWorkspaceToken(raw) {
  return raw
    .trim()
    .replace(/^['"`]/, '')
    .replace(/['"`,.:;)\]]+$/, '')
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
}

function buildWorkspaceScriptMap() {
  const rootPackage = readJson(rootPackagePath);
  const map = new Map();

  for (const workspacePath of rootPackage.workspaces || []) {
    const workspacePackagePath = path.join(process.cwd(), workspacePath, 'package.json');
    if (!fs.existsSync(workspacePackagePath)) continue;

    const workspacePackage = readJson(workspacePackagePath);
    const scripts = new Set(Object.keys(workspacePackage.scripts || {}));
    const normalizedPath = workspacePath.replace(/\\/g, '/').replace(/^\.\/+/, '');

    const aliases = new Set([
      normalizedPath,
      `./${normalizedPath}`,
      workspacePackage.name,
    ]);

    for (const alias of aliases) {
      if (!alias) continue;
      map.set(alias, scripts);
    }
  }

  return {
    rootScripts: new Set(Object.keys(rootPackage.scripts || {})),
    workspaceScripts: map,
  };
}

function checkCommandScripts() {
  const violations = [];
  const { rootScripts, workspaceScripts } = buildWorkspaceScriptMap();

  const workspaceRunPattern = /npm\s+--workspace\s+([^\s]+)\s+run\s+([a-zA-Z0-9:_-]+)/g;
  const workspaceTestPattern = /npm\s+--workspace\s+([^\s]+)\s+test\b/g;
  const rootRunPattern = /npm\s+run\s+([a-zA-Z0-9:_-]+)/g;
  const rootTestPattern = /npm\s+test\b/g;

  for (const locale of locales) {
    const files = listDocFiles(locale);
    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      const relativePath = toPosixPath(path.relative(process.cwd(), filePath));

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];

        for (const match of line.matchAll(workspaceRunPattern)) {
          const workspaceToken = normalizeWorkspaceToken(match[1]);
          const scriptName = match[2];
          const scripts = workspaceScripts.get(workspaceToken);
          if (!scripts) {
            violations.push(
              `${relativePath}:${index + 1} -> unknown workspace "${workspaceToken}" in command: ${match[0].trim()}`
            );
            continue;
          }
          if (!scripts.has(scriptName)) {
            violations.push(
              `${relativePath}:${index + 1} -> missing workspace script "${scriptName}" for "${workspaceToken}"`
            );
          }
        }

        for (const match of line.matchAll(workspaceTestPattern)) {
          const workspaceToken = normalizeWorkspaceToken(match[1]);
          const scripts = workspaceScripts.get(workspaceToken);
          if (!scripts) {
            violations.push(
              `${relativePath}:${index + 1} -> unknown workspace "${workspaceToken}" in command: ${match[0].trim()}`
            );
            continue;
          }
          if (!scripts.has('test')) {
            violations.push(
              `${relativePath}:${index + 1} -> missing workspace script "test" for "${workspaceToken}"`
            );
          }
        }

        for (const match of line.matchAll(rootRunPattern)) {
          const scriptName = match[1];
          if (!rootScripts.has(scriptName)) {
            violations.push(
              `${relativePath}:${index + 1} -> missing root script "${scriptName}" in command: ${match[0].trim()}`
            );
          }
        }

        if (rootTestPattern.test(line) && !rootScripts.has('test')) {
          violations.push(
            `${relativePath}:${index + 1} -> missing root script "test" in command: ${line.trim()}`
          );
        }
      }
    }
  }

  return violations;
}

module.exports = {
  checkCommandScripts,
};
