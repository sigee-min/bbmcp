import { defineI18n } from 'fumadocs-core/i18n';
import { defineI18nUI } from 'fumadocs-ui/i18n';

export const locales = ['en', 'ko'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export const docsI18n = defineI18n({
  languages: [...locales],
  defaultLanguage: defaultLocale,
  parser: 'dir',
  hideLocale: 'never',
  fallbackLanguage: defaultLocale,
});

export const docsI18nUI = defineI18nUI(docsI18n, {
  translations: {
    en: {
      displayName: 'English',
      search: 'Search docs',
      searchNoResult: 'No matching results',
      toc: 'On this page',
      tocNoHeadings: 'No headings',
      lastUpdate: 'Last updated',
      chooseLanguage: 'Language',
      nextPage: 'Next page',
      previousPage: 'Previous page',
      chooseTheme: 'Theme',
      editOnGithub: 'Edit on GitHub',
    },
    ko: {
      displayName: '한국어',
      search: '문서 검색',
      searchNoResult: '검색 결과가 없습니다',
      toc: '이 페이지에서',
      tocNoHeadings: '헤딩이 없습니다',
      lastUpdate: '최근 업데이트',
      chooseLanguage: '언어',
      nextPage: '다음 문서',
      previousPage: '이전 문서',
      chooseTheme: '테마',
      editOnGithub: 'GitHub에서 수정',
    },
  },
});

export const localeLabels: Record<Locale, string> = {
  en: 'English',
  ko: '한국어',
};

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}
