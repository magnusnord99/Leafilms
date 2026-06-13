import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getQuotePath } from '@/lib/storage/paths'
import { generateQuotePDF } from './pdf-generator'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      builderData,
      projectId,
      language = 'NO',
      mva = 'y',
      saveToStorage = false,
    } = body

    if (!builderData) {
      return NextResponse.json({ error: 'builderData mangler' }, { status: 400 })
    }

    const includeVat = mva === 'y'

    const pdfBuffer = await generateQuotePDF(builderData, { language, includeVat })

    // Build filename
    const projectName = (builderData.projectName || 'Prosjekt')
      .replace(/[^a-zA-Z0-9æøåÆØÅ\s_-]/g, '')
      .replace(/\s+/g, '_')
    const client = (builderData.clientContact || '')
      .replace(/[^a-zA-Z0-9æøåÆØÅ\s_-]/g, '')
      .replace(/\s+/g, '_')
    const version = builderData.version || 'V1'
    const date = new Date().toISOString().split('T')[0]
    const filename = `Pristilbud_${projectName}${client ? '_' + client : ''}_${version}_${date}.pdf`

    // Optionally save to Supabase Storage
    let storagePath: string | null = null
    if (saveToStorage && projectId) {
      try {
        const supabase = await createClient()
        const { data: project } = await supabase
          .from('projects')
          .select('id, title, customer_id')
          .eq('id', projectId)
          .single()

        if (project) {
          let customerName = project.title || 'Ukjent'
          if (project.customer_id) {
            const { data: customer } = await supabase
              .from('customers')
              .select('name')
              .eq('id', project.customer_id)
              .single()
            if (customer) customerName = customer.name
          }
          storagePath = getQuotePath(customerName, project.title || 'Ukjent', filename, version)

          const { error: uploadError } = await supabase.storage
            .from('assets')
            .upload(storagePath, pdfBuffer, {
              contentType: 'application/pdf',
              upsert: true,
            })

          if (uploadError) {
            console.error('Storage upload error:', uploadError)
            storagePath = null
          }
        }
      } catch (storageErr) {
        console.error('Storage error (non-fatal):', storageErr)
        storagePath = null
      }
    }

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Filename': filename,
        ...(storagePath ? { 'X-Storage-Path': storagePath } : {}),
      },
    })
  } catch (error) {
    console.error('PDF generation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunne ikke generere PDF' },
      { status: 500 }
    )
  }
}
