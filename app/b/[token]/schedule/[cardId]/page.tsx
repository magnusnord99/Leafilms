import { notFound } from 'next/navigation'
import { getSharedScheduleCard } from '@/lib/actions/boards'
import ScheduleCardPage from '@/components/boards/nodes/schedule/ScheduleCardPage'
import { CINEMATIC_PALETTE } from '../../SharedBoardClient'

export default async function SharedScheduleCardPage({ params }: {
  params: Promise<{ token: string; cardId: string }>
}) {
  const { token, cardId } = await params
  const data = await getSharedScheduleCard(token, cardId)
  if (!data) notFound()
  return <ScheduleCardPage initial={data} readOnly backHref={`/b/${token}?board=${data.boardId}`} palette={CINEMATIC_PALETTE} />
}
