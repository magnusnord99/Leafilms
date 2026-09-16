// RFC 5545 UTC DATE-TIME: YYYYMMDDTHHMMSSZ
// PostgREST/Postgres timestamptz comes back as ISO-8601 with an offset
// (`2026-08-13T08:00:00+00:00`), not `...Z`. A naive strip of `-`/`: ` leaves
// `20260813T080000+0000`, which is not a valid DATE-TIME and can make calendar
// clients reject the whole feed.

export function toIcsUtcDateTime(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const y = String(d.getUTCFullYear()).padStart(4, '0')
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const da = String(d.getUTCDate()).padStart(2, '0')
  const h = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  const s = String(d.getUTCSeconds()).padStart(2, '0')
  return `${y}${mo}${da}T${h}${mi}${s}Z`
}
