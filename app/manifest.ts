import type { MetadataRoute } from 'next'
import { C } from '@/lib/admin-theme'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Leafilms',
    short_name: 'Leafilms',
    description: 'Leafilms interne business-plattform',
    start_url: '/admin',
    scope: '/',
    display: 'standalone',
    background_color: C.bg,
    theme_color: C.bg,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
