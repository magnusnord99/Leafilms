import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import type { OurSignature } from '@/lib/types'

const LOGO_PATH = path.join(process.cwd(), 'public', 'brand', 'leafilms-logo.png')
const LOGO_ASPECT_RATIO = 446 / 840
const LOGO_WIDTH = 90
const LOGO_Y = 30
const CONTENT_TOP_MARGIN = LOGO_Y + LOGO_WIDTH * LOGO_ASPECT_RATIO + 20

export interface CustomerSignature {
  signerName: string
  signerEmail: string
  signedAt: string
  ip: string
  signatureImage: string
}

// Delt PDF-bygger for produksjonsavtalen — brukt både når kunden faktisk signerer
// (app/api/contracts/sign/route.ts) og når admin laster ned en forhåndsvisning
// før kunden har signert (app/api/contracts/download-pdf/route.ts). Sistnevnte
// sender customerSignature: null, som gir et "venter på signering"-avsnitt i stedet.
export async function generateContractPDF(
  contractText: string,
  ourSignature: OurSignature | null,
  customerSignature: CustomerSignature | null
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      autoFirstPage: false,
      margins: { top: CONTENT_TOP_MARGIN, bottom: 60, left: 60, right: 60 },
    })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Tegner LF-logoen på hver side (også sider fra automatisk sideskift i kontraktteksten)
    doc.on('pageAdded', () => {
      if (fs.existsSync(LOGO_PATH)) {
        doc.image(LOGO_PATH, 60, LOGO_Y, { width: LOGO_WIDTH })
      }
    })
    doc.addPage()

    const now = new Date()

    // Tittel
    doc.fontSize(16).font('Helvetica-Bold').text('Produksjonsavtale', { align: 'center' })
    doc.moveDown(0.5)
    doc.fontSize(9).font('Helvetica').fillColor('#666666')
      .text(`Generert: ${now.toLocaleString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, { align: 'center' })
    doc.fillColor('#000000')
    doc.moveDown(1.5)

    // Kontrakttekst
    doc.fontSize(9).font('Courier').text(contractText, {
      lineGap: 2,
      paragraphGap: 4,
    })

    doc.moveDown(2)

    // Signeringsseksjon
    doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor('#cccccc').lineWidth(0.5).stroke()
    doc.strokeColor('#000000').lineWidth(1)
    doc.moveDown(1)

    // Leafilms-signatur (satt ved publisering)
    if (ourSignature) {
      doc.fontSize(9).font('Helvetica-Bold').text('Signatur — Leafilms')
      doc.font('Helvetica').moveDown(0.3)
      doc.text(`Signert av: ${ourSignature.signerName}`)
      doc.text(`Dato: ${new Date(ourSignature.signedAt).toLocaleString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`)
      doc.moveDown(0.5)
      const ourImgBuffer = Buffer.from(ourSignature.signatureImage.replace('data:image/png;base64,', ''), 'base64')
      doc.image(ourImgBuffer, { width: 220, height: 55 })
      doc.moveDown(1)
    }

    doc.fontSize(9).font('Helvetica-Bold').text('Signatur — Kunde')
    doc.font('Helvetica').moveDown(0.3)

    if (customerSignature) {
      doc.text(`Signert av: ${customerSignature.signerName} (${customerSignature.signerEmail})`)
      doc.text(`Dato: ${new Date(customerSignature.signedAt).toLocaleString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`)
      doc.text(`IP: ${customerSignature.ip}`)
      doc.moveDown(0.8)
      const imgBuffer = Buffer.from(customerSignature.signatureImage.replace('data:image/png;base64,', ''), 'base64')
      doc.image(imgBuffer, { width: 220, height: 55 })
    } else {
      doc.font('Helvetica-Oblique').fillColor('#666666').text('Venter på kundens signatur')
      doc.fillColor('#000000').font('Helvetica')
    }

    doc.end()
  })
}
