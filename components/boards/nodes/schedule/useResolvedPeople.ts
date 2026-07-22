'use client'

import { useEffect, useState } from 'react'
import type { ResolvedSchedulePerson, SchedulePersonRef } from '@/lib/types'
import { resolveSchedulePeople } from '@/lib/actions/schedule-people'

export const refKey = (ref: SchedulePersonRef) => `${ref.type}:${ref.id}`

export function useResolvedPeople(allRefs: SchedulePersonRef[]) {
  const [directory, setDirectory] = useState<Record<string, ResolvedSchedulePerson>>({})
  const missingKey = allRefs.filter(r => !directory[refKey(r)]).map(refKey).join(',')

  useEffect(() => {
    if (!missingKey) return
    const missing = allRefs.filter(r => !directory[refKey(r)])
    if (missing.length === 0) return
    let cancelled = false
    resolveSchedulePeople(missing).then(people => {
      if (cancelled) return
      setDirectory(prev => {
        const next = { ...prev }
        for (const p of people) next[refKey(p.ref)] = p
        return next
      })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey])

  const upsert = (person: ResolvedSchedulePerson) => {
    setDirectory(prev => ({ ...prev, [refKey(person.ref)]: person }))
  }

  return { directory, upsert }
}
