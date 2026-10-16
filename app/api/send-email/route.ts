import { NextRequest } from 'next/server'
import { getAuthenticatedStaffUser } from '@/lib/auth/staff'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import { emailBodyToHtml, emailBodyToPlainText } from '@/lib/email-markup'
import { renderEmailFooter } from '@/lib/email-footer'

export async function POST(req: NextRequest) {
  try {
    // Staff-only — uten denne sjekken kan en innlogget kunde sende e-post
    // som Leafilms til en vilkårlig mottaker.
    const staff = await getAuthenticatedStaffUser()
    if (!staff.ok) {
      return Response.json({ error: 'Ikke autentisert' }, { status: 401 })
    }
    const { user } = staff

    const { projectId, leadId, emailType, to, cc, subject, body, meetingLink, useLeafilmsAddress } = await req.json()

    if (!to || !subject || !body) {
      return Response.json({ error: 'Manglende felt: to, subject, body' }, { status: 400 })
    }

    // cc kan komme som array eller en komma/semikolon-separert streng fra input-feltet.
    const ccList: string[] = (Array.isArray(cc) ? cc : typeof cc === 'string' ? cc.split(/[,;]/) : [])
      .map((s: string) => s.trim())
      .filter(Boolean)

    let fromAddress = 'Leafilms <post@leafilms.no>'

    // Hentes alltid (uavhengig av useLeafilmsAddress) — footeren nedenfor viser
    // alltid den faktiske avsenderen, selv når e-posten sendes fra den delte
    // post@leafilms.no-adressen.
    const supabase = await createClient()
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('name, email, phone, job_title')
      .eq('id', user.id)
      .single()

    if (!useLeafilmsAddress && senderProfile?.email) {
      fromAddress = `${senderProfile.name ?? 'Leafilms'} <${senderProfile.email}>`
    }

    let resendMessageId: string | null = null

    if (process.env.RESEND_API_KEY) {
      const { data: footerRow } = await supabase
        .from('email_footer_template')
        .select('template')
        .eq('id', 'main')
        .maybeSingle()
      const footer = footerRow?.template && senderProfile
        ? renderEmailFooter(footerRow.template, senderProfile)
        : ''

      const bodyWithMeeting = meetingLink ? `${body}\n\nMøtelink: ${meetingLink}` : body
      const emailText = emailBodyToPlainText(bodyWithMeeting) + (footer ? `\n\n--\n${emailBodyToPlainText(footer)}` : '')
      const emailHtml = emailBodyToHtml(bodyWithMeeting) + (footer
        ? `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e2e2;color:#888888;font-size:12px;line-height:1.5;">${emailBodyToHtml(footer)}</div>`
        : '')

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [to],
          ...(ccList.length > 0 ? { cc: ccList } : {}),
          subject,
          text: emailText,
          html: emailHtml,
        }),
      })

      if (!resendRes.ok) {
        const resendErr = await resendRes.json().catch(() => ({}))
        console.error('Resend feil:', resendRes.status, resendErr)
        return Response.json({ error: 'E-postsending feilet via Resend' }, { status: 502 })
      }

      const resendData = await resendRes.json().catch(() => ({}))
      resendMessageId = resendData.id ?? null
    } else {
      console.warn('send-email: RESEND_API_KEY mangler — logger men sender ikke fysisk')
    }

    // Log til email_log (bruk service client for å omgå RLS-kanttilfeller)
    const serviceClient = createServiceClient()
    const { error: logError } = await serviceClient.from('email_log').insert({
      project_id: projectId ?? null,
      lead_id: leadId ?? null,
      to_email: to,
      subject,
      body_html: body,
      sent_by: user.id,
      type: emailType ?? 'general',
      resend_message_id: resendMessageId,
    })

    if (logError) {
      console.error('email_log insert feil:', logError)
    }

    return Response.json({ success: true, messageId: resendMessageId })
  } catch (err) {
    console.error('POST /api/send-email error:', err)
    return Response.json({ error: 'Serverfeil' }, { status: 500 })
  }
}
