import { supabase } from '@/lib/supabase-client'

const MAX_BYTES = 52428800 // 50 MB — matcher bucketens file_size_limit
const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']

export async function uploadBoardFile(boardId: string, file: File): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED.includes(file.type)) return { error: `Filtypen ${file.type || 'ukjent'} støttes ikke` }
  if (file.size > MAX_BYTES) return { error: 'Filen er større enn 50 MB' }
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${boardId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('board-images').upload(path, file, { contentType: file.type })
  if (error) return { error: 'Opplasting feilet: ' + error.message }
  const { data } = supabase.storage.from('board-images').getPublicUrl(path)
  return { url: data.publicUrl }
}
