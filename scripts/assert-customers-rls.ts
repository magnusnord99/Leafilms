/**
 * Locks in that customers RLS migrations require staff (not open authenticated).
 *
 * Run: npx tsx scripts/assert-customers-rls.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..')

function readMigration(name: string): string {
  return readFileSync(join(root, 'supabase/migrations', name), 'utf8')
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
}

const source019 = readMigration('019_enable_rls_all_tables.sql')
const forward134 = readMigration('134_harden_customers_rls.sql')

function assertCustomersStaff(sql: string, label: string, preferIsStaff: boolean): void {
  assert(
    sql.includes('staff_read_customers') &&
      sql.includes('staff_insert_customers') &&
      sql.includes('staff_update_customers') &&
      sql.includes('staff_delete_customers'),
    `${label}: customers must define staff_* policies`,
  )

  if (preferIsStaff) {
    assert(
      sql.includes('is_staff(auth.uid())'),
      `${label}: forward harden must use is_staff(auth.uid())`,
    )
  } else {
    assert(
      sql.includes("role IN ('admin', 'sales', 'production')"),
      `${label}: source 019 (before is_staff) must use inline staff roles`,
    )
  }

  assert(
    !/CREATE POLICY "authenticated_(read|insert|update|delete)_customers"[\s\S]{0,160}USING \(true\)/.test(
      sql,
    ),
    `${label}: must not recreate open authenticated_*_customers USING (true)`,
  )
}

assertCustomersStaff(source019, '019_enable_rls_all_tables.sql', false)
assertCustomersStaff(forward134, '134_harden_customers_rls.sql', true)

console.log('assert-customers-rls: all passed')
