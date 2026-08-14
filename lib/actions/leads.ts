'use server'

import { createClient } from '@/lib/supabase-server'
import { notifyAssignment } from '@/lib/notify-assignment'
import { revalidatePath } from 'next/cache'
import Anthropic from '@anthropic-ai/sdk'

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'lead'
}

export async function createLead(data: {
  name: string
  company: string
  email: string
  phone: string
  website: string
  source: string
  reason: string
  sales_points: string[]
  notes: string
  quote_assignee_id?: string
}): Promise<{ leadId: string; projectId: string } | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const projectTitle = data.company.trim() || data.name.trim()
    const slug = slugify(projectTitle) + '-' + Date.now().toString(36).slice(-5)

    // 1. Opprett prosjekt i 'lead'-steget
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        title: projectTitle,
        slug,
        pipeline_stage: 'lead',
        status: 'draft',
        language: 'no',
        client_name: null,
        quote_assignee_id: data.quote_assignee_id ?? null,
      })
      .select('id')
      .single()

    if (projectError || !project) {
      console.error('createLead project error:', projectError)
      return null
    }

    // 2. Opprett lead med basis-kolonner (alltid tilgjengelige)
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        name: data.name.trim(),
        company: data.company.trim() || null,
        email: data.email.trim() || null,
        phone: data.phone.trim() || null,
        source: data.source || null,
        notes: stripHtml(data.notes) ? data.notes.trim() : null,
        status: 'new',
        converted_to_project_id: project.id,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single()

    if (leadError || !lead) {
      console.error('createLead lead error:', leadError)
      await supabase.from('projects').delete().eq('id', project.id)
      return null
    }

    // 3. Prøv å oppdatere med berikede felter (krever migration 048)
    //    Feiler stille hvis kolonnene ikke eksisterer ennå
    const enriched: Record<string, unknown> = {}
    if (data.website.trim()) enriched.website = data.website.trim()
    if (data.reason.trim()) enriched.reason = data.reason.trim()
    const points = data.sales_points.filter(s => s.trim())
    if (points.length > 0) enriched.sales_points = points

    if (Object.keys(enriched).length > 0) {
      await supabase.from('leads').update(enriched).eq('id', lead.id)
        .then(({ error }) => {
          if (error) console.warn('createLead enriched update skipped (run migration 048):', error.message)
        })
    }

    // 4. Seed lead-stage tasks
    try {
      const { data: templates } = await supabase
        .from('task_templates')
        .select('*')
        .eq('pipeline_stage', 'lead')
        .order('sort_order', { ascending: true })

      if (templates && templates.length > 0) {
        await supabase.from('tasks').insert(
          templates.map((t: { title: string; description: string | null; sort_order: number }) => ({
            project_id: project.id,
            pipeline_stage: 'lead',
            title: t.title,
            description: t.description ?? null,
            status: 'todo',
            sort_order: t.sort_order,
          }))
        )
      }
    } catch { /* ikke kritisk */ }

    // Send varsel til tilbud-ansvarlig hvis satt ved opprettelse
    if (data.quote_assignee_id) {
      await notifyAssignment({
        recipientId: data.quote_assignee_id,
        type: 'quote_assigned',
        projectId: project.id,
        preview: projectTitle,
      })
    }

    revalidatePath('/admin/projects')
    revalidatePath('/admin/leads')

    return { leadId: lead.id, projectId: project.id }
  } catch (err) {
    console.error('createLead unexpected:', err)
    return null
  }
}

// Notater lagres som HTML (rik tekst) — strippes til ren tekst før den sendes til Claude.
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// Kortfattet AI-sammendrag av interne notater på en lead som ennå ikke er opprettet
// (ingen lead-id å persistere mot) — kun til hjelp for den som fyller ut skjemaet.
export async function analyzeLeadNotes(
  notes: string,
  leadName: string
): Promise<{ sammendrag: string } | { error: string }> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return { error: 'AI-analyse er ikke konfigurert.' }
    const plainNotes = stripHtml(notes)
    if (!plainNotes) return { error: 'Ingen notater å analysere.' }
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: 'Du er en assistent for et norsk film- og fotoproduksjonsselskap. Du oppsummerer interne notater om en salgs-lead til et kort, lettlest sammendrag. Svar KUN med et JSON-objekt — ingen markdown-fences, ingen tekst før eller etter.',
      messages: [{
        role: 'user',
        content: `Lead: "${leadName || 'Ukjent'}"\n\nInterne notater:\n${plainNotes}\n\nSkriv et sammenhengende sammendrag på 2-4 setninger (vanlig løpende tekst, ikke punktliste) som dekker det viktigste: hvem leaden er, hva de er interessert i, og eventuelle konkrete detaljer (budsjett, tidslinje, kontaktperson) hvis nevnt.\n\nSvar med nøyaktig dette JSON-objektet:\n{"sammendrag": "..."}`
      }]
    })

    const raw = (response.content.find(b => b.type === 'text')?.text ?? '').trim()
    if (!raw) return { error: 'Fikk ikke noe svar fra AI-tjenesten.' }

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    let parsed: { sammendrag?: string } = {}
    try {
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    } catch {
      parsed = {}
    }

    const sammendrag = (parsed.sammendrag ?? raw).trim()
    if (!sammendrag) return { error: 'Fikk ikke noe svar fra AI-tjenesten.' }
    return { sammendrag }
  } catch (err) {
    console.error('analyzeLeadNotes error:', err)
    if (err instanceof Anthropic.APIError && err.status === 400 && /credit balance/i.test(err.message)) {
      return { error: 'AI-tjenesten har ikke nok kreditt. Kontakt en administrator.' }
    }
    return { error: 'Kunne ikke analysere akkurat nå. Prøv igjen senere.' }
  }
}

