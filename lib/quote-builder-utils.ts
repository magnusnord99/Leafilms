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
  termsEn?: string
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
  /**
   * After-discount beløp (eks. mva) fordelt på de 5 filtrerbare postene.
   * Invariant: startup + production + equipment + post + expenses === afterDiscount (innenfor flyttallsavrunding).
   * For rå QuoteBuilderData er alle 5 poster separate. For konvertert akseptert-form er utstyr
   * slått sammen i production (equipment === 0) — dette er forventet og akseptert.
   */
  categoryTotals: {
    startup: number
    production: number  // mannskap opptak — IKKE utstyr
    equipment: number   // utstyr (alltid 0 for konvertert form)
    post: number
    expenses: number
  }
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

// Pakkekortets ikon-chips (flyer-pakker) telles herfra — samme rå/konvertert-robusthet som
// getQuoteAmountExclVat over, siden begge leser quotes.quote_data. Video-rader har ikke noe
// quantity-felt (1 rad = 1 navngitt element, se DeliverableItem) og telles derfor som stykk,
// gruppert på videoRole (udefinert → 'hovedvideo' — rent additivt, se migrasjon/feltkommentar
// i lib/types.ts). Foto-rader telles på quantity, der en rad uten quantity satt ennå regnes
// som 1 (en rad som finnes representerer minst ett element). 'annet'-rader er bevisst utelatt
// — designet spesifiserer kun 3 chip-ikoner (video/bilde/klipp), se
// 2026-11-09-flyer-package-showcase-design.md. Konvertert (akseptert) form har ingen
// deliverables-liste og gir derfor alltid 0/0/0 her — amount-visningen er uendret av dette.
export function getPackageDeliverableCounts(data: unknown): { hovedvideo: number; klipp: number; photo: number } {
  const zero = { hovedvideo: 0, klipp: 0, photo: 0 }
  if (!isBuilderData(data)) return zero
  return (data.deliverables ?? []).reduce((acc, item) => {
    if (item.type === 'video') {
      const role = item.videoRole ?? 'hovedvideo'
      acc[role] += 1
    } else if (item.type === 'photo') {
      acc.photo += item.quantity ?? 1
    }
    return acc
  }, zero)
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
  // Per-kategori-splitt av tilleggsbeløp: discountable vs. non-discountable.
  // Brukes til å beregne per-post after-discount beløp (categoryTotals) og erstatter
  // det tidligere enkelt-aggregerte addonDiscountableTotal.
  const addonDiscountableByCategory = includedAddons.reduce(
    (acc, a) => {
      if (a.discountable === false) return acc
      const amounts = getAddonAmounts(a)
      for (const cat of ['startup', 'production', 'post'] as const) {
        acc[cat] += amounts[cat] ?? 0
      }
      return acc
    },
    { startup: 0, production: 0, post: 0 }
  )
  // addonDiscountableTotal er summen av alle rabatterbare tillegg-poster på tvers av kategorier
  const addonDiscountableTotal =
    addonDiscountableByCategory.startup +
    addonDiscountableByCategory.production +
    addonDiscountableByCategory.post

  const subtotal =
    crewTotal + equipmentTotal + postProductionTotal + otherCostsTotal + licensingTotal +
    addonTotalsByCategory.startup + addonTotalsByCategory.production + addonTotalsByCategory.post + addonTotalsByCategory.expenses

  // Én rabatt, kun på mannskap — opptak (inkl. oppstart) og post-produksjon-TEAM — ikke utstyr,
  // post-produksjon-kostnader (f.eks. Adobe CC), lisens eller andre kostnader — pluss
  // rabatterbare tillegg-poster i disse kategoriene
  const discountBase = crewTotal + postCrewTotal + addonDiscountableTotal
  const discountFactor = data.discountFactor ?? 0
  const discountAmount = discountBase * discountFactor

  const afterDiscount = subtotal - discountAmount
  const vatAmount = data.includeVat ? afterDiscount * (data.vatRate / 100) : 0
  const finalInclVat = afterDiscount + vatAmount

  // Per-post after-discount beløp — brukes av Økonomi-filtrering.
  // Invariant: startup + production + equipment + post + expenses === afterDiscount
  // (bevist matematisk: se kommentar over getQuoteCategoryAmounts)
  const categoryTotals = {
    startup:
      (startupTotal + addonDiscountableByCategory.startup) * (1 - discountFactor) +
      (addonTotalsByCategory.startup - addonDiscountableByCategory.startup),
    production:
      (shootCrewTotal + addonDiscountableByCategory.production) * (1 - discountFactor) +
      (addonTotalsByCategory.production - addonDiscountableByCategory.production),
    equipment: equipmentTotal,
    post:
      (postCrewTotal + addonDiscountableByCategory.post) * (1 - discountFactor) +
      (addonTotalsByCategory.post - addonDiscountableByCategory.post) +
      postItemsTotal,
    expenses: otherCostsTotal + licensingTotal + addonTotalsByCategory.expenses,
  }

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
    categoryTotals,
  }
}

