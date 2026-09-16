import { toIcsUtcDateTime } from '../lib/ics-datetime'

function assertEqual(actual: string | null, expected: string | null, label: string) {
  if (actual !== expected) {
    console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
    process.exitCode = 1
  } else {
    console.log(`ok   ${label}`)
  }
}

function assertMatch(actual: string | null, re: RegExp, label: string) {
  if (!actual || !re.test(actual)) {
    console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, expected to match ${re}`)
    process.exitCode = 1
  } else {
    console.log(`ok   ${label}`)
  }
}

// PostgREST/Postgres timestamptz (the format that broke the old strip-replace helper)
assertEqual(toIcsUtcDateTime('2026-08-13T08:00:00+00:00'), '20260813T080000Z', 'offset +00:00')
assertEqual(toIcsUtcDateTime('2026-08-13T10:00:00+02:00'), '20260813T080000Z', 'offset +02:00 converted to UTC')
assertEqual(toIcsUtcDateTime('2026-08-13T08:00:00.123456+00:00'), '20260813T080000Z', 'microseconds + offset')
assertEqual(toIcsUtcDateTime('2026-08-13T08:00:00.000Z'), '20260813T080000Z', 'JS toISOString() Z')
assertEqual(toIcsUtcDateTime('2026-08-13 08:00:00+00'), '20260813T080000Z', 'Postgres ISO with space')

assertEqual(toIcsUtcDateTime('not-a-date'), null, 'unparseable returns null')
assertEqual(toIcsUtcDateTime(''), null, 'empty returns null')

assertMatch(toIcsUtcDateTime(new Date().toISOString()), /^\d{8}T\d{6}Z$/, 'live stamp shape')

if (process.exitCode) {
  console.error('\nICS DATE-TIME assertions failed')
  process.exit(1)
}

console.log('\nAll ICS DATE-TIME assertions passed')
