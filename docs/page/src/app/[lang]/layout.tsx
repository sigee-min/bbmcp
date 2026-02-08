import { LocalizedProvider } from '@/components/localized-provider';
import { isLocale, locales } from '@/lib/i18n';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

type LangLayoutProps = {
  children: ReactNode;
  params: Promise<{
    lang: string;
  }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export default async function LangLayout({ children, params }: LangLayoutProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return <LocalizedProvider locale={lang}>{children}</LocalizedProvider>;
}
