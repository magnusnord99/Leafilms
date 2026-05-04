// Database types
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
  quote_data: Record<string, any> | null
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
  discountPercentage: number
  includeVat: boolean
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
  signature_data: Record<string, any> | null
  created_at: string
  updated_at: string
}

export type Section = {
  id: string
  project_id: string
  type: 'hero' | 'goal' | 'concept' | 'cases' | 'moodboard' | 'timeline' | 'deliverables' | 'contact' | 'team' | 'example_work' | 'quote' | 'full_image' | 'production_schedule'
  content: Record<string, any>
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

