import type { MetadataRoute } from 'next';
// Browser installation metadata; offline caching is handled separately by the service worker.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: 'CeresGaiaSystems', short_name: 'CGS',
    description: 'Your fields, crops and saved data, available offline.',
    start_url: '/', scope: '/', display: 'standalone',
    background_color: '#18271f', theme_color: '#286649',
    icons: [
      { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
