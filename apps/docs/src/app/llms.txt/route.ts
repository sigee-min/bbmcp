import { source } from '@/lib/source';
import { defaultLocale } from '@/lib/i18n';
import { docIntentLabels, docIntentOrder, inferDocIntent } from '@/lib/llm';
import { toAbsoluteUrl } from '@/lib/site';

export const revalidate = false;

const docsPath = (locale: string, slugs: string[]): string =>
  `/${locale}/docs${slugs.length > 0 ? `/${slugs.join('/')}` : ''}`;

export async function GET() {
  const pages = source
    .getPages()
    .map((page) => {
      const locale = page.locale ?? defaultLocale;
      const url = toAbsoluteUrl(docsPath(locale, page.slugs));
      const summary =
        typeof page.data.summary === 'string' && page.data.summary.trim().length > 0
          ? page.data.summary.trim()
          : page.data.description;
      return {
        locale,
        intent: inferDocIntent(page.slugs),
        title: page.data.title,
        summary,
        url,
      };
    })
    .sort((a, b) => a.url.localeCompare(b.url));

  const groupedPages = new Map<
    (typeof docIntentOrder)[number],
    Array<{
      locale: string;
      intent: (typeof docIntentOrder)[number];
      title: string;
      summary?: string;
      url: string;
    }>
  >();
  for (const intent of docIntentOrder) {
    groupedPages.set(intent, []);
  }
  for (const page of pages) {
    groupedPages.get(page.intent)?.push(page);
  }

  const lines: string[] = [
    '# Ashfox Docs for LLM Retrieval',
    '',
    `home: ${toAbsoluteUrl('/en')}`,
    `full-text: ${toAbsoluteUrl('/llms-full.txt')}`,
    'locales: en, ko',
    '',
    'selection-guide:',
    '- Prefer pages in the same locale as the user query.',
    '- Use Task Guides for procedures, Tool Reference for parameters, Troubleshooting for failures.',
    '',
  ];

  for (const intent of docIntentOrder) {
    const entries = groupedPages.get(intent);
    if (!entries || entries.length === 0) continue;

    lines.push(`## ${docIntentLabels[intent]}`);
    entries.forEach((page) => {
      lines.push(`- [${page.locale}] ${page.title}: ${page.url}`);
      if (page.summary) lines.push(`  summary: ${page.summary}`);
    });
    lines.push('');
  }

  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
