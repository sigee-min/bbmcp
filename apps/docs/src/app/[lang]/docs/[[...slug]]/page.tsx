import { getPageImage, source } from '@/lib/source';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { isLocale } from '@/lib/i18n';
import { inferDocIntent } from '@/lib/llm';
import {
  localizedAlternates,
  localizedPath,
  openGraphAlternateLocales,
  openGraphLocale,
  siteName,
  siteTitle,
  toAbsoluteUrl,
} from '@/lib/site';

type DocsPageProps = {
  params: Promise<{
    lang: string;
    slug?: string[];
  }>;
};

export default async function Page({ params }: DocsPageProps) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();

  const page = source.getPage(slug, lang);
  if (!page) notFound();

  const docsSuffix = slug?.length ? `/docs/${slug.join('/')}` : '/docs';
  const pageUrl = toAbsoluteUrl(`/${lang}${docsSuffix}`);
  const summary = typeof page.data.summary === 'string' && page.data.summary.trim().length > 0
    ? page.data.summary.trim()
    : page.data.description;
  const docSchema = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: page.data.title,
    description: summary,
    inLanguage: lang,
    url: pageUrl,
    about: inferDocIntent(page.slugs),
    isPartOf: {
      '@type': 'WebSite',
      name: siteName,
      url: toAbsoluteUrl(`/${lang}`),
    },
  };
  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{summary}</DocsDescription>
      <DocsBody>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(docSchema) }}
        />
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams('slug', 'lang');
}

export async function generateMetadata({ params }: DocsPageProps): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();

  const page = source.getPage(slug, lang);
  if (!page) notFound();
  const docsSuffix = slug?.length ? `/docs/${slug.join('/')}` : '/docs';
  const pageUrl = localizedPath(lang, docsSuffix);
  const pageImage = getPageImage(page).url;
  const summary = typeof page.data.summary === 'string' && page.data.summary.trim().length > 0
    ? page.data.summary.trim()
    : undefined;
  const noindex = page.data.noindex === true;
  const description = summary ?? page.data.description;

  return {
    title:
      page.data.title === siteTitle
        ? {
            absolute: siteTitle,
          }
        : page.data.title,
    description,
    robots: noindex ? { index: false, follow: false } : undefined,
    alternates: {
      canonical: pageUrl,
      languages: localizedAlternates(docsSuffix),
    },
    openGraph: {
      type: 'article',
      siteName,
      title: page.data.title,
      description,
      url: pageUrl,
      locale: openGraphLocale(lang),
      alternateLocale: openGraphAlternateLocales(lang),
      images: [
        {
          url: pageImage,
          alt: `${page.data.title} | ${siteName}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: page.data.title,
      description,
      images: [pageImage],
    },
  };
}
