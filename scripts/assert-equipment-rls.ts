/**
 * Locks in that equipment_* RLS migrations require is_staff
 * (not open authenticated USING true).
 *
 * Run: npx tsx scripts/assert-equipment-rls.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
}

function readMigration(name: string): string {
  return readFileSync(resolve(__dirname, '../supabase/migrations', name), 'utf8')
}

const source102 = readMigration('102_equipment_rooms.sql')
const source110 = readMigration('110_equipment_groups.sql')
const source111 = readMigration('111_equipment_reservations.sql')
const forward136 = readMigration('136_harden_equipment_rls.sql')

for (const [label, sql] of [
  ['102', source102],
  ['136', forward136],
] as const) {
  assert(
    sql.includes('staff_all_equipment_rooms') && sql.includes('is_staff(auth.uid())'),
    `${label}: equipment_rooms must use staff_all + is_staff`,
  )
  assert(
    sql.includes('staff_all_equipment_units') && sql.includes('is_staff(auth.uid())'),
    `${label}: equipment_units must use staff_all + is_staff`,
  )
  assert(
    !/CREATE POLICY "authenticated full access equipment_rooms"[\s\S]{0,160}USING \(true\)/.test(
      sql,
    ),
    `${label}: must not CREATE open authenticated full access USING (true) on equipment_rooms`,
  )
  assert(
    !/CREATE POLICY "authenticated full access equipment_units"[\s\S]{0,160}USING \(true\)/.test(
      sql,
    ),
    `${label}: must not CREATE open authenticated full access USING (true) on equipment_units`,
  )
}

for (const [label, sql] of [
  ['111', source111],
  ['136', forward136],
] as const) {
  assert(
    sql.includes('staff_all_equipment_reservations') && sql.includes('is_staff(auth.uid())'),
    `${label}: equipment_reservations must use staff_all + is_staff`,
  )
  assert(
    !/CREATE POLICY "authenticated full access equipment_reservations"[\s\S]{0,160}USING \(true\)/.test(
      sql,
    ),
    `${label}: must not CREATE open authenticated full access USING (true) on equipment_reservations`,
  )
}

for (const [label, sql] of [
  ['110', source110],
  ['136', forward136],
] as const) {
  for (const table of ['equipment_groups', 'equipment_group_items'] as const) {
    assert(
      sql.includes(`staff_read_${table}`) && sql.includes('is_staff(auth.uid())'),
      `${label}: ${table} SELECT must use staff + is_staff`,
    )
    assert(
      sql.includes(`staff_delete_${table}`),
      `${label}: ${table} delete policy must be staff-scoped`,
    )
    assert(
      !new RegExp(
        `CREATE POLICY "authenticated_(read|insert|update|delete)_${table}"[\\s\\S]{0,160}USING \\(true\\)`,
      ).test(sql),
      `${label}: must not CREATE open authenticated_* USING (true) on ${table}`,
    )
  }
}

console.log('assert-equipment-rls: all passed')
