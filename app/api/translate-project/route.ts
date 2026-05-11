import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { requireAdmin } from '@/lib/auth/admin'
import { createServiceClient } from '@/lib/supabase-server'

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

// Text fields to translate per section type
const TRANSLATABLE_FIELDS: Record<string, string[]> = {
  hero: ['text', 'subtitle', 'sectionLabel'],
  goal: ['text', 'subtitle', 'sectionLabel'],
  concept: ['text', 'subtitle', 'sectionLabel'],
  timeline: ['sectionLabel'], // items handled separately
  deliverables: ['text', 'sectionLabel'], // items handled separately
  contact: ['text', 'sectionLabel'],
  team: ['text', 'sectionLabel'],
  moodboard: ['text', 'sectionLabel'],
  example_work: ['text', 'sectionLabel'],
  cases: ['text', 'title', 'subtitle', 'sectionLabel'],
  quote: ['text', 'sectionLabel'],
  full_image: ['text', 'caption', 'sectionLabel'],
  production_schedule: ['text', 'title', 'subtitle', 'partnerSubtitle', 'sectionLabel'],
}

async function translateText(text: string, targetLanguage: 'no' | 'en', openai: OpenAI): Promise<string> {
  if (!text || !text.trim()) return text

  const systemPrompt = targetLanguage === 'en'
    ? 'You are a professional translator. Translate the following text to English. Preserve formatting and tone. Return only the translated text, nothing else.'
    : 'Du er en profesjonell oversetter. Oversett følgende tekst til norsk bokmål. Bevar formattering og tone. Returner kun den oversatte teksten, ingenting annet.'

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ],
    temperature: 0.3,
    max_tokens: 600
  })

  return completion.choices[0].message.content?.trim() || text
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin()
    if (!admin.ok) return admin.response

    const { projectId, targetLanguage } = await req.json()

    if (!projectId || !targetLanguage) {
      return Response.json({ error: 'Mangler projectId eller targetLanguage' }, { status: 400 })
    }

    if (targetLanguage !== 'no' && targetLanguage !== 'en') {
      return Response.json({ error: 'Ugyldig språk' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const openai = getOpenAIClient()

    // Fetch all sections
    const { data: sections, error: sectionsError } = await supabase
      .from('sections')
      .select('*')
      .eq('project_id', projectId)

    if (sectionsError || !sections) {
      return Response.json({ error: 'Kunne ikke hente seksjoner' }, { status: 500 })
    }

    // Fetch all team members once for team card translations
    const { data: allTeamMembers, error: teamMembersError } = await supabase
      .from('team_members')
      .select('id, role, bio')

    if (teamMembersError) {
      return Response.json({ error: 'Kunne ikke hente team-medlemmer' }, { status: 500 })
    }

    const teamMemberMap = new Map(
      (allTeamMembers || []).map((member: { id: string; role: string | null; bio: string | null }) => [member.id, member])
    )

    // Translate each section
    for (const section of sections) {
      const content = { ...(section.content || {}) }
      const fields = TRANSLATABLE_FIELDS[section.type] || []
      let changed = false

      // Translate simple text fields
      for (const field of fields) {
        if (content[field] && typeof content[field] === 'string') {
          content[field] = await translateText(content[field], targetLanguage, openai)
          changed = true
        }
      }

      // Translate timeline items
      if (section.type === 'timeline' && Array.isArray(content.timelineItems)) {
        content.timelineItems = await Promise.all(
          content.timelineItems.map(async (item: { title: string; text: string }) => ({
            title: item.title ? await translateText(item.title, targetLanguage, openai) : item.title,
            text: item.text ? await translateText(item.text, targetLanguage, openai) : item.text,
          }))
        )
        changed = true
      }

      // Translate deliverable items
      if (section.type === 'deliverables' && Array.isArray(content.deliverableItems)) {
        content.deliverableItems = await Promise.all(
          content.deliverableItems.map(async (item: { id: string; title: string; quantity: string; format: string; description: string }) => ({
            ...item,
            title: item.title ? await translateText(item.title, targetLanguage, openai) : item.title,
            description: item.description ? await translateText(item.description, targetLanguage, openai) : item.description,
          }))
        )
        changed = true
      }

      if (section.type === 'team') {
        if (targetLanguage === 'en') {
          const { data: teamLinks, error: teamLinksError } = await supabase
            .from('section_team_members')
            .select('team_member_id')
            .eq('section_id', section.id)

          if (teamLinksError) {
            return Response.json({ error: 'Kunne ikke hente valgte team-medlemmer' }, { status: 500 })
          }

          const teamMemberCardTranslations: Record<string, { role: string; bio: string }> = {}
          for (const link of teamLinks || []) {
            const teamMemberId = link.team_member_id
            const member = teamMemberMap.get(teamMemberId)
            if (!member) continue

            const role = member.role ? await translateText(member.role, targetLanguage, openai) : ''
            const bio = member.bio ? await translateText(member.bio, targetLanguage, openai) : ''
            teamMemberCardTranslations[teamMemberId] = { role, bio }
          }

          content.teamMemberCardTranslations = teamMemberCardTranslations
          changed = true

          if (content.teamMemberRoles && typeof content.teamMemberRoles === 'object') {
            const teamMemberRolesEn: Record<string, string> = {}
            for (const [memberId, roleText] of Object.entries(content.teamMemberRoles)) {
              if (typeof roleText !== 'string' || !roleText.trim()) continue
              teamMemberRolesEn[memberId] = await translateText(roleText, targetLanguage, openai)
            }
            content.teamMemberRolesEn = teamMemberRolesEn
            changed = true
          }
        } else {
          if (content.teamMemberCardTranslations) {
            delete content.teamMemberCardTranslations
            changed = true
          }
          if (content.teamMemberRolesEn) {
            delete content.teamMemberRolesEn
            changed = true
          }
        }
      }

      if (changed) {
        const { error: updateError } = await supabase
          .from('sections')
          .update({ content, updated_at: new Date().toISOString() })
          .eq('id', section.id)

        if (updateError) {
          console.error('[translate-project] Error updating section:', updateError)
          return Response.json({ error: 'Kunne ikke lagre oversatt seksjon' }, { status: 500 })
        }
      }
    }

    // Update project language
    const { error: projectUpdateError } = await supabase
      .from('projects')
      .update({ language: targetLanguage, updated_at: new Date().toISOString() })
      .eq('id', projectId)

    if (projectUpdateError) {
      console.error('[translate-project] Error updating project language:', projectUpdateError)
      return Response.json({ error: 'Kunne ikke lagre prosjektspråk' }, { status: 500 })
    }

    return Response.json({ success: true, language: targetLanguage })
  } catch (error: any) {
    console.error('[translate-project] Error:', error)
    return Response.json({ error: 'Oversettelse feilet' }, { status: 500 })
  }
}
