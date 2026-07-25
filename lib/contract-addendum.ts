// Bygger kontraktteksten med valgte tillegg lagt inn — delt mellom den offentlige
// forhåndsvisningen (ContractSigningSection, før signering) og selve signeringen
// (api/contracts/sign/route.ts), slik at de aldri kan divergere.
//
// Punkt 5.1 i malen inneholder totalprisen som ren tekst (satt inn av
// {{totalpris}} ved publisering, se lib/actions/contracts.ts). Vi oppdaterer
// den summen i klausulen direkte når kunden velger tillegg, i stedet for å
// bare legge til et eget avsnitt et annet sted i avtalen.

import { OptionalAddon } from './types'
import { addonDiscountedPrice } from './quote-builder-utils'

type AddonLike = Pick<OptionalAddon, 'description' | 'amounts' | 'price' | 'category' | 'discountable' | 'deliveryImpact'>

export type ContractLanguage = 'no' | 'en'

function fmtKr(n: number, language: ContractLanguage): string {
  return language === 'en'
    ? `NOK ${new Intl.NumberFormat('en-US').format(Math.round(n))}`
    : `${new Intl.NumberFormat('nb-NO').format(Math.round(n))} kr`
}

// Totalprisen i punkt 5.1 beholder alltid "1 234,-"-formatet uavhengig av språk —
// {{totalpris}} settes inn slik ved publisering, og TOTALPRIS_RE under må kunne
// gjenfinne (og re-patche) summen ved senere kall mot samme kontraktekst.
function fmtTotalpris(n: number): string {
  return `${Math.round(n).toLocaleString('nb-NO')},-`
}

const STRINGS = {
  no: {
    deliveryNote: 'Følgende endringer i leveransen følger av valgte tillegg:',
    addonsInTotal: 'Følgende valgfrie tillegg inngår i totalsummen i punkt 5.1:',
    addonsFallback: 'Tillegg valgt av kunde ved signering:',
    newTotal: (sum: string) => `Ny totalsum inkl. tillegg: ${sum} eks. MVA`,
  },
  en: {
    deliveryNote: 'The following changes to the delivery follow from the selected add-ons:',
    addonsInTotal: 'The following optional add-ons are included in the total in section 5.1:',
    addonsFallback: 'Add-ons selected by the customer at signing:',
    newTotal: (sum: string) => `New total incl. add-ons: ${sum} excl. VAT`,
  },
} as const

// Malen (supabase/migrations/054_contract_system.sql) setter alltid inn totalprisen som
// "{{totalpris}} eks. mva." i punkt 5.1 — dette mønsteret brukes kun til å finne *hvor* i
// teksten totalen står (uavhengig av mellomromstegn Node/nettleser bruker i tallgrupperingen).
// En engelsk mal forventes å bruke "{{totalpris}} excl. VAT" — begge varianter godtas.
// Verdien som settes inn er alltid den friskt beregnede baseFinalPriceExclVat pluss tillegg —
// IKKE tallet som allerede står der, som kan være frosset fra forrige publisering og ikke
// reflektere endringer gjort i tilbudet etterpå (ville da gitt en for lav sum).
const TOTALPRIS_RE = /[\d][\d\s  ]*,-(\s*(?:eks\.?\s*mva\.?|excl\.?\s*VAT\.?))/i

// Malen setter alltid inn den faste overskriften "5. Økonomi" rett etter leveranseklausulen
// (punkt 4, {{leveranse}}). Leveranseteksten selv er fri tekst admin har skrevet og egner seg
// derfor ikke som anker — vi setter i stedet inn leveranseendringer fra valgte tillegg rett før
// denne faste overskriften. Engelske maler kan bruke "5. Finances"/"5. Financial terms" o.l.
const OKONOMI_HEADING_RE = /\n\n(5\.\s*(?:Økonomi|Finances?|Financial terms|Economy))/i

