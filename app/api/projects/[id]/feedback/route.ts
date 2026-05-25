import { NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const serviceClient = createServiceClient()

    const { data, error } = await serviceClient
      .from('pitch_feedback')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('GET /feedback error:', error)
      return Response.json({ error: 'Kunne ikke hente innspill' }, { status: 500 })
    }

    return Response.json({ feedback: data })
  } catch (err) {
    console.error('GET /feedback error:', err)
    return Response.json({ error: 'Serverfeil' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const { content, author_name, share_token, section_id } = await req.json()

    // Valider input
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return Response.json({ error: 'Innspill kan ikke vaere tomt' }, { status: 400 })
    }
    if (!author_name || typeof author_name !== 'string' || author_name.trim().length === 0) {
      return Response.json({ error: 'Navn er paakrevd' }, { status: 400 })
    }
    if (!share_token || typeof share_token !== 'string') {
      return Response.json({ error: 'Ugyldig tilgang' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Verifiser at share_token er gyldig og tilhorer dette prosjektet
    const { data: share, error: shareError } = await serviceClient
      .from('project_shares')
      .select('project_id')
      .eq('token', share_token.trim())
      .single()

    if (shareError || !share || share.project_id !== projectId) {
      return Response.json({ error: 'Ugyldig tilgang' }, { status: 403 })
    }

    // Sett inn feedback
    const { data, error } = await serviceClient
      .from('pitch_feedback')
      .insert({
        project_id: projectId,
        section_id: section_id || null,
        share_token: share_token.trim(),
        author_name: author_name.trim(),
        content: content.trim(),
      })
      .select()
      .single()

    if (error) {
      console.error('POST /feedback insert error:', error)
      return Response.json({ error: 'Kunne ikke lagre innspill' }, { status: 500 })
    }

    return Response.json({ feedback: data }, { status: 201 })
  } catch (err) {
    console.error('POST /feedback error:', err)
    return Response.json({ error: 'Serverfeil' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const supabase = await createClient()

    // Kun autentiserte brukere (admin) kan slette
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Ikke autentisert' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const feedbackId = searchParams.get('feedbackId')
    if (!feedbackId) {
      return Response.json({ error: 'feedbackId er paakrevd' }, { status: 400 })
    }

    const serviceClient = createServiceClient()
    const { error } = await serviceClient
      .from('pitch_feedback')
      .delete()
      .eq('id', feedbackId)
      .eq('project_id', projectId)

    if (error) {
      console.error('DELETE /feedback error:', error)
      return Response.json({ error: 'Kunne ikke slette innspill' }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('DELETE /feedback error:', err)
    return Response.json({ error: 'Serverfeil' }, { status: 500 })
  }
}
