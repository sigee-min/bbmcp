import Image from 'next/image';
import Link from 'next/link';
import { BookText, Github, Hammer, Home } from 'lucide-react';
import type { Locale } from '@/lib/i18n';

type SiteFooterProps = {
  locale: Locale;
};

const copyByLocale = {
  en: {
    product: 'Product',
    resources: 'Resources',
    docs: 'Docs',
    home: 'Home',
    install: 'Install',
    tools: 'Tool Reference',
    issues: 'Issues',
    releases: 'Releases',
    tagline: 'Production-ready MCP tooling for Blockbench teams.',
  },
  ko: {
    product: 'Product',
    resources: 'Resources',
    docs: 'Docs',
    home: 'Home',
    install: 'Install',
    tools: 'Tool Reference',
    issues: 'Issues',
    releases: 'Releases',
    tagline: 'Production-ready MCP tooling for Blockbench teams.',
  },
} as const;

export function SiteFooter({ locale }: SiteFooterProps) {
  const copy = copyByLocale[locale];

  return (
    <footer className="bb-site-footer mt-auto border-t border-fd-border/80">
      <div className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-10 sm:py-12">
        <div className="grid gap-8 md:grid-cols-[1.45fr_1fr_1fr]">
          <div className="space-y-3">
            <Link href={`/${locale}`} className="inline-flex items-center gap-2.5 text-base font-semibold">
              <span className="inline-flex size-[42px] items-center justify-center rounded-lg border border-fd-border bg-fd-card">
                <Image src="/logo_fullbackground_light.png" alt="" width={29} height={29} className="rounded-[7px] dark:hidden" />
                <Image
                  src="/logo_fullbackground_dark.png"
                  alt=""
                  width={29}
                  height={29}
                  className="hidden rounded-[7px] dark:inline-block"
                />
              </span>
              <span>Ashfox</span>
            </Link>
            <p className="max-w-sm text-sm leading-relaxed text-fd-muted-foreground">{copy.tagline}</p>
            <p className="text-xs text-fd-muted-foreground">ashfox.sigee.xyz</p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fd-muted-foreground">{copy.product}</p>
            <div className="flex flex-col gap-2 text-sm">
              <Link
                href={`/${locale}`}
                className="inline-flex items-center gap-2 text-fd-muted-foreground transition-colors hover:text-fd-foreground"
              >
                <Home className="size-4" />
                <span>{copy.home}</span>
              </Link>
              <Link
                href={`/${locale}/docs`}
                className="inline-flex items-center gap-2 text-fd-muted-foreground transition-colors hover:text-fd-foreground"
              >
                <BookText className="size-4" />
                <span>{copy.docs}</span>
              </Link>
              <Link
                href={`/${locale}/docs/users/blockbench-plugin/installation`}
                className="inline-flex items-center gap-2 text-fd-muted-foreground transition-colors hover:text-fd-foreground"
              >
                <Hammer className="size-4" />
                <span>{copy.install}</span>
              </Link>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fd-muted-foreground">{copy.resources}</p>
            <div className="flex flex-col gap-2 text-sm">
              <Link
                href={`/${locale}/docs/users/tool-reference`}
                className="text-fd-muted-foreground transition-colors hover:text-fd-foreground"
              >
                {copy.tools}
              </Link>
              <a
                href="https://github.com/sigee-min/ashfox/issues"
                target="_blank"
                rel="noreferrer"
                className="text-fd-muted-foreground transition-colors hover:text-fd-foreground"
              >
                {copy.issues}
              </a>
              <a
                href="https://github.com/sigee-min/ashfox/releases"
                target="_blank"
                rel="noreferrer"
                className="text-fd-muted-foreground transition-colors hover:text-fd-foreground"
              >
                {copy.releases}
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-fd-border/70 pt-5 text-xs text-fd-muted-foreground">
          <p>© {new Date().getFullYear()} Ashfox. All rights reserved.</p>
          <a
            href="https://github.com/sigee-min/ashfox"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-fd-foreground"
          >
            <Github className="size-3.5" />
            <span>GitHub</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
