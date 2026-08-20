import { NextRequest } from 'next/server'
import { getAuthenticatedStaffUser } from '@/lib/auth/staff'
import { runChat, type ChatMessage } from '@/lib/ai/chat'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  // Staff-only — runChat bruker service-rollen; en customer-JWT må ikke
  // kunne dumpe CRM via query_database.
  const staff = await getAuthenticatedStaffUser()
  if (!staff.ok) {
    return Response.json({ error: 'Ikke autentisert' }, { status: 401 })
  }

  let messages: ChatMessage[]
  try {
    const body = await req.json()
    messages = body.messages
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: 'Ugyldig input: messages må være en ikke-tom array' }, { status: 400 })
    }
  } catch {
    return Response.json({ error: 'Ugyldig JSON' }, { status: 400 })
  }

  try {
    const stream = await runChat(messages)
    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err) {
    console.error('[AI chat] Feil:', err)
    return Response.json({ error: 'Serverfeil ved generering av svar' }, { status: 500 })
  }
}
