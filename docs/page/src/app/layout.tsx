import type { Metadata } from 'next';
import './global.css';

function resolveMetadataBase() {
  const fallback = new URL('http://localhost:3000');
  const raw = process.env.DOCS_SITE_URL?.trim();
  if (!raw) return fallback;

  try {
    return new URL(raw);
  } catch {
    return fallback;
  }
}

const metadataBase = resolveMetadataBase();

export const metadata: Metadata = {
  title: {
    default: 'bbmcp',
    template: '%s | bbmcp',
  },
  description: 'bbmcp MCP tools for Blockbench modeling, texturing, animation, and validation workflows.',
  metadataBase,
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col antialiased">{children}</body>
    </html>
  );
}
