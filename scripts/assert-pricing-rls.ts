/**
 * Låser inn at price_catalog, discount_factors og contract_templates
 * er staff-only i RLS.
 *
 * Kjør: npx tsx scripts/assert-pricing-rls.ts
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
    `${file} policy ${name} must require admin/sales/production (source migrations run before is_staff)`
  )
}

function assertIsStaff(block: string, name: string, file: string): void {
  assertNoOpenAuthenticated(block, name, file)
  assert(
    /public\.is_staff\(\s*auth\.uid\(\)\s*\)/.test(block),
    `${file} policy ${name} must use public.is_staff(auth.uid())`
  )
}

const source035 = read('supabase/migrations/035_price_catalog_rls.sql')
const mirror035 = read('database-migrations/035_price_catalog_rls.sql')
const source054 = read('supabase/migrations/054_contract_system.sql')
const source057 = read('supabase/migrations/057_discount_factors.sql')
const forward = read('supabase/migrations/146_harden_pricing_rls.sql')

const catalogPolicies = [
  'authenticated_read_price_catalog',
  'authenticated_insert_price_catalog',
  'authenticated_update_price_catalog',
  'authenticated_delete_price_catalog',
]

const discountPolicies = [
  'Authenticated can read discount_factors',
  'Authenticated can modify discount_factors',
]

const templatePolicies = ['Auth users manage templates']

for (const name of catalogPolicies) {
  assertInlineStaff(policyBlock(source035, name, '035_price_catalog_rls.sql'), name, '035_price_catalog_rls.sql')
  assertInlineStaff(
    policyBlock(mirror035, name, 'database-migrations/035_price_catalog_rls.sql'),
    name,
    'database-migrations/035_price_catalog_rls.sql'
  )
}

for (const name of discountPolicies) {
  assertInlineStaff(policyBlock(source057, name, '057_discount_factors.sql'), name, '057_discount_factors.sql')
}

for (const name of templatePolicies) {
  assertInlineStaff(policyBlock(source054, name, '054_contract_system.sql'), name, '054_contract_system.sql')
}

assert(
  /143 is reserved/.test(forward),
  '146 must document that 143 is reserved by the profile-role PR'
)
assert(
  /144 is reserved/.test(forward),
  '146 must document that 144 is reserved by the tasks RLS PR'
)
assert(
  /145 is reserved/.test(forward),
  '146 must document that 145 is reserved by the leads RLS PR'
)

const allPolicies = [...catalogPolicies, ...discountPolicies, ...templatePolicies]
for (const name of allPolicies) {
  assert(
    forward.includes(`DROP POLICY IF EXISTS "${name}"`),
    `146 must drop existing policy ${JSON.stringify(name)} before recreating it`
  )
  assertIsStaff(policyBlock(forward, name, '146_harden_pricing_rls.sql'), name, '146_harden_pricing_rls.sql')
}

const pricesPage = read('app/admin/prices/page.tsx')
assert(
  /from\('price_catalog'\)/.test(pricesPage) && /from\('discount_factors'\)/.test(pricesPage),
  '/admin/prices must keep using the cookie client against price_catalog/discount_factors (staff RLS still allows it)'
)

const quotePage = read('app/admin/projects/[id]/quote/page.tsx')
assert(
  /from\('price_catalog'\)/.test(quotePage) && /from\('discount_factors'\)/.test(quotePage),
  'quote builder must keep reading price_catalog/discount_factors with the staff cookie client'
)

const contracts = read('lib/actions/contracts.ts')
assert(
  /from\('contract_templates'\)/.test(contracts) && /createClient\(\)/.test(contracts),
  'contract actions must keep using the cookie client against contract_templates'
)

const acceptQuote = read('app/api/accept-quote/route.ts')
assert(
  !/from\(['"]price_catalog['"]\)/.test(acceptQuote),
  'public accept-quote must not read live price_catalog (uses stored quote_data)'
)

console.log('assert-pricing-rls: ok')
