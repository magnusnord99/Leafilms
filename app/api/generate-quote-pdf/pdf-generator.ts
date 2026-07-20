import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import type { QuoteBuilderData, OptionalAddonCategory } from '@/lib/types'
import { getAddonAmounts, addonTotalPrice, addonDiscountedPrice, isAddonDiscountable } from '@/lib/quote-builder-utils'

const LOGO_PATH = path.join(process.cwd(), 'public', 'brand', 'leafilms-logo.png')
const LOGO_ASPECT_RATIO = 446 / 840

type Lang = 'NO' | 'EN'

export interface GenerateOptions {
  language: Lang
  includeVat: boolean
}

function fmt(amount: number, lang: Lang): string {
  if (lang === 'NO') {
    return new Intl.NumberFormat('nb-NO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function getLabels(lang: Lang) {
  if (lang === 'EN') {
    return {
      header: 'Offer',
      version: 'Version:',
      offerDate: 'Offer Date:',
      project: 'Project:',
      reference: 'Reference:',
      theirContact: 'Their contact:',
      customerNumber: 'Customer number:',
      ourContact: 'Our contact:',
      paymentDetails: 'Payment details:',
      deliveryDate: 'Delivery date:',
      termsHeader: 'Terms and Conditions',
      descCol: 'Description',
      qtyCol: 'Quantity',
      sumCol: 'Sum excl. VAT (NOK)',
      totalExclVat: 'Production total (excl. VAT):',
      vat: (rate: number) => `VAT (${rate}%):`,
      totalInclVat: 'Total (incl. VAT):',
      discount: (pct: number) => `Discount (${pct}%)`,
      discountNote: 'on production and post-production',
      addonsHeader: 'Optional add-ons included',
      categories: {
        startup: 'Startup/Planning',
        production: 'Production',
        post: 'Post-Production',
        expenses: 'Production Expenses',
      },
    }
  }
  return {
    header: 'Tilbud',
    version: 'Versjon:',
    offerDate: 'Tilbudsdato:',
    project: 'Prosjekt:',
    reference: 'Referanse:',
    theirContact: 'Deres kontakt:',
    customerNumber: 'Kundenummer:',
    ourContact: 'Vår kontakt:',
    paymentDetails: 'Betalingsbetingelser:',
    deliveryDate: 'Leveringsdato:',
    termsHeader: 'Vilkår og betingelser',
    descCol: 'Beskrivelse',
    qtyCol: 'Antall',
    sumCol: 'Sum eks. MVA (NOK)',
    totalExclVat: 'Produksjonstotal (eks. MVA):',
    vat: (rate: number) => `MVA (${rate}%):`,
    totalInclVat: 'Total (ink. MVA):',
    discount: (pct: number) => `Rabatt (${pct}%)`,
    discountNote: 'på opptak og post-produksjon',
    addonsHeader: 'Inkluderte valgfrie tillegg',
    categories: {
      startup: 'Oppstart/planlegging',
      production: 'Opptak',
      post: 'Post-produksjon',
      expenses: 'Produksjonsutgifter',
    },
  }
}

function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, width: number): number {
  const height = width * LOGO_ASPECT_RATIO
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, x, y, { width })
  }
  return height
}

