// Database types

export type ProjectType = 'video' | 'photo' | 'mixed'

export type PipelineStage =
  | 'lead' | 'møte' | 'tilbud_sendt' | 'kontrakt'
  | 'pre_prod' | 'produksjon' | 'post_prod'
  | 'levering' | 'fakturert' | 'videresalg'

export const PIPELINE_STAGES: { value: PipelineStage; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'møte', label: 'Møte' },
  { value: 'tilbud_sendt', label: 'Sende tilbud' },
  { value: 'kontrakt', label: 'Kontrakt' },
  { value: 'pre_prod', label: 'Pre-produksjon' },
  { value: 'produksjon', label: 'Produksjon' },
  { value: 'post_prod', label: 'Post-produksjon' },
  { value: 'levering', label: 'Levering' },
  { value: 'fakturert', label: 'Fakturering' },
  { value: 'videresalg', label: 'Videresalg' },
]

// Kortform brukt i tettpakkede lister/dashboards (pipeline-chips, tasklister) —
// samme verdier som var kopiert inn separat i 5 admin-filer.
export const PIPELINE_STAGE_LABELS_SHORT: Record<PipelineStage, string> = {
  lead: 'Lead',
  møte: 'Møte',
  tilbud_sendt: 'Sende tilbud',
  kontrakt: 'Kontrakt',
  pre_prod: 'Pre-prod',
  produksjon: 'Produksjon',
  post_prod: 'Post-prod',
  levering: 'Levering',
  fakturert: 'Fakturering',
  videresalg: 'Videresalg',
}

export type PipelineData = {
  meeting_link?: string
  meeting_link_sent_at?: string
  [key: string]: unknown
}

export type Customer = {
  id: string
  name: string
  email: string | null
  company: string | null
  phone: string | null
  address: string | null
  notes: string | null
  customer_number: number
  org_nummer: string | null
  invoice_email: string | null
  invoice_reference: string | null
  invoice_info_skipped: boolean
  invoice_info_confirmed_at: string | null
  created_at: string
  updated_at: string
}

export type CustomerContact = {
  id: string
  customer_id: string
  name: string
  email: string | null
  phone: string | null
  role: string | null
  is_primary: boolean
  created_at: string
  updated_at: string
}

export type Project = {
  id: string
  title: string
  slug: string
  client_name: string | null // Deprecated - bruk customer_id
  customer_id: string | null
  status: 'draft' | 'published' | 'archived'
  language: 'no' | 'en'
  parent_project_id?: string | null // Referanse til V1 (null for første versjon)
  version_number?: number // 1, 2, 3...
  project_type?: ProjectType | null
  pipeline_stage?: PipelineStage
  delivery_description?: string | null
  delivery_video?: string | null
  delivery_photo?: string | null
  post_prod_days?: number | null
  shoot_start?: string | null
  shoot_end?: string | null
  shoot_confirmed?: boolean
  meeting_notes?: string | null
  meeting_summary?: Record<string, unknown> | null
  pipeline_data?: PipelineData | null
  quote_assignee_id?: string | null
  invoice_assignee_id?: string | null
  resale_assignee_id?: string | null
  project_lead_id?: string | null
  pitch_review_enabled?: boolean
  pitch_reviewer_id?: string | null
  quote_review_enabled?: boolean
  quote_reviewer_id?: string | null
  created_at: string
  updated_at: string
}

export type Quote = {
  id: string
  project_id: string
  sheet_url: string | null
  version: string
  status: 'draft' | 'sent' | 'accepted' | 'rejected'
  accepted_at: string | null
  accepted_by: string | null
  pdf_path: string | null
  quote_data: Record<string, unknown> | null
  label: string | null
  is_current: boolean
  /** IDs (fra quote_data.optionalAddons) på tilleggene kunden har haket av på det publiserte tilbudet. */
  selected_addon_ids: string[]
  created_at: string
  updated_at: string
}

export type QuoteMessage = {
  id: string
  quote_id: string
  project_id: string
  user_id: string
  message: string
  mentions: string[]
  created_at: string
  user: { id: string; name: string | null; email: string } | null
}

export type PreprodMessage = {
  id: string
  project_id: string
  user_id: string
  message: string
  mentions: string[]
  created_at: string
  user: { id: string; name: string | null; email: string } | null
}

export type ReviewSubjectType = 'pitch' | 'quote'
export type ReviewStatus = 'pending' | 'approved' | 'changes_requested'

