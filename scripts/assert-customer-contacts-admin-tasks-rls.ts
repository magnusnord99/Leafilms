/**
 * Locks in that customer_contacts / admin_tasks RLS migrations require is_staff
 * (not open authenticated USING true).
 *
 * Run: npx tsx scripts/assert-customer-contacts-admin-tasks-rls.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
}

function readMigration(name: string): string {
  return readFileSync(resolve(__dirname, '../supabase/migrations', name), 'utf8')
}

const source108 = readMigration('108_admin_tasks.sql')
const source117 = readMigration('117_customer_contacts.sql')
const forward132 = readMigration('132_harden_customer_contacts_admin_tasks_rls.sql')

for (const [label, sql] of [
  ['108', source108],
  ['132', forward132],
] as const) {
  assert(
    sql.includes('staff_read_admin_tasks') && sql.includes('is_staff(auth.uid())'),
    `${label}: admin_tasks SELECT must use staff + is_staff`
  )
  assert(
    sql.includes('staff_delete_admin_tasks'),
    `${label}: admin_tasks delete policy must be staff-scoped`
  )
  assert(
    !/CREATE POLICY "authenticated_(read|insert|update|delete)_admin_tasks"[\s\S]{0,160}USING \(true\)/.test(
      sql
    ),
    `${label}: must not CREATE open authenticated_* USING (true) on admin_tasks`
  )
}

for (const [label, sql] of [
  ['117', source117],
  ['132', forward132],
] as const) {
  assert(
    sql.includes('staff_all_customer_contacts') && sql.includes('is_staff(auth.uid())'),
    `${label}: customer_contacts must use staff_all + is_staff`
  )
  assert(
    !/CREATE POLICY "authenticated full access customer_contacts"[\s\S]{0,160}USING \(true\)/.test(
      sql
    ),
    `${label}: must not CREATE open authenticated full access USING (true) on customer_contacts`
  )
}

console.log('assert-customer-contacts-admin-tasks-rls: all passed')
