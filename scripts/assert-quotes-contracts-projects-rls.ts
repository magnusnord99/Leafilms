/**
 * Locks in that quotes/contracts/projects RLS migrations require staff
 * (not open authenticated CRUD).
 *
 * Run: npx tsx scripts/assert-quotes-contracts-projects-rls.ts
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
const forward135 = readMigration('135_harden_quotes_contracts_projects_rls.sql')

const TABLES = ['quotes', 'contracts', 'projects'] as const

function assertTableStaff(sql: string, table: string, label: string, preferIsStaff: boolean): void {
  for (const op of ['read', 'insert', 'update', 'delete'] as const) {
    assert(
      sql.includes(`staff_${op}_${table}`),
      `${label}: ${table} must define staff_${op}_${table}`,
    )
  }

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
    !new RegExp(
      `CREATE POLICY "authenticated_(read|insert|update|delete)_${table}"[\\s\\S]{0,160}USING \\(true\\)`,
    ).test(sql),
    `${label}: must not recreate open authenticated_*_${table} USING (true)`,
  )
}

for (const table of TABLES) {
  assertTableStaff(source019, table, '019_enable_rls_all_tables.sql', false)
  assertTableStaff(forward135, table, '135_harden_quotes_contracts_projects_rls.sql', true)
}

console.log('assert-quotes-contracts-projects-rls: all passed')
