import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { ThemeSelect } from '@/components/theme-select';
import type { Locale } from '@/lib/i18n';

export function baseOptions(locale: Locale): BaseLayoutProps {
  return {
    i18n: true,
    themeSwitch: {
      enabled: true,
      component: <ThemeSelect locale={locale} />,
    },
    githubUrl: 'https://github.com/sigee-min/bbmcp',
    links: [
      {
        text: locale === 'ko' ? 'MCP 가이드' : 'MCP Guide',
        url: `/${locale}/docs`,
      },
    ],
    nav: {
      title: 'bbmcp',
      url: `/${locale}`,
    },
  };
}
