/**
 * Locks in that preprod_messages / post_prod_lanes / post_prod_task_library
 * RLS migrations require is_staff (not open authenticated USING true).
 *
 * Run: npx tsx scripts/assert-preprod-postprod-rls.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
}

function readMigration(name: string): string {
  return readFileSync(resolve(__dirname, '../supabase/migrations', name), 'utf8')
}

const source122 = readMigration('122_post_prod_board.sql')
const source127 = readMigration('127_preprod_messages.sql')
const forward131 = readMigration('131_harden_preprod_postprod_rls.sql')

for (const [label, sql] of [
  ['122', source122],
  ['131', forward131],
] as const) {
  assert(
    sql.includes('staff_read_post_prod_lanes') && sql.includes('is_staff(auth.uid())'),
    `${label}: post_prod_lanes must use staff + is_staff`
  )
  assert(
    sql.includes('staff_delete_post_prod_lanes') && sql.includes('staff_delete_post_prod_task_library'),
    `${label}: delete policies must be staff-scoped`
  )
  assert(
    !/CREATE POLICY "authenticated_(read|insert|update|delete)_post_prod_lanes"[\s\S]{0,160}USING \(true\)/.test(
      sql
    ),
    `${label}: must not CREATE open authenticated_* USING (true) on post_prod_lanes`
  )
  assert(
    !/CREATE POLICY "authenticated_(read|insert|update|delete)_post_prod_task_library"[\s\S]{0,160}USING \(true\)/.test(
      sql
    ),
    `${label}: must not CREATE open authenticated_* USING (true) on post_prod_task_library`
  )
}

for (const [label, sql] of [
  ['127', source127],
  ['131', forward131],
] as const) {
  assert(
    sql.includes('staff_read_preprod_messages') && sql.includes('is_staff(auth.uid())'),
    `${label}: preprod_messages SELECT must use staff + is_staff`
  )
  assert(
    sql.includes('staff_insert_preprod_messages') &&
      sql.includes('auth.uid() = user_id'),
    `${label}: preprod insert must require staff + self as user_id`
  )
  assert(
    !sql.includes('authed_read_preprod_messages') || sql.includes('DROP POLICY IF EXISTS "authed_read_preprod_messages"'),
    `${label}: open authed_read policy must be dropped or absent`
  )
  assert(
    !/CREATE POLICY "authed_read_preprod_messages"[\s\S]{0,120}USING \(true\)/.test(sql),
    `${label}: must not CREATE open authed_read USING (true)`
  )
}

console.log('assert-preprod-postprod-rls: all passed')
