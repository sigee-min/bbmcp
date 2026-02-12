import type { MetadataRoute } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import { source } from '@/lib/source';
import { defaultLocale, locales } from '@/lib/i18n';
import { toAbsoluteUrl } from '@/lib/site';

export const dynamic = 'force-static';

const docsPath = (locale: string, slugs: string[]): string =>
  `/${locale}/docs${slugs.length > 0 ? `/${slugs.join('/')}` : ''}`;

const docsContentRoot = path.join(process.cwd(), 'apps', 'docs', 'content', 'docs');

function resolveLastModified(locale: string, slugs: string[]): Date | null {
  const base = path.join(docsContentRoot, locale, ...slugs);
  const candidates = [
    `${base}.mdx`,
    `${base}.md`,
    path.join(base, 'index.mdx'),
    path.join(base, 'index.md'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.statSync(candidate).mtime;
    }
  }

  return null;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];
  const seen = new Set<string>();
  let latestModified = new Date(0);

  locales.forEach((locale) => {
    const homeUrl = toAbsoluteUrl(`/${locale}`);
    const homeModified = resolveLastModified(locale, []);
    if (!seen.has(homeUrl)) {
      entries.push({ url: homeUrl, lastModified: homeModified ?? now });
      seen.add(homeUrl);
    }
    if (homeModified && homeModified > latestModified) latestModified = homeModified;
  });

  source.getPages().forEach((page) => {
    const locale = page.locale ?? defaultLocale;
    const url = toAbsoluteUrl(docsPath(locale, page.slugs));
    const lastModified = resolveLastModified(locale, page.slugs) ?? now;
    if (seen.has(url)) return;
    entries.push({ url, lastModified });
    seen.add(url);
    if (lastModified > latestModified) latestModified = lastModified;
  });

  const discoveryModified = latestModified.getTime() > 0 ? latestModified : now;
  const llmsTxt = toAbsoluteUrl('/llms.txt');
  const llmsFull = toAbsoluteUrl('/llms-full.txt');
  if (!seen.has(llmsTxt)) {
    entries.push({ url: llmsTxt, lastModified: discoveryModified });
    seen.add(llmsTxt);
  }
  if (!seen.has(llmsFull)) {
    entries.push({ url: llmsFull, lastModified: discoveryModified });
    seen.add(llmsFull);
  }

  return entries;
}
