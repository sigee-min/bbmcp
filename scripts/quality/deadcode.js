/* eslint-disable no-console */
// ashfox release gate: dead export check with explicit symbol-level allowlist governance.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const npmExecPath = process.env.npm_execpath;
const cmd = npmExecPath ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const args = npmExecPath
  ? [npmExecPath, 'exec', '--', 'ts-prune', '-p', 'tsconfig.json']
  : ['exec', '--', 'ts-prune', '-p', 'tsconfig.json'];

const run = spawnSync(cmd, args, { encoding: 'utf8' });

if (run.status !== 0) {
  console.error('deadcode gate failed to run ts-prune');
  if (run.stderr) process.stderr.write(run.stderr);
  process.exitCode = run.status ?? 1;
  return;
}

const maxSuppressed = Number.parseInt(process.env.ASHFOX_DEADCODE_MAX_SUPPRESSED ?? '200', 10);
const summaryFile = process.env.ASHFOX_DEADCODE_SUMMARY_FILE;
const allowlistFile = path.resolve(
  process.cwd(),
  process.env.ASHFOX_DEADCODE_ALLOWLIST_FILE ?? 'scripts/quality/deadcode-allowlist.json'
);

const normalizeFilePath = (value) => `/${String(value).replace(/\\/g, '/').replace(/^\/+/, '')}`;

const parseDeadcodeLine = (line) => {
  const match = /^(.*?):(\d+)\s+-\s+(.+)$/.exec(line);
  if (!match) return null;
  return {
    path: normalizeFilePath(match[1]),
    symbol: String(match[3]).trim()
  };
};

const loadAllowlistManifest = () => {
  let raw;
  try {
    raw = fs.readFileSync(allowlistFile, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to read allowlist file (${allowlistFile}): ${message}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to parse allowlist JSON (${allowlistFile}): ${message}`);
  }

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('allowlist manifest must be an object');
  }

  const entries = manifest.entries;
  if (!Array.isArray(entries)) {
    throw new Error('allowlist manifest must include entries[]');
  }

  const symbolEntries = [];
  const grouped = [];
  const seenKeys = new Set();

  for (const [entryIndex, entry] of entries.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`allowlist entry[${entryIndex}] must be an object`);
    }

    const entryPath = typeof entry.path === 'string' ? normalizeFilePath(entry.path) : '';
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
    const symbols = Array.isArray(entry.symbols) ? entry.symbols : null;

    if (!entryPath) {
      throw new Error(`allowlist entry[${entryIndex}] is missing a valid path`);
    }
    if (!reason) {
      throw new Error(`allowlist entry[${entryIndex}] is missing reason (ungoverned suppression)`);
    }
    if (!symbols || symbols.length === 0) {
      throw new Error(`allowlist entry[${entryIndex}] is missing symbols[] (ungoverned suppression)`);
    }

    const uniqueSymbols = [];
    const symbolSet = new Set();
    for (const [symbolIndex, symbolValue] of symbols.entries()) {
      const symbol = typeof symbolValue === 'string' ? symbolValue.trim() : '';
      if (!symbol) {
        throw new Error(
          `allowlist entry[${entryIndex}] symbol[${symbolIndex}] is invalid (ungoverned suppression)`
        );
      }
      if (symbolSet.has(symbol)) continue;
      symbolSet.add(symbol);
      uniqueSymbols.push(symbol);

      const key = `${entryPath}::${symbol}`;
      if (seenKeys.has(key)) {
        throw new Error(`duplicate allowlist entry for ${key}`);
      }
      seenKeys.add(key);
      symbolEntries.push({ path: entryPath, symbol, reason });
    }

    grouped.push({
      path: entryPath,
      reason,
      symbols: uniqueSymbols,
      hits: 0
    });
  }

  return {
    symbolEntries,
    grouped
  };
};

let allowlist;
try {
  allowlist = loadAllowlistManifest();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ashfox deadcode gate failed (allowlist invalid): ${message}`);
  process.exitCode = 1;
  return;
}

const allowlistMap = new Map();
for (const entry of allowlist.symbolEntries) {
  allowlistMap.set(`${entry.path}::${entry.symbol}`, entry);
}
const allowlistGroupMap = new Map(allowlist.grouped.map((entry) => [entry.path, entry]));

const output = run.stdout || '';
const rawLines = output
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const usedInModuleCount = rawLines.filter((line) => line.includes('(used in module)')).length;
const candidateLines = rawLines.filter((line) => !line.includes('(used in module)'));

const actionable = [];
const unparsed = [];
const matched = [];

for (const line of candidateLines) {
  const parsed = parseDeadcodeLine(line);
  if (!parsed) {
    unparsed.push(line);
    actionable.push(line);
    continue;
  }

  const key = `${parsed.path}::${parsed.symbol}`;
  const governance = allowlistMap.get(key);
  if (!governance) {
    actionable.push(line);
    continue;
  }

  matched.push({ ...parsed, line });
  const group = allowlistGroupMap.get(parsed.path);
  if (group) {
    group.hits += 1;
  }
}

const suppressedCount = matched.length;
if (suppressedCount > 0) {
  console.log('ashfox deadcode allowlist summary:');
  for (const entry of allowlist.grouped) {
    if (entry.hits === 0) continue;
    console.log(`- ${entry.path} :: ${entry.hits} entries :: ${entry.reason}`);
  }
}

const summary = {
  totalRawEntries: rawLines.length,
  usedInModuleFiltered: usedInModuleCount,
  candidateEntries: candidateLines.length,
  suppressedEntries: suppressedCount,
  actionableEntries: actionable.length,
  unparsedEntries: unparsed.length,
  budget: {
    maxSuppressed
  },
  allowlist: {
    file: path.relative(process.cwd(), allowlistFile),
    groups: allowlist.grouped.length,
    symbols: allowlist.symbolEntries.length,
    entries: allowlist.grouped.map((entry) => ({
      path: entry.path,
      reason: entry.reason,
      symbolCount: entry.symbols.length,
      hits: entry.hits
    }))
  }
};

console.log(`ashfox deadcode summary: ${JSON.stringify(summary)}`);
if (summaryFile) {
  fs.writeFileSync(path.resolve(process.cwd(), summaryFile), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

if (suppressedCount > maxSuppressed) {
  console.error(
    `ashfox deadcode gate failed (suppression budget exceeded): suppressed=${suppressedCount}, budget=${maxSuppressed}`
  );
  process.exitCode = 1;
  return;
}

if (actionable.length > 0) {
  console.error('ashfox deadcode gate failed (unused exports):');
  for (const line of actionable) {
    console.error(`- ${line}`);
  }
  process.exitCode = 1;
  return;
}

console.log('ashfox deadcode gate ok');
