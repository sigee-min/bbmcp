/* eslint-disable no-console */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

const APP_PACKAGES = [
  { id: 'ashfox', packagePath: 'apps/ashfox/package.json' },
  { id: 'plugin-desktop', packagePath: 'apps/plugin-desktop/package.json' },
  { id: 'gateway', packagePath: 'apps/gateway/package.json' },
  { id: 'worker', packagePath: 'apps/worker/package.json' },
  { id: 'web', packagePath: 'apps/web/package.json' },
  { id: 'docs', packagePath: 'apps/docs/package.json' }
];

const MAX_COMMITS = 200;
const NOTES_RELATIVE_PATH = '.github/release-notes.generated.md';
const NOTES_ABSOLUTE_PATH = path.join(repoRoot, NOTES_RELATIVE_PATH);

const runGit = (args) => {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch {
    return '';
  }
};

const readTextRelative = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const readJsonRelative = (relativePath) => JSON.parse(readTextRelative(relativePath));

const loadAppVersionsFromPackages = () => {
  const versions = {};
  for (const app of APP_PACKAGES) {
    const pkg = readJsonRelative(app.packagePath);
    const version = typeof pkg.version === 'string' ? pkg.version.trim() : '';
    versions[app.id] = version || '(missing)';
  }
  return versions;
};

const findPreviousTag = () => runGit(['describe', '--tags', '--abbrev=0', 'HEAD^']) || runGit(['describe', '--tags', '--abbrev=0']);

const parseCommits = (raw) =>
  raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, subject, date] = line.split('\t');
      return {
        hash: hash || '',
        shortHash: shortHash || '',
        subject: subject || '(no subject)',
        date: date || ''
      };
    });

const parseCommitType = (subject) => {
  const match = String(subject).match(/^([a-z]+)(\(.+\))?!?:\s+/i);
  return match ? match[1].toLowerCase() : '';
};

const cleanSubject = (subject) => {
  const stripped = String(subject).replace(/^[a-z]+(\(.+\))?!?:\s*/i, '').trim();
  if (!stripped) return String(subject || '(no subject)');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
};

const sectionFromType = (type) => {
  if (type === 'feat') return 'Features';
  if (type === 'fix') return 'Fixes';
  if (type === 'refactor') return 'Refactors';
  if (type === 'perf') return 'Performance';
  return 'Other Changes';
};

const commitLinkBase =
  process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/commit`
    : '';

const formatCommit = (commit) => {
  const hashRef = commitLinkBase
    ? `[\`${commit.shortHash}\`](${commitLinkBase}/${commit.hash})`
    : `\`${commit.shortHash}\``;
  return `- ${cleanSubject(commit.subject)} ${hashRef}`;
};

const buildFallbackSummary = (commits) => {
  const bySection = new Map();
  for (const commit of commits) {
    const section = sectionFromType(parseCommitType(commit.subject));
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(commit);
  }

  const sectionOrder = ['Features', 'Fixes', 'Refactors', 'Performance', 'Other Changes'];
  const lines = [];
  for (const section of sectionOrder) {
    const sectionCommits = bySection.get(section) || [];
    if (sectionCommits.length === 0) continue;
    lines.push(`### ${section}`);
    lines.push('');
    for (const commit of sectionCommits.slice(0, 10)) {
      lines.push(formatCommit(commit));
    }
    if (sectionCommits.length > 10) {
      lines.push(`- ... and ${sectionCommits.length - 10} more`);
    }
    lines.push('');
  }

  if (lines.length === 0) {
    lines.push('_No meaningful commits detected for this release range._');
  }
  return lines.join('\n');
};

const extractTextFromResponse = (responseJson) => {
  if (typeof responseJson.output_text === 'string' && responseJson.output_text.trim()) {
    return responseJson.output_text.trim();
  }
  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string' && part.text.trim()) {
        return part.text.trim();
      }
    }
  }
  return '';
};

