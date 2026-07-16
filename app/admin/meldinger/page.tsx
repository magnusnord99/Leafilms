import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getConversations } from '@/lib/actions/messages'
import { getAllProfiles } from '@/lib/actions/pipeline'
import { MeldingerClient } from './MeldingerClient'

export default async function MeldingerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, email, color')
    .eq('id', user.id)
    .single()

  const [conversations, profiles] = await Promise.all([
    getConversations(),
    getAllProfiles(),
  ])

  return (
    <MeldingerClient
      currentUser={{
        id: user.id,
        name: profile?.name ?? null,
        email: profile?.email ?? user.email ?? '',
        color: profile?.color ?? null,
      }}
      initialConversations={conversations}
      allProfiles={profiles.filter((p) => p.id !== user.id)}
    />
  )
}
