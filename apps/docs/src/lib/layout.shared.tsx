import Image from 'next/image';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { ThemeSelect } from '@/components/theme-select';
import type { Locale } from '@/lib/i18n';

export function baseOptions(locale: Locale): BaseLayoutProps {
  const navTitle = (
    <span className="inline-flex items-center gap-2.5">
      <Image src="/logo_fullbackground_light.png" alt="" width={24} height={24} className="rounded-[6px] dark:hidden" />
      <Image
        src="/logo_fullbackground_dark.png"
        alt=""
        width={24}
        height={24}
        className="hidden rounded-[6px] dark:inline-block"
      />
      <span>Ashfox</span>
    </span>
  );

  return {
    i18n: true,
    themeSwitch: {
      enabled: true,
      component: <ThemeSelect locale={locale} />,
    },
    githubUrl: 'https://github.com/sigee-min/ashfox',
    links: [
      {
        text: locale === 'ko' ? 'MCP 가이드' : 'MCP Guide',
        url: `/${locale}/docs`,
      },
    ],
    nav: {
      title: navTitle,
      url: `/${locale}`,
    },
  };
}
