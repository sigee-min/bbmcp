'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { isLocale, localeLabels, type Locale } from '@/lib/i18n';

const LOCALE_STORAGE_KEY = 'bbmcp.docs.locale';
const FALLBACK_LOCALE: Locale = 'en';

function detectPreferredLocale(): Locale {
  if (typeof window === 'undefined') return FALLBACK_LOCALE;

  const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved && isLocale(saved)) return saved;

  const browserLocale = window.navigator.language.toLowerCase();
  if (browserLocale.startsWith('ko')) return 'ko';
  return FALLBACK_LOCALE;
}

export function LocaleRedirect() {
  useEffect(() => {
    const locale = detectPreferredLocale();
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    window.location.replace(`./${locale}/`);
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">bbmcp</h1>
      <p className="text-sm text-fd-muted-foreground">Choose your language</p>
      <div className="flex gap-3">
        {(Object.entries(localeLabels) as Array<[Locale, string]>).map(([locale, label]) => (
          <Link
            key={locale}
            href={`/${locale}`}
            className="rounded-md border border-fd-border bg-fd-card px-4 py-2 text-sm font-medium hover:bg-fd-accent hover:text-fd-accent-foreground"
          >
            {label}
          </Link>
        ))}
      </div>
    </main>
  );
}