export type Review = {
  id: string
  project_id: string
  subject_type: ReviewSubjectType
  status: ReviewStatus
  requested_by: string
  reviewer_id: string
  comment: string | null
  requested_at: string
  responded_at: string | null
  created_at: string
  requester: { id: string; name: string | null; email: string } | null
  reviewer: { id: string; name: string | null; email: string } | null
}

export type CrewMember = {
  id: string
  role: string
  name: string
  dailyRate: number
  days: number
  /** Timebasert avlønning i stedet for dagsats — kun for opptaksmannskap. 'day' (default) bruker dailyRate*days som før. */
  billingMode?: 'day' | 'hour'
  hourlyRate?: number
  hours?: number
}

export type QuoteBuilderItem = {
  id: string
  description: string
  quantity: number
  unitPrice: number
}

export type OptionalAddonCategory = 'startup' | 'production' | 'post' | 'expenses'

export type OptionalAddon = {
  id: string
  description: string
  /**
   * Beløp fordelt på tilbudskategori(er) — de fleste tillegg bruker kun én, men et tillegg
   * kan spres over flere (f.eks. fotografering som krever mer i både Opptak og Post-produksjon).
   * Summen av alle verdier er tillegget totalpris. Mangler på gamle rader (se `price`/`category`
   * under) — les alltid via getAddonAmounts() i lib/quote-builder-utils.ts, ikke direkte.
   */
  amounts?: Partial<Record<OptionalAddonCategory, number>>
  /** Skal tillegget rabatteres sammen med resten av kategorien(e) (gjelder ikke 'expenses' — den rabatteres aldri)? Default true. Skru av f.eks. for innleide eksterne eksperter vi ikke kan gi rabatt på. */
  discountable?: boolean
  /** Fritekst som beskriver hvordan tillegget endrer leveransen (f.eks. "+ 10 bilder") — settes inn som eget avsnitt i kontrakten når kunden velger tillegget. Tomt/uspesifisert = tillegget påvirker ikke leveransen (f.eks. ekstra VFX). */
  deliveryImpact?: string
  /** @deprecated Erstattet av `amounts`. Beholdt kun for å lese gamle rader i quote_data — se getAddonAmounts i lib/quote-builder-utils.ts. */
  price?: number
  /** @deprecated Erstattet av `amounts`. */
  category?: OptionalAddonCategory
}

export type QuoteBuilderData = {
  version: string
  quoteDate: string
  projectName: string
  reference: string
  clientContact: string
  customerNumber: string
  ourContact: string
  paymentInfo: string
  deliveryDate: string
  deliveryDescription: string
  terms: string
  language: 'NO' | 'EN'
  startupCrew: CrewMember[]
  shootDays: number
  crew: CrewMember[]
  equipment: QuoteBuilderItem[]
  postProductionCrew: CrewMember[]
  postProduction: QuoteBuilderItem[]
  otherCosts: QuoteBuilderItem[]
  licensing: QuoteBuilderItem[]
  vatRate: number
  /** Rabatt (desimal, 0.1 = 10%) på opptak (inkl. oppstart) og post-produksjon. Gjelder ikke utstyr, lisens eller andre kostnader. */
  discountFactor: number
  includeVat: boolean
  /** E-post vist i "Fra oss"-blokken på tilbuds-PDF-en */
  companyEmail?: string
  /** Valgfrie tillegg kunden kan hake av på det publiserte tilbudet — fast pris, ikke underlagt discountFactor. */
  optionalAddons: OptionalAddon[]
}

export type DiscountFactor = {
  shoot_day: number
  discount_factor: number
  created_at: string
  updated_at: string
}

export type PriceCatalogItem = {
  id: string
  name: string
  category: string
  default_price: number
  unit: string
  created_at: string
  updated_at: string
}

export type EquipmentGroupItem = {
  id: string
  group_id: string
  catalog_item_id: string
  quantity: number
}

export type EquipmentGroup = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

/** Gruppe med varene den inneholder, hver slått sammen med katalogvaren sin (navn/kategori/pris). */
export type EquipmentGroupWithItems = EquipmentGroup & {
  items: (EquipmentGroupItem & { catalog_item: PriceCatalogItem })[]
}

