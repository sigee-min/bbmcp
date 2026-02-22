import type { Metadata } from 'next';
import { defaultOpenGraphImage, resolveMetadataBase, siteDescription, siteName, siteTitle, withBasePath } from '@/lib/site';
import './global.css';

const metadataBase = resolveMetadataBase();

export const metadata: Metadata = {
  title: {
    default: siteTitle,
    template: `%s | ${siteTitle}`,
  },
  description: siteDescription,
  applicationName: siteName,
  metadataBase,
  alternates: {
    canonical: withBasePath('/en'),
  },
  openGraph: {
    type: 'website',
    siteName,
    title: siteTitle,
    description: siteDescription,
    url: withBasePath('/en'),
    images: [
      {
        url: defaultOpenGraphImage,
        alt: `${siteName} preview`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: [defaultOpenGraphImage],
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicons/favicon-light.ico', media: '(prefers-color-scheme: light)' },
      { url: '/favicons/favicon-dark.ico', media: '(prefers-color-scheme: dark)' },
      { url: '/favicons/favicon-16x16-light.png', sizes: '16x16', type: 'image/png', media: '(prefers-color-scheme: light)' },
      { url: '/favicons/favicon-16x16-dark.png', sizes: '16x16', type: 'image/png', media: '(prefers-color-scheme: dark)' },
      { url: '/favicons/favicon-32x32-light.png', sizes: '32x32', type: 'image/png', media: '(prefers-color-scheme: light)' },
      { url: '/favicons/favicon-32x32-dark.png', sizes: '32x32', type: 'image/png', media: '(prefers-color-scheme: dark)' },
      { url: '/favicons/favicon-192x192-light.png', sizes: '192x192', type: 'image/png' },
      { url: '/favicons/favicon-512x512-light.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicons/favicon-light.ico',
    apple: [{ url: '/favicons/favicon-180x180-light.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col antialiased">{children}</body>
    </html>
  );
}
