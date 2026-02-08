'use client';

import { type ReactNode, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Provider } from '@/components/provider';
import { docsI18nUI, isLocale, type Locale } from '@/lib/i18n';

const LOCALE_STORAGE_KEY = 'ashfox.docs.locale';

type LocalizedProviderProps = {
  locale: Locale;
  children: ReactNode;
};

export function LocalizedProvider({ locale, children }: LocalizedProviderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const i18nProps = useMemo(() => {
    const base = docsI18nUI.provider(locale);

    return {
      ...base,
      onLocaleChange: (nextLocale: string) => {
        if (!isLocale(nextLocale)) return;

        if (typeof window !== 'undefined') {
          window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
        }

        const segments = pathname.split('/').filter((segment) => segment.length > 0);
        if (segments.length === 0) {
          router.push(`/${nextLocale}`);
          return;
        }

        segments[0] = nextLocale;
        router.push(`/${segments.join('/')}`);
      },
    };
  }, [locale, pathname, router]);

  return <Provider i18n={i18nProps}>{children}</Provider>;
}