export type Contract = {
  id: string
  quote_id: string
  project_id: string
  pdf_path: string | null
  status: 'pending' | 'sent' | 'signed' | 'cancelled'
  signed_at: string | null
  signed_by: string | null
  signature_data: Record<string, unknown> | null
  form_fields: ContractFormFields | null
  our_signature: OurSignature | null
  is_current: boolean
  label: string | null
  created_at: string
  updated_at: string
}

export type ContractFormFields = {
  orgNummerOverride?: string
  produksjonsPeriode?: string
  signeringsSted?: string
  signeringsDato?: string
  bedriftOverride?: string
  kundeKontaktOverride?: string
  oppstartDatoOverride?: string
  opptakDatoerOverride?: string
  leveranseOverride?: string
  totalprisOverride?: string
  /** Hvem som dekker reise/kost/losji i §5.1 — default 'oppdragsgiver' (dagens oppførsel). */
  reiseDekkesAv?: 'oppdragsgiver' | 'oppdragstaker'
  /** Antall personer i crew i §5.1 — auto-utfylt fra pristilbudets opptaksmannskap, overstyrbart. */
  antallCrewOverride?: string
}

export type OurSignature = {
  profileId: string
  signerName: string
  signatureImage: string
  signedAt: string
}

// Innholdsfelter for seksjoner (lagres som JSONB i `sections.content`).
// Kjente felter er typet — ukjente felter er tillatt via index-signaturen.
export type SectionContent = {
  title?: string
  subtitle?: string
  text?: string
  description?: string
  client?: string
  sectionLabel?: string
  sectionHeading?: string
  presetId?: number | string | null
  selectedTeamIds?: string[]
  selectedCaseIds?: string[]
  timelineItems?: { title: string; text: string; monthYear?: string }[]
  deliverableItems?: {
    id: string
    title?: string
    quantity?: number
    format?: string
    aspectRatio?: string
    description?: string
  }[]
  scheduleItems?: ScheduleItem[]
  partnerItems?: ScheduleItem[]
  partnerTitle?: string
  partnerSubtitle?: string
  teamMemberRoles?: Record<string, string>
  teamMemberRolesEn?: Record<string, string>
  teamMemberCardTranslations?: Record<string, { role?: string; bio?: string }>
  [key: string]: unknown
}

export type ScheduleItem = {
  id: string
  event: string
  location: string
  date: string
  startDate: string
  endDate: string
  channels: string
  liveOn: string
  crew: number
  manualDays?: number
}

export type Section = {
  id: string
  project_id: string
  type: 'hero' | 'goal' | 'concept' | 'cases' | 'moodboard' | 'timeline' | 'deliverables' | 'contact' | 'team' | 'example_work' | 'quote' | 'full_image' | 'production_schedule'
  content: SectionContent
  visible: boolean
  order_index: number
  created_at: string
  updated_at: string
}

export type Asset = {
  id: string
  filename: string
  file_path: string
  tags: string[]
  title: string | null
  description: string | null
  created_at: string
}

export type Video = {
  id: string
  vimeo_url: string
  vimeo_id: string | null
  title: string | null
  description: string | null
  tags: string[]
  thumbnail_url: string | null
  created_at: string
}

// Video Library type (for uploaded videos, not Vimeo)
export type VideoLibrary = {
  id: string
  filename: string
  file_path: string
  title: string | null
  description: string | null
  category: string
  subcategory: string | null
  tags: string[]
  duration: number | null
  width: number | null
  height: number | null
  file_size: number | null
  thumbnail_path: string | null
  created_at: string
  updated_at: string
}

export type SectionVideo = {
  id: string
  section_id: string
  video_id: string
  order_index: number
  position: string | null
  autoplay: boolean
  loop: boolean
  muted: boolean
  created_at: string
}

export type ProjectShare = {
  id: string
  project_id: string
  token: string
  password_hash: string | null
  expires_at: string | null
  view_count: number
  last_viewed_at: string | null
  created_at: string
}

export type AIExample = {
  id: string
  section_type: string
  project_type: string
  example_text: string
  quality_score: number
  usage_count: number
  created_at: string
  updated_at: string
}

export type CaseStudy = {
  id: string
  title: string
  description: string
  vimeo_url: string
  vimeo_id: string | null
  thumbnail_path: string | null
  tags: string[]
  order_index: number
  created_at: string
  updated_at: string
}

export type Image = {
  id: string
  filename: string
  file_path: string
  title: string | null
  description: string | null
  category: string
  subcategory: string | null
  tags: string[]
  width: number | null
  height: number | null
  file_size: number | null
  created_at: string
  updated_at: string
}

