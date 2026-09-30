// Lettvekts lenke-syntaks for e-postutkast: [visningstekst](url), satt inn av
// Cmd+K i kompose-boksen (se MentionTextInput-søsken-komponenten EmailBodyInput).
// Holder body-feltet som ren tekst i UI-en, men lar oss sende ordentlige
// <a>-lenker i e-posten i stedet for rå URL-er — se feedback 4c2cadff.

const LINK_PATTERN = /\[([^\]]+)\]\(([^)\s]+)\)/g

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function emailBodyToHtml(body: string): string {
  const withLinks = escapeHtml(body).replace(
    LINK_PATTERN,
    (_match, label, url) => `<a href="${escapeHtml(url)}">${label}</a>`
  )
  return withLinks.replace(/\n/g, '<br>')
}

export function emailBodyToPlainText(body: string): string {
  return body.replace(LINK_PATTERN, (_match, label, url) => `${label} (${url})`)
}