export type LeadStatus = 'new' | 'contacted' | 'meeting_booked' | 'converted' | 'lost'

export type LeadRecord = {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  website: string | null
  source: string | null
  status: LeadStatus
  reason: string | null
  sales_points: string[]
  cold_email: string | null
  notes: string | null
  assigned_to: string | null
  converted_to_project_id: string | null
  created_at: string
  updated_at: string
}

export async function getLeadById(leadId: string): Promise<LeadRecord | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()
    if (error) { console.error('getLeadById:', error); return null }
    return data as LeadRecord
  } catch (err) {
    console.error('getLeadById unexpected:', err)
    return null
  }
}

export async function getLeadByProjectId(projectId: string): Promise<LeadRecord | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('converted_to_project_id', projectId)
      .maybeSingle()
    if (error) { console.error('getLeadByProjectId:', error); return null }
    return (data as LeadRecord) ?? null
  } catch (err) {
    console.error('getLeadByProjectId unexpected:', err)
    return null
  }
}

export async function getAllLeads(): Promise<LeadRecord[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { console.error('getAllLeads:', error); return [] }
    return (data ?? []) as LeadRecord[]
  } catch (err) {
    console.error('getAllLeads unexpected:', err)
    return []
  }
}

export async function updateLeadStatus(leadId: string, status: LeadStatus): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', leadId)
    revalidatePath('/admin/leads')
  } catch (err) {
    console.error('updateLeadStatus unexpected:', err)
  }
}

export async function updateLead(leadId: string, data: {
  name: string
  company: string
  email: string
  phone: string
  website: string
  source: string
  reason: string
  sales_points: string[]
}): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('leads')
      .update({
        name: data.name.trim(),
        company: data.company.trim() || null,
        email: data.email.trim() || null,
        phone: data.phone.trim() || null,
        website: data.website.trim() || null,
        source: data.source || null,
        reason: data.reason.trim() || null,
        sales_points: data.sales_points.filter(s => s.trim()),
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)
    if (error) { console.error('updateLead:', error); return false }
    revalidatePath('/admin/leads')
    revalidatePath(`/admin/leads/${leadId}`)
    return true
  } catch (err) {
    console.error('updateLead unexpected:', err)
    return false
  }
}

export async function updateLeadNotes(leadId: string, notes: string): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('leads')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', leadId)
  } catch (err) {
    console.error('updateLeadNotes unexpected:', err)
  }
}

export async function assignLead(leadId: string, profileId: string | null): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: lead } = await supabase
      .from('leads')
      .select('name, company, converted_to_project_id')
      .eq('id', leadId)
      .single()

    await supabase
      .from('leads')
      .update({ assigned_to: profileId, updated_at: new Date().toISOString() })
      .eq('id', leadId)

    if (profileId && lead) {
      await notifyAssignment({
        recipientId: profileId,
        type: 'lead_assigned',
        projectId: lead.converted_to_project_id,
        leadId,
        preview: lead.company || lead.name,
      })
    }

    revalidatePath('/admin/leads')
  } catch (err) {
    console.error('assignLead unexpected:', err)
  }
}

export type LeadListItem = LeadRecord & {
  assigned_profile: { id: string; name: string | null; email: string } | null
  open_tasks: number
}

export async function getLeadsWithMeta(): Promise<LeadListItem[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('leads')
      .select('*, assigned_profile:profiles!leads_assigned_to_fkey ( id, name, email )')
      .order('created_at', { ascending: false })
    if (error) { console.error('getLeadsWithMeta:', error); return [] }

    const leads = (data ?? []) as unknown as (LeadRecord & {
      assigned_profile: { id: string; name: string | null; email: string } | null
    })[]

    const projectIds = leads
      .map(l => l.converted_to_project_id)
      .filter((id): id is string => !!id)

    const openByProject: Record<string, number> = {}
    if (projectIds.length > 0) {
      const { data: openTasks } = await supabase
        .from('tasks')
        .select('project_id')
        .in('project_id', projectIds)
        .neq('status', 'done')
      for (const t of openTasks ?? []) {
        openByProject[t.project_id] = (openByProject[t.project_id] ?? 0) + 1
      }
    }

    return leads.map(l => ({
      ...l,
      open_tasks: l.converted_to_project_id
        ? openByProject[l.converted_to_project_id] ?? 0
        : 0,
    }))
  } catch (err) {
    console.error('getLeadsWithMeta unexpected:', err)
    return []
  }
}

export async function deleteLead(leadId: string): Promise<boolean> {
  try {
    const supabase = await createClient()

    const { data: lead } = await supabase
      .from('leads')
      .select('converted_to_project_id')
      .eq('id', leadId)
      .single()

    await supabase.from('leads').delete().eq('id', leadId)

    if (lead?.converted_to_project_id) {
      await supabase.from('projects').delete().eq('id', lead.converted_to_project_id)
    }

    revalidatePath('/admin/leads')
    revalidatePath('/admin/projects')
    return true
  } catch (err) {
    console.error('deleteLead unexpected:', err)
    return false
  }
}
