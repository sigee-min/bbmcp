import type { Logger } from '../logging';
import { errorMessage } from '../logging';
import { loadNativeModule } from '../shared/nativeModules';
import { resolveUserConfigBaseDir } from '../shared/userConfigDir';

type FsModule = {
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
};

type PathModule = {
  join: (...parts: string[]) => string;
};

type OsModule = {
  homedir: () => string;
};

const ensureDir = (fs: FsModule | null, dir: string, logger?: Logger): boolean => {
  if (!fs) return false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch (err) {
    logger?.warn('trace log directory creation failed', { dir, message: errorMessage(err) });
    return false;
  }
};

export const resolveTraceLogDestPath = (fileName: string, logger?: Logger): string | null => {
  const path = loadNativeModule<PathModule>('path', { message: 'Filesystem access required', optional: true });
  if (!path) return null;
  const fs = loadNativeModule<FsModule>('fs', { message: 'Filesystem access required', optional: true });
  const os = loadNativeModule<OsModule>('os', { message: 'Filesystem access required', optional: true });
  const base = resolveUserConfigBaseDir(path, os);
  if (!base) return null;
  const dir = path.join(base.baseDir, 'trace');
  if (!ensureDir(fs, dir, logger)) return null;
  return path.join(dir, fileName);
};
