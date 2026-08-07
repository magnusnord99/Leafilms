/**
 * Locks in that selection gallery/album RLS migrations require staff
 * (not open authenticated USING true), including the selections storage bucket.
 *
 * Run: npx tsx scripts/assert-selection-galleries-rls.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
}

function readMigration(name: string): string {
  return readFileSync(resolve(__dirname, '../supabase/migrations', name), 'utf8')
}

const source059 = readMigration('059_selection_galleries.sql')
const source067 = readMigration('067_selection_albums.sql')
const forward133 = readMigration('133_harden_selection_galleries_rls.sql')

const staffRolesInline =
  /role IN \('admin', 'sales', 'production'\)/

for (const [label, sql] of [
  ['059', source059],
  ['133', forward133],
] as const) {
  assert(
    sql.includes('staff_all_selection_galleries'),
    `${label}: selection_galleries must use staff_all policy`
  )
  assert(
    sql.includes('staff_all_selection_images'),
    `${label}: selection_images must use staff_all policy`
  )
  assert(
    sql.includes('staff_manage_selections_storage'),
    `${label}: selections storage must use staff_manage policy`
  )
  assert(
    label === '133'
      ? sql.includes('is_staff(auth.uid())')
      : staffRolesInline.test(sql),
    `${label}: selection policies must gate on staff roles`
  )
  assert(
    !/CREATE POLICY "authenticated full access galleries"[\s\S]{0,200}USING \(true\)/.test(
      sql
    ),
    `${label}: must not CREATE open authenticated full access galleries USING (true)`
  )
  assert(
    !/CREATE POLICY "authenticated full access images"[\s\S]{0,200}USING \(true\)/.test(
      sql
    ),
    `${label}: must not CREATE open authenticated full access images USING (true)`
  )
  assert(
    !/CREATE POLICY "authenticated manage selections storage"[\s\S]{0,280}USING \(bucket_id = 'selections'\)/.test(
      sql
    ),
    `${label}: must not CREATE open authenticated manage selections storage`
  )
}

for (const [label, sql] of [
  ['067', source067],
  ['133', forward133],
] as const) {
  assert(
    sql.includes('staff_all_selection_albums'),
    `${label}: selection_albums must use staff_all policy`
  )
  assert(
    sql.includes('staff_all_selection_album_picks'),
    `${label}: selection_album_picks must use staff_all policy`
  )
  assert(
    label === '133'
      ? sql.includes('is_staff(auth.uid())')
      : staffRolesInline.test(sql),
    `${label}: album policies must gate on staff roles`
  )
  assert(
    !/CREATE POLICY "authenticated full access albums"[\s\S]{0,200}USING \(true\)/.test(
      sql
    ),
    `${label}: must not CREATE open authenticated full access albums USING (true)`
  )
  assert(
    !/CREATE POLICY "authenticated full access album picks"[\s\S]{0,200}USING \(true\)/.test(
      sql
    ),
    `${label}: must not CREATE open authenticated full access album picks USING (true)`
  )
}

console.log('assert-selection-galleries-rls: all passed')
