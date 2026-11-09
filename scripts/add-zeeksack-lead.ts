import { readFile } from 'fs/promises'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

// One-off import for a single lead, mirrors scripts/add-prospect-leads.ts
// (which mirrors lib/actions/leads.ts createLead()), run server-side with
// the service role key since there's no authenticated request context.

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'lead'
}

async function loadEnv() {
  try {
    const envFile = await readFile(join(process.cwd(), '.env.local'), 'utf-8')
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const [key, ...rest] = trimmed.split('=')
      if (key && rest.length > 0 && !process.env[key]) {
        process.env[key] = rest.join('=').replace(/^["']|["']$/g, '')
      }
    }
  } catch {
    // .env.local not found, use existing env
  }
}

const lead = {
  name: 'David Brudö',
  company: 'Zeeksack',
  website: 'zeeksack.com',
  reason:
    'Svensk DTC-merke (Göteborg-regionen) grunnlagt av David Brudö, en lydingeniør med 250+ reisedager i året som til slutt brant ut. Produktene er organiserte ryggsekker (€79–€149), 200 000+ kunder, 4,8/5 på Trustpilot, 51K Instagram-følgere. Sterkt skandinavisk visuelt uttrykk. Merkevarehistorien og Leafilms sitt landskap (fjord/fjell/midnattssol, lavpuls cinematisk stil) er en ekstremt god match — vurdert som en av de best-kalibrerte pitchene denne sesjonens markedsanalyse har funnet. Risiko: lite bootstrap-selskap der performance-reklame (Meta/Google) sannsynligvis dominerer budsjettet. De har allerede investert i video gjennom Tomcy Agency + Elite Media, så det er en konkurrent å utfordre, ikke et videoneri.',
  sales_points: [
    'Merkevarens eget slagord "Stress-free travel starts here" matcher Norge som visuell stressfri-destinasjon perfekt — konseptet "The Norwegian Edit" (produktene i fjord/fjell/midnattssol, lavpuls og filmisk, ikke action)',
    'Grunnleggerens egen historie (lydingeniør, 250+ reisedager, utbrenthet) gir en ekte, personlig fortelling å bygge merkevarefilm rundt',
    '200 000+ kunder og 4,8/5 på Trustpilot — etablert og tillitsbygget merke, ikke en uprøvd oppstart',
    'Allerede investert i videoinnhold (Tomcy Agency, Elite Media) — viser at de prioriterer film, men ingen av dagens leverandører kan levere norsk natur/lys',
    'Budsjett er hovedrisikoen — litt bootstrap-selskap der Meta/Google-performance sannsynligvis tar mesteparten; lede pitchen med konseptet, ikke produksjonsbudsjettet',
  ],
  notes:
    'Lead identifisert og analysert via markedsanalyse 2026-11-08. Anbefalt prioritet: medium. Anbefalt tidspunkt for outreach: januar 2027, når Black Weeks er over og de begynner å planlegge vår-/sommerinnhold. Fullt lead-dokument med analyse ligger som Zeeksack_Lead_2026-11-08.docx. Kontaktperson David Brudö er oppført som medgrunnlegger/styreleder i Zeeksack AB, men har hovedrolle som CEO i Remente (Göteborg) — direkte e-post ikke bekreftet, sjekk zeeksack.com sin kontaktside eller LinkedIn før utsending.',
  cold_email:
    'Subject: The Norwegian Edit — a film for Zeeksack\n\nHi David,\n\n"Stress-free travel starts here" is a great line, and I think it deserves a visual home that matches it. Right now your products are shot well, but mostly in places built for speed and noise, not calm.\n\nI\'m Magnus from LEAfilms, an Oslo-based production company. We make cinematic brand films, drone footage and photography for brands like Breitling, Porsche and ASICS. Norway is arguably the world\'s best visual setting for "stress-free" — fjords, mountains, midnight sun — and a low-pulse, slow film shot here could say more about Zeeksack than any fast-cut travel edit.\n\nWe\'d call it "The Norwegian Edit": your bags in the landscape that invented stillness. I\'d love to send over a short concept and a few relevant examples — no pressure, just worth a look ahead of next season\'s content planning.\n\nWould a quick call make sense in the new year?\n\nBest regards,\nMagnus\nLEAfilms\nleafilms.no',
  temperature: 'lukewarm' as const,
}

async function main() {
  await loadEnv()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ikke satt i .env.local')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: templates } = await supabase
    .from('task_templates')
    .select('*')
    .eq('pipeline_stage', 'lead')
    .order('sort_order', { ascending: true })

  const projectTitle = lead.company
  const slug = slugify(projectTitle) + '-' + Date.now().toString(36).slice(-5)

  const { data: project, error: projectError } = await supabase
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
    console.error(`❌ ${lead.company}: prosjekt-feil`, projectError)
    process.exit(1)
  }

  const { data: leadRow, error: leadError } = await supabase
    .from('leads')
    .insert({
      name: lead.name,
      company: lead.company,
      email: null,
      phone: null,
      source: 'market_analysis',
      notes: lead.notes,
      status: 'new',
      converted_to_project_id: project.id,
      website: lead.website,
      reason: lead.reason,
      sales_points: lead.sales_points,
      cold_email: lead.cold_email,
      temperature: lead.temperature,
    })
    .select('id')
    .single()

  if (leadError || !leadRow) {
    console.error(`❌ ${lead.company}: lead-feil`, leadError)
    await supabase.from('projects').delete().eq('id', project.id)
    process.exit(1)
  }

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

  console.log(`✅ ${lead.company} — lead ${leadRow.id} / prosjekt ${project.id}`)
}

main().catch(err => {
  console.error('❌ Uventet feil:', err.message)
  process.exit(1)
})
