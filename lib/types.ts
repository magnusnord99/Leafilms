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
  { value: 'fakturert', label: 'Fakturert' },
  { value: 'videresalg', label: 'Videresalg' },
]

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
  meeting_notes?: string | null
  meeting_summary?: Record<string, unknown> | null
  pipeline_data?: PipelineData | null
  quote_assignee_id?: string | null
  invoice_assignee_id?: string | null
  project_lead_id?: string | null
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
  created_at: string
  updated_at: string
}

export type CrewMember = {
  id: string
  role: string
  name: string
  dailyRate: number
  days: number
}

export type QuoteBuilderItem = {
  id: string
  description: string
  quantity: number
  unitPrice: number
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

export type Contract = {
  id: string
  quote_id: string
  project_id: string
  pdf_path: string | null
  status: 'pending' | 'sent' | 'signed' | 'cancelled'
  signed_at: string | null
  signed_by: string | null
  signature_data: Record<string, unknown> | null
  created_at: string
  updated_at: string
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
  due_date: string | null
  status: 'todo' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high' | null
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
  assignees: { id: string; name: string | null; email: string }[]
}

export type TaskMessage = {
  id: string
  task_id: string
  user_id: string
  message: string
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
  } | null
  tasks?: Task[]
}

// Hjelpetyper for Supabase-joinrader (klienten har ikke genererte DB-typer)
export type AssigneeJoin = { profile: { id: string; name: string | null; email: string } | null }
export type TaskRow = Task & { task_assignees?: AssigneeJoin[] }
export type ProjectRow = ProjectWithPipeline & { customers?: ProjectWithPipeline['customer'] }


