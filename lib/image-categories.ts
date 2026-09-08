// Delt kategori/subkategori-definisjon for bildebiblioteket.
// Brukes av /admin/images (liste + bulk-endring), /admin/images/[id]/edit og /api/analyze-image.
export const IMAGE_CATEGORIES: Record<string, string[]> = {
  landskap: ['fjell', 'kyst', 'by', 'natur', 'skog'],
  sport: ['ski', 'løping', 'sykkel', 'vannsport', 'klatring', 'fotball'],
  closeup: ['produkt', 'detalj', 'tekstur', 'ansikt'],
  portrett: ['enkel', 'gruppe', 'bedrift'],
  event: ['konsert', 'konferanse', 'festival', 'sport'],
  kommersiell: ['produkt', 'merkevare', 'reklame'],
  abstrakt: ['kunst', 'mønster', 'farge'],
  bts: ['opptak', 'rigging', 'team', 'utstyr', 'lokasjon'],
  bryllup: ['seremoni', 'fest', 'portrett', 'detaljer'],
  industri: ['kontor', 'produksjon', 'team', 'produkt', 'fasade'],
}

export const CATEGORY_LABELS: Record<string, string> = {
  landskap: 'Landskap',
  sport: 'Sport',
  closeup: 'Close-up',
  portrett: 'Portrett',
  event: 'Event',
  kommersiell: 'Kommersiell',
  abstrakt: 'Abstrakt',
  bts: 'BTS',
  bryllup: 'Bryllup',
  industri: 'Industri/Corporate',
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category
}
