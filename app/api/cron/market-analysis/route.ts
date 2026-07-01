import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { runMarketAnalysis } from '@/lib/services/market-analysis-agent'
import type { MarketLead } from '@/lib/types'

export const maxDuration = 300

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'lead'
}

async function saveLeadsFromAnalysis(customers: MarketLead[]) {
  const serviceClient = createServiceClient()

  // Hent alle eksisterende selskaper for å unngå duplikater
  const { data: existing } = await serviceClient
    .from('leads')
    .select('company')
    .not('company', 'is', null)

  const existingCompanies = new Set(
    (existing ?? []).map(l => l.company?.toLowerCase().trim())
  )

  // Hent task-maler for lead-steget
  const { data: templates } = await serviceClient
    .from('task_templates')
    .select('*')
    .eq('pipeline_stage', 'lead')
    .order('sort_order', { ascending: true })

  let created = 0

  for (const customer of customers) {
    const companyKey = customer.company?.toLowerCase().trim()
    if (companyKey && existingCompanies.has(companyKey)) continue

    const projectTitle = customer.company || customer.name
    const slug = slugify(projectTitle) + '-' + Date.now().toString(36).slice(-5)

    const { data: project, error: projectError } = await serviceClient
      .from('projects')
      .insert({
        title: projectTitle,
        slug,
        pipeline_stage: 'lead',
        status: 'draft',
        language: 'no',
        client_name: null,
      })
      .select('id')
      .single()

    if (projectError || !project) {
      console.error('saveLeadsFromAnalysis: project insert feilet', projectError?.message)
      continue
    }

    const { error: leadError } = await serviceClient
      .from('leads')
      .insert({
        name: customer.name,
        company: customer.company || null,
        email: null,
        phone: null,
        source: 'markedsanalyse',
        status: 'new',
        website: customer.website || null,
        reason: customer.reason || null,
        sales_points: customer.sales_points ?? [],
        cold_email: customer.cold_email || null,
        converted_to_project_id: project.id,
      })

    if (leadError) {
      console.error('saveLeadsFromAnalysis: lead insert feilet', leadError.message)
      await serviceClient.from('projects').delete().eq('id', project.id)
      continue
    }

    if (templates && templates.length > 0) {
      await serviceClient.from('tasks').insert(
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

    existingCompanies.add(companyKey ?? '')
    created++
  }

  return created
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  const { data: record, error: insertError } = await serviceClient
    .from('market_analyses')
    .insert({ status: 'running', triggered_by: 'cron' })
    .select()
    .single()

  if (insertError) {
    console.error('Cron: could not create analysis record', insertError)
    return Response.json({ error: 'DB error' }, { status: 500 })
  }

  try {
    const results = await runMarketAnalysis()

    const leadsCreated = await saveLeadsFromAnalysis(results.customers)

    await serviceClient
      .from('market_analyses')
      .update({ status: 'done', results, completed_at: new Date().toISOString() })
      .eq('id', record.id)

    return Response.json({ ok: true, leads: results.customers.length, leads_created: leadsCreated })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await serviceClient
      .from('market_analyses')
      .update({ status: 'error', error_message: message, completed_at: new Date().toISOString() })
      .eq('id', record.id)

    console.error('Cron markedsanalyse feilet:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
