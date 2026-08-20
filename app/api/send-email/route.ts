import { NextRequest } from 'next/server'
import { getAuthenticatedStaffUser } from '@/lib/auth/staff'
import { createServiceClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    // Staff-only — uten denne sjekken kan en innlogget kunde sende e-post
    // som Leafilms til en vilkårlig mottaker.
    const staff = await getAuthenticatedStaffUser()
    if (!staff.ok) {
      return Response.json({ error: 'Ikke autentisert' }, { status: 401 })
    }
    const { user } = staff

    const { projectId, emailType, to, subject, body, meetingLink } = await req.json()

    if (!to || !subject || !body) {
      return Response.json({ error: 'Manglende felt: to, subject, body' }, { status: 400 })
    }

    let resendMessageId: string | null = null

    if (process.env.RESEND_API_KEY) {
      const emailText = meetingLink ? `${body}\n\nMøtelink: ${meetingLink}` : body

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Leafilms <post@leafilms.no>',
          to: [to],
          subject,
          text: emailText,
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
