#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

const round = (value) => Number(value.toFixed(3));

const nowIso = () => new Date().toISOString();

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    writeBaseline: null,
    assertBaseline: null,
    iterations: 160,
    warmup: 20,
    projectCount: 300,
    workspaceCount: 80
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--write-baseline') {
      options.writeBaseline = args[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg === '--assert-baseline') {
      options.assertBaseline = args[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg === '--iterations') {
      options.iterations = Number.parseInt(args[index + 1] || '', 10);
      index += 1;
      continue;
    }
    if (arg === '--warmup') {
      options.warmup = Number.parseInt(args[index + 1] || '', 10);
      index += 1;
      continue;
    }
    if (arg === '--projects') {
      options.projectCount = Number.parseInt(args[index + 1] || '', 10);
      index += 1;
      continue;
    }
    if (arg === '--workspaces') {
      options.workspaceCount = Number.parseInt(args[index + 1] || '', 10);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.writeBaseline && options.assertBaseline) {
    throw new Error('Use either --write-baseline or --assert-baseline, not both.');
  }
  if (!Number.isInteger(options.iterations) || options.iterations < 20) {
    throw new Error('--iterations must be an integer >= 20');
  }
  if (!Number.isInteger(options.warmup) || options.warmup < 0) {
    throw new Error('--warmup must be an integer >= 0');
  }
  if (!Number.isInteger(options.projectCount) || options.projectCount < 50) {
    throw new Error('--projects must be an integer >= 50');
  }
  if (!Number.isInteger(options.workspaceCount) || options.workspaceCount < 10) {
    throw new Error('--workspaces must be an integer >= 10');
  }

  return options;
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const quantile = (values, q) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q)));
  return sorted[index];
};

const toStats = (samples) => {
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    count: samples.length,
    meanMs: round(total / samples.length),
    p50Ms: round(quantile(samples, 0.5)),
    p95Ms: round(quantile(samples, 0.95)),
    p99Ms: round(quantile(samples, 0.99)),
    maxMs: round(Math.max(...samples)),
    minMs: round(Math.min(...samples))
  };
};

const toThreshold = (stats) => {
  const p95MsMax = round(Math.max(stats.p95Ms * 1.35, stats.p95Ms + 0.25));
  const meanMsMax = round(Math.max(stats.meanMs * 1.35, stats.meanMs + 0.15));
  return {
    p95MsMax,
    meanMsMax
  };
};

const measure = (iterations, warmup, runOnce) => {
  for (let index = 0; index < warmup; index += 1) {
    runOnce(index);
  }
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = process.hrtime.bigint();
    runOnce(index);
    const end = process.hrtime.bigint();
    samples.push(Number(end - start) / 1_000_000);
  }
  return samples;
};

