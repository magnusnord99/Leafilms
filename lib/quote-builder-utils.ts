import { QuoteBuilderData, OptionalAddon, OptionalAddonCategory, CrewMember } from './types'

// Timebasert opptaksmannskap (billingMode='hour') bruker hourlyRate*hours i stedet for
// dailyRate*days — kun aktuelt for opptak, jf. feedback 2bbb2f77.
export function crewMemberCost(m: CrewMember): number {
  if (m.billingMode === 'hour') return (m.hourlyRate ?? 0) * (m.hours ?? 0)
  return m.dailyRate * m.days
}

// Et prosjekt kan ha et signert/akseptert hovedtilbud OG et nyere, ikke-signert
// tilleggstilbud (kunden ba om ekstraarbeid i etterkant, se "Lag ny versjon"). Det
// signerte skal alltid vinne over "gjeldende versjon" (is_current) — ellers viser
// UI-et plutselig kladden som om DEN var det kunden har akseptert. Falt tilbake til
// is_current, så nyeste, hvis ingenting er akseptert ennå. Samme prioritering som
// er etablert i app/admin/okonomi og customers/[id]-sidene (se feedback 08a0235b).
//
// Bruk denne for DISPLAY (hub, økonomi, kundekort) — IKKE for tilbuds-editoren.
// Editoren skal åpne is_current via pickQuoteForEditing, ellers lander man på
// akseptert V1 etter "Lag ny versjon" og kan overskrive kundens avtalte tall.
export function pickBestQuote<T extends { status: string; is_current: boolean; created_at: string }>(
  quotes: T[]
): T | null {
  if (quotes.length === 0) return null
  const byRecency = (a: T, b: T) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  const accepted = quotes.filter(q => q.status === 'accepted').sort(byRecency)
  if (accepted.length) return accepted[0]
  const current = quotes.find(q => q.is_current)
  if (current) return current
  return [...quotes].sort(byRecency)[0]
}

// Tilbuds-editoren: åpne den gjeldende arbeidsversjonen (is_current). Aksepterte
// rader er fortsatt synlige via versjonsfanene, men skal ikke være default-mål
// for Lagre/PDF når en nyere kladd finnes.
export function pickQuoteForEditing<T extends { status: string; is_current: boolean; created_at: string }>(
  quotes: T[]
): T | null {
  if (quotes.length === 0) return null
  const current = quotes.find(q => q.is_current)
  if (current) return current
  return pickBestQuote(quotes)
}

/** Akseptert/avslått tilbud er kundens svar — quote_data skal ikke muteres på plass. */
export function isQuoteContentLocked(status: string | null | undefined): boolean {
  return status === 'accepted' || status === 'rejected'
}

const ADDON_CATEGORIES: OptionalAddonCategory[] = ['startup', 'production', 'post', 'expenses']

// Leser et tillegg sine beløp per kategori — normaliserer gamle rader (price+category, fra før
// 'amounts' fantes) til samme form. Les alltid via denne, aldri addon.amounts direkte.
export function getAddonAmounts(
  addon: Pick<OptionalAddon, 'amounts' | 'price' | 'category'>
): Partial<Record<OptionalAddonCategory, number>> {
  if (addon.amounts) return addon.amounts
  if (addon.price) return { [addon.category ?? 'expenses']: addon.price }
  return {}
}

export function addonTotalPrice(addon: Pick<OptionalAddon, 'amounts' | 'price' | 'category'>): number {
  return Object.values(getAddonAmounts(addon)).reduce((sum: number, v) => sum + (v ?? 0), 0)
}

// Delt mellom PDF-generering, pristilbudsvisning og kontraktstekst (§5.1) — skal aldri
// divergere. Beløp i startup/production/post-postene rabatteres sammen med resten av
// kategorien med mindre discountable er satt til false. 'expenses'-posten rabatteres aldri.
export function addonDiscountedPrice(
  addon: Pick<OptionalAddon, 'amounts' | 'price' | 'category' | 'discountable'>,
  discountFactor: number
): number {
  const amounts = getAddonAmounts(addon)
  return ADDON_CATEGORIES.reduce((sum, cat) => {
    const amt = amounts[cat] ?? 0
    if (!amt) return sum
    const discountable = cat !== 'expenses' && addon.discountable !== false
    return sum + (discountable ? amt * (1 - discountFactor) : amt)
  }, 0)
}

// Har tillegget minst én rabatterbar post? Brukes for å avgjøre om vi i det hele tatt skal
// vise "opprinnelig pris"-gjennomstreking på pristilbudssiden (QuoteSection.tsx).
export function isAddonDiscountable(
  addon: Pick<OptionalAddon, 'amounts' | 'price' | 'category' | 'discountable'>
): boolean {
  if (addon.discountable === false) return false
  const amounts = getAddonAmounts(addon)
  return ADDON_CATEGORIES.some((cat) => cat !== 'expenses' && (amounts[cat] ?? 0) > 0)
}