export type SectionImage = {
  id: string
  section_id: string
  image_id: string
  order_index: number
  position: string | null
  background_position_x: number | null
  background_position_y: number | null
  background_zoom: number | null
  created_at: string
  updated_at: string
}

export type TeamMember = {
  id: string
  name: string
  role: string
  bio: string | null
  profile_image_path: string | null
  email: string | null
  phone: string | null
  tags: string[]
  order_index: number
  daily_rate: number | null
  created_at: string
  updated_at: string
}

// Bildesett-posisjoner for "Eksempelarbeid"-collagen
export type CollageImages = {
  pos1: Image | null
  pos2: Image | null
  pos3: Image | null
  pos4: Image | null
  pos5: Image | null
}

export type CollagePreset = {
  id: number
  name: string
  description: string | null
  keywords: string[]
  created_at: string
  updated_at: string
}

export type CollagePresetImage = {
  id: string
  preset_id: number
  image_id: string
  position: 'left' | 'topRight' | 'bottomRight'
  created_at: string
}

export type ProjectCollageImage = {
  id: string
  project_id: string
  section_id: string
  image_id: string
  position: 'left' | 'topRight' | 'bottomRight'
  original_preset_id: number | null
  created_at: string
  updated_at: string
}

export type ProjectMessage = {
  id: string
  project_id: string
  user_id: string
  user_name: string | null
  content: string
  mentions: string[]
  created_at: string
}

export type MarketLead = {
  name: string
  company: string
  website: string | null
  reason: string
  sales_points: string[]
  cold_email: string
}

export type MarketAnalysis = {
  id: string
  status: 'pending' | 'running' | 'done' | 'error'
  triggered_by: 'manual' | 'cron' | null
  results: { customers: MarketLead[]; generated_at: string } | null
  error_message: string | null
  created_at: string
  completed_at: string | null
}

export type PitchFeedback = {
  id: string
  project_id: string
  section_id: string | null
  share_token: string
  author_name: string
  content: string
  created_at: string
}

export type Task = {
  id: string
  project_id: string
  pipeline_stage: PipelineStage
  title: string
  description: string | null
  notes: string | null
  task_data: Record<string, string> | null
  sub_type: 'video' | 'photo' | null
  custom_lane_id: string | null
  is_parallel: boolean
  color: string | null
  icon: string | null
  due_date: string | null
  status: 'todo' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high' | null
  sort_order: number
  is_custom: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  assignees: { id: string; name: string | null; email: string }[]
  // Kun satt av getMyTasks()/getDailyPlanItems() (lib/task-lock.ts) når oppgaven vises utenfor
  // sin egen stadie-side — post-prod-steg som venter på et tidligere steg i rekkefølgen.
  locked?: boolean
  blockedByTitle?: string | null
}

export type TaskStatus = Task['status']

// Intern admin-oppgave uten prosjekttilknytning — status ER pipelinen (ingen egne stadier).
export type AdminTask = {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  assignee: { id: string; name: string | null; email: string; color: string | null } | null
  due_date: string | null
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

// Delt kilde for oppgavestatus-tekst — var tidligere "Todo"/"Å gjøre"/"Ikke startet"
// for samme status i ulike admin-sider.
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Ikke startet',
  in_progress: 'Pågår',
  done: 'Ferdig',
}

// Rekkefølgen et klikk på status-chippen sykler gjennom.
export const TASK_STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'todo',
}

// Dagens plan (/admin/tasks) — personlig, sorterbar arbeidsliste for dagen.
// 'task'-varianten peker på en ekte prosjektoppgave (status leses fra tasks.status,
// ikke lagret egen "ferdig"-flagg); 'custom'-varianten er et frittstående punkt.
export type DailyPlanItem =
  | {
      id: string
      kind: 'task'
      sort_order: number
      task: Task & {
        project: { id: string; title: string; pipeline_stage: string; customer: { name: string; company: string | null } | null } | null
      }
    }
  | {
      id: string
      kind: 'custom'
      sort_order: number
      title: string
      done: boolean
    }

export type TaskMessage = {
  id: string
  task_id: string
  user_id: string
  message: string
  mentions: string[]
  created_at: string
  user?: { id: string; name: string | null; email: string } | null
}

export type TaskTemplate = {
  id: string
  pipeline_stage: PipelineStage
  title: string
  description: string | null
  sort_order: number
  project_type?: ProjectType | null
  created_at: string
}

