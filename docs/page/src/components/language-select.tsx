'use client';

import { Check, ChevronDown, Languages } from 'lucide-react';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { isLocale, localeLabels, locales, type Locale } from '@/lib/i18n';

const LOCALE_STORAGE_KEY = 'ashfox.docs.locale';

export function LanguageSelect({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const chooseLanguageLabel = locale === 'ko' ? '언어' : 'Language';

  useEffect(() => {
    if (!open) return;

    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || !rootRef.current) return;
      if (!rootRef.current.contains(target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('pointerdown', handleOutsidePointer);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handleOutsidePointer);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const onSelectLocale = (nextLocale: Locale) => {
    if (nextLocale === locale) {
      setOpen(false);
      return;
    }

    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);

    const segments = pathname.split('/').filter((segment) => segment.length > 0);
    if (segments.length === 0) {
      router.push(`/${nextLocale}`);
      setOpen(false);
      return;
    }

    if (isLocale(segments[0])) {
      segments[0] = nextLocale;
    } else {
      segments.unshift(nextLocale);
    }

    router.push(`/${segments.join('/')}`);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={chooseLanguageLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className={buttonVariants({
          color: 'ghost',
          className: 'gap-1.5 p-1.5',
        })}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Languages className="size-4.5" />
        <span className="max-sm:hidden">{localeLabels[locale]}</span>
        <ChevronDown className={`size-3 text-fd-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={chooseLanguageLabel}
          className="absolute right-0 z-40 mt-1.5 w-40 overflow-hidden rounded-md border border-fd-border bg-fd-popover p-0 shadow-lg"
        >
          <p className="border-b px-2 py-1.5 text-xs font-medium text-fd-muted-foreground">{chooseLanguageLabel}</p>
          <div className="p-1">
            {locales.map((item) => {
              const selected = item === locale;

              return (
                <button
                  key={item}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                    selected
                      ? 'bg-fd-primary/10 font-medium text-fd-primary'
                      : 'text-fd-foreground hover:bg-fd-accent hover:text-fd-accent-foreground'
                  }`}
                  onClick={() => onSelectLocale(item)}
                >
                  <span className="flex-1">{localeLabels[item]}</span>
                  {selected ? <Check className="size-4" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

