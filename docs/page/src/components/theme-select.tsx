'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Monitor, Moon, Sun } from 'lucide-react';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from 'fumadocs-ui/components/ui/popover';
import { useTheme } from 'next-themes';
import type { Locale } from '@/lib/i18n';

type ThemeMode = 'light' | 'dark' | 'system';

type ThemeOption = {
  value: ThemeMode;
  label: string;
  icon: typeof Sun;
};

const optionsByLocale: Record<Locale, ThemeOption[]> = {
  en: [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ],
  ko: [
    { value: 'light', label: '라이트', icon: Sun },
    { value: 'dark', label: '다크', icon: Moon },
    { value: 'system', label: '시스템', icon: Monitor },
  ],
};

export function ThemeSelect({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  const options = optionsByLocale[locale];
  const currentValue: ThemeMode = theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system';
  const current = useMemo(
    () => options.find((option) => option.value === currentValue) ?? options[2],
    [currentValue, options],
  );

  const CurrentIcon = current.icon;
  const chooseThemeLabel = locale === 'ko' ? '테마' : 'Theme';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={chooseThemeLabel}
        className={buttonVariants({
          color: 'ghost',
          className: 'gap-1.5 p-1.5',
        })}
      >
        <CurrentIcon className="size-4.5" />
        <span className="max-sm:hidden">{current.label}</span>
        <ChevronDown className="size-3 text-fd-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 overflow-hidden p-0">
        <p className="border-b px-2 py-1.5 text-xs font-medium text-fd-muted-foreground">{chooseThemeLabel}</p>
        <div className="p-1">
          {options.map((option) => {
            const Icon = option.icon;
            const selected = currentValue === option.value;

            return (
              <button
                key={option.value}
                type="button"
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                  selected
                    ? 'bg-fd-primary/10 font-medium text-fd-primary'
                    : 'text-fd-foreground hover:bg-fd-accent hover:text-fd-accent-foreground'
                }`}
                onClick={() => {
                  setTheme(option.value);
                  setOpen(false);
                }}
              >
                <Icon className="size-4" />
                <span className="flex-1">{option.label}</span>
                {selected ? <Check className="size-4" /> : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
