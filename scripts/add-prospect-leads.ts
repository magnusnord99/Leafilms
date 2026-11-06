import { readFile } from 'fs/promises'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

// Mirrors lib/actions/leads.ts createLead() but run server-side with the
// service role key (one-off import, no authenticated request context).

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

type NewLead = {
  name: string
  company: string
  website: string
  reason: string
  sales_points: string[]
  notes: string
  cold_email: string
  temperature: 'cold' | 'lukewarm' | 'warm'
}

const leads: NewLead[] = [
  {
    name: 'Christian Schmidt',
    company: 'Norrøna',
    website: 'norrona.com',
    reason:
      'Norsk premium friluftsmerke (Jørgensen-familien, 4. generasjon) som utvider fra klær til opplevelser. Ny "Arctic Voyage"-lodge på Andørja (15 hytter, 30 gjester, tegnet av Dark Arkitekter) åpner juni 2027 — annonsert sept. 2026. Trenger merkevarefilm av byggeprosessen, dronefoto av øya/båt- og luftankomst, og gjestopplevelse-innhold til lanseringskampanjen. God match med Leafilms sitt ASICS/Breitling-aktige arbeid, og et naturlig løp mot en løpende sesongavtale.',
    sales_points: [
      'Ny lodge på Andørja åpner juni 2027 — planlegging av oppbyggingsinnhold og lanseringskampanje skjer de neste 6-8 månedene',
      'Satser stort på opplevelser i tillegg til klær — trenger film, ikke bare stillbilder',
      'Spektakulær lokasjon (tidligere haiforskningsstasjon) som egner seg sterkt for drone/cinematic',
      'Familieeid merke med lang horisont — potensial for løpende sesonginnhold',
    ],
    notes:
      'Kilde: sgbonline.com pressemelding (sept. 2026). Kontakt: Jørgen Jørgensen (CEO/eier) og Christian Schmidt (Chief Experience Officer) er sitert i annonseringen — ingen markedsføringsansvarlig identifisert, bør sjekkes på LinkedIn. E-postadresse ikke funnet.',
    cold_email:
      'Emne: Andørja – film for Arctic Voyage-historien\n\nHi Christian,\n\nCongratulations on the Andørja lodge announcement. Building around a former basking shark research centre, and calling it the first step of an Arctic Voyage, is a story that deserves to be seen properly, not just photographed.\n\nI\'m Magnus from LEAfilms, an Oslo-based production company. We make cinematic brand films, drone footage and photography for brands like Breitling, Porsche and ASICS, and we also produce Netflix-level quality content when the story calls for it.\n\nWith an opening in June 2027, there is a good window to document the build, the landscape and the arrival by air and boat, so the launch campaign has real material to work with.\n\nWould you be open to a 20-minute call in the coming weeks? I can also send a few relevant examples beforehand.\n\nBest regards,\nMagnus\nLEAfilms\nleafilms.no',
    temperature: 'warm',
  },
  {
    name: 'Kari Traa',
    company: 'Kari Traa',
    website: 'karitraa.com',
    reason:
      'Norsk dame-aktivitetsmerke (grunnlagt av OL-mesteren Kari Traa) som nylig signerte OL-utøvere i freeski/snowboard. Presenterte AW26-kolleksjonen på Oslo Runway i en innendørs vintersportsarena med ekte snø og bakker (sept. 2026) — tydelig investering i store merkevaremomenter. Sterk match med Leafilms sitt ASICS/Olympiatoppen-arbeid: utøverportretter, produkt-i-bevegelse i snø med drone, og recap-filmer fra event som kan leve på sosiale medier og i butikk.',
    sales_points: [
      'Investerer tydelig i store produksjonsmomenter (snø-arena på Oslo Runway, sept. 2026)',
      'Har nylig signert OL-utøvere — naturlig for utøverportretter/historiefortelling',
      'Sterkt overlapp med eksisterende Leafilms-arbeid for ASICS og Olympiatoppen',
      'Vintersesong gir naturlig vindu for produkt-i-snø-innhold med drone',
    ],
    notes:
      'Kilde: voguescandinavia.com (2. sept. 2026), snowindustrynews.com. Kontakt ikke identifisert fra tilgjengelige kilder — søk LinkedIn etter markedssjef/brand director hos Kari Traa før utsending.',
    cold_email:
      'Emne: Kari Traa – film for AW26-momentet\n\nHi [Name],\n\nStaging the AW26 show in an arena with real snow and slopes was a bold way to show what Kari Traa stands for. A moment like that deserves a film that lives well beyond the runway.\n\nI\'m Magnus from LEAfilms in Oslo. We produce cinematic brand films, drone footage and photography for brands such as Breitling, Porsche, ASICS and Netflix, and we know how to make sport and fashion feel like one story.\n\nI think there is a strong opportunity to turn the collection and your athletes into a campaign film for the winter season, shot properly on snow.\n\nWould you be up for a short call, or should I send over a few examples first?\n\nBest regards,\nMagnus\nLEAfilms\nleafilms.no',
    temperature: 'warm',
  },
  {
    name: 'Kine Willumsen',
    company: 'Ytri (Relais & Châteaux)',
    website: 'relaischateaux.com/fr/details/ytri-island-retreat',
    reason:
      'Nytt 38-roms natur- og wellness-hotell i Træna-skjærgården på Helgelandskysten, på Polarsirkelen. Åpnet april 2026, Relais & Châteaux-medlem siden 2025 (fra ca. 398 GBP/natt). Oppføringen er kun bilde-ledet — ingen film er nevnt noe sted. Klart gap: signaturfilm, sesongbasert dronefoto (midnattssol, nordlys, hval og øyer) og sosialt innhold for internasjonale luksusreisende. Direkte match med Leafilms sitt drone- og cinematic-arbeid.',
    sales_points: [
      'Nyåpnet (april 2026) uten noen filmtilstedeværelse i dag — ren bilde-portefølje',
      'Spektakulær, unik lokasjon på Polarsirkelen med sterke sesongmotiv (midnattssol/nordlys/hval)',
      'Del av Relais & Châteaux — internasjonalt luksussegment med budsjett til stedet',
      'Navngitt kontaktperson funnet — lav terskel for første kontakt',
    ],
    notes:
      'Kilde: luxurylondon.co.uk, relaischateaux.com. Kontakt: Kine Willumsen, oppført som "Maître de maison" på Relais & Châteaux-siden. Eiere ikke navngitt i kildene. E-postadresse ikke funnet — sjekk hotellets kontaktside/LinkedIn.',
    cold_email:
      'Emne: Ytri – en film for det ytterste hotellet\n\nHi Kine,\n\nYtri is one of the most striking new hotels in Norway, and the Relais & Châteaux page shows it beautifully in stills. What I couldn\'t find was a film that captures the light, the islands and the feeling of being at the outermost edge.\n\nI\'m Magnus from LEAfilms, an Oslo production company. We make cinematic brand films, drone footage and photography for brands like Breitling, Porsche, ASICS and Netflix.\n\nI\'d love to explore a signature film for Ytri, plus a set of shorter cuts for your seasons and international channels.\n\nWould you be open to a short call, or shall I send some relevant examples?\n\nBest regards,\nMagnus\nLEAfilms\nleafilms.no',
    temperature: 'warm',
  },
  {
    name: 'Svart Eiendom',
    company: 'Svart Eiendom / Six Senses Svart',
    website: 'sixsenses.com',
    reason:
      '94-roms energipositivt hotell ved foten av Svartisen-breen i Arktisk Norge, tegnet av Snøhetta med interiør av Space Copenhagen, drives av Six Senses. Omtales som verdens første energipositive hotell nord for Polarsirkelen. Arkitektur- og bærekrafthistorien er laget for film: dokumentarisk merkevarefilm, dronefoto av bygget på stylter over fjorden, og lanseringsinnhold mot et internasjonalt luksussegment. Typisk budsjettnivå for dette prosjektet er betydelig — men åpningsdato må verifiseres før utsending (pressekilder er eldre og viser flere års forsinkelse).',
    sales_points: [
      'Ambisiøst, Snøhetta-tegnet signaturprosjekt — svært sterkt visuelt/dronepotensial',
      'Internasjonalt luksussegment (Six Senses) med sannsynlig betydelig budsjett',
      'Bærekraft/arkitektur-historien ("energipositivt") er en naturlig dokumentarvinkel',
      'NB: åpningsdato usikker (sent 2026/2027 etter flere års forsinkelse) — status bør bekreftes før kontakt',
    ],
    notes:
      'Kilder: wtravelmagazine.com, attractionsmanagement.com (eldre artikler — verifiser). Neil Jacobs (Six Senses CEO) er sitert men for senior for førstekontakt — se etter Svart Eiendom AS-ledelsen eller pre-opening markedsførings-/kommunikasjonsansvarlig. Verifiser faktisk status/åpningsdato før utsending.',
    cold_email:
      'Emne: Svart – åpningsfilm\n\nHi [Name],\n\nSvart is one of the most ambitious hotel projects in the Nordics, and the story of a building that powers itself above the Arctic Circle is one that should be told on film.\n\nI\'m Magnus from LEAfilms, an Oslo-based production company. We create cinematic brand films, drone footage and photography for brands like Breitling, Porsche, ASICS and Netflix.\n\nAhead of the opening, I think there is a strong case for a film that captures the architecture, the landscape and the idea behind it, for launch and for the years of marketing that follow.\n\nCould we set up a brief call? I\'m happy to share a few examples first.\n\nBest regards,\nMagnus\nLEAfilms\nleafilms.no',
    temperature: 'lukewarm',
  },
]

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

  for (const lead of leads) {
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
      continue
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
      continue
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
}

main().catch(err => {
  console.error('❌ Uventet feil:', err.message)
  process.exit(1)
})
