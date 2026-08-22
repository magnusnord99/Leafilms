/**
 * Låser inn at tasks / task_templates / task_assignees er staff-only i RLS.
 *
 * Kjør: npx tsx scripts/assert-tasks-rls.ts
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
    `${file} policy ${name} must require admin/sales/production (040/047 run before is_staff)`
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
const source047 = read('supabase/migrations/047_task_assignees.sql')
const forward = read('supabase/migrations/144_harden_tasks_rls.sql')

const sourceTaskPolicies = [
  'authenticated_read_tasks',
  'authenticated_insert_tasks',
  'authenticated_update_tasks',
  'authenticated_delete_tasks',
  'authenticated_read_task_templates',
  'authenticated_insert_task_templates',
  'authenticated_update_task_templates',
  'authenticated_delete_task_templates',
]

for (const name of sourceTaskPolicies) {
  assertInlineStaff(policyBlock(source040, name, '040_project_management.sql'), name, '040_project_management.sql')
}

const assigneePolicies = [
  'Authenticated users can read task_assignees',
  'Authenticated users can insert task_assignees',
  'Authenticated users can delete task_assignees',
]

for (const name of assigneePolicies) {
  assertInlineStaff(policyBlock(source047, name, '047_task_assignees.sql'), name, '047_task_assignees.sql')
}

assert(
  /143 is reserved/.test(forward) || /143/.test(forward),
  '144 must document that 143 is reserved by the profile-role PR'
)

const allForwardPolicies = [...sourceTaskPolicies, ...assigneePolicies]
for (const name of allForwardPolicies) {
  assert(
    forward.includes(`DROP POLICY IF EXISTS "${name}"`),
    `144 must drop existing policy ${JSON.stringify(name)} before recreating it`
  )
  assertIsStaff(policyBlock(forward, name, '144_harden_tasks_rls.sql'), name, '144_harden_tasks_rls.sql')
}

assert(
  /createServiceClient\(\)/.test(read('app/api/contracts/sign/route.ts')),
  'contract sign must keep using the service client so staff-only RLS does not block pre_prod seeding'
)
assert(
  /createServiceClient\(\)/.test(read('lib/actions/selection-picks.ts')),
  'selection submit must keep using the service client so marking Selektering done still works'
)

console.log('assert-tasks-rls: ok')
