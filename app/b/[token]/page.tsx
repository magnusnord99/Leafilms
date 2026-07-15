import { notFound } from 'next/navigation'
import { getSharedBoard } from '@/lib/actions/boards'
import SharedBoardClient from './SharedBoardClient'

export default async function SharedBoardPage({ params, searchParams }: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ board?: string }>
}) {
  const { token } = await params
  const { board } = await searchParams
  const data = await getSharedBoard(token, board)
  if (!data) notFound()
  return <SharedBoardClient token={token} data={data} />
}
