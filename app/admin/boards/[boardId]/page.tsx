import { notFound } from 'next/navigation'
import { getBoardData } from '@/lib/actions/boards'
import BoardPageClient from './BoardPageClient'

export default async function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params
  const data = await getBoardData(boardId)
  if (!data) notFound()
  return <BoardPageClient initial={data} />
}
