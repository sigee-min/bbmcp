'use client';

import { useEffect, useState } from 'react';

import {
  isThemeMode,
  resolveTheme,
  THEME_MODE_STORAGE_KEY,
  type ResolvedTheme,
  type ThemeMode
} from '../../lib/theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const getMediaQueryList = (): MediaQueryList | null => {
  if (typeof window.matchMedia !== 'function') {
    return null;
  }
  return window.matchMedia(DARK_QUERY);
};

const applyThemeToDocument = (mode: ThemeMode, prefersDark: boolean): ResolvedTheme => {
  const resolvedTheme = resolveTheme(mode, prefersDark);
  const root = document.documentElement;
  root.dataset.themeMode = mode;
  root.dataset.theme = resolvedTheme;
  return resolvedTheme;
};

export const useThemeMode = () => {
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const media = getMediaQueryList();
    const persistedThemeMode = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    const initialThemeMode = isThemeMode(persistedThemeMode) ? persistedThemeMode : 'system';
    setThemeMode(initialThemeMode);
    setResolvedTheme(applyThemeToDocument(initialThemeMode, media?.matches ?? false));
  }, []);

  useEffect(() => {
    const media = getMediaQueryList();

    const syncTheme = () => {
      setResolvedTheme(applyThemeToDocument(themeMode, media?.matches ?? false));
    };

    syncTheme();

    if (themeMode !== 'system' || media === null) {
      return;
    }

    const handleMediaChange = () => {
      syncTheme();
    };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleMediaChange);
      return () => {
        media.removeEventListener('change', handleMediaChange);
      };
    }
    media.addListener(handleMediaChange);
    return () => {
      media.removeListener(handleMediaChange);
    };
  }, [themeMode]);

  const updateThemeMode = (nextThemeMode: ThemeMode) => {
    setThemeMode(nextThemeMode);
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, nextThemeMode);
  };

  return {
    themeMode,
    resolvedTheme,
    setThemeMode: updateThemeMode
  };
};
