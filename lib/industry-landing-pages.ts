// Delt mellom klient (admin-skjema) og server action (lib/actions/
// industry-landing-pages.ts) — kan ikke ligge i en 'use server'-fil siden
// bare async funksjoner kan eksporteres derfra.

// Eksisterende topp-nivå-ruter en bransjeside-slug ikke kan kollidere med.
// 'energi' er med fordi den har en reservert understi (/energi/arbeid) som
// ikke kan gjenbrukes som slug for en annen side.
export const RESERVED_SLUGS = [
  'admin', 'api', 'auth', 'login', 'b', 'd', 'p', 's', 'v', 'energi', 'girona-form-2026',
]

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function isValidSlugFormat(slug: string): boolean {
  return SLUG_PATTERN.test(slug)
}

export function validateSlug(slug: string): string | null {
  if (!slug) return 'Slug kan ikke være tom'
  if (!isValidSlugFormat(slug)) return 'Slug kan kun inneholde små bokstaver, tall og enkeltbindestreker (f.eks. "bryllup")'
  if (RESERVED_SLUGS.includes(slug)) return `"${slug}" er en reservert sti og kan ikke brukes som slug`
  return null
}

// Avsnitt separert med tom linje — samme konvensjon som annen fritekst i appen.
export function splitParagraphs(content: string): string[] {
  return content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
}
