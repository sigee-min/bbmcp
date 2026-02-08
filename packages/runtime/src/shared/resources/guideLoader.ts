import { loadNativeModule } from '../nativeModules';

export type GuideLoader = (name: string, fallback: string) => string;

type FsModule = {
  existsSync: (path: string) => boolean;
  statSync: (path: string) => { mtimeMs?: number; mtime?: Date; isFile?: () => boolean };
  readFileSync: (path: string, encoding: string) => string;
};

type PathModule = {
  resolve: (...parts: string[]) => string;
};

type GuideCacheEntry = { text: string; mtimeMs: number; filePath: string };

const guideCache = new Map<string, GuideCacheEntry>();

const resolveGuidePaths = (path: PathModule, name: string): string[] => {
  const root = typeof process !== 'undefined' && process.cwd ? process.cwd() : '.';
  const base = path.resolve(root, 'apps', 'docs', 'content', 'docs', 'en', 'guides');
  return [path.resolve(base, `${name}.md`), path.resolve(base, `${name}.mdx`)];
};

const resolveGuidePath = (fs: FsModule, path: PathModule, name: string): string | null => {
  const candidates = resolveGuidePaths(path, name);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
};

const resolveMtimeMs = (stat: { mtimeMs?: number; mtime?: Date }): number => {
  if (typeof stat.mtimeMs === 'number') return stat.mtimeMs;
  if (stat.mtime instanceof Date) return stat.mtime.getTime();
  return 0;
};

const readGuideEntry = (args: {
  fs: FsModule;
  path: PathModule;
  name: string;
}): GuideCacheEntry | null => {
  const filePath = resolveGuidePath(args.fs, args.path, args.name);
  if (!filePath) return null;
  try {
    const stat = args.fs.statSync(filePath);
    if (typeof stat.isFile === 'function' && !stat.isFile()) return null;
    const text = args.fs.readFileSync(filePath, 'utf-8');
    return { text, mtimeMs: resolveMtimeMs(stat), filePath };
  } catch (_err) {
    return null;
  }
};

const resolveCachedGuide = (args: {
  fs: FsModule;
  path: PathModule;
  name: string;
}): GuideCacheEntry | null => {
  const cached = guideCache.get(args.name);
  if (!cached) return null;
  const filePath = resolveGuidePath(args.fs, args.path, args.name);
  if (!filePath || filePath !== cached.filePath) return null;
  try {
    const stat = args.fs.statSync(filePath);
    if (typeof stat.isFile === 'function' && !stat.isFile()) return null;
    const mtimeMs = resolveMtimeMs(stat);
    if (mtimeMs === cached.mtimeMs) return cached;
  } catch (_err) {
    return null;
  }
  return null;
};

export const loadGuideMarkdown: GuideLoader = (name, fallback) => {
  const fs = loadNativeModule<FsModule>('fs', { message: 'Filesystem access required', optional: true });
  const path = loadNativeModule<PathModule>('path', { message: 'Filesystem access required', optional: true });
  if (!fs || !path) return fallback;

  const cached = resolveCachedGuide({ fs, path, name });
  if (cached) return cached.text;

  const entry = readGuideEntry({ fs, path, name });
  if (entry) {
    guideCache.set(name, entry);
    return entry.text;
  }

  guideCache.delete(name);
  return fallback;
};
