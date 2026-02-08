import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import { isLocale } from '@/lib/i18n';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

type HomeLayoutProps = {
  children: ReactNode;
  params: Promise<{
    lang: string;
  }>;
};

export default async function Layout({ children, params }: HomeLayoutProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return <HomeLayout {...baseOptions(lang)}>{children}</HomeLayout>;
}
