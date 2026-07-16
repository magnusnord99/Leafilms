import { NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

async function assertParticipant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('conversation_participants')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('profile_id', userId)
    .maybeSingle()
  return !!data
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Ikke autentisert' }, { status: 401 })
    }

    if (!(await assertParticipant(supabase, conversationId, user.id))) {
      return Response.json({ error: 'Ikke tilgang til denne samtalen' }, { status: 403 })
    }

    const serviceClient = createServiceClient()
    const { data, error } = await serviceClient
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(200)

    if (error) {
      return Response.json({ error: 'Kunne ikke hente meldinger' }, { status: 500 })
    }

    return Response.json({ messages: data })
  } catch (err) {
    console.error('GET /messages error:', err)
    return Response.json({ error: 'Serverfeil' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Ikke autentisert' }, { status: 401 })
    }

    if (!(await assertParticipant(supabase, conversationId, user.id))) {
      return Response.json({ error: 'Ikke tilgang til denne samtalen' }, { status: 403 })
    }

    const { content } = await req.json()
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return Response.json({ error: 'Melding kan ikke være tom' }, { status: 400 })
    }

    const serviceClient = createServiceClient()
    const { data, error } = await serviceClient
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: content.trim(),
      })
      .select()
      .single()

    if (error) {
      return Response.json({ error: 'Kunne ikke sende melding' }, { status: 500 })
    }

    return Response.json({ message: data }, { status: 201 })
  } catch (err) {
    console.error('POST /messages error:', err)
    return Response.json({ error: 'Serverfeil' }, { status: 500 })
  }
}
