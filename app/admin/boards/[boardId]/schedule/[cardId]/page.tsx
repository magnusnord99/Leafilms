import { notFound } from 'next/navigation'
import { getScheduleCardData } from '@/lib/actions/boards'
import ScheduleCardPageClient from './ScheduleCardPageClient'

export default async function ScheduleCardPage({ params }: { params: Promise<{ boardId: string; cardId: string }> }) {
  const { boardId, cardId } = await params
  const data = await getScheduleCardData(cardId)
  if (!data || data.boardId !== boardId) notFound()
  return <ScheduleCardPageClient initial={data} />
}
