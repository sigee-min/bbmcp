import { LandingPage } from '@/components/landing/landing-page';
import { getLandingCopy } from '@/lib/content/landing';
import { isLocale, locales } from '@/lib/i18n';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

type LocalizedHomePageProps = {
  params: Promise<{
    lang: string;
  }>;
};

export async function generateMetadata({ params }: LocalizedHomePageProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) {
    return {};
  }

  if (lang === 'ko') {
    return {
      title: 'bbmcp',
      description: 'bbmcp MCP 도구로 모델링, 텍스처링, 애니메이션, 검증 워크플로우를 표준화하세요.',
    };
  }

  return {
    title: 'bbmcp',
    description: 'Use bbmcp MCP tools to standardize modeling, texturing, animation, and validation workflows.',
  };
}

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export default async function HomePage({ params }: LocalizedHomePageProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return <LandingPage locale={lang} copy={getLandingCopy(lang)} />;
}