const buildDataset = (db, options) => {
  db.exec(`
    CREATE TABLE ashfox_projects (
      tenant_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      revision TEXT NOT NULL,
      state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, project_id)
    );
    CREATE INDEX idx_projects_scope ON ashfox_projects(tenant_id, project_id);

    CREATE TABLE ashfox_accounts (
      account_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      system_roles TEXT NOT NULL,
      local_login_id TEXT,
      password_hash TEXT,
      github_user_id TEXT,
      github_login TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX idx_accounts_local_login_id ON ashfox_accounts(local_login_id);
    CREATE UNIQUE INDEX idx_accounts_github_user_id ON ashfox_accounts(github_user_id);

    CREATE TABLE ashfox_workspaces (
      workspace_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mode TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE ashfox_workspace_members (
      workspace_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      role_ids TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, account_id)
    );
    CREATE INDEX idx_workspace_members_account_id ON ashfox_workspace_members(account_id);

    CREATE TABLE ashfox_workspace_folder_acl (
      workspace_id TEXT NOT NULL,
      folder_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      read_effect TEXT NOT NULL,
      write_effect TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, folder_id, role_id)
    );
    CREATE INDEX idx_workspace_acl_workspace_id ON ashfox_workspace_folder_acl(workspace_id);
  `);

  const tenantId = 'tenant-bench';
  const now = nowIso();

  const insertProject = db.prepare(`
    INSERT INTO ashfox_projects (tenant_id, project_id, revision, state, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (let index = 0; index < options.projectCount; index += 1) {
    const projectId = `proj-${String(index).padStart(4, '0')}`;
    insertProject.run(tenantId, projectId, 'r0', JSON.stringify({ i: index, items: [index, index + 1] }), now, now);
  }

  const insertAccount = db.prepare(`
    INSERT INTO ashfox_accounts (account_id, email, display_name, system_roles, local_login_id, password_hash, github_user_id, github_login, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertAccount.run(
    'admin',
    'admin@ashfox.local',
    'Administrator',
    JSON.stringify(['system_admin']),
    'admin',
    'hash',
    'gh-admin',
    'admin',
    now,
    now
  );
  for (let index = 0; index < options.workspaceCount; index += 1) {
    insertAccount.run(
      `user-${index}`,
      `user-${index}@ashfox.local`,
      `User ${index}`,
      JSON.stringify([]),
      `user-${index}`,
      'hash',
      `gh-user-${index}`,
      `user-${index}`,
      now,
      now
    );
  }

  const insertWorkspace = db.prepare(`
    INSERT INTO ashfox_workspaces (workspace_id, tenant_id, name, mode, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMember = db.prepare(`
    INSERT INTO ashfox_workspace_members (workspace_id, account_id, role_ids, joined_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertAcl = db.prepare(`
    INSERT INTO ashfox_workspace_folder_acl (workspace_id, folder_id, role_id, read_effect, write_effect, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (let index = 0; index < options.workspaceCount; index += 1) {
    const workspaceId = `ws-${String(index).padStart(3, '0')}`;
    insertWorkspace.run(workspaceId, tenantId, `Workspace ${index}`, 'rbac', 'admin', now, now);
    insertMember.run(workspaceId, 'admin', JSON.stringify(['role_workspace_admin']), now, now);
    insertMember.run(workspaceId, `user-${index}`, JSON.stringify(['role_user']), now, now);
    insertAcl.run(workspaceId, '__root__', 'role_user', 'allow', 'allow', now);
    insertAcl.run(workspaceId, `folder-${index}`, 'role_user', 'allow', 'allow', now);
  }
};

const runBenchmarks = (options) => {
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (error) {
    throw new Error('better-sqlite3 is required. Install dependencies before running this benchmark.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ashfox-perf-'));
  const dbPath = path.join(tempDir, 'persistence-benchmark.sqlite');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  try {
    buildDataset(db, options);

    const tenantId = 'tenant-bench';
    const projectRevisions = new Array(options.projectCount).fill(0);

    const findProjectStmt = db.prepare(
      'SELECT tenant_id, project_id, revision, state, created_at, updated_at FROM ashfox_projects WHERE tenant_id = ? AND project_id = ?'
    );
    const listProjectByPrefixStmt = db.prepare(
      `SELECT tenant_id, project_id, revision, state, created_at, updated_at
       FROM ashfox_projects
       WHERE tenant_id = ? AND project_id LIKE ? ESCAPE '\\'
       ORDER BY project_id ASC`
    );
    const saveIfRevisionStmt = db.prepare(
      `UPDATE ashfox_projects
       SET state = ?, revision = ?, updated_at = ?
       WHERE tenant_id = ? AND project_id = ? AND revision = ?`
    );
    const listWorkspaceForAccountStmt = db.prepare(
      `SELECT w.workspace_id, w.tenant_id, w.name, w.mode, w.created_by, w.created_at, w.updated_at
       FROM ashfox_workspaces AS w
       LEFT JOIN ashfox_workspace_members AS m ON m.workspace_id = w.workspace_id
       WHERE m.account_id = ?
       ORDER BY w.created_at ASC, w.workspace_id ASC`
    );
    const lookupAccountByLocalLoginStmt = db.prepare(
      `SELECT account_id, email, display_name, system_roles, local_login_id, github_user_id
       FROM ashfox_accounts
       WHERE local_login_id = ?`
    );
    const listAclStmt = db.prepare(
      `SELECT workspace_id, folder_id, role_id, read_effect, write_effect, updated_at
       FROM ashfox_workspace_folder_acl
       WHERE workspace_id = ?
       ORDER BY folder_id ASC, role_id ASC`
    );

    const operationMap = {
      project_find: () => {
        const index = Math.floor(Math.random() * options.projectCount);
        const row = findProjectStmt.get(tenantId, `proj-${String(index).padStart(4, '0')}`);
        if (!row) throw new Error('project_find returned empty result');
      },
      project_list_by_scope_prefix: () => {
        const rows = listProjectByPrefixStmt.all(tenantId, 'proj-00%');
        if (rows.length === 0) throw new Error('project_list_by_scope_prefix returned empty set');
      },
      project_save_if_revision: (iteration) => {
        const index = iteration % options.projectCount;
        const projectId = `proj-${String(index).padStart(4, '0')}`;
        const expectedRevision = `r${projectRevisions[index]}`;
        const nextRevision = `r${projectRevisions[index] + 1}`;
        const mutationPayload = JSON.stringify({ updatedAt: nowIso(), iteration, projectId });
        const result = saveIfRevisionStmt.run(mutationPayload, nextRevision, nowIso(), tenantId, projectId, expectedRevision);
        if (!result || result.changes !== 1) {
          throw new Error(`project_save_if_revision optimistic update failed for ${projectId}`);
        }
        projectRevisions[index] += 1;
      },
      workspace_list_for_account: () => {
        const rows = listWorkspaceForAccountStmt.all('admin');
        if (rows.length === 0) throw new Error('workspace_list_for_account returned empty set');
      },
      account_lookup_local_login: () => {
        const accountIndex = Math.floor(Math.random() * options.workspaceCount);
        const row = lookupAccountByLocalLoginStmt.get(`user-${accountIndex}`);
        if (!row) throw new Error('account_lookup_local_login returned empty result');
      },
      workspace_acl_lookup: (iteration) => {
        const workspaceId = `ws-${String(iteration % options.workspaceCount).padStart(3, '0')}`;
        const rows = listAclStmt.all(workspaceId);
        if (rows.length === 0) throw new Error('workspace_acl_lookup returned empty set');
      }
    };

    const metrics = {};
    for (const [name, runOperation] of Object.entries(operationMap)) {
      const samples = measure(options.iterations, options.warmup, runOperation);
      metrics[name] = toStats(samples);
    }

    return {
      generatedAt: nowIso(),
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch
      },
      benchmarkConfig: {
        iterations: options.iterations,
        warmup: options.warmup,
        projectCount: options.projectCount,
        workspaceCount: options.workspaceCount
      },
      metrics
    };
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

const printResult = (title, result) => {
  console.log(title);
  for (const [name, stats] of Object.entries(result.metrics)) {
    console.log(
      `- ${name}: mean=${stats.meanMs}ms p50=${stats.p50Ms}ms p95=${stats.p95Ms}ms p99=${stats.p99Ms}ms max=${stats.maxMs}ms`
    );
  }
};

const main = () => {
  const options = parseArgs();
  const result = runBenchmarks(options);

  if (options.writeBaseline) {
    const baselinePath = path.resolve(repoRoot, options.writeBaseline);
    const thresholds = {};
    for (const [name, stats] of Object.entries(result.metrics)) {
      thresholds[name] = toThreshold(stats);
    }

    const baseline = {
      baselineId: 'persistence-benchmark',
      generatedAt: result.generatedAt,
      runtime: result.runtime,
      benchmarkConfig: result.benchmarkConfig,
      metrics: result.metrics,
      thresholds
    };
    writeJson(baselinePath, baseline);
    printResult('ashfox persistence benchmark baseline written', result);
    console.log(`baseline_file=${path.relative(repoRoot, baselinePath)}`);
    return;
  }

  if (options.assertBaseline) {
    const baselinePath = path.resolve(repoRoot, options.assertBaseline);
    if (!fs.existsSync(baselinePath)) {
      throw new Error(`Baseline file not found: ${baselinePath}`);
    }
    const baseline = readJson(baselinePath);
    const thresholds = baseline.thresholds && typeof baseline.thresholds === 'object' ? baseline.thresholds : null;
    if (!thresholds) {
      throw new Error(`Baseline file has no thresholds: ${baselinePath}`);
    }

    const violations = [];
    for (const [name, threshold] of Object.entries(thresholds)) {
      const current = result.metrics[name];
      if (!current) {
        violations.push(`${name}: metric missing from current run`);
        continue;
      }
      if (typeof threshold !== 'object' || threshold === null) {
        violations.push(`${name}: invalid threshold entry`);
        continue;
      }
      const p95Max = Number(threshold.p95MsMax);
      const meanMax = Number(threshold.meanMsMax);
      if (!Number.isFinite(p95Max) || !Number.isFinite(meanMax)) {
        violations.push(`${name}: threshold values must be finite numbers`);
        continue;
      }
      if (current.p95Ms > p95Max) {
        violations.push(`${name}: p95 ${current.p95Ms}ms exceeds limit ${p95Max}ms`);
      }
      if (current.meanMs > meanMax) {
        violations.push(`${name}: mean ${current.meanMs}ms exceeds limit ${meanMax}ms`);
      }
    }

    printResult('ashfox persistence benchmark assert run', result);
    console.log(`baseline_file=${path.relative(repoRoot, baselinePath)}`);

    if (violations.length > 0) {
      console.error('ashfox perf regression detected:');
      for (const violation of violations) {
        console.error(`- ${violation}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log('ashfox perf regression gate ok');
    return;
  }

  printResult('ashfox persistence benchmark run', result);
};

main();
