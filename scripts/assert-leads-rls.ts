/**
 * Låser inn at leads og email_log er staff-only i RLS.
 *
 * Kjør: npx tsx scripts/assert-leads-rls.ts
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
}

function assertInlineStaff(block: string, name: string, file: string): void {
  assertNoOpenAuthenticated(block, name, file)
  assert(
    /role IN \('admin',\s*'sales',\s*'production'\)/.test(block),
    `${file} policy ${name} must require admin/sales/production (040 runs before is_staff)`
  )
}

function assertIsStaff(block: string, name: string, file: string): void {
  assertNoOpenAuthenticated(block, name, file)
  assert(
    /public\.is_staff\(\s*auth\.uid\(\)\s*\)/.test(block),
    `${file} policy ${name} must use public.is_staff(auth.uid())`
  )
}

const source040 = read('supabase/migrations/040_project_management.sql')
const mirror040 = read('database-migrations/040_project_management.sql')
const forward = read('supabase/migrations/145_harden_leads_rls.sql')

const policies = [
  'authenticated_read_leads',
  'authenticated_insert_leads',
  'authenticated_update_leads',
  'authenticated_delete_leads',
  'authenticated_read_email_log',
  'authenticated_insert_email_log',
  'authenticated_update_email_log',
  'authenticated_delete_email_log',
]

for (const name of policies) {
  assertInlineStaff(policyBlock(source040, name, '040_project_management.sql'), name, '040_project_management.sql')
  assertInlineStaff(policyBlock(mirror040, name, 'database-migrations/040_project_management.sql'), name, 'database-migrations/040_project_management.sql')
}

assert(
  /143 is reserved/.test(forward),
  '145 must document that 143 is reserved by the profile-role PR'
)
assert(
  /144 is reserved/.test(forward),
  '145 must document that 144 is reserved by the tasks RLS PR'
)

for (const name of policies) {
  assert(
    forward.includes(`DROP POLICY IF EXISTS "${name}"`),
    `145 must drop existing policy ${JSON.stringify(name)} before recreating it`
  )
  assertIsStaff(policyBlock(forward, name, '145_harden_leads_rls.sql'), name, '145_harden_leads_rls.sql')
}

assert(
  /createServiceClient\(\)/.test(read('app/api/cron/market-analysis/route.ts')),
  'market-analysis cron must keep using the service client so staff-only RLS does not block lead inserts'
)
assert(
  /createServiceClient\(\)/.test(read('app/api/send-email/route.ts')),
  'send-email must keep using the service client so staff-only RLS does not block email_log inserts'
)

console.log('assert-leads-rls: ok')
