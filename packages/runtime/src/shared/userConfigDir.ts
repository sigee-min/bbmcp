export type UserConfigBase = {
  baseDir: string;
  source: 'APPDATA' | 'XDG_CONFIG_HOME' | 'HOME';
};

type PathModule = {
  join: (...parts: string[]) => string;
};

type OsModule = {
  homedir: () => string;
};

export const resolveUserConfigBaseDir = (
  path: PathModule,
  os: OsModule | null
): UserConfigBase | null => {
  const env = typeof process !== 'undefined' ? process.env ?? {} : {};
  if (env.APPDATA && env.APPDATA.trim()) {
    return { baseDir: path.join(env.APPDATA, 'ashfox'), source: 'APPDATA' };
  }
  if (env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim()) {
    return { baseDir: path.join(env.XDG_CONFIG_HOME, 'ashfox'), source: 'XDG_CONFIG_HOME' };
  }
  const home = (env.HOME && env.HOME.trim()) || (env.USERPROFILE && env.USERPROFILE.trim()) || os?.homedir?.();
  if (home) {
    return { baseDir: path.join(home, '.ashfox'), source: 'HOME' };
  }
  return null;
};

