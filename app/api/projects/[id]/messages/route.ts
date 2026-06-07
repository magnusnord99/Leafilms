import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { createServiceClient } from '@/lib/supabase-server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()
    const { data, error } = await serviceClient
      .from('project_messages')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(100)

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const { content } = await req.json()
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return Response.json({ error: 'Melding kan ikke være tom' }, { status: 400 })
    }

    const { data: profile } = await auth.supabase
      .from('profiles')
      .select('name, email')
      .eq('id', auth.user.id)
      .single()

    const userName = profile?.name || profile?.email || auth.user.email || 'Ukjent'

    const serviceClient = createServiceClient()
    const { data, error } = await serviceClient
      .from('project_messages')
      .insert({
        project_id: projectId,
        user_id: auth.user.id,
        user_name: userName,
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
