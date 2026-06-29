import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getFeedback } from '@/lib/actions/feedback'
import { FeedbackList } from './FeedbackList'

export default async function FeedbackPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { items, error } = await getFeedback()

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#181920', padding: '32px 24px', fontFamily: 'var(--font-dm-sans)' }}>
        <p style={{ color: '#C05050', fontSize: '0.85rem' }}>Databasefeil: {error}</p>
        <p style={{ color: '#8484A0', fontSize: '0.75rem', marginTop: 8 }}>
          Har du kjørt <code style={{ background: '#2A2A38', padding: '2px 6px', borderRadius: 4 }}>supabase db push</code>?
        </p>
      </div>
    )
  }

  return <FeedbackList initialItems={items} />
}
