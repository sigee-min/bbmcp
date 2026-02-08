const fs = require('fs');
const path = require('path');

const SNAPSHOT_PATH = path.join(__dirname, '..', '..', 'config', 'specs', 'blockbench-spec-snapshot.json');
const RELEASES_URL = 'https://api.github.com/repos/JannisX11/blockbench/releases/latest';

const nowIsoDate = () => new Date().toISOString().slice(0, 10);

const parseVersion = (tag) => (typeof tag === 'string' ? tag.replace(/^v/i, '') : '');

const readSnapshot = () => JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));

const writeSnapshot = (snapshot) => {
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
};

const fetchLatestRelease = async () => {
  const res = await fetch(RELEASES_URL, {
    headers: {
      'User-Agent': 'ashfox-spec-sync',
      Accept: 'application/vnd.github+json'
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${RELEASES_URL}: ${res.status} ${res.statusText}`);
  }
  return res.json();
};

const refreshSources = (sources, date) =>
  Array.isArray(sources)
    ? sources.map((source) => ({ ...source, checkedAt: date }))
    : sources;

const updateFromRelease = (snapshot, release) => {
  const updated = { ...snapshot };
  const tag = release?.tag_name ?? updated.blockbench?.releaseTag ?? '';
  const version = parseVersion(tag) || updated.blockbench?.version || '';
  const releaseDate = typeof release?.published_at === 'string' ? release.published_at.slice(0, 10) : undefined;
  const releaseUrl = typeof release?.html_url === 'string' ? release.html_url : undefined;
  updated.blockbench = {
    ...updated.blockbench,
    version: version || updated.blockbench?.version,
    releaseTag: tag || updated.blockbench?.releaseTag,
    releaseDate: releaseDate || updated.blockbench?.releaseDate,
    releaseUrl: releaseUrl || updated.blockbench?.releaseUrl
  };
  return updated;
};

const main = async () => {
  const snapshot = readSnapshot();
  const release = await fetchLatestRelease();
  const today = nowIsoDate();
  const updated = updateFromRelease(snapshot, release);
  updated.updatedAt = today;
  updated.sources = refreshSources(updated.sources, today);
  writeSnapshot(updated);
  console.log(`blockbench spec snapshot updated: ${updated.blockbench?.version ?? 'unknown'}`);
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

