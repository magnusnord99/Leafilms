'use client'

import type { ScheduleCardPageData } from '@/lib/actions/boards'
import ScheduleCardPage from '@/components/boards/nodes/schedule/ScheduleCardPage'

export default function ScheduleCardPageClient({ initial }: { initial: ScheduleCardPageData }) {
  return <ScheduleCardPage initial={initial} backHref={`/admin/boards/${initial.boardId}`} />
}
