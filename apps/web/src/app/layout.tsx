import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'Ashfox Dashboard',
  description: 'Ashfox multi-tenant dashboard and API shell'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="dashboard-body">
        {children}
      </body>
    </html>
  );
}
