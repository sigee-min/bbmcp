import type { Locale } from '@/lib/i18n';

export const siteName = 'ashfox';
export const siteTitle = 'ashfox';
export const siteDescription = 'ashfox MCP tools for Blockbench modeling, texturing, animation, and validation workflows.';

const rawBasePath = process.env.DOCS_BASE_PATH?.trim() ?? '';
export const basePath =
  rawBasePath && rawBasePath !== '/' ? `/${rawBasePath.replace(/^\/+|\/+$/g, '')}` : '';

export function withBasePath(pathname: string): string {
  if (!pathname.startsWith('/')) return `${basePath}/${pathname}`;
  return `${basePath}${pathname}`;
}

export function resolveMetadataBase(): URL {
  const fallback = new URL('http://localhost:3000');
  const raw = process.env.DOCS_SITE_URL?.trim();
  if (!raw) return fallback;

  try {
    return new URL(raw);
  } catch {
    return fallback;
  }
}

export function openGraphLocale(locale: Locale): string {
  switch (locale) {
    case 'ko':
      return 'ko_KR';
    case 'en':
    default:
      return 'en_US';
  }
}

export function openGraphAlternateLocales(locale: Locale): string[] {
  return locale === 'ko' ? ['en_US'] : ['ko_KR'];
}

export function localizedPath(locale: Locale, suffix = ''): string {
  const normalizedSuffix =
    suffix.length === 0 ? '' : suffix.startsWith('/') ? suffix : `/${suffix}`;
  return withBasePath(`/${locale}${normalizedSuffix}`);
}

export function localizedAlternates(suffix = ''): Record<string, string> {
  const normalizedSuffix =
    suffix.length === 0 ? '' : suffix.startsWith('/') ? suffix : `/${suffix}`;
  return {
    en: withBasePath(`/en${normalizedSuffix}`),
    ko: withBasePath(`/ko${normalizedSuffix}`),
    'x-default': withBasePath(`/en${normalizedSuffix}`),
  };
}

export const defaultOpenGraphImage = withBasePath('/ashfox.png');

