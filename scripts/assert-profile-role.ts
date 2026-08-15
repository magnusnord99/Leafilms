/**
 * Låser inn at migrasjon 143 fail-closer nye profiler og blokkerer
 * self-service privilege escalation på profiles.role.
 *
 * Kjør: npx tsx scripts/assert-profile-role.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/143_harden_profile_role.sql'),
  'utf8'
)

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
}

assert(
  /ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'customer'/.test(sql),
  'column DEFAULT must be customer, not admin'
)

assert(
  /VALUES \(NEW\.id, NEW\.email, 'customer'\)/.test(sql),
  'handle_new_user must insert role=customer'
)

assert(
  !/VALUES \(NEW\.id, NEW\.email, 'admin'\)/.test(sql),
  'handle_new_user must not insert role=admin'
)

assert(
  /enforce_profile_role_change/.test(sql),
  'must install a BEFORE UPDATE trigger that guards role changes'
)

assert(
  /NEW\.role IS NOT DISTINCT FROM OLD\.role/.test(sql),
  'trigger must compare NEW.role to OLD.role (not re-read the row under RLS)'
)

assert(
  /is_admin\(auth\.uid\(\)\)/.test(sql),
  'admins must still be able to change roles from /admin/users'
)

assert(
  /auth\.uid\(\) IS NULL/.test(sql),
  'service_role (invite flow) must still be able to set the invited role'
)

assert(
  /Only admins can change profile roles/.test(sql),
  'non-admin self-update of role must raise'
)

assert(
  /SET search_path = public/.test(sql),
  'SECURITY DEFINER functions must pin search_path'
)

console.log('assert-profile-role: ok')