function insertDeliveryImpact(text: string, deliveryLines: string, language: ContractLanguage): string {
  if (!deliveryLines) return text
  const note = `\n\n${STRINGS[language].deliveryNote}\n${deliveryLines}`
  return OKONOMI_HEADING_RE.test(text)
    ? text.replace(OKONOMI_HEADING_RE, `${note}\n\n$1`)
    : text + note
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Fjerner leveranse-/tilleggsavsnitt som tidligere signeringer (eller PDF-forhåndsvisning)
// har bakt inn i contract_text. unsignContract nullstiller kun status — ikke teksten — så
// buildContractTextWithAddons må være idempotent, ellers dupliseres avsnittene ved re-signering.
export function stripPreviousAddonPatches(text: string): string {
  const deliveryAlt = [STRINGS.no.deliveryNote, STRINGS.en.deliveryNote].map(escapeRegExp).join('|')
  const addonAlt = [
    STRINGS.no.addonsInTotal,
    STRINGS.en.addonsInTotal,
    STRINGS.no.addonsFallback,
    STRINGS.en.addonsFallback,
  ].map(escapeRegExp).join('|')

  let result = text

  // Leveransenotater satt inn rett før §5 (kan finnes flere etter gjentatt unsign→resign).
  const deliveryBeforeSectionRe = new RegExp(
    `\\n\\n(?:${deliveryAlt})\\n[\\s\\S]*?(?=\\n\\n(?:(?:${deliveryAlt})|5\\.\\s))`,
    'g'
  )
  result = result.replace(deliveryBeforeSectionRe, '')

  // Tilleggslistinger appendes alltid bakerst — fjern fra første kjente anker til slutten.
  const addonTailRe = new RegExp(`\\n\\n(?:${addonAlt})\\n[\\s\\S]*$`)
  result = result.replace(addonTailRe, '')

  // Leveransenotat appendet uten §5-overskrift (insertDeliveryImpact-fallback), evt. etter
  // at tilleggslistingen over ble strippet bort.
  const trailingDeliveryRe = new RegExp(`\\n\\n(?:${deliveryAlt})\\n[\\s\\S]*$`)
  result = result.replace(trailingDeliveryRe, '')

  return result
}

export function buildContractTextWithAddons(
  baseContractText: string,
  baseFinalPriceExclVat: number,
  selectedAddons: AddonLike[],
  discountFactor: number = 0,
  language: ContractLanguage = 'no'
): string {
  const t = STRINGS[language]
  // Start alltid fra ren basetekst — contract_text kan allerede inneholde patch fra forrige signering
  // (unsignContract bevarer teksten) eller fra admin PDF-nedlasting mens status er 'sent'.
  const cleanBase = stripPreviousAddonPatches(baseContractText)

  // Rabatterbare tillegg (startup/production/post, med mindre discountable er satt til false)
  // rabatteres med samme faktor som resten av tilbudet — 'expenses' rabatteres aldri.
  const addonsTotal = selectedAddons.reduce((sum, a) => sum + addonDiscountedPrice(a, discountFactor), 0)
  const newTotalStr = fmtTotalpris(baseFinalPriceExclVat + addonsTotal)
  const lines = selectedAddons
    .map((a) => `${a.description} — ${fmtKr(addonDiscountedPrice(a, discountFactor), language)}`)
    .join('\n')

  // Kun tillegg hvor admin faktisk har satt deliveryImpact påvirker leveransen (f.eks. "+ 10
  // bilder") — andre tillegg (f.eks. ekstra VFX) påvirker kun prisen i punkt 5.1 over.
  const deliveryLines = selectedAddons
    .filter((a) => a.deliveryImpact?.trim())
    .map((a) => a.deliveryImpact!.trim())
    .join('\n')

  if (TOTALPRIS_RE.test(cleanBase)) {
    // Summen oppdateres alltid til den friske grunnsummen — selv uten valgte tillegg — siden
    // tilbudet kan ha blitt endret etter forrige publisering av kontrakten. Tillegg-avsnittet
    // legges kun ved når kunden faktisk har valgt noe.
    const updated = cleanBase.replace(TOTALPRIS_RE, `${newTotalStr}$1`)
    const withDelivery = insertDeliveryImpact(updated, deliveryLines, language)
    return selectedAddons.length > 0
      ? `${withDelivery}\n\n${t.addonsInTotal}\n${lines}`
      : withDelivery
  }

  if (selectedAddons.length === 0) return cleanBase

  // Fallback hvis totalprisen i kontrakten ikke er på forventet format
  // (f.eks. admin har fjernet "eks. mva."-teksten manuelt) — legg til som eget avsnitt i stedet,
  // så informasjonen aldri går tapt.
  return (
    insertDeliveryImpact(cleanBase, deliveryLines, language) +
    `\n\n${t.addonsFallback}\n${lines}\n\n${t.newTotal(fmtKr(baseFinalPriceExclVat + addonsTotal, language))}`
  )
}
