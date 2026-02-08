import { getPageImage, source } from '@/lib/source';
import { isLocale } from '@/lib/i18n';
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { generate as DefaultImage } from 'fumadocs-ui/og';

export const revalidate = false;

type RouteProps = {
  params: Promise<{
    lang: string;
    slug: string[];
  }>;
};

export async function GET(_req: Request, { params }: RouteProps) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();

  const page = source.getPage(slug.slice(0, -1), lang);
  if (!page) notFound();

  return new ImageResponse(
    <DefaultImage title={page.data.title} description={page.data.description} site="bbmcp" />,
    {
      width: 1200,
      height: 630,
    },
  );
}

export function generateStaticParams() {
  return source
    .generateParams('slug', 'lang')
    .map(({ lang, slug }) => ({ lang, slug: [...slug, 'image.png'] }));
}
