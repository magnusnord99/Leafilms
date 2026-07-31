/**
 * Assert that the highest-numbered notifications_type_check migration includes
 * every notification type the app actually inserts (from lib/actions/notifications.ts
 * + DB trigger types). Catches the DROP+ADD clobber pattern (118/121, 127/129).
 *
 * Run: npx tsx scripts/assert-notifications-type-check.ts
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const REQUIRED_TYPES = [
  'project_message',
  'task_message',
  'selection_submitted',
  'task_assigned',
  'lead_assigned',
  'quote_assigned',
  'invoice_assigned',
  'quote_mention',
  'project_message_mention',
  'task_message_mention',
  'quote_message',
  'feedback_reply',
  'contract_signed',
  'project_message_reaction',
  'task_message_reaction',
  'quote_message_reaction',
  'resale_assigned',
  'direct_message',
  'meeting_invite',
  'meeting_response',
  'board_comment_mention',
  'board_comment_reply',
  'pitch_review_requested',
  'pitch_review_responded',
  'quote_review_requested',
  'quote_review_responded',
  'preprod_mention',
  'preprod_message',
  'preprod_message_reaction',
  'conversation_message_reaction',
] as const

const migrationsDir = join(process.cwd(), 'supabase/migrations')
const files = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort((a, b) => {
    const numA = parseInt(a.match(/^\d+/)?.[0] || '0', 10)
    const numB = parseInt(b.match(/^\d+/)?.[0] || '0', 10)
    return numA - numB
  })

let lastConstraintFile: string | null = null
let lastConstraintBody: string | null = null

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), 'utf-8')
  // Match the last ADD CONSTRAINT notifications_type_check ... CHECK (type IN (...))
  const re =
    /ADD CONSTRAINT notifications_type_check\s+CHECK\s*\(\s*type\s+IN\s*\(([\s\S]*?)\)\s*\)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(sql)) !== null) {
    lastConstraintFile = file
    lastConstraintBody = match[1]
  }
}

if (!lastConstraintFile || !lastConstraintBody) {
  console.error('❌ Fant ingen notifications_type_check i supabase/migrations/')
  process.exit(1)
}

const present = new Set(
  [...lastConstraintBody.matchAll(/'([^']+)'/g)].map(m => m[1])
)
const missing = REQUIRED_TYPES.filter(t => !present.has(t))

if (missing.length > 0) {
  console.error(
    `❌ ${lastConstraintFile} mangler notification-typer i notifications_type_check:`
  )
  for (const t of missing) console.error(`   - ${t}`)
  process.exit(1)
}

console.log(
  `✅ ${lastConstraintFile} inkluderer alle ${REQUIRED_TYPES.length} påkrevde notification-typer`
)
