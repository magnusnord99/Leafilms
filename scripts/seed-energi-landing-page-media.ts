import { readFile } from 'fs/promises'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

// Engangs-skript, kjøres rett etter migrasjon 174_industry_landing_pages.sql.
//
// Migrasjonen seedet industry_landing_pages (slug 'energi').about_image_path
// med en URL som peker direkte på en EKSISTERENDE rad i images-biblioteket
// (assets/images/511810jjo23.jpg, images.id c1c4bc1a-b72f-497a-ac10-
// 5a1a5b764a3c) — ren SQL kan ikke kopiere storage-objekter selv (det krever
// Storage-API-et). Resultat uten dette skriptet: sletter noen det bildet fra
// /admin/images en gang i fremtiden (helt urelatert til landingssiden), ville
// den publiserte /energi-siden mistet "Om oss"-bildet uten varsel — samme
// problem planen løser for fremtidige bildevalg via ImagePickerModal
// (se lib/actions/industry-landing-pages.ts sin copyLibraryImageToPage).
//
// Laster ned filen, laster den opp på nytt under sidens eget lagringsområde,
// og oppdaterer raden til å peke dit i stedet.

const SOURCE_PATH = 'images/511810jjo23.jpg'
const DEST_PATH = 'landing-pages/energi/about.jpg'

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

async function main() {
  await loadEnv()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ikke satt i .env.local')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  console.log(`Laster ned ${SOURCE_PATH} fra "assets"...`)
  const { data: fileBlob, error: downloadError } = await supabase.storage.from('assets').download(SOURCE_PATH)
  if (downloadError || !fileBlob) {
    console.error('❌ Nedlasting feilet:', downloadError)
    process.exit(1)
  }

  console.log(`Laster opp som ${DEST_PATH}...`)
  const { error: uploadError } = await supabase.storage.from('assets').upload(DEST_PATH, fileBlob, {
    contentType: fileBlob.type || 'image/jpeg',
    upsert: true,
  })
  if (uploadError) {
    console.error('❌ Opplasting feilet:', uploadError)
    process.exit(1)
  }

  const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(DEST_PATH)

  const { error: updateError } = await supabase
    .from('industry_landing_pages')
    .update({ about_image_path: publicUrl })
    .eq('slug', 'energi')

  if (updateError) {
    console.error('❌ Oppdatering av about_image_path feilet:', updateError)
    process.exit(1)
  }

  console.log(`✅ energi-sidens about_image_path peker nå på ${publicUrl} (ikke lenger avhengig av images-biblioteket)`)
}

main()
