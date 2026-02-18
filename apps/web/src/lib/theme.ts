export const THEME_MODE_STORAGE_KEY = 'ashfox.theme-mode';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const isThemeMode = (value: string | null): value is ThemeMode =>
  value === 'light' || value === 'dark' || value === 'system';

export const resolveTheme = (mode: ThemeMode, prefersDark: boolean): ResolvedTheme =>
  mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
