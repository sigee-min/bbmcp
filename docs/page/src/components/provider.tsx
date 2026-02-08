'use client';
import SearchDialog from '@/components/search';
import { RootProvider, type RootProviderProps } from 'fumadocs-ui/provider/next';
import { type ReactNode } from 'react';

type ProviderProps = {
  children: ReactNode;
  i18n?: RootProviderProps['i18n'];
};

export function Provider({ children, i18n }: ProviderProps) {
  return (
    <RootProvider
      search={{ SearchDialog }}
      theme={{
        enabled: true,
        attribute: 'class',
        defaultTheme: 'system',
        enableSystem: true,
      }}
      i18n={i18n}
    >
      {children}
    </RootProvider>
  );
}
