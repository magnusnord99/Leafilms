// Delt type→{title,body,url}-mapping brukt av /api/push/dispatch (server, ingen
// browser-API-er tilgjengelig der). Speiler bevisst navigateTo() og fraseringen i
// app/admin/varsler/VarslerClient.tsx — hold de to i sync ved nye notification-typer.

export type PushNotificationRow = {
  id: string
  user_id: string
  type: string
  project_id: string | null
  task_id: string | null
  lead_id: string | null
  conversation_id: string | null
  message_id: string | null
  meeting_id: string | null
  board_id: string | null
  board_card_id: string | null
  message_preview: string
  sender_name: string
}

const PHRASE: Record<string, string> = {
  project_message: 'i prosjekt-chatten',
  project_message_mention: 'nevnte deg i prosjekt-chatten',
  project_message_reaction: 'reagerte på meldingen din i prosjekt-chatten',
  task_message: 'i en oppgave',
  task_message_mention: 'nevnte deg i en oppgave',
  task_message_reaction: 'reagerte på meldingen din i en oppgave',
  task_assigned: 'tildelte deg en oppgave',
  lead_assigned: 'satte deg som ansvarlig for en lead',
  resale_assigned: 'satte deg som ansvarlig for videresalg',
  selection_submitted: 'sendte inn bildevalg',
  quote_mention: 'tagget deg i tilbud',
  quote_message: 'i tilbudschatten',
  quote_message_reaction: 'reagerte på meldingen din i tilbudschatten',
  quote_assigned: 'tildelte deg et tilbud',
  quote_review_requested: 'ber deg godkjenne tilbudet',
  quote_review_responded: 'svarte på review av tilbudet',
  preprod_mention: 'tagget deg i pre-prod-chatten',
  preprod_message: 'i pre-prod-chatten',
  preprod_message_reaction: 'reagerte på meldingen din i pre-prod-chatten',
  feedback_reply: 'svarte på tilbakemeldingen din',
  contract_signed: 'signerte kontrakten',
  direct_message: 'sendte deg en direktemelding',
  conversation_message_reaction: 'reagerte på meldingen din',
  meeting_invite: 'inviterte deg til et møte',
  meeting_response: 'svarte på møteinvitasjonen din',
  board_comment_mention: 'nevnte deg i en boardkommentar',
  board_comment_reply: 'svarte på kommentaren din på boardet',
  pitch_review_requested: 'ber deg godkjenne pitchen',
  pitch_review_responded: 'svarte på review av pitchen',
  invoice_assigned: 'tildelte deg en faktura',
}

function pushUrlFor(n: PushNotificationRow, taskPipelineStage: string | null): string {
  switch (n.type) {
    case 'lead_assigned':
      return n.project_id ? `/admin/projects/${n.project_id}/contact` : `/admin/leads/${n.lead_id}`
    case 'task_assigned':
    case 'resale_assigned':
      return `/admin/projects/${n.project_id}`
    case 'direct_message':
    case 'conversation_message_reaction':
      return '/admin/meldinger'
    case 'meeting_invite':
    case 'meeting_response':
      return '/admin/calendar'
    case 'project_message':
    case 'project_message_mention':
    case 'project_message_reaction':
      return `/admin/projects/${n.project_id}?chat=1`
    case 'quote_mention':
    case 'quote_assigned':
    case 'quote_message':
    case 'quote_message_reaction':
      return `/admin/projects/${n.project_id}/quote${n.type === 'quote_assigned' ? '' : '?chat=1'}`
    case 'preprod_mention':
    case 'preprod_message':
    case 'preprod_message_reaction':
      return `/admin/preprod/${n.project_id}?chat=1`
    case 'pitch_review_requested':
    case 'pitch_review_responded':
    case 'quote_review_requested':
    case 'quote_review_responded':
      return `/admin/projects/${n.project_id}?tab=pitch`
    case 'invoice_assigned':
      return `/admin/faktura/${n.project_id}`
    case 'contract_signed':
      return `/admin/projects/${n.project_id}?tab=kontrakt`
    case 'feedback_reply':
      return '/admin/varsler'
    case 'task_message':
    case 'task_message_mention':
    case 'task_message_reaction':
      if (!n.task_id) return `/admin/postprod/${n.project_id}`
      if (taskPipelineStage === 'post_prod') return `/admin/postprod/${n.project_id}?task=${n.task_id}&chat=1`
      if (taskPipelineStage === 'pre_prod') return `/admin/preprod/${n.project_id}?task=${n.task_id}`
      return `/admin/projects/${n.project_id}?task=${n.task_id}`
    case 'board_comment_mention':
    case 'board_comment_reply':
      return `/admin/boards/${n.board_id}?comment=${n.board_card_id}`
    default:
      return `/admin/postprod/${n.project_id}`
  }
}

export function buildPushContent(
  n: PushNotificationRow,
  taskPipelineStage: string | null
): { title: string; body: string; url: string } {
  return {
    title: `${n.sender_name} ${PHRASE[n.type] ?? 'i en oppgave'}`,
    body: n.message_preview,
    url: pushUrlFor(n, taskPipelineStage),
  }
}
