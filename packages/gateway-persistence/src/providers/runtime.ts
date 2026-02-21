const MIN_NODE_RUNTIME_MAJOR = 22;

const readNodeRuntimeMajor = (): number => {
  const rawMajor = process.versions.node.split('.')[0];
  const major = Number.parseInt(rawMajor, 10);
  return Number.isFinite(major) ? major : 0;
};

export const assertNodeRuntimePreflight = (): void => {
  const major = readNodeRuntimeMajor();
  if (major >= MIN_NODE_RUNTIME_MAJOR) return;
  throw new Error(
    `Unsupported Node.js runtime ${process.versions.node}. Ashfox persistence requires Node.js ${MIN_NODE_RUNTIME_MAJOR}+ for the supported SQLite driver.`
  );
};

export const resolveSqliteRuntimeAvailability = (): { available: boolean; reason?: string } => {
  try {
    type SqliteDriverConstructor = new (location: string) => unknown;
    type SqliteModule = SqliteDriverConstructor | { default?: SqliteDriverConstructor };
    const sqliteModule = require('better-sqlite3') as SqliteModule;
    const constructor = typeof sqliteModule === 'function' ? sqliteModule : sqliteModule.default;
    if (typeof constructor === 'function') {
      return { available: true };
    }
    return { available: false, reason: 'sqlite_driver_missing_constructor' };
  } catch {
    return { available: false, reason: 'sqlite_driver_unavailable' };
  }
};
