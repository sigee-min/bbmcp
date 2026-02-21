import type { MetadataRoute } from 'next';
import { withBasePath } from '@/lib/site';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ashfox',
    short_name: 'Ashfox',
    description: 'Ashfox MCP tools for Blockbench modeling, texturing, animation, and validation workflows.',
    start_url: withBasePath('/en'),
    display: 'standalone',
    background_color: '#0a0f18',
    theme_color: '#0a0f18',
    icons: [
      {
        src: '/favicon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/favicon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
