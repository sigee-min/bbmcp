import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ashfox',
    short_name: 'ashfox',
    description: 'ashfox MCP tools for Blockbench modeling, texturing, animation, and validation workflows.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0f18',
    theme_color: '#0a0f18',
    icons: [
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}

