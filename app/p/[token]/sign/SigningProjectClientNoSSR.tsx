'use client'

import dynamic from 'next/dynamic'

const SigningProjectClient = dynamic(
  () => import('./SigningProjectClient').then((m) => m.SigningProjectClient),
  { ssr: false }
)

export default SigningProjectClient
