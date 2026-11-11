import TaskChatPanel from '@/components/task/TaskChatPanel'
import { getFlyerChat } from '@/lib/actions/flyer-chat'
import { AdminThemeProvider } from '@/lib/admin-theme-provider'

export async function FlyerChat({ flyerId, slug, forceOpen }: { flyerId: string; slug: string; forceOpen: boolean }) {
  let chat: Awaited<ReturnType<typeof getFlyerChat>>
  try {
    chat = await getFlyerChat(flyerId)
  } catch (error) {
    console.error('FlyerChat:', error)
    return <p role="alert" className="fixed right-4 top-20 z-[96] rounded bg-neutral-900 p-3 text-sm text-white">Intern chat kunne ikke lastes. Last siden på nytt for å prøve igjen.</p>
  }
  if (!chat) return null
  return <AdminThemeProvider fullHeight={false}><TaskChatPanel taskId={chat.conversationId} conversationId={chat.conversationId}
    taskTitle={`Flyer · ${slug}`} currentUserId={chat.currentUserId} profiles={chat.profiles}
    initialUnread={chat.unread} forceOpen={forceOpen} triggerTop={72} /></AdminThemeProvider>
}
