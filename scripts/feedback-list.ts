import { readFile } from 'fs/promises'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

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

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase
    .from('feedback')
    .select('id, type, message, page_url, priority, status, created_at, created_by, image_path')
    .neq('status', 'resolved')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Klarte ikke hente feedback:', error.message)
    process.exit(1)
  }

  if (!data || data.length === 0) {
    console.log('Ingen åpne saker.')
    return
  }

  const PRIORITY_LABEL: Record<number, string> = { 1: 'Høy', 2: 'Medium', 3: 'Lav' }

  data.forEach((item, i) => {
    console.log(`[${i + 1}] ${item.type.toUpperCase()} · ${PRIORITY_LABEL[item.priority] ?? item.priority} · ${item.status}`)
    console.log(`    "${item.message}"`)
    console.log(`    side: ${item.page_url ?? '–'} · bilde: ${item.image_path ? 'ja' : 'nei'} · ${new Date(item.created_at).toLocaleString('nb-NO')}`)
    console.log(`    id: ${item.id}`)
    console.log('')
  })
}

main().catch(err => {
  console.error('❌ Uventet feil:', err.message)
  process.exit(1)
})
