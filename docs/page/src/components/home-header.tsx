'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BookText, Github } from 'lucide-react';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { LanguageSelect } from '@/components/language-select';
import { ThemeSelect } from '@/components/theme-select';
import type { Locale } from '@/lib/i18n';

export function HomeHeader({ locale }: { locale: Locale }) {
  const [isHidden, setIsHidden] = useState(false);
  const lastScrollYRef = useRef(0);
  const tickingRef = useRef(false);
  const docsLabel = locale === 'ko' ? '문서' : 'Docs';

  useEffect(() => {
    if (typeof window === 'undefined') return;

    lastScrollYRef.current = window.scrollY;

    const onScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;

      window.requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const deltaY = currentY - lastScrollYRef.current;
        const minDelta = 10;
        const hideStartY = 72;
        lastScrollYRef.current = currentY;

        if (currentY <= 0) {
          setIsHidden(false);
        } else if (Math.abs(deltaY) >= minDelta) {
          if (deltaY > 0 && currentY > hideStartY) {
            setIsHidden(true);
          } else if (deltaY < 0) {
            setIsHidden(false);
          }
        }

        tickingRef.current = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 border-b bg-fd-background/80 backdrop-blur-lg transition-transform duration-500 ease-out will-change-transform ${
        isHidden ? '-translate-y-full' : 'translate-y-0'
      }`}
    >
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href={`/${locale}`} className="inline-flex items-center gap-2 text-base font-semibold">
          <Image src="/favicon-32x32.png" alt="" width={32} height={32} className="rounded-[5px]" />
          <span>ashfox</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <Link href={`/${locale}/docs`} className={buttonVariants({ color: 'ghost', className: 'gap-1.5 px-2.5 text-sm' })}>
            <BookText className="size-4" />
            <span>{docsLabel}</span>
          </Link>
          <ThemeSelect locale={locale} />
          <LanguageSelect locale={locale} />
          <a
            href="https://github.com/sigee-min/ashfox"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className={buttonVariants({ color: 'ghost', size: 'icon' })}
          >
            <Github className="size-4.5" />
          </a>
        </div>
      </div>
    </header>
  );
}

