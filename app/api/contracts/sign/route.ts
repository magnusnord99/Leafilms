import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import type { OurSignature } from '@/lib/types'
import { generateContractPDF } from '../pdf-generator'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, shareToken, signerName, signerEmail, contractSnapshot, signatureImage } = body

    // Valider påkrevde felt
    if (!projectId || !shareToken || !signerName || !signerEmail || !contractSnapshot || !signatureImage) {
      return Response.json(
        { error: 'Manglende felt: projectId, shareToken, signerName, signerEmail, contractSnapshot, signatureImage' },
        { status: 400 }
      )
    }

    if (typeof signatureImage !== 'string' || !signatureImage.startsWith('data:image/png;base64,') || signatureImage.length < 200) {
      return Response.json({ error: 'Ugyldig signaturbildet' }, { status: 400 })
    }

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

    const supabase = createServiceClient()

    // Verifiser at delelenken faktisk peker på dette prosjektet før vi lar noen signere —
    // uten dette kan hvem som helst signere et vilkårlig prosjekts kontrakt via projectId alene.
    const { data: share, error: shareError } = await supabase
      .from('project_shares')
      .select('project_id')
      .eq('token', shareToken)
      .eq('project_id', projectId)
      .single()

    if (shareError || !share) {
      return Response.json({ error: 'Ugyldig delelenke for dette prosjektet' }, { status: 403 })
    }

    // Hent kontrakt for prosjektet
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('id, published_at, status, contract_text, our_signature')
      .eq('project_id', projectId)
      .single()

    if (contractError || !contract) {
      return Response.json(
        { error: 'Fant ikke kontrakt for dette prosjektet' },
        { status: 404 }
      )
    }

    // Valider at kontrakten er publisert
    if (!contract.published_at) {
      return Response.json(
        { error: 'Kontrakten er ikke publisert enda' },
        { status: 403 }
      )
    }

    // Sjekk at kontrakten ikke allerede er signert
    if (contract.status === 'signed') {
      return Response.json(
        { error: 'Kontrakten er allerede signert' },
        { status: 409 }
      )
    }

    const signedAt = new Date().toISOString()

    // Oppdater kontrakt til signert
    const { error: updateContractError } = await supabase
      .from('contracts')
      .update({
        status: 'signed',
        signed_at: signedAt,
        signed_by: signerEmail,
        signature_data: {
          signerName,
          signerEmail,
          signedAt,
          contractSnapshot,
          ip,
          signatureImage,
        },
        updated_at: signedAt,
      })
      .eq('id', contract.id)

    if (updateContractError) {
      console.error('sign contract update error:', updateContractError)
      return Response.json({ error: 'Kunne ikke registrere signering' }, { status: 500 })
    }

    // Generer PDF i minnet (ikke-fatal — kontrakt er allerede signert)
    let pdfBuffer: Buffer | null = null
    try {
      const ourSignature = contract.our_signature as OurSignature | null
      pdfBuffer = await generateContractPDF(
        contract.contract_text ?? contractSnapshot,
        ourSignature,
        { signerName, signerEmail, signedAt, ip, signatureImage }
      )
    } catch (pdfErr) {
      console.error('sign contract PDF generation error:', pdfErr)
    }

    // Last opp PDF til Supabase Storage
    const pdfFileName = `${contract.id}-${Date.now()}.pdf`
    let pdfUrl: string | null = null

    if (pdfBuffer != null) {
      const { error: uploadError } = await supabase.storage
        .from('contracts')
        .upload(pdfFileName, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: false,
        })

      if (uploadError) {
        console.error('sign contract PDF upload error:', uploadError)
        // Ikke fatal — logg og fortsett uten PDF-URL
      } else {
        const { data: urlData } = supabase.storage
          .from('contracts')
          .getPublicUrl(pdfFileName)
        pdfUrl = urlData.publicUrl

        // Lagre PDF-URL på kontrakt-raden
        const { error: pdfUrlUpdateError } = await supabase
          .from('contracts')
          .update({ pdf_url: pdfUrl })
          .eq('id', contract.id)
        if (pdfUrlUpdateError) {
          console.error('sign contract pdf_url update error:', pdfUrlUpdateError)
        }
      }
    }

    // Sett gjeldende quote-versjon til accepted
    const { error: updateQuoteError } = await supabase
      .from('quotes')
      .update({ status: 'accepted', updated_at: signedAt })
      .eq('project_id', projectId)
      .eq('is_current', true)

    if (updateQuoteError) {
      console.error('sign contract quote update error:', updateQuoteError)
      // Ikke fatal — logg og fortsett
    }

    // Hent eksisterende pipeline_data for å bevare andre felt
    const { data: existingProject } = await supabase
      .from('projects')
      .select('title, pipeline_data')
      .eq('id', projectId)
      .single()

    const existingPipelineData = (existingProject?.pipeline_data as Record<string, unknown>) ?? {}

    // Avanser pipeline_stage fra 'kontrakt' → 'pre_prod', merk contract_signed
    const { data: updatedProject, error: updateProjectError } = await supabase
      .from('projects')
      .update({
        pipeline_stage: 'pre_prod',
        pipeline_data: { ...existingPipelineData, contract_signed: true, contract_signed_at: signedAt },
        updated_at: signedAt,
      })
      .eq('id', projectId)
      .eq('pipeline_stage', 'kontrakt')
      .select('title')
      .maybeSingle()

    if (updateProjectError) {
      console.error('sign contract project update error:', updateProjectError)
      // Ikke fatal — logg og fortsett
    }

    // Seed pre_prod-oppgaver hvis prosjektet ble avansert
    if (updatedProject) {
      const { data: templates } = await supabase
        .from('task_templates')
        .select('*')
        .eq('pipeline_stage', 'pre_prod')
        .is('project_type', null)
        .order('sort_order', { ascending: true })

      const { count: existingCount } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('pipeline_stage', 'pre_prod')

      if ((existingCount ?? 0) === 0 && templates && templates.length > 0) {
        await supabase.from('tasks').insert(
          templates.map((t: { title: string; description: string | null; sort_order: number }) => ({
            project_id: projectId,
            pipeline_stage: 'pre_prod',
            title: t.title,
            description: t.description ?? null,
            status: 'todo',
            sort_order: t.sort_order,
            sub_type: null,
            due_date: null,
            priority: null,
            created_by: null,
          }))
        )
      }
    }

    // Hent prosjektnavn som fallback
    let projectTitle = updatedProject?.title ?? existingProject?.title ?? null
    if (!projectTitle) {
      const { data: proj } = await supabase
        .from('projects')
        .select('title')
        .eq('id', projectId)
        .single()
      projectTitle = proj?.title ?? 'Prosjekt'
    }

    // Send bekreftelsese-poster via Resend
    if (process.env.RESEND_API_KEY) {
      const formattedDate = new Date(signedAt).toLocaleString('nb-NO', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })

      const pdfAttachment = pdfBuffer != null
        ? [{
            filename: `Produksjonsavtale-${(projectTitle ?? 'kontrakt').replace(/\s+/g, '-')}.pdf`,
            content: pdfBuffer.toString('base64'),
          }]
        : []

      const emails = [
        // Bekreftelse til signataren
        {
          to: signerEmail,
          subject: `Bekreftelse på signert produksjonsavtale — ${projectTitle}`,
          text: `Hei ${signerName},\n\nVi bekrefter at du har signert produksjonsavtalen for ${projectTitle}.\n\nSignert av: ${signerName} (${signerEmail})\nDato: ${formattedDate}\n\nTa vare på denne e-posten som bekreftelse på inngått avtale.\n\nMed vennlig hilsen,\nLeafilms`,
          attachments: pdfAttachment,
        },
        // Intern varsling til Leafilms
        {
          to: 'post@leafilms.no',
          subject: `Kontrakt signert — ${projectTitle}`,
          text: `Produksjonsavtalen for ${projectTitle} er signert.\n\nSignert av: ${signerName} (${signerEmail})\nDato: ${formattedDate}\nIP: ${ip}`,
          attachments: pdfAttachment,
        },
      ]

      for (const email of emails) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'Leafilms <post@leafilms.no>',
              to: [email.to],
              subject: email.subject,
              text: email.text,
              attachments: email.attachments,
            }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            console.error(`sign contract email feil (${email.to}):`, res.status, err)
          }
        } catch (emailErr) {
          console.error(`sign contract email unntak (${email.to}):`, emailErr)
        }
      }
    } else {
      console.warn('sign contract: RESEND_API_KEY mangler — e-post ikke sendt')
    }

    return Response.json({ ok: true })
  } catch (err) {
    console.error('POST /api/contracts/sign error:', err)
    return Response.json({ error: 'Serverfeil' }, { status: 500 })
  }
}
