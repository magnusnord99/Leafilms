import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getAuthenticatedStaffUser } from '@/lib/auth/staff'
import { getOpenAIClient, translateText } from '@/lib/services/translate'

// Oversetter rolle/bio for ett eller flere team-medlemmer og slår dem inn i
// team-seksjonens teamMemberCardTranslations — brukt når et medlem legges til
// eller redigeres ETTER at "Oversett hele prosjektet" allerede er kjørt, slik
// at kortet ikke lenger stille faller tilbake til norsk. Se feedback f02401d6.
export async function POST(req: NextRequest) {
  try {
    const staff = await getAuthenticatedStaffUser()
    if (!staff.ok) {
      return Response.json({ error: 'Ikke autentisert' }, { status: 401 })
    }

    const { sectionId, teamMemberIds } = await req.json()
    if (!sectionId || !Array.isArray(teamMemberIds) || teamMemberIds.length === 0) {
      return Response.json({ error: 'Mangler sectionId eller teamMemberIds' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: section, error: sectionError } = await supabase
      .from('sections')
      .select('id, type, content')
      .eq('id', sectionId)
      .single()

    if (sectionError || !section || section.type !== 'team') {
      return Response.json({ error: 'Fant ikke team-seksjonen' }, { status: 404 })
    }

    const { data: members, error: membersError } = await supabase
      .from('team_members')
      .select('id, role, bio')
      .in('id', teamMemberIds)

    if (membersError) {
      return Response.json({ error: 'Kunne ikke hente team-medlemmer' }, { status: 500 })
    }

    const openai = getOpenAIClient()
    const content = { ...(section.content || {}) }
    const teamMemberCardTranslations: Record<string, { role: string; bio: string }> = {
      ...(content.teamMemberCardTranslations || {}),
    }

    for (const member of members || []) {
      const role = member.role ? await translateText(member.role, 'en', openai) : ''
      const bio = member.bio ? await translateText(member.bio, 'en', openai) : ''
      teamMemberCardTranslations[member.id] = { role, bio }
    }

    content.teamMemberCardTranslations = teamMemberCardTranslations

    const { error: updateError } = await supabase
      .from('sections')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', sectionId)

    if (updateError) {
      return Response.json({ error: 'Kunne ikke lagre oversettelsen' }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('POST /api/translate-project/team-member error:', err)
    return Response.json({ error: 'Serverfeil' }, { status: 500 })
  }
}