type QuoteLineItem = {
  description: string
  quantity: string
  amount: number
  discount?: number
}

type QuoteData = {
  version?: string
  quoteDate?: string
  projectName?: string
  reference?: string
  clientContact?: string
  customerNumber?: string
  ourContact?: string
  paymentInfo?: string
  deliveryDate?: string
  terms?: string
  lineItems?: QuoteLineItem[]
  subtotalExclVat?: number
  subtotalInclVat?: number
  totalDiscount?: number
  discountPercent?: number
  finalPriceExclVat?: number
  finalPriceInclVat?: number
  vatRate?: number
}

export type QuoteTotals = {
  startupTotal: number
  startupDays: number
  shootCrewTotal: number
  shootDays: number
  crewTotal: number
  equipmentTotal: number
  postCrewDays: number
  postProductionTotal: number
  otherCostsTotal: number
  licensingTotal: number
  /** Valgte tillegg (kun de i selectedAddonIds) summert per kategori — 0 for alle hvis selectedAddonIds ikke er oppgitt. */
  addonTotalsByCategory: Record<OptionalAddonCategory, number>
  subtotal: number
  discountBase: number
  discountAmount: number
  afterDiscount: number
  vatAmount: number
  finalInclVat: number
}

// quotes.quote_data kan være to ulike former: rå QuoteBuilderData (har `crew`), eller den
// konverterte visningsformen som /api/accept-quote skriver ved akseptering (har `finalPriceExclVat`
// i stedet, jf. convertBuilderDataToQuoteData). Samme sjekk som QuoteSection.tsx sin isBuilderData.
export function isBuilderData(data: unknown): data is QuoteBuilderData {
  return !!data && Array.isArray((data as { crew?: unknown }).crew)
}

// Robust beløp uavhengig av hvilken av de to formene over quote_data har — brukt av
// Økonomi-siden og pipeline-oversikten (admin/projects) slik at et akseptert tilbud aldri
// stille faller ut som "—"/0 bare fordi det ble lagret i den konverterte formen.
export function getQuoteAmountExclVat(data: unknown, selectedAddonIds?: string[]): number | null {
  if (!data) return null
  if (isBuilderData(data)) {
    try {
      return calculateQuoteTotals(data, selectedAddonIds ?? []).afterDiscount
    } catch {
      return null
    }
  }
  const finalPriceExclVat = (data as { finalPriceExclVat?: unknown }).finalPriceExclVat
  return typeof finalPriceExclVat === 'number' ? finalPriceExclVat : null
}

// selectedAddonIds er valgfri: uoppgitt = ingen tillegg inkludert (dagens oppførsel, brukt av
// admin-byggeren og alle andre kallere). Når oppgitt (kundens avkryssede tillegg på den
// offentlige pristilbudssiden) summeres tilleggenes poster inn i riktig kategori — samme
// mønster som PDF-eksporten (app/api/generate-quote-pdf/pdf-generator.ts), slik at
// visningene aldri divergerer. Et tillegg kan ha poster i flere kategorier samtidig.
export function calculateQuoteTotals(data: QuoteBuilderData, selectedAddonIds?: string[]): QuoteTotals {
  const startupCrewList = data.startupCrew ?? []
  const startupTotal = startupCrewList.reduce((sum, m) => sum + m.dailyRate * m.days, 0)
  const startupDays = startupCrewList.reduce((sum, m) => sum + m.days, 0)

  const shootCrewTotal = data.crew.reduce((sum, m) => sum + crewMemberCost(m), 0)
  // Faktiske dager på mannskapet er fasit — data.shootDays er kun en UI-snarvei og kan avvike hvis en rad er endret manuelt
  const shootDays = data.crew.length > 0 ? data.crew[0].days : (data.shootDays ?? 0)
  const crewTotal = shootCrewTotal + startupTotal

  const equipmentTotal = data.equipment.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)

  const postCrewList = data.postProductionCrew ?? []
  const postCrewTotal = postCrewList.reduce((sum, m) => sum + m.dailyRate * m.days, 0)
  const postCrewDays = postCrewList.reduce((sum, m) => sum + m.days, 0)
  const postItemsTotal = data.postProduction.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  const postProductionTotal = postCrewTotal + postItemsTotal

  const otherCostsTotal = data.otherCosts.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  const licensingTotal = data.licensing.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)

  const includedAddons = (data.optionalAddons ?? []).filter(
    (a) => selectedAddonIds !== undefined && selectedAddonIds.includes(a.id)
  )
  const addonTotalsByCategory = includedAddons.reduce(
    (acc, a) => {
      const amounts = getAddonAmounts(a)
      for (const cat of ADDON_CATEGORIES) acc[cat] += amounts[cat] ?? 0
      return acc
    },
    { startup: 0, production: 0, post: 0, expenses: 0 } as Record<OptionalAddonCategory, number>
  )
  const addonDiscountableTotal = includedAddons.reduce((sum, a) => {
    if (a.discountable === false) return sum
    const amounts = getAddonAmounts(a)
    return sum + ADDON_CATEGORIES.filter((c) => c !== 'expenses').reduce((s, c) => s + (amounts[c] ?? 0), 0)
  }, 0)

  const subtotal =
    crewTotal + equipmentTotal + postProductionTotal + otherCostsTotal + licensingTotal +
    addonTotalsByCategory.startup + addonTotalsByCategory.production + addonTotalsByCategory.post + addonTotalsByCategory.expenses

  // Én rabatt, kun på opptak (inkl. oppstart) og post-produksjon — ikke utstyr, lisens eller andre
  // kostnader — pluss rabatterbare tillegg-poster i disse kategoriene
  const discountBase = crewTotal + postProductionTotal + addonDiscountableTotal
  const discountAmount = discountBase * (data.discountFactor ?? 0)

  const afterDiscount = subtotal - discountAmount
  const vatAmount = data.includeVat ? afterDiscount * (data.vatRate / 100) : 0
  const finalInclVat = afterDiscount + vatAmount

  return {
    startupTotal,
    startupDays,
    shootCrewTotal,
    shootDays,
    crewTotal,
    equipmentTotal,
    postCrewDays,
    postProductionTotal,
    otherCostsTotal,
    licensingTotal,
    addonTotalsByCategory,
    subtotal,
    discountBase,
    discountAmount,
    afterDiscount,
    vatAmount,
    finalInclVat,
  }
}

