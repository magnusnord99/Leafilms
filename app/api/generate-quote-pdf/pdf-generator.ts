import PDFDocument from 'pdfkit'
import type { QuoteBuilderData } from '@/lib/types'

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
      sumCol: 'Sum (NOK)',
      totalExclVat: 'Production total (excl. VAT):',
      vat: (rate: number) => `VAT (${rate}%):`,
      totalInclVat: 'Total (incl. VAT):',
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
    sumCol: 'Sum (NOK)',
    totalExclVat: 'Produksjonstotal (eks. MVA):',
    vat: (rate: number) => `MVA (${rate}%):`,
    totalInclVat: 'Total (ink. MVA):',
    categories: {
      startup: 'Oppstart/planlegging',
      production: 'Opptak',
      post: 'Post-produksjon',
      expenses: 'Produksjonsutgifter',
    },
  }
}

function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number) {
  doc.font('Helvetica-Bold').fontSize(17).fillColor('#000000')
  doc.text('L  E  A', x, y, { width: 70, lineBreak: false })

  const iconX = x + 75
  const iconY = y - 1
  doc.rect(iconX, iconY, 30, 23).lineWidth(1).stroke('#000000')
  doc.lineWidth(0.7).strokeColor('#000000')
  for (let i = 0; i < 4; i++) {
    doc.moveTo(iconX + 4, iconY + 4 + i * 5)
      .lineTo(iconX + 26, iconY + 4 + i * 5)
      .stroke()
  }

  doc.font('Helvetica').fontSize(7).fillColor('#000000')
  doc.text('F  I  L  M  S', x, y + 27, { width: 108, lineBreak: false })
}

export async function generateQuotePDF(
  data: QuoteBuilderData,
  options: GenerateOptions
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
    const logoX = MR - 108
    const logoY = 40
    drawLogo(doc, logoX, logoY)

    // ── CLIENT NAME (top left) ─────────────────────────────────────────────────
    const clientLine = [data.clientContact, data.reference].filter(Boolean).join('/')
    if (clientLine) {
      doc.font('Helvetica').fontSize(10).fillColor('#000000')
      doc.text(clientLine, ML, logoY + 4, { width: logoX - ML - 10, lineBreak: false })
    }

    // ── COMPANY INFO ──────────────────────────────────────────────────────────
    let cy = logoY + 65
    const ciLabelX = MIDX
    const ciValueX = MIDX + 75

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000')
    doc.text('LEA FILMS', ciLabelX, cy)
    cy += 16

    const companyRows: [string, string][] = [
      ['Adresse:', 'Dæliveien 33b'],
      ['', 'Asker'],
      ['', 'Norway'],
      ['Telefon:', '0047 94989036'],
      ['Email:', 'magnusbn@hotmail.com'],
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
    const shootDays = data.shootDays ?? (data.crew.length > 0 ? data.crew[0].days : 0)

    const postCrewList = data.postProductionCrew ?? []
    const postCrewTotal = postCrewList.reduce((s, m) => s + m.dailyRate * m.days, 0)
    const postItemsTotal = data.postProduction.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const postTotal = postCrewTotal + postItemsTotal
    const postDays = postCrewList.reduce((s, m) => s + m.days, 0)

    const otherTotal = data.otherCosts.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const licensingTotal = data.licensing.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const expensesTotal = otherTotal + licensingTotal

    const dayLabel = (days: number) => language === 'EN'
      ? `${days} ${days === 1 ? 'day' : 'days'}`
      : `${days} ${days === 1 ? 'dag' : 'dager'}`

    const categories = [
      { label: labels.categories.startup, total: startupTotal, qty: startupDays > 0 ? dayLabel(startupDays) : '' },
      { label: labels.categories.production, total: productionTotal, qty: shootDays > 0 ? dayLabel(shootDays) : '' },
      { label: labels.categories.post, total: postTotal, qty: postDays > 0 ? dayLabel(postDays) : '' },
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

    const subtotal = startupTotal + productionTotal + postTotal + expensesTotal
    const discountAmount = subtotal * (data.discountPercentage / 100)
    const afterDiscount = subtotal - discountAmount
    const vatRate = data.vatRate ?? 25
    const vatAmount = includeVat ? afterDiscount * (vatRate / 100) : 0
    const totalInclVat = afterDiscount + vatAmount

    if (data.discountPercentage > 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#555555')
      doc.text(`Rabatt (${data.discountPercentage}%)`, colDescX, y, { width: colSumX - colDescX - 10, lineBreak: false })
      doc.text(`−${fmt(discountAmount, language)} NOK`, colSumX, y, { width: colSumW, align: 'right', lineBreak: false })
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
