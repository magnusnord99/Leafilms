/**
 * Låser inn at service-role / e-post / AI-ruter fail-closer uten staff-session.
 *
 * Kjør: npx tsx scripts/assert-staff-api-auth.ts
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

function indexOfOrFail(src: string, needle: string, file: string): number {
  const i = src.indexOf(needle)
  assert(i >= 0, `${file} must contain ${JSON.stringify(needle)}`)
  return i
}

const staffHelper = read('lib/auth/staff.ts')
assert(
  /export async function getAuthenticatedStaffUser/.test(staffHelper),
  'lib/auth/staff.ts must export getAuthenticatedStaffUser'
)
assert(
  /isStaffRole\(profile\?\.role\)/.test(staffHelper),
  'staff gate must use isStaffRole so sales/production can still call pitch tools'
)
assert(
  /if \(!user\) return \{ ok: false \}/.test(staffHelper),
  'missing session must fail closed'
)

const routes = [
  'app/api/generate-project/route.ts',
  'app/api/ai/chat/route.ts',
  'app/api/send-email/route.ts',
]

for (const file of routes) {
  const src = read(file)
  assert(
    src.includes("from '@/lib/auth/staff'"),
    `${file} must import getAuthenticatedStaffUser`
  )
  const staffCall = indexOfOrFail(src, 'getAuthenticatedStaffUser()', file)
  const unauthorized = src.indexOf('status: 401')
  assert(
    unauthorized > staffCall,
    `${file} must return 401 when getAuthenticatedStaffUser fails`
  )
}

const generateProject = read('app/api/generate-project/route.ts')
const staffGate = generateProject.indexOf('getAuthenticatedStaffUser()')
const serviceClient = generateProject.indexOf('createServiceClient()')
assert(
  staffGate >= 0 && serviceClient > staffGate,
  'generate-project must authenticate before creating the service client'
)

const sendEmail = read('app/api/send-email/route.ts')
assert(
  /sent_by: user\.id/.test(sendEmail),
  'send-email must still log the authenticated staff user as sent_by'
)

console.log('assert-staff-api-auth: ok')
