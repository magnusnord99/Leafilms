/**
 * Låser inn at project/task/quote-chat og reviews er staff-only i RLS,
 * og at prosjekt-chat-API-et krever staff før service-role.
 *
 * Kjør: npx tsx scripts/assert-messages-reviews-rls.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
}

function policyBlock(src: string, name: string, file: string): string {
  const start = src.indexOf(`CREATE POLICY "${name}"`)
  assert(start >= 0, `${file} must create policy ${JSON.stringify(name)}`)
  const next = src.indexOf('CREATE POLICY', start + 1)
  return next >= 0 ? src.slice(start, next) : src.slice(start)
}

function assertNoOpenAuthenticated(block: string, name: string, file: string): void {
  assert(
    !/USING\s*\(\s*true\s*\)/i.test(block),
    `${file} policy ${name} must not use USING (true)`
  )
  assert(
    !/WITH CHECK\s*\(\s*true\s*\)/i.test(block),
    `${file} policy ${name} must not use WITH CHECK (true)`
  )
  assert(
    !/auth\.role\(\)\s*=\s*'authenticated'/.test(block),
    `${file} policy ${name} must not treat every authenticated JWT as authorized`
  )
}

function assertInlineStaff(block: string, name: string, file: string): void {
  assertNoOpenAuthenticated(block, name, file)
  assert(
    /role IN \('admin',\s*'sales',\s*'production'\)/.test(block),
    `${file} policy ${name} must require admin/sales/production (036/045/080/088 run before is_staff)`
  )
}

function assertIsStaff(block: string, name: string, file: string): void {
  assertNoOpenAuthenticated(block, name, file)
  assert(
    /public\.is_staff\(\s*auth\.uid\(\)\s*\)/.test(block),
    `${file} policy ${name} must use public.is_staff(auth.uid())`
  )
}

function assertSelfInsert(block: string, column: string, name: string, file: string): void {
  assert(
    new RegExp(`auth\\.uid\\(\\)\\s*=\\s*${column}`).test(block),
    `${file} policy ${name} must still require auth.uid() = ${column}`
  )
}

const source036 = read('supabase/migrations/036_project_messages.sql')
const source036Copy = read('database-migrations/036_project_messages.sql')
const source045 = read('supabase/migrations/045_task_messages.sql')
const source080 = read('supabase/migrations/080_quote_messages.sql')
const source088 = read('supabase/migrations/088_task_reviews.sql')
const forward = read('supabase/migrations/147_harden_messages_reviews_rls.sql')
const messagesRoute = read('app/api/projects/[id]/messages/route.ts')
const publishing = read('hooks/project/usePublishing.ts')

assert(
  source036 === source036Copy,
  'database-migrations/036_project_messages.sql must match supabase/migrations/036'
)

const sourceSelect = [
  { file: '036_project_messages.sql', src: source036, name: 'Authenticated users can read messages' },
  { file: '045_task_messages.sql', src: source045, name: 'authenticated_read_task_messages' },
  { file: '080_quote_messages.sql', src: source080, name: 'authed_read_quote_messages' },
  { file: '088_task_reviews.sql', src: source088, name: 'authed_read_reviews' },
] as const

for (const { file, src, name } of sourceSelect) {
  assertInlineStaff(policyBlock(src, name, file), name, file)
}

const sourceInsert = [
  { file: '036_project_messages.sql', src: source036, name: 'Users can insert own messages', column: 'user_id' },
  { file: '045_task_messages.sql', src: source045, name: 'authenticated_insert_task_messages', column: 'user_id' },
  { file: '080_quote_messages.sql', src: source080, name: 'authed_insert_quote_messages', column: 'user_id' },
  { file: '088_task_reviews.sql', src: source088, name: 'authed_insert_reviews', column: 'requested_by' },
] as const

for (const { file, src, name, column } of sourceInsert) {
  const block = policyBlock(src, name, file)
  assertInlineStaff(block, name, file)
  assertSelfInsert(block, column, name, file)
}

const sourceBoundWrites = [
  { file: '045_task_messages.sql', src: source045, name: 'authenticated_update_task_messages', column: 'user_id' },
  { file: '045_task_messages.sql', src: source045, name: 'authenticated_delete_task_messages', column: 'user_id' },
  { file: '088_task_reviews.sql', src: source088, name: 'authed_update_reviews', column: 'reviewer_id' },
] as const

for (const { file, src, name, column } of sourceBoundWrites) {
  const block = policyBlock(src, name, file)
  assertInlineStaff(block, name, file)
  assertSelfInsert(block, column, name, file)
}

assert(
  /143/.test(forward) && /146/.test(forward),
  '147 must document that 143–146 are reserved by open harden PRs'
)

const allForwardPolicies = [
  'Authenticated users can read messages',
  'Users can insert own messages',
  'authenticated_read_task_messages',
  'authenticated_insert_task_messages',
  'authenticated_update_task_messages',
  'authenticated_delete_task_messages',
  'authed_read_quote_messages',
  'authed_insert_quote_messages',
  'authed_read_reviews',
  'authed_insert_reviews',
  'authed_update_reviews',
]

for (const name of allForwardPolicies) {
  assert(
    forward.includes(`DROP POLICY IF EXISTS "${name}"`),
    `147 must drop existing policy ${JSON.stringify(name)} before recreating it`
  )
  assertIsStaff(policyBlock(forward, name, '147_harden_messages_reviews_rls.sql'), name, '147_harden_messages_reviews_rls.sql')
}

assertSelfInsert(
  policyBlock(forward, 'Users can insert own messages', '147_harden_messages_reviews_rls.sql'),
  'user_id',
  'Users can insert own messages',
  '147_harden_messages_reviews_rls.sql'
)
assertSelfInsert(
  policyBlock(forward, 'authed_insert_quote_messages', '147_harden_messages_reviews_rls.sql'),
  'user_id',
  'authed_insert_quote_messages',
  '147_harden_messages_reviews_rls.sql'
)
assertSelfInsert(
  policyBlock(forward, 'authed_insert_reviews', '147_harden_messages_reviews_rls.sql'),
  'requested_by',
  'authed_insert_reviews',
  '147_harden_messages_reviews_rls.sql'
)
assertSelfInsert(
  policyBlock(forward, 'authed_update_reviews', '147_harden_messages_reviews_rls.sql'),
  'reviewer_id',
  'authed_update_reviews',
  '147_harden_messages_reviews_rls.sql'
)

assert(
  /isStaffRole/.test(messagesRoute) && /requireStaff/.test(messagesRoute),
  'project messages API must require a staff role before using the service client'
)
assert(
  /createServiceClient\(\)/.test(messagesRoute),
  'project messages API may keep the service client after the staff gate so chat still works before 147 is applied'
)
assert(
  /latest\?\.status !== 'approved'/.test(publishing),
  'publish gate must still consult getLatestReview status — forged approved rows were the RLS trigger'
)

console.log('assert-messages-reviews-rls: ok')