export async function generateQuotePDF(
  data: QuoteBuilderData,
  options: GenerateOptions,
  /** Kun disse addon-id-ene tas med (kundens avkryssede valg). `undefined` = ta med alle (admin-forhåndsvisning). */
  selectedAddonIds?: string[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, compress: true })

    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const { language, includeVat } = options
    const labels = getLabels(language)

    const W = doc.page.width
    const ML = 50
    const MR = W - 50
    const UW = W - 100
    const MIDX = W / 2 + 10

    // ── LOGO ──────────────────────────────────────────────────────────────────
    const logoWidth = 130
    const logoX = MR - logoWidth
    const logoY = 35
    const logoHeight = drawLogo(doc, logoX, logoY, logoWidth)

    // ── CLIENT NAME (top left) ─────────────────────────────────────────────────
    const clientLine = [data.clientContact, data.reference].filter(Boolean).join('/')
    if (clientLine) {
      doc.font('Helvetica').fontSize(10).fillColor('#000000')
      doc.text(clientLine, ML, logoY + 4, { width: logoX - ML - 10, lineBreak: false })
    }

    // ── COMPANY INFO ──────────────────────────────────────────────────────────
    let cy = logoY + logoHeight + 20
    const ciLabelX = ML
    const ciValueX = ML + 75

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000')
    doc.text('LEA FILMS', ciLabelX, cy)
    cy += 16

    const companyRows: [string, string][] = [
      ['Adresse:', 'Dæliveien 33b'],
      ['', 'Asker'],
      ['', 'Norway'],
      ['Telefon:', '0047 94989036'],
      ['Email:', data.companyEmail || 'eivind@leafilms.no'],
      ['Website:', 'leafilms.no'],
    ]

    for (const [lbl, val] of companyRows) {
      if (lbl) {
        doc.font('Helvetica').fontSize(9).fillColor('#000000')
        doc.text(lbl, ciLabelX, cy, { width: 72, lineBreak: false })
      }
      doc.font('Helvetica').fontSize(9).fillColor('#000000')
      doc.text(val, ciValueX, cy, { width: MR - ciValueX, lineBreak: false })
      cy += 13
    }

    // ── "OFFER" HEADING ───────────────────────────────────────────────────────
    let y = Math.max(cy + 20, 235)
    doc.font('Helvetica').fontSize(13).fillColor('#000000')
    doc.text(labels.header, ML, y)
    y += 24

    // ── INFO GRID ─────────────────────────────────────────────────────────────
    const col1LabelX = ML
    const col1ValueX = ML + 105
    const col2LabelX = MIDX
    const col2ValueX = MIDX + 105
    const LH = 15

    const leftRows: [string, string][] = [
      [labels.version, data.version || ''],
      [labels.offerDate, data.quoteDate || ''],
      [labels.project, data.projectName || ''],
      [labels.reference, data.reference || ''],
      [labels.theirContact, data.clientContact || ''],
    ]
    const rightRows: [string, string][] = [
      [labels.customerNumber, data.customerNumber || ''],
      [labels.ourContact, data.ourContact || ''],
      [labels.paymentDetails, data.paymentInfo || ''],
      [labels.deliveryDate, data.deliveryDate || ''],
    ]

    const gridY = y
    for (let i = 0; i < leftRows.length; i++) {
      const ry = gridY + i * LH
      doc.font('Helvetica').fontSize(9).fillColor('#000000')
      doc.text(leftRows[i][0], col1LabelX, ry, { width: 102, lineBreak: false })
      doc.text(leftRows[i][1], col1ValueX, ry, { width: col2LabelX - col1ValueX - 10, lineBreak: false })
    }
    for (let i = 0; i < rightRows.length; i++) {
      const ry = gridY + i * LH
      doc.font('Helvetica').fontSize(9).fillColor('#000000')
      doc.text(rightRows[i][0], col2LabelX, ry, { width: 102, lineBreak: false })
      doc.text(rightRows[i][1], col2ValueX, ry, { width: MR - col2ValueX, lineBreak: false })
    }

    y = gridY + leftRows.length * LH + 22

    // ── TERMS ─────────────────────────────────────────────────────────────────
    if (data.terms) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
      doc.text(labels.termsHeader, ML, y)
      y += 16

      const paragraphs = data.terms.split('\n').filter(p => p.trim())
      doc.font('Helvetica').fontSize(8.5).fillColor('#000000')

      for (const para of paragraphs) {
        const h = doc.heightOfString(para, { width: UW })
        if (y + h > doc.page.height - 100) {
          doc.addPage()
          y = 50
        }
        doc.text(para, ML, y, { width: UW, lineGap: 1 })
        y += h + 6
      }
      y += 14
    }

    // ── TABLE ─────────────────────────────────────────────────────────────────
    if (y > doc.page.height - 180) {
      doc.addPage()
      y = 50
    }

    const colDescX = ML
    const colDescW = 310
    const colQtyX = ML + 315
    const colQtyW = 80
    const colSumX = ML + 400
    const colSumW = MR - colSumX

    // Table header
    doc.font('Helvetica').fontSize(9.5).fillColor('#000000')
    doc.text(labels.descCol, colDescX, y, { width: colDescW, lineBreak: false })
    doc.text(labels.qtyCol, colQtyX, y, { width: colQtyW, lineBreak: false })
    doc.text(labels.sumCol, colSumX, y, { width: colSumW, align: 'right', lineBreak: false })
    y += 13

    doc.strokeColor('#000000').lineWidth(0.5)
    doc.moveTo(ML, y).lineTo(MR, y).stroke()
    y += 8

    // ── Aggregate into 4 categories ───────────────────────────────────────────
    const startupCrewList = data.startupCrew ?? []
    const startupTotal = startupCrewList.reduce((s, m) => s + m.dailyRate * m.days, 0)
    const startupDays = startupCrewList.reduce((s, m) => s + m.days, 0)

    const shootCrewTotal = data.crew.reduce((s, m) => s + m.dailyRate * m.days, 0)
    const equipTotal = data.equipment.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const productionTotal = shootCrewTotal + equipTotal
    // Faktiske dager på mannskapet er fasit (brukes også i pengeberegningen over) —
    // data.shootDays er kun en UI-snarvei og kan avvike hvis en rad er endret manuelt
    const shootDays = data.crew.length > 0 ? data.crew[0].days : (data.shootDays ?? 0)

    const postCrewList = data.postProductionCrew ?? []
    const postCrewTotal = postCrewList.reduce((s, m) => s + m.dailyRate * m.days, 0)
    const postItemsTotal = data.postProduction.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const postTotal = postCrewTotal + postItemsTotal
    const postDays = postCrewList.reduce((s, m) => s + m.days, 0)

    const otherTotal = data.otherCosts.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const licensingTotal = data.licensing.reduce((s, i) => s + i.quantity * i.unitPrice, 0)

    // Valgfrie tillegg — hver post (kategori+beløp) summeres inn i sin kategori for visning. Et
    // tillegg kan ha poster i flere kategorier samtidig (f.eks. fotografering som koster mer i
    // både Opptak og Post-produksjon). Poster i startup/production/post rabatteres sammen med
    // resten av kategorien med mindre discountable er satt til false (f.eks. innleide eksterne
    // eksperter). 'expenses'-poster rabatteres aldri, uansett discountable-flagg.
    const includedAddons = (data.optionalAddons ?? []).filter(
      a => selectedAddonIds === undefined || selectedAddonIds.includes(a.id)
    )
    const ADDON_CATEGORIES: OptionalAddonCategory[] = ['startup', 'production', 'post', 'expenses']
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
      return sum + ADDON_CATEGORIES.filter(c => c !== 'expenses').reduce((s, c) => s + (amounts[c] ?? 0), 0)
    }, 0)
    // Hoistet hit (brukes både av addon-linjene og TOTALS-seksjonen under) slik at
    // rabatterte tillegg kan vises linje for linje, ikke bare som én samlet rabattsum nederst.
    const discountFactor = data.discountFactor ?? 0

    const expensesTotal = otherTotal + licensingTotal + addonTotalsByCategory.expenses

    const dayLabel = (days: number) => {
      const n = new Intl.NumberFormat(language === 'EN' ? 'en-US' : 'nb-NO').format(days)
      return language === 'EN'
        ? `${n} ${days === 1 ? 'day' : 'days'}`
        : `${n} ${days === 1 ? 'dag' : 'dager'}`
    }

    // Visningstotaler inkl. addons per kategori.
    const startupDisplayTotal = startupTotal + addonTotalsByCategory.startup
    const productionDisplayTotal = productionTotal + addonTotalsByCategory.production
    const postDisplayTotal = postTotal + addonTotalsByCategory.post

    const categories = [
      { label: labels.categories.startup, total: startupDisplayTotal, qty: startupDays > 0 ? dayLabel(startupDays) : '' },
      { label: labels.categories.production, total: productionDisplayTotal, qty: shootDays > 0 ? dayLabel(shootDays) : '' },
      { label: labels.categories.post, total: postDisplayTotal, qty: postDays > 0 ? dayLabel(postDays) : '' },
      { label: labels.categories.expenses, total: expensesTotal, qty: '' },
    ].filter(c => c.total > 0)

    for (const cat of categories) {
      if (y > doc.page.height - 80) {
        doc.addPage()
        y = 50
      }
      doc.font('Helvetica').fontSize(9).fillColor('#000000')
      doc.text(cat.label, colDescX, y, { width: colDescW, lineBreak: false })
      if (cat.qty) {
        doc.text(cat.qty, colQtyX, y, { width: colQtyW, lineBreak: false })
      }
      doc.text(fmt(cat.total, language), colSumX, y, { width: colSumW, align: 'right', lineBreak: false })
      y += 14
    }

    // ── Valgfrie tillegg — egne linjer ───────────────────────────────────────
    // Kategori-radene over inkluderer allerede tillegg-beløpene i totalen (uten dette ville
    // summene vært feil), men uten en egen liste her er det usynlig for leseren AT et tillegg
    // er inkludert i prisen — samme problem som ble meldt inn fra kunder som ikke skjønte at
    // f.eks. aftermovie var et tilvalg. Speiler visningen i det interaktive tilbudet (QuoteSection.tsx).
    if (includedAddons.length > 0) {
      if (y > doc.page.height - 100) {
        doc.addPage()
        y = 50
      }
      y += 4
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#555555')
      doc.text(labels.addonsHeader, colDescX, y, { width: colDescW, lineBreak: false })
      y += 13

      for (const addon of includedAddons) {
        if (y > doc.page.height - 80) {
          doc.addPage()
          y = 50
        }
        doc.font('Helvetica').fontSize(9).fillColor('#000000')
        doc.text(`• ${addon.description}`, colDescX + 8, y, { width: colDescW - 8, lineBreak: false })

        // Speiler strikethrough-visningen i det interaktive tilbudet (QuoteSection.tsx) — uten
        // dette ser tillegget dyrere ut i PDF-en enn det faktisk blir siden rabatten kun vises
        // som én samlet sum lenger ned.
        const discounted = isAddonDiscountable(addon) && discountFactor > 0
        const finalPrice = discounted ? addonDiscountedPrice(addon, discountFactor) : addonTotalPrice(addon)
        const finalText = `+${fmt(finalPrice, language)} NOK`

        if (discounted) {
          const originalText = `${fmt(addonTotalPrice(addon), language)} NOK`
          doc.font('Helvetica').fontSize(7.5).fillColor('#777777')
          const originalWidth = doc.widthOfString(originalText)
          doc.font('Helvetica-Bold').fontSize(9)
          const finalWidth = doc.widthOfString(finalText)
          const gap = 6
          const finalX = MR - finalWidth
          const originalX = finalX - gap - originalWidth

          doc.font('Helvetica').fontSize(7.5).fillColor('#777777')
          doc.text(originalText, originalX, y + 1.5, { lineBreak: false })
          doc.strokeColor('#777777').lineWidth(0.5)
          doc.moveTo(originalX, y + 5).lineTo(originalX + originalWidth, y + 5).stroke()

          doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000')
          doc.text(finalText, finalX, y, { lineBreak: false })
        } else {
          doc.font('Helvetica').fontSize(9).fillColor('#000000')
          doc.text(finalText, colSumX, y, { width: colSumW, align: 'right', lineBreak: false })
        }
        y += 13
      }
      y += 4
    }

    // Table bottom line
    y += 4
    doc.strokeColor('#000000').lineWidth(0.5)
    doc.moveTo(ML, y).lineTo(MR, y).stroke()
    y += 10

    // ── TOTALS ────────────────────────────────────────────────────────────────
    if (y > doc.page.height - 150) {
      doc.addPage()
      y = 50
    }

    const subtotal = startupDisplayTotal + productionDisplayTotal + postDisplayTotal + expensesTotal
    // Rabatten gjelder kun opptak (inkl. oppstart) og post-produksjon — ikke utstyr, lisens eller andre kostnader —
    // pluss rabatterbare tillegg i disse kategoriene
    const discountBase = startupTotal + shootCrewTotal + postTotal + addonDiscountableTotal
    const discountAmount = discountBase * discountFactor
    const afterDiscount = subtotal - discountAmount
    const vatRate = data.vatRate ?? 25
    const vatAmount = includeVat ? afterDiscount * (vatRate / 100) : 0
    const totalInclVat = afterDiscount + vatAmount

    if (discountAmount > 0) {
      const discountPct = Math.round(discountFactor * 100)
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000000')
      doc.text(labels.discount(discountPct), colDescX, y, { width: colSumX - colDescX - 10, lineBreak: false })
      doc.text(`-${fmt(discountAmount, language)} NOK`, colSumX, y, { width: colSumW, align: 'right', lineBreak: false })
      y += 12
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#555555')
      doc.text(labels.discountNote, colDescX, y, { width: colSumX - colDescX - 10, lineBreak: false })
      y += 14
    }

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000000')
    doc.text(labels.totalExclVat, colDescX, y, { width: colSumX - colDescX - 10, lineBreak: false })
    doc.text(`${fmt(afterDiscount, language)} NOK`, colSumX, y, { width: colSumW, align: 'right', lineBreak: false })
    y += 16

    if (includeVat) {
      doc.font('Helvetica').fontSize(9).fillColor('#555555')
      doc.text(labels.vat(vatRate), colDescX, y, { width: colSumX - colDescX - 10, lineBreak: false })
      doc.text(`${fmt(vatAmount, language)} NOK`, colSumX, y, { width: colSumW, align: 'right', lineBreak: false })
      y += 14

      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000000')
      doc.text(labels.totalInclVat, colDescX, y, { width: colSumX - colDescX - 10, lineBreak: false })
      doc.text(`${fmt(totalInclVat, language)} NOK`, colSumX, y, { width: colSumW, align: 'right', lineBreak: false })
    }

    doc.end()
  })
}
