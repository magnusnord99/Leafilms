/**
 * Locks in that gallery_reviews / gallery_review_marks / image_comments
 * RLS migrations require is_staff (not open authenticated USING true).
 *
 * Run: npx tsx scripts/assert-gallery-reviews-rls.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
}

function readMigration(name: string): string {
  return readFileSync(resolve(__dirname, '../supabase/migrations', name), 'utf8')
}

const source130 = readMigration('130_image_comments.sql')
const source131 = readMigration('131_gallery_reviews.sql')
const forward143 = readMigration('143_harden_gallery_reviews_rls.sql')

for (const [label, sql] of [
  ['130', source130],
  ['143', forward143],
] as const) {
  assert(
    sql.includes('staff_all_image_comments') && sql.includes('is_staff(auth.uid())'),
    `${label}: image_comments must use staff_all + is_staff`,
  )
  assert(
    !/CREATE POLICY "authenticated full access image_comments"[\s\S]{0,160}USING \(true\)/.test(
      sql,
    ),
    `${label}: must not CREATE open authenticated full access USING (true) on image_comments`,
  )
}

for (const [label, sql] of [
  ['131', source131],
  ['143', forward143],
] as const) {
  assert(
    sql.includes('staff_all_gallery_reviews') && sql.includes('is_staff(auth.uid())'),
    `${label}: gallery_reviews must use staff_all + is_staff`,
  )
  assert(
    sql.includes('staff_all_gallery_review_marks') && sql.includes('is_staff(auth.uid())'),
    `${label}: gallery_review_marks must use staff_all + is_staff`,
  )
  assert(
    !/CREATE POLICY "authenticated full access gallery_reviews"[\s\S]{0,160}USING \(true\)/.test(
      sql,
    ),
    `${label}: must not CREATE open authenticated full access USING (true) on gallery_reviews`,
  )
  assert(
    !/CREATE POLICY "authenticated full access gallery_review_marks"[\s\S]{0,160}USING \(true\)/.test(
      sql,
    ),
    `${label}: must not CREATE open authenticated full access USING (true) on gallery_review_marks`,
  )
}

console.log('assert-gallery-reviews-rls: all passed')
