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

function fmtKr(n: number): string {
  return `${new Intl.NumberFormat('nb-NO').format(Math.round(n))} kr`
}

function fmtTotalpris(n: number): string {
  return `${Math.round(n).toLocaleString('nb-NO')},-`
}

// Malen (supabase/migrations/054_contract_system.sql) setter alltid inn totalprisen som
// "{{totalpris}} eks. mva." i punkt 5.1 — dette mønsteret brukes kun til å finne *hvor* i
// teksten totalen står (uavhengig av mellomromstegn Node/nettleser bruker i tallgrupperingen).
// Verdien som settes inn er alltid den friskt beregnede baseFinalPriceExclVat pluss tillegg —
// IKKE tallet som allerede står der, som kan være frosset fra forrige publisering og ikke
// reflektere endringer gjort i tilbudet etterpå (ville da gitt en for lav sum).
const TOTALPRIS_RE = /[\d][\d\s  ]*,-(\s*eks\.?\s*mva\.?)/i

// Malen setter alltid inn den faste overskriften "5. Økonomi" rett etter leveranseklausulen
// (punkt 4, {{leveranse}}). Leveranseteksten selv er fri tekst admin har skrevet og egner seg
// derfor ikke som anker — vi setter i stedet inn leveranseendringer fra valgte tillegg rett før
// denne faste overskriften.
const OKONOMI_HEADING_RE = /\n\n(5\.\s*Økonomi)/i

function insertDeliveryImpact(text: string, deliveryLines: string): string {
  if (!deliveryLines) return text
  const note = `\n\nFølgende endringer i leveransen følger av valgte tillegg:\n${deliveryLines}`
  return OKONOMI_HEADING_RE.test(text)
    ? text.replace(OKONOMI_HEADING_RE, `${note}\n\n$1`)
    : text + note
}

export function buildContractTextWithAddons(
  baseContractText: string,
  baseFinalPriceExclVat: number,
  selectedAddons: AddonLike[],
  discountFactor: number = 0
): string {
  // Rabatterbare tillegg (startup/production/post, med mindre discountable er satt til false)
  // rabatteres med samme faktor som resten av tilbudet — 'expenses' rabatteres aldri.
  const addonsTotal = selectedAddons.reduce((sum, a) => sum + addonDiscountedPrice(a, discountFactor), 0)
  const newTotalStr = fmtTotalpris(baseFinalPriceExclVat + addonsTotal)
  const lines = selectedAddons
    .map((a) => `${a.description} — ${fmtKr(addonDiscountedPrice(a, discountFactor))}`)
    .join('\n')

  // Kun tillegg hvor admin faktisk har satt deliveryImpact påvirker leveransen (f.eks. "+ 10
  // bilder") — andre tillegg (f.eks. ekstra VFX) påvirker kun prisen i punkt 5.1 over.
  const deliveryLines = selectedAddons
    .filter((a) => a.deliveryImpact?.trim())
    .map((a) => a.deliveryImpact!.trim())
    .join('\n')

  if (TOTALPRIS_RE.test(baseContractText)) {
    // Summen oppdateres alltid til den friske grunnsummen — selv uten valgte tillegg — siden
    // tilbudet kan ha blitt endret etter forrige publisering av kontrakten. Tillegg-avsnittet
    // legges kun ved når kunden faktisk har valgt noe.
    const updated = baseContractText.replace(TOTALPRIS_RE, `${newTotalStr}$1`)
    const withDelivery = insertDeliveryImpact(updated, deliveryLines)
    return selectedAddons.length > 0
      ? `${withDelivery}\n\nFølgende valgfrie tillegg inngår i totalsummen i punkt 5.1:\n${lines}`
      : withDelivery
  }

  if (selectedAddons.length === 0) return baseContractText

  // Fallback hvis totalprisen i kontrakten ikke er på forventet format
  // (f.eks. admin har fjernet "eks. mva."-teksten manuelt) — legg til som eget avsnitt i stedet,
  // så informasjonen aldri går tapt.
  return (
    insertDeliveryImpact(baseContractText, deliveryLines) +
    `\n\nTillegg valgt av kunde ved signering:\n${lines}\n\nNy totalsum inkl. tillegg: ${fmtKr(baseFinalPriceExclVat + addonsTotal)} eks. MVA`
  )
}
