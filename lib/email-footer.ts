// Fyller inn en delt e-post-footer-mal (email_footer_template) med avsenderens
// egne profilfelt. Brukes både server-side ved faktisk sending
// (app/api/send-email/route.ts) og client-side for live forhåndsvisning på
// /admin/profile — derfor en ren modul uten 'use server'/DB-tilgang.

export const EMAIL_FOOTER_PLACEHOLDERS = ['name', 'job_title', 'phone', 'email'] as const
export type EmailFooterPlaceholder = (typeof EMAIL_FOOTER_PLACEHOLDERS)[number]

export type EmailFooterData = {
  name?: string | null
  job_title?: string | null
  phone?: string | null
  email?: string | null
}

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g

/**
 * Fyller plassholdere linje for linje. En linje droppes helt hvis den
 * inneholder minst én plassholder og ALLE plassholderne på den linjen er
 * tomme for denne avsenderen — det lar valgfrie felt (som stilling) forsvinne
 * sporløst i stedet for å etterlate et tomt felt eller foreldreløse
 * skilletegn. Linjer uten plassholdere (f.eks. en tom linje for luft, eller
 * fast tekst) beholdes alltid uendret.
 */
export function renderEmailFooter(template: string, data: EmailFooterData): string {
  const values: Record<string, string> = {
    name: data.name?.trim() || '',
    job_title: data.job_title?.trim() || '',
    phone: data.phone?.trim() || '',
    email: data.email?.trim() || '',
  }

  const lines = template.split('\n').map(line => {
    const tokens = [...line.matchAll(PLACEHOLDER_PATTERN)]
    if (tokens.length === 0) return line
    const allEmpty = tokens.every(([, key]) => !values[key])
    if (allEmpty) return null
    return line.replace(PLACEHOLDER_PATTERN, (_match, key) => values[key] ?? '')
  })

  return lines.filter((l): l is string => l !== null).join('\n').trim()
}
