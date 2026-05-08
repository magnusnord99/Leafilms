'use client'

import dynamic from 'next/dynamic'

const PublicProjectClient = dynamic(
  () => import('./PublicProjectClient').then((m) => m.PublicProjectClient),
  { ssr: false }
)

export default PublicProjectClient
