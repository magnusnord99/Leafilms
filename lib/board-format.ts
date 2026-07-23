// Brukes av BoardInfoPanel til å formatere Opptak-feltet i sidepanelet.
export function formatShootDates(shootStart: string | null | undefined, shootEnd: string | null | undefined): string {
  if (!shootStart) return 'Ikke satt ennå.'
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return `${d}.${m}.${y}`
  }
  return shootEnd && shootEnd !== shootStart
    ? `${fmt(shootStart)} – ${fmt(shootEnd)}`
    : fmt(shootStart)
}
