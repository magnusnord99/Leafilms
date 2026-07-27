import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import type { OurSignature, QuoteBuilderData } from '@/lib/types'
import { calculateQuoteTotals, addonDiscountedPrice } from '@/lib/quote-builder-utils'
import { buildContractTextWithAddons } from '@/lib/contract-addendum'
import { generateContractPDF } from '../pdf-generator'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      projectId, shareToken, signerName, signerEmail, contractSnapshot, signatureImage,
      selectedAddonIds: rawSelectedAddonIds,
      noInvoiceInfo, invoiceCompany, invoiceOrgNummer, invoiceAddress, invoiceEmail, invoiceReference,
    } = body
    const selectedAddonIds: string[] = Array.isArray(rawSelectedAddonIds) ? rawSelectedAddonIds : []

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

    // Hent gjeldende kontrakt for prosjektet
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('id, published_at, status, contract_text, our_signature')
      .eq('project_id', projectId)
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

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

    // Hent prosjektet tidlig — språket styrer kontrakttillegg, PDF og kunde-e-post,
    // og pipeline-feltene brukes ved stage-avansering lenger ned.
    const { data: existingProject } = await supabase
      .from('projects')
      .select('title, pipeline_stage, pipeline_data, language, customer_id')
      .eq('id', projectId)
      .single()

    const lang: 'no' | 'en' = existingProject?.language === 'en' ? 'en' : 'no'

    // Admin kan skru av fakturainfo-spørsmålet per prosjekt (f.eks. hvis vi allerede har
    // informasjonen) — defaulter til på for prosjekter uten eksplisitt valg.
    const requestInvoiceInfo =
      (existingProject?.pipeline_data as { request_invoice_info?: boolean } | null)?.request_invoice_info !== false

    // Fakturainformasjon er påkrevd med mindre den er skrudd av for prosjektet, eller kunden
    // eksplisitt har krysset av for at den ikke er tilgjengelig ennå — samme regel håndheves
    // client-side (canSubmit), men signeringsendepunktet er offentlig så vi stoler ikke på
    // klienten alene.
    if (requestInvoiceInfo) {
      const hasInvoiceInfo =
        typeof invoiceCompany === 'string' && invoiceCompany.trim() !== '' &&
        typeof invoiceAddress === 'string' && invoiceAddress.trim() !== '' &&
        typeof invoiceEmail === 'string' && invoiceEmail.trim() !== ''
      if (!noInvoiceInfo && !hasInvoiceInfo) {
        return Response.json(
          { error: 'Fakturainformasjon mangler — fyll ut eller huk av for at den ikke er tilgjengelig ennå' },
          { status: 400 }
        )
      }
    }

    // Hent gjeldende tilbud — server-side, aldri klientens tall. Henter id-en ALLTID (ikke
    // bare når tillegg er valgt), slik at "sett status=accepted" lenger ned kan matche på
    // nøyaktig denne raden i stedet for et skjørt project_id+is_current-søk, som kan treffe
    // feil rad hvis noen rekker å opprette en ny (usignert) tilbudsversjon i mellomtiden
    // (samme mønster som forårsaket feedback 08a0235b).
    let quoteData: QuoteBuilderData | null = null
    let quoteRowId: string | null = null
    {
      const { data: quote } = await supabase
        .from('quotes')
        .select('id, quote_data')
        .eq('project_id', projectId)
        .eq('is_current', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (quote) {
        quoteRowId = quote.id
        if (quote.quote_data && Array.isArray((quote.quote_data as { crew?: unknown }).crew)) {
          quoteData = quote.quote_data as QuoteBuilderData
        }
      }
    }

    const selectedAddons = (quoteData?.optionalAddons ?? []).filter((a) => selectedAddonIds.includes(a.id))

    let addonsTotal = 0
    let finalPriceExclVatWithAddons: number | null = null
    let finalPriceInclVatWithAddons: number | null = null

    const baseContractText = contract.contract_text ?? contractSnapshot
    let finalContractText = baseContractText

    if (quoteData && selectedAddons.length > 0) {
      const discountFactor = quoteData.discountFactor ?? 0
      addonsTotal = selectedAddons.reduce((sum, a) => sum + addonDiscountedPrice(a, discountFactor), 0)
      const baseTotals = calculateQuoteTotals(quoteData)
      const addonsInclVat = quoteData.includeVat ? addonsTotal * (1 + quoteData.vatRate / 100) : addonsTotal
      finalPriceExclVatWithAddons = baseTotals.afterDiscount + addonsTotal
      finalPriceInclVatWithAddons = baseTotals.finalInclVat + addonsInclVat

      // Oppdaterer totalsummen i punkt 5.1 direkte (samme funksjon som forhåndsvisningen
      // bruker før signering, app/p/[token]/ContractSigningSection.tsx) — aldri divergerende.
      finalContractText = buildContractTextWithAddons(baseContractText, baseTotals.afterDiscount, selectedAddons, discountFactor, lang)
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
        // Fryst kopi av leveranselisten på signeringstidspunktet — aldri
        // oppdatert igjen etter dette (se
        // docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md).
        deliverables: quoteData?.deliverables ?? [],
        updated_at: signedAt,
        ...(finalContractText !== baseContractText ? { contract_text: finalContractText } : {}),
      })
      .eq('id', contract.id)

    if (updateContractError) {
      console.error('sign contract update error:', updateContractError)
      return Response.json({ error: 'Kunne ikke registrere signering' }, { status: 500 })
    }

    // Lagre fakturainformasjonen på kundekortet — ikke-fatal, kontrakten er allerede signert.
    // invoice_info_confirmed_at settes uansett (utfylt eller hoppet over) slik at fakturasteget
    // i pipelinen kan skille «ikke spurt ennå» fra «kunden har svart».
    if (existingProject?.customer_id && requestInvoiceInfo) {
      try {
        const customerUpdate: Record<string, unknown> = {
          invoice_info_skipped: !!noInvoiceInfo,
          invoice_info_confirmed_at: signedAt,
        }
        if (!noInvoiceInfo) {
          if (invoiceCompany?.trim()) customerUpdate.company = invoiceCompany.trim()
          if (invoiceOrgNummer?.trim()) customerUpdate.org_nummer = invoiceOrgNummer.trim()
          if (invoiceAddress?.trim()) customerUpdate.address = invoiceAddress.trim()
          if (invoiceEmail?.trim()) customerUpdate.invoice_email = invoiceEmail.trim()
          if (invoiceReference?.trim()) customerUpdate.invoice_reference = invoiceReference.trim()
        }
        const { error: customerUpdateError } = await supabase
          .from('customers')
          .update(customerUpdate)
          .eq('id', existingProject.customer_id)
        if (customerUpdateError) {
          console.error('sign contract customer invoice update error:', customerUpdateError)
        }
      } catch (invoiceErr) {
        console.error('sign contract customer invoice update exception:', invoiceErr)
      }
    }

    // Generer PDF i minnet (ikke-fatal — kontrakt er allerede signert)
    let pdfBuffer: Buffer | null = null
    try {
      const ourSignature = contract.our_signature as OurSignature | null
      pdfBuffer = await generateContractPDF(
        finalContractText,
        ourSignature,
        { signerName, signerEmail, signedAt, ip, signatureImage },
        lang
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

    // Sett gjeldende quote-versjon til accepted, og lagre valgte tillegg hvis noen ble valgt
    const quoteUpdatePayload: Record<string, unknown> = {
      status: 'accepted', updated_at: signedAt, accepted_at: signedAt, accepted_by: signerEmail,
    }
    if (quoteData && selectedAddons.length > 0 && quoteRowId) {
      quoteUpdatePayload.quote_data = {
        ...quoteData,
        selectedAddonIds: selectedAddons.map((a) => a.id),
        addonsTotal,
        finalPriceExclVatWithAddons,
        finalPriceInclVatWithAddons,
      }
    }

    // Matcher på den eksakte tilbudsraden vi allerede slo opp over, i stedet for et
    // skjørt project_id+is_current-søk (se kommentaren ved oppslaget av quoteRowId).
    let updateQuoteQuery = supabase.from('quotes').update(quoteUpdatePayload)
    updateQuoteQuery = quoteRowId
      ? updateQuoteQuery.eq('id', quoteRowId)
      : updateQuoteQuery.eq('project_id', projectId).eq('is_current', true)
    const { error: updateQuoteError } = await updateQuoteQuery

    if (updateQuoteError) {
      console.error('sign contract quote update error:', updateQuoteError)
      // Ikke fatal — logg og fortsett
    }

    // Bevar eksisterende pipeline_data-felt (hentet sammen med språket over)
    const existingPipelineData = (existingProject?.pipeline_data as Record<string, unknown>) ?? {}

    // contract_signed skal alltid settes når kontrakten faktisk signeres, uansett hvilket
    // pipeline-steg prosjektet står i akkurat da — ellers kan flagget forbli usatt selv om
    // kontrakten er reelt signert (f.eks. hvis noen rakk å flytte prosjektet videre manuelt
    // før signeringen kom inn), og admin-pipelinen viser da "ikke signert" på en signert kontrakt.
    //
    // Advanser fra både 'tilbud_sendt' og 'kontrakt' — kunden kan signere før noen i teamet har
    // rukket å flytte prosjektet til 'kontrakt' manuelt, og da skal signeringen selv drive det
    // videre til 'pre_prod' i stedet for å bli hengende i 'tilbud_sendt'.
    const shouldAdvanceStage =
      existingProject?.pipeline_stage === 'kontrakt' || existingProject?.pipeline_stage === 'tilbud_sendt'

    const { data: updatedProject, error: updateProjectError } = await supabase
      .from('projects')
      .update({
        ...(shouldAdvanceStage ? { pipeline_stage: 'pre_prod' } : {}),
        pipeline_data: { ...existingPipelineData, contract_signed: true, contract_signed_at: signedAt },
        // Levende kopi av siste signerte leveranseliste — dette er hva
        // post-prod og resten av systemet leser fra, ikke
        // contracts.deliverables (den uforanderlige historikken).
        deliverables: quoteData?.deliverables ?? [],
        updated_at: signedAt,
      })
      .eq('id', projectId)
      .select('title')
      .maybeSingle()

    if (updateProjectError) {
      console.error('sign contract project update error:', updateProjectError)
      // Ikke fatal — logg og fortsett
    }

    // Seed pre_prod-oppgaver kun hvis prosjektet faktisk ble avansert til pre_prod nå
    if (updatedProject && shouldAdvanceStage) {
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
      const formattedDate = new Date(signedAt).toLocaleString(lang === 'en' ? 'en-GB' : 'nb-NO', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })

      const pdfAttachment = pdfBuffer != null
        ? [{
            filename: `${lang === 'en' ? 'Production-Agreement' : 'Produksjonsavtale'}-${(projectTitle ?? 'kontrakt').replace(/\s+/g, '-')}.pdf`,
            content: pdfBuffer.toString('base64'),
          }]
        : []

      // Bekreftelsen til kunden følger prosjektspråket — den interne varslingen er alltid norsk
      const customerEmail = lang === 'en'
        ? {
            to: signerEmail,
            subject: `Confirmation of signed production agreement — ${projectTitle}`,
            text: `Hi ${signerName},\n\nWe confirm that you have signed the production agreement for ${projectTitle}.\n\nSigned by: ${signerName} (${signerEmail})\nDate: ${formattedDate}\n\nPlease keep this email as confirmation of the agreement.\n\nBest regards,\nLeafilms`,
            attachments: pdfAttachment,
          }
        : {
            to: signerEmail,
            subject: `Bekreftelse på signert produksjonsavtale — ${projectTitle}`,
            text: `Hei ${signerName},\n\nVi bekrefter at du har signert produksjonsavtalen for ${projectTitle}.\n\nSignert av: ${signerName} (${signerEmail})\nDato: ${formattedDate}\n\nTa vare på denne e-posten som bekreftelse på inngått avtale.\n\nMed vennlig hilsen,\nLeafilms`,
            attachments: pdfAttachment,
          }

      const emails = [
        customerEmail,
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

    // Internt varsel til hele admin-teamet (klokke-ikonet i admin) — i tillegg til
    // e-posten over. Bevisst broadcast til alle admin-profiler i stedet for kun
    // task-assignees, siden pre_prod-oppgaver først blir sådd i samme forespørsel og
    // ingen kan være tildelt ennå. Feil her skal aldri blokkere selve signeringen.
    try {
      const { data: adminProfiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin')

      if (adminProfiles && adminProfiles.length > 0) {
        await supabase.from('notifications').insert(
          adminProfiles.map((p) => ({
            user_id: p.id,
            type: 'contract_signed',
            project_id: projectId,
            message_preview: `Kontrakt signert av ${signerName} — ${projectTitle}`,
            sender_name: signerName,
          }))
        )
      }
    } catch (notifyErr) {
      console.error('sign contract notification error:', notifyErr)
    }

    return Response.json({ ok: true, pdfUrl })
  } catch (err) {
    console.error('POST /api/contracts/sign error:', err)
    return Response.json({ error: 'Serverfeil' }, { status: 500 })
  }
}