function dayLabel(days: number, lang: 'NO' | 'EN'): string {
  const n = new Intl.NumberFormat(lang === 'EN' ? 'en-US' : 'nb-NO').format(days)
  return lang === 'EN'
    ? `${n} ${days === 1 ? 'day' : 'days'}`
    : `${n} ${days === 1 ? 'dag' : 'dager'}`
}

// Samme gruppering som PDF-eksporten (app/api/generate-quote-pdf/pdf-generator.ts) —
// 4 kategorier med sum, ikke per-rad-detalj, slik at tilbudet vist på pitchen matcher PDF-en.
// selectedAddonIds (kundens avkryssede tillegg) summeres inn i kategorien(e) sin(e) — feltene
// Oppstart/Opptak/Post-produksjon/Produksjonsutgifter endrer seg dermed dynamisk når
// kunden haker av tillegg på den offentlige pristilbudssiden.
export function convertBuilderDataToQuoteData(data: QuoteBuilderData, selectedAddonIds?: string[]): QuoteData {
  const lang = data.language
  const labels = lang === 'EN'
    ? {
        startup: 'Startup/Planning',
        production: 'Production',
        post: 'Post-Production',
        expenses: 'Production Expenses',
      }
    : {
        startup: 'Oppstart/planlegging',
        production: 'Opptak',
        post: 'Post-produksjon',
        expenses: 'Produksjonsutgifter',
      }

  const totals = calculateQuoteTotals(data, selectedAddonIds)
  const startupTotal = totals.startupTotal + totals.addonTotalsByCategory.startup
  const productionTotal = totals.shootCrewTotal + totals.equipmentTotal + totals.addonTotalsByCategory.production
  const postProductionTotal = totals.postProductionTotal + totals.addonTotalsByCategory.post
  const expensesTotal = totals.otherCostsTotal + totals.licensingTotal + totals.addonTotalsByCategory.expenses

  const lineItems: QuoteLineItem[] = [
    { label: labels.startup, total: startupTotal, qty: totals.startupDays > 0 ? dayLabel(totals.startupDays, lang) : '' },
    { label: labels.production, total: productionTotal, qty: totals.shootDays > 0 ? dayLabel(totals.shootDays, lang) : '' },
    { label: labels.post, total: postProductionTotal, qty: totals.postCrewDays > 0 ? dayLabel(totals.postCrewDays, lang) : '' },
    { label: labels.expenses, total: expensesTotal, qty: '' },
  ]
    .filter((c) => c.total > 0)
    .map((c) => ({ description: c.label, quantity: c.qty, amount: c.total }))

  const discountPercent = Math.round((data.discountFactor ?? 0) * 100)

  return {
    version: data.version,
    quoteDate: data.quoteDate,
    projectName: data.projectName,
    reference: data.reference,
    clientContact: data.clientContact,
    customerNumber: data.customerNumber,
    ourContact: data.ourContact,
    paymentInfo: data.paymentInfo,
    deliveryDate: data.deliveryDate,
    terms: data.terms,
    lineItems,
    subtotalExclVat: totals.subtotal,
    subtotalInclVat: totals.subtotal + (data.includeVat ? totals.subtotal * (data.vatRate / 100) : 0),
    totalDiscount: totals.discountAmount,
    discountPercent,
    finalPriceExclVat: totals.afterDiscount,
    finalPriceInclVat: totals.finalInclVat,
    vatRate: data.vatRate,
  }
}