const summarizeWithLlm = async (context) => {
  if ((process.env.RELEASE_NOTES_DISABLE_LLM || '').trim().toLowerCase() === 'true') {
    return { text: '', source: 'fallback' };
  }

  const apiKey = (process.env.RELEASE_NOTES_LLM_API_KEY || '').trim();
  if (!apiKey) return { text: '', source: 'fallback' };

  const model = (process.env.RELEASE_NOTES_LLM_MODEL || 'gpt-4.1-mini').trim();
  const baseUrl = (process.env.RELEASE_NOTES_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const url = `${baseUrl}/responses`;
  const payload = {
    model,
    temperature: 0.2,
    max_output_tokens: 1000,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text:
              'Write concise markdown release notes for engineers. Focus on user-impacting changes only. Output markdown body only.'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              commitRange: context.commitRange,
              commitCount: context.commitCount,
              commits: context.commits
            })
          }
        ]
      }
    ]
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LLM request failed (${response.status}): ${body.slice(0, 300)}`);
    }
    const json = await response.json();
    const text = extractTextFromResponse(json);
    if (!text) {
      throw new Error('LLM response did not contain usable summary text.');
    }
    return { text, source: `llm:${model}` };
  } finally {
    clearTimeout(timeout);
  }
};

const buildAppVersionTable = (context) => {
  const changedSet = new Set(context.changedApps || []);
  const rows = APP_PACKAGES.map((app) => {
    const version = context.appVersions?.[app.id] || '(missing)';
    const changed = changedSet.has(app.id) ? 'yes' : 'no';
    return `| ${app.id} | ${version} | ${changed} |`;
  });
  return ['| App | Version | Changed Since Previous Tag |', '| --- | --- | --- |', ...rows].join('\n');
};

const buildNotes = (context, summary, summarySource) => {
  return [
    `# ${context.releaseName}`,
    '',
    `- Generated: ${context.generatedAt}`,
    `- Commit: ${context.commit}`,
    `- Previous tag: ${context.previousTag || 'none'}`,
    `- Commit range: ${context.commitRange}`,
    `- Commit count (no merges): ${context.commitCount}`,
    `- Summary source: ${summarySource}`,
    '',
    '## App Versions',
    '',
    buildAppVersionTable(context),
    '',
    '## Auto-detected Changes',
    '',
    summary
  ].join('\n');
};

const collectContext = () => {
  const now = new Date();
  const iso = now.toISOString();
  const datePart = iso.slice(0, 10);
  const dateCompact = datePart.replace(/-/g, '');
  const shortSha = (process.env.GITHUB_SHA || 'local').slice(0, 7);
  const releaseTag = `update-${dateCompact}-${shortSha}`;
  const releaseName = `Ashfox Update ${datePart}`;
  const previousTag = findPreviousTag();
  const commitRange = previousTag ? `${previousTag}..HEAD` : 'HEAD';

  const commitsRaw = runGit([
    'log',
    '--no-merges',
    '--date=short',
    `--max-count=${MAX_COMMITS}`,
    '--pretty=format:%H%x09%h%x09%s%x09%ad',
    commitRange
  ]);
  const commits = commitsRaw ? parseCommits(commitsRaw) : [];
  const commitCount = Number(runGit(['rev-list', '--count', '--no-merges', commitRange]) || '0');

  const changedFilesRaw = previousTag ? runGit(['diff', '--name-only', `${previousTag}..HEAD`]) : '';
  const changedFiles = changedFilesRaw
    ? changedFilesRaw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  const changedApps = APP_PACKAGES.map((app) => app.id).filter((appId) => {
    if (!previousTag) return true;
    return changedFiles.some((file) => file.startsWith(`apps/${appId}/`));
  });

  return {
    generatedAt: iso,
    commit: process.env.GITHUB_SHA || 'local',
    releaseTag,
    releaseName,
    previousTag: previousTag || null,
    commitRange,
    commitCount,
    commits,
    changedApps,
    appVersions: loadAppVersionsFromPackages()
  };
};

const writeGithubOutput = (name, value) => {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
};

const run = async () => {
  const context = collectContext();

  let summary = '';
  let summarySource = 'fallback';
  try {
    const llm = await summarizeWithLlm(context);
    summary = llm.text;
    summarySource = llm.source;
  } catch (error) {
    console.warn(`LLM summary unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!summary) {
    summary = buildFallbackSummary(context.commits);
    summarySource = 'fallback';
  }

  const notes = buildNotes(context, summary, summarySource);
  fs.writeFileSync(NOTES_ABSOLUTE_PATH, notes, 'utf8');

  writeGithubOutput('release_tag', context.releaseTag);
  writeGithubOutput('release_name', context.releaseName);
  writeGithubOutput('body_path', NOTES_RELATIVE_PATH);

  console.log(`release_tag=${context.releaseTag}`);
  console.log(`release_name=${context.releaseName}`);
  console.log(`body_path=${NOTES_RELATIVE_PATH}`);
  console.log(`release_notes_source=${summarySource}`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
