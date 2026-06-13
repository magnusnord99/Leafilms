import { QuoteBuilderData, CrewMember, QuoteBuilderItem } from './types'

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
  finalPriceExclVat?: number
  finalPriceInclVat?: number
  vatRate?: number
}

export type QuoteTotals = {
  crewTotal: number
  equipmentTotal: number
  postProductionTotal: number
  otherCostsTotal: number
  licensingTotal: number
  subtotal: number
  crewDiscountAmount: number
  equipmentDiscountAmount: number
  discountAmount: number
  afterDiscount: number
  vatAmount: number
  finalInclVat: number
}

export function calculateQuoteTotals(data: QuoteBuilderData): QuoteTotals {
  const startupTotal = (data.startupCrew ?? []).reduce((sum, m) => sum + m.dailyRate * m.days, 0)
  const crewTotal = data.crew.reduce((sum, m) => sum + m.dailyRate * m.days, 0) + startupTotal
  const equipmentTotal = data.equipment.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  const postCrewTotal = (data.postProductionCrew ?? []).reduce((sum, m) => sum + m.dailyRate * m.days, 0)
  const postItemsTotal = data.postProduction.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  const postProductionTotal = postCrewTotal + postItemsTotal
  const otherCostsTotal = data.otherCosts.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  const licensingTotal = data.licensing.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)

  const subtotal = crewTotal + equipmentTotal + postProductionTotal + otherCostsTotal + licensingTotal

  const crewFactor = data.crewDiscountFactor ?? 0
  const equipmentFactor = data.equipmentDiscountFactor ?? 0
  const crewDiscountAmount = crewTotal * crewFactor
  const equipmentDiscountAmount = equipmentTotal * equipmentFactor
  // Backward compat: use flat discountPercentage only when no separate factors are set
  const legacyFlatDiscount = (crewFactor === 0 && equipmentFactor === 0)
    ? subtotal * ((data.discountPercentage ?? 0) / 100)
    : 0
  const discountAmount = crewDiscountAmount + equipmentDiscountAmount + legacyFlatDiscount

  const afterDiscount = subtotal - discountAmount
  const vatAmount = data.includeVat ? afterDiscount * (data.vatRate / 100) : 0
  const finalInclVat = afterDiscount + vatAmount

  return {
    crewTotal,
    equipmentTotal,
    postProductionTotal,
    otherCostsTotal,
    licensingTotal,
    subtotal,
    crewDiscountAmount,
    equipmentDiscountAmount,
    discountAmount,
    afterDiscount,
    vatAmount,
    finalInclVat,
  }
}

function itemsToLineItems(
  items: QuoteBuilderItem[],
  headerLabel: string,
  lang: 'NO' | 'EN'
): QuoteLineItem[] {
  if (items.length === 0) return []
  const result: QuoteLineItem[] = [{ description: headerLabel, quantity: '', amount: 0 }]
  for (const item of items) {
    const total = item.quantity * item.unitPrice
    const qtyLabel = lang === 'EN'
      ? `${item.quantity} ${item.quantity === 1 ? 'unit' : 'units'}`
      : `${item.quantity} stk`
    result.push({ description: item.description, quantity: qtyLabel, amount: total })
  }
  return result
}

function crewToLineItems(crew: CrewMember[], headerLabel: string, lang: 'NO' | 'EN'): QuoteLineItem[] {
  if (crew.length === 0) return []
  const result: QuoteLineItem[] = [{ description: headerLabel, quantity: '', amount: 0 }]
  for (const m of crew) {
    const total = m.dailyRate * m.days
    const dayLabel = lang === 'EN'
      ? `${m.days} ${m.days === 1 ? 'day' : 'days'}`
      : `${m.days} ${m.days === 1 ? 'dag' : 'dager'}`
    result.push({
      description: m.name ? `${m.role} - ${m.name}` : m.role,
      quantity: dayLabel,
      amount: total,
    })
  }
  return result
}

export function convertBuilderDataToQuoteData(data: QuoteBuilderData): QuoteData {
  const lang = data.language
  const labels = lang === 'EN'
    ? {
        crew: 'CREW',
        equipment: 'EQUIPMENT',
        postCrew: 'POST PRODUCTION — TEAM',
        post: 'POST PRODUCTION',
        other: 'OTHER COSTS',
        licensing: 'LICENSING',
      }
    : {
        crew: 'MANNSKAP',
        equipment: 'UTSTYRSLISTE',
        postCrew: 'POST-PRODUKSJON — TEAM',
        post: 'POST-PRODUKSJON',
        other: 'ANDRE KOSTNADER',
        licensing: 'LISENSIERING',
      }

  const lineItems: QuoteLineItem[] = [
    ...crewToLineItems(data.crew, labels.crew, lang),
    ...itemsToLineItems(data.equipment, labels.equipment, lang),
    ...crewToLineItems(data.postProductionCrew ?? [], labels.postCrew, lang),
    ...itemsToLineItems(data.postProduction, labels.post, lang),
    ...itemsToLineItems(data.otherCosts, labels.other, lang),
    ...itemsToLineItems(data.licensing, labels.licensing, lang),
  ]

  const totals = calculateQuoteTotals(data)

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
    finalPriceExclVat: totals.afterDiscount,
    finalPriceInclVat: totals.finalInclVat,
    vatRate: data.vatRate,
  }
}
