import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const admin = await requireAdmin()
    if (!admin.ok) return admin.response

    const { data, error } = await admin.supabase
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
    const admin = await requireAdmin()
    if (!admin.ok) return admin.response

    const { content } = await req.json()
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return Response.json({ error: 'Melding kan ikke være tom' }, { status: 400 })
    }

    const userName = admin.profile.name || admin.profile.email || admin.user.email || 'Ukjent'

    const { data, error } = await admin.supabase
      .from('project_messages')
      .insert({
        project_id: projectId,
        user_id: admin.user.id,
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