/**
 * De 5 filtrerbare postene brukt av Økonomi-siden.
 * For aksepterte tilbud (konvertert form) er equipment alltid 0 — utstyr er ugjenvinnelig
 * slått sammen i production-posten ved akseptering (se convertBuilderDataToQuoteData).
 * Magnus er informert om og har akseptert dette.
 */
export type QuoteCategoryAmounts = {
  startup: number
  production: number  // mannskap opptak — IKKE utstyr
  equipment: number   // utstyr (alltid 0 for konvertert form)
  post: number
  expenses: number
}

/**
 * Robust beregning av per-kategori beløp (eks. mva, after-discount) uavhengig av
 * hvilken av de to formene quote_data har.
 *
 * Invariant for rå form: startup + production + equipment + post + expenses === getQuoteAmountExclVat(data)
 * For konvertert form gjelder tilsvarende (equipment === 0, production inkluderer utstyr).
 */
export function getQuoteCategoryAmounts(
  data: unknown,
  selectedAddonIds?: string[]
): QuoteCategoryAmounts | null {
  if (!data) return null

  if (isBuilderData(data)) {
    try {
      return calculateQuoteTotals(data, selectedAddonIds).categoryTotals
    } catch {
      return null
    }
  }

  // Konvertert form: match lineItems på kjente labels (begge språk, ingen language-felt lagres her)
  const quoteData = data as { lineItems?: unknown; finalPriceExclVat?: unknown }
  if (!Array.isArray(quoteData.lineItems)) return null

  const STARTUP_LABELS = new Set(['Oppstart/planlegging', 'Startup/Planning'])
  const PRODUCTION_LABELS = new Set(['Opptak', 'Production'])
  const POST_LABELS = new Set(['Post-produksjon', 'Post-Production'])
  const EXPENSES_LABELS = new Set(['Produksjonsutgifter', 'Production Expenses'])

  const raw = { startup: 0, production: 0, post: 0, expenses: 0 }

  for (const item of quoteData.lineItems) {
    const li = item as { description?: string; amount?: number }
    const desc = li.description ?? ''
    const amount = typeof li.amount === 'number' ? li.amount : 0
    if (STARTUP_LABELS.has(desc)) raw.startup = amount
    else if (PRODUCTION_LABELS.has(desc)) raw.production = amount
    else if (POST_LABELS.has(desc)) raw.post = amount
    else if (EXPENSES_LABELS.has(desc)) raw.expenses = amount
  }

  // lineItems-beløpene er pre-discount subtotaler (jf. convertBuilderDataToQuoteData). For å
  // opprettholde invarianten (sum === finalPriceExclVat) og vise faktisk inntjening per
  // kategori, skalerer vi de tre rabatterbare postene (startup/production/post) proporsjonalt.
  // "Produksjonsutgifter" (expenses) rabatteres ALDRI — den beholdes uendret (raw.expenses er
  // allerede korrekt etter-rabatt-verdi). Skaleringsfaktoren beregnes kun over de tre
  // rabatterbare postene mot (finalPrice - raw.expenses) slik at invarianten holder eksakt.
  // Uten rabatt er scale===1 og beløpene er uendret.
  const finalPrice = typeof quoteData.finalPriceExclVat === 'number' ? quoteData.finalPriceExclVat : null
  if (finalPrice === null) return null

  const nonExpensesRaw = raw.startup + raw.production + raw.post
  const nonExpensesTarget = finalPrice - raw.expenses
  const scale = nonExpensesRaw > 0 ? nonExpensesTarget / nonExpensesRaw : 1

  return {
    startup: raw.startup * scale,
    production: raw.production * scale,
    equipment: 0,
    post: raw.post * scale,
    expenses: raw.expenses,
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
    termsEn: data.termsEn,
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

// Standard-skjelett for et helt nytt tilbud. Flyttet hit fra components/quote/QuoteBuilder.tsx
// ('use client') slik at server actions også kan bruke det — se createPackageTemplateQuote.
const DEFAULT_TERMS = `Leafilms vil være ansvarlig for planleggingen, produksjonen og leveringen av prosjektet slik det er beskrevet i dette tilbudet. Prosjektets omfang, tidslinje og leveranser avtales før produksjonen starter. Eventuelle endringer i omfanget underveis kan medføre ekstra kostnader.
Reise-, overnattings- og oppholdsutgifter for teamet er inkludert i budsjettet med mindre annet er spesifisert.
Dersom uforutsette omstendigheter (f.eks. ekstremvær eller andre faktorer utenfor Leafilms' kontroll) hindrer produksjonen i å gjennomføres som planlagt, vil alternative løsninger utarbeides i samråd med kunden. Eventuelle forsinkelser eller omlegginger kan medføre ekstra kostnader.
Kansellering innen 14 dager før startdato: 50 % av den avtalte prisen vil bli fakturert.
Kansellering innen 48 timer før startdato: 100 % av den avtalte prisen vil bli fakturert.
Leafilms beholder full opphavsrett til alt produsert materiale. Kunden gis bruksrettigheter for det avtalte formålet og prosjektet. Videre salg eller distribusjon er ikke tillatt uten skriftlig samtykke fra Leafilms. Leafilms må krediteres i henhold til bransjestandarder der materialet brukes, der det er praktisk mulig.
Alt materiale, inkludert opptak og prosjektfiler, vil bli levert til kunden som avtalt. Lagring og arkivering av materialet utover leveringsdatoen er kundens ansvar.
Fakturaen deles opp i to like betalinger. Den første halvparten faktureres ved signering av produksjonsavtalen, og den andre halvparten faktureres etter siste produksjonsdag. Vær oppmerksom på at forsinkede betalinger kan medføre ekstra gebyrer.`

// Oversettelse av DEFAULT_TERMS over — hold de to i sync ved endringer (feedback fd02da09:
// engelske tilbud viste norsk vilkårstekst siden det ikke fantes noen engelsk standardtekst).
const EN_DEFAULT_TERMS = `Leafilms will be responsible for the planning, production and delivery of the project as described in this offer. The project's scope, timeline and deliverables are agreed before production begins. Any changes to the scope along the way may incur additional costs.
Travel, accommodation and subsistence costs for the team are included in the budget unless otherwise specified.
If unforeseen circumstances (e.g. extreme weather or other factors beyond Leafilms' control) prevent the production from being carried out as planned, alternative solutions will be arranged in consultation with the client. Any delays or rescheduling may incur additional costs.
Cancellation within 14 days before the start date: 50% of the agreed price will be invoiced.
Cancellation within 48 hours before the start date: 100% of the agreed price will be invoiced.
Leafilms retains full copyright to all produced material. The client is granted usage rights for the agreed purpose and project. Further sale or distribution is not permitted without written consent from Leafilms. Leafilms must be credited in accordance with industry standards wherever the material is used, where practically possible.
All material, including recordings and project files, will be delivered to the client as agreed. Storage and archiving of the material beyond the delivery date is the client's responsibility.
The invoice is split into two equal payments. The first half is invoiced upon signing of the production agreement, and the second half is invoiced after the last day of production. Please note that late payments may incur additional fees.`

export function createEmptyBuilderData(projectName = ''): QuoteBuilderData {
  return {
    version: 'V1',
    quoteDate: new Date().toISOString().split('T')[0],
    projectName,
    reference: 'Video produksjon',
    clientContact: '',
    customerNumber: '',
    ourContact: '',
    paymentInfo: '14 dager',
    deliveryDate: '',
    deliveryDescription: '',
    deliverables: [],
    terms: DEFAULT_TERMS,
    termsEn: EN_DEFAULT_TERMS,
    language: 'NO',
    startupCrew: [],
    shootDays: 1,
    crew: [],
    equipment: [],
    postProductionCrew: [],
    postProduction: [],
    otherCosts: [],
    licensing: [],
    vatRate: 25,
    discountFactor: 0,
    includeVat: true,
    companyEmail: 'eivind@leafilms.no',
    optionalAddons: [],
  }
}
