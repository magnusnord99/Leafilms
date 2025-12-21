// Database types
export type Customer = {
  id: string
  name: string
  email: string | null
  company: string | null
  phone: string | null
  address: string | null
  notes: string | null
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
  created_at: string
  updated_at: string
}

export type Quote = {
  id: string
  project_id: string
  sheet_url: string
  version: string
  status: 'draft' | 'sent' | 'accepted' | 'rejected'
  accepted_at: string | null
  accepted_by: string | null
  pdf_path: string | null // Path til PDF i Storage
  quote_data: Record<string, any> | null
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
  type: 'hero' | 'goal' | 'concept' | 'cases' | 'moodboard' | 'timeline' | 'deliverables' | 'contact' | 'team' | 'example_work' | 'quote'
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