export type ProjectWithPipeline = Project & {
  pipeline_stage: PipelineStage
  project_type?: ProjectType | null
  pipeline_data?: PipelineData | null
  project_lead_id?: string | null
  project_lead?: { id: string; name: string | null; email: string } | null
  customer?: {
    id: string
    name: string
    company: string | null
    email?: string | null
    phone?: string | null
    org_nummer?: string | null
    address?: string | null
    invoice_email?: string | null
    invoice_reference?: string | null
    invoice_info_skipped?: boolean
    invoice_info_confirmed_at?: string | null
  } | null
  tasks?: Task[]
}

// Hjelpetyper for Supabase-joinrader (klienten har ikke genererte DB-typer)
export type AssigneeJoin = { profile: { id: string; name: string | null; email: string } | null }
export type TaskRow = Task & { task_assignees?: AssigneeJoin[] }
export type ProjectRow = ProjectWithPipeline & { customers?: ProjectWithPipeline['customer'] }

// ---------------------------------------------------------------------------
// Boards (intern Milanote-erstatning) — 098_boards.sql
// ---------------------------------------------------------------------------

export type BoardCardType = 'note' | 'image' | 'video' | 'link' | 'color' | 'todo' | 'column' | 'board' | 'schedule' | 'storyline'

export type NoteContent = { text: string }
/** url mangler for tomme bildeplasser sådd inn av storyline-blueprinten, fylles inn ved opplasting */
export type ImageContent = { url?: string; caption?: string }
/** Enten embed_url (YouTube/Vimeo iframe-URL) eller url (opplastet fil i board-images) */
export type VideoContent = { embed_url?: string; url?: string }
export type LinkContent = { url: string; title?: string; description?: string; image_url?: string }
export type ColorContent = { hex: string }
export type TodoItem = { id: string; text: string; checked: boolean }
export type TodoContent = { title?: string; items: TodoItem[] }
export type ColumnContent = {
  title: string
  color?: string
  /** Fyll hele kolonnebakgrunnen med en svak toning av `color` */
  colorFill?: boolean
  /** Vis `color` som en stripe øverst på kolonnen (Milanote-stil) */
  colorStrip?: boolean
}
/** title er denormalisert fra boards.title for enkel rendering (holdes i sync av renameBoard) */
export type BoardRefContent = { child_board_id: string; title: string; color?: string }
export type SchedulePersonRef =
  | { type: 'customer_contact'; id: string }
  | { type: 'team_member'; id: string }

export type ResolvedSchedulePerson = {
  ref: SchedulePersonRef
  name: string
  role: string | null
  email: string | null
  phone: string | null
}

export type BoardScheduleItem = {
  id: string
  time: string
  label: string
  location?: string
  locationLink?: string
  people?: SchedulePersonRef[]
}

export type BoardScheduleContent = { title?: string; items: BoardScheduleItem[] }

export type BoardCardContent =
  | NoteContent | ImageContent | VideoContent | LinkContent
  | ColorContent | TodoContent | ColumnContent | BoardRefContent | BoardScheduleContent

export type Board = {
  id: string
  project_id: string
  parent_board_id: string | null
  title: string
  share_token: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  /** 'storyline' på underboards sådd av storyline-blueprinten, ellers null */
  kind: 'storyline' | null
  /** Bredden på panel-rutenettet på et storyline-board — brukes av legg til kort/rad/kolonne */
  storyline_columns: number | null
  /** Kontaktperson fra Leafilms (profiles) — satt per board, ikke per prosjekt */
  lead_profile_id: string | null
  /** Kontaktperson hos kunden (customer_contacts) — satt per board, ikke per prosjekt */
  customer_contact_id: string | null
}

export type BoardCard = {
  id: string
  board_id: string
  type: BoardCardType
  x: number
  y: number
  width: number | null
  z_index: number
  column_id: string | null
  sort_order: number
  content: BoardCardContent
  created_at: string
  updated_at: string
}

export type BoardEdge = {
  id: string
  board_id: string
  from_card_id: string
  to_card_id: string
  label: string | null
  created_at: string
}

export type BoardCommentThread = {
  id: string
  board_id: string
  card_id: string
  created_by: string | null
  resolved: boolean
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export type BoardComment = {
  id: string
  thread_id: string
  board_id: string
  author_id: string | null
  content: string
  mentions: string[]
  created_at: string
}

