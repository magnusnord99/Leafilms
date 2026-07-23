import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'

const LOGO_PATH = path.join(process.cwd(), 'public', 'brand', 'leafilms-logo.png')
const LOGO_ASPECT_RATIO = 446 / 840

function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, width: number): number {
  const height = width * LOGO_ASPECT_RATIO
  if (fs.existsSync(LOGO_PATH)) doc.image(LOGO_PATH, x, y, { width })
  return height
}

export type TimeplanPdfPerson = { name: string; role: string | null; email: string | null; phone: string | null }
export type TimeplanPdfItem = { time: string; label: string; location?: string; people: TimeplanPdfPerson[] }

export interface TimeplanPdfData {
  scheduleTitle: string
  projectTitle: string
  /** Ferdigformatert dato/datospenn, f.eks. "12.08.2026" eller "12.08.2026 – 14.08.2026", eller null om ikke satt. */
  shootDateRange: string | null
  items: TimeplanPdfItem[]
}

// Samme "manuell layout med pdfkit"-mønster som generateQuotePDF/generateContractPDF —
// fast A4-side, egendefinerte kolonne-x-posisjoner, og manuell sidebryting basert på
// gjenværende høyde (ingen HTML/React-mellomsteg).
export async function generateTimeplanPDF(data: TimeplanPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, compress: true })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const W = doc.page.width
    const H = doc.page.height
    const ML = 50
    const MR = W - 50
    const bottomLimit = H - 50

    const logoWidth = 110
    const logoX = MR - logoWidth
    const logoY = 40
    const logoHeight = drawLogo(doc, logoX, logoY, logoWidth)
    const headerTextWidth = logoX - ML - 10

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#000000')
    doc.text(data.scheduleTitle || 'Timeplan', ML, logoY, { width: headerTextWidth })

    doc.font('Helvetica').fontSize(10).fillColor('#333333')
    doc.text(data.projectTitle, ML, logoY + 24, { width: headerTextWidth, lineBreak: false })
    if (data.shootDateRange) {
      doc.text(data.shootDateRange, ML, logoY + 40, { width: headerTextWidth, lineBreak: false })
    }

    let y = Math.max(logoY + logoHeight, logoY + 60) + 30

    const colTimeX = ML
    const colTimeW = 55
    const colLabelX = colTimeX + colTimeW
    const colLabelW = 165
    const colLocX = colLabelX + colLabelW
    const colLocW = 130
    const colPeopleX = colLocX + colLocW
    const colPeopleW = MR - colPeopleX

    const drawHeaderRow = () => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000')
      doc.text('TID', colTimeX, y, { width: colTimeW, lineBreak: false })
      doc.text('PROGRAMPUNKT', colLabelX, y, { width: colLabelW, lineBreak: false })
      doc.text('LOKASJON', colLocX, y, { width: colLocW, lineBreak: false })
      doc.text('FOLK', colPeopleX, y, { width: colPeopleW, lineBreak: false })
      y += 14
      doc.moveTo(ML, y).lineTo(MR, y).strokeColor('#cccccc').lineWidth(1).stroke()
      y += 8
    }

    drawHeaderRow()

    if (data.items.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#777777')
      doc.text('Ingen programpunkter ennå.', colTimeX, y)
    }

    for (const item of data.items) {
      const peopleLines = item.people.map(p => {
        const nameLine = p.role ? `${p.name} (${p.role})` : p.name
        const contact = [p.email, p.phone].filter(Boolean).join(' · ')
        return contact ? `${nameLine} — ${contact}` : nameLine
      })

      const labelHeight = doc.heightOfString(item.label || '', { width: colLabelW })
      const locHeight = doc.heightOfString(item.location || '', { width: colLocW })
      const peopleHeight = peopleLines.reduce((sum, line) => sum + doc.heightOfString(line, { width: colPeopleW }), 0)
      const rowHeight = Math.max(labelHeight, locHeight, peopleHeight, 12)

      if (y + rowHeight > bottomLimit) {
        doc.addPage()
        y = 50
        drawHeaderRow()
      }

      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000')
      doc.text(item.time, colTimeX, y, { width: colTimeW, lineBreak: false })
      doc.font('Helvetica').fontSize(9).fillColor('#000000')
      doc.text(item.label || '', colLabelX, y, { width: colLabelW })
      doc.text(item.location || '', colLocX, y, { width: colLocW })

      let py = y
      for (const line of peopleLines) {
        doc.text(line, colPeopleX, py, { width: colPeopleW })
        py += doc.heightOfString(line, { width: colPeopleW })
      }

      y += rowHeight + 10
    }

    doc.end()
  })
}
