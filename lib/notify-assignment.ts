import { createClient, createServiceClient } from '@/lib/supabase-server'

/**
 * Sender et tildelingsvarsel til en bruker. Hopper over selv-tildeling.
 * Feil logges og svelges — varsling skal aldri blokkere hovedhandlingen.
 */
export async function notifyAssignment(opts: {
  recipientId: string
  type: 'task_assigned' | 'lead_assigned' | 'quote_assigned' | 'invoice_assigned' | 'quote_mention' | 'pitch_review_requested' | 'pitch_review_responded' | 'quote_review_requested' | 'quote_review_responded'
  projectId: string | null
  taskId?: string | null
  leadId?: string | null
  preview: string
}): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.id === opts.recipientId) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', user.id)
      .single()

    const service = createServiceClient()
    await service.from('notifications').insert({
      user_id: opts.recipientId,
      type: opts.type,
      project_id: opts.projectId,
      task_id: opts.taskId ?? null,
      lead_id: opts.leadId ?? null,
      message_preview: opts.preview.slice(0, 200),
      sender_name: profile?.name ?? profile?.email ?? 'Ukjent',
    })
  } catch (err) {
    console.error('notifyAssignment error:', err)
  }
}
