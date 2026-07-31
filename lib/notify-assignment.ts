import { createClient, createServiceClient } from '@/lib/supabase-server'

/**
 * Sender et tildelingsvarsel til en bruker. Hopper over selv-tildeling.
 * Feil logges og svelges — varsling skal aldri blokkere hovedhandlingen.
 */
export async function notifyAssignment(opts: {
  recipientId: string
  type: 'task_assigned' | 'task_turn_ready' | 'lead_assigned' | 'quote_assigned' | 'invoice_assigned' | 'quote_mention' | 'resale_assigned' | 'pitch_review_requested' | 'pitch_review_responded' | 'quote_review_requested' | 'quote_review_responded' | 'gallery_review_requested' | 'gallery_review_responded'
  projectId: string | null
  taskId?: string | null
  leadId?: string | null
  galleryId?: string | null
  galleryReviewId?: string | null
  preview: string
  /**
   * Avsenders navn, hvis allerede kjent (unngår et profiles-oppslag).
   * Nyttig når man kaller notifyAssignment flere ganger på rad (f.eks. i en
   * loop over flere mottakere) — hent avsenderens profil én gang i kallstedet
   * og send den inn her i stedet for at hvert kall gjør sitt eget oppslag.
   */
  senderName?: string
}): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.id === opts.recipientId) return

    let senderName = opts.senderName
    if (senderName === undefined) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, email')
        .eq('id', user.id)
        .single()
      senderName = profile?.name ?? profile?.email ?? 'Ukjent'
    }

    const service = createServiceClient()
    await service.from('notifications').insert({
      user_id: opts.recipientId,
      type: opts.type,
      project_id: opts.projectId,
      task_id: opts.taskId ?? null,
      lead_id: opts.leadId ?? null,
      gallery_id: opts.galleryId ?? null,
      gallery_review_id: opts.galleryReviewId ?? null,
      message_preview: opts.preview.slice(0, 200),
      sender_name: senderName || 'Ukjent',
    })
  } catch (err) {
    console.error('notifyAssignment error:', err)
  }
}
