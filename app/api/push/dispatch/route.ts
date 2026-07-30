import { NextRequest } from 'next/server'
import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase-server'
import { buildPushContent, type PushNotificationRow } from '@/lib/push-notification-content'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-push-secret')
  if (!secret || secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return Response.json({ error: 'Ikke autorisert' }, { status: 401 })
  }

  const payload = await req.json().catch(() => null)
  // Webhooken er konfigurert til kun å fyre på INSERT (se migrasjon/dashboard-oppsett),
  // men denne sjekken er et sekundært vern mot at noen endrer trigger-konfigurasjonen
  // til også å inkludere UPDATE (f.eks. når `read` settes til true).
  if (!payload || payload.type !== 'INSERT') {
    return Response.json({ skipped: true })
  }

  const row = payload.record as PushNotificationRow | undefined
  if (!row?.user_id) {
    return Response.json({ error: 'Mangler varsel-data' }, { status: 400 })
  }

  const supabase = createServiceClient()

  let taskPipelineStage: string | null = null
  if (row.task_id) {
    const { data: task } = await supabase
      .from('tasks')
      .select('pipeline_stage')
      .eq('id', row.task_id)
      .single()
    taskPipelineStage = task?.pipeline_stage ?? null
  }

  const content = buildPushContent(row, taskPipelineStage)

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', row.user_id)

  if (!subscriptions?.length) {
    return Response.json({ sent: 0 })
  }

  let sent = 0
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(content)
        )
        sent++
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        } else {
          console.error('push send feilet for subscription', sub.id, err)
        }
      }
    })
  )

  return Response.json({ sent })
}
