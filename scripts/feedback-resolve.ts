import { readFile } from 'fs/promises'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

// Magnus Nordmo (magnusbn@hotmail.com) — used as replied_by since there is no bot/agent profile
const ADMIN_PROFILE_ID = '2a59b34c-8b66-441c-8d74-b94998119d2e'

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
  const [id, reply] = process.argv.slice(2)
  if (!id || !reply) {
    console.error('Bruk: tsx scripts/feedback-resolve.ts <feedback-id> "<svar til innmelder>"')
    process.exit(1)
  }

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
    .update({
      status: 'resolved',
      admin_reply: reply,
      replied_at: new Date().toISOString(),
      replied_by: ADMIN_PROFILE_ID,
    })
    .eq('id', id)
    .select('id, type, message')
    .single()

  if (error) {
    console.error('❌ Klarte ikke oppdatere feedback:', error.message)
    process.exit(1)
  }

  console.log(`✅ Sak ${data.id} (${data.type}) markert som løst.`)
}

main().catch(err => {
  console.error('❌ Uventet feil:', err.message)
  process.exit(1)
})
