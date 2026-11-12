'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'

export function StatisticsRefresh() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <Button variant="secondary" size="sm" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
    {pending ? 'Oppdaterer…' : 'Oppdater'}
  </Button>
}
