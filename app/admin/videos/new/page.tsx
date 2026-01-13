'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button, Input, Textarea, Card, Heading, Text } from '@/components/ui'

export default function NewVideo() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'hero',
    subcategory: '',
    tags: ''
  })
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoPreview, setVideoPreview] = useState<string | null>(null)
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null)

  // Kategorier med underkategorier
  const categories = {
    hero: ['nature', 'urban', 'sport', 'abstract', 'corporate'],
    background: ['nature', 'urban', 'abstract', 'texture'],
    showcase: ['product', 'event', 'corporate'],
    nature: ['landscape', 'wildlife', 'seasons'],
    urban: ['city', 'architecture', 'street'],
    sport: ['action', 'training', 'competition']
  }

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Valider video-type
    if (!file.type.startsWith('video/')) {
      alert('❌ Filen er ikke en video')
      return
    }

    // Valider størrelse (max 50MB - Supabase Storage standard limit)
    // For større filer, vurder å bruke en video-hosting service som Cloudflare Stream eller Mux
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
      alert(`❌ Videoen er for stor (${sizeMB}MB)\n\nSupabase Storage har en grense på 50MB per fil.\n\nFor større videoer, vurder:\n- Komprimere videoen før opplasting\n- Bruke en dedikert video-hosting service\n- Dele opp videoen i mindre segmenter`)
      return
    }

    setVideoFile(file)
    setVideoPreview(URL.createObjectURL(file))
  }

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Valider bilde-type
    if (!file.type.startsWith('image/')) {
      alert('❌ Thumbnail må være et bilde')
      return
    }

    setThumbnailFile(file)
    setThumbnailPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!videoFile) {
      alert('❌ Vennligst velg en video')
      return
    }

    setLoading(true)
    setUploading(true)

    try {
      // Sjekk om Supabase er riktig konfigurert
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      
      if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder')) {
        throw new Error('Supabase er ikke riktig konfigurert. Sjekk environment variables.')
      }

      // Last opp video til Supabase Storage
      const videoExt = videoFile.name.split('.').pop()
      const videoFileName = `${Math.random().toString(36).substring(2)}.${videoExt}`
      const videoPath = `videos/${videoFileName}`

      console.log('📤 Starting video upload...', {
        fileName: videoFile.name,
        fileSize: `${(videoFile.size / (1024 * 1024)).toFixed(2)}MB`,
        fileType: videoFile.type,
        path: videoPath
      })

      // For store filer, kan det være nødvendig å bruke chunked upload
      // Supabase Storage støtter automatisk chunking, men vi kan eksplisitt sette det
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('assets')
        .upload(videoPath, videoFile, {
          cacheControl: '3600',
          upsert: false,
          contentType: videoFile.type || 'video/mp4',
          // Supabase håndterer automatisk chunking for store filer
          // Men vi kan eksplisitt deaktivere det hvis det forårsaker problemer
        })

      if (uploadError) {
        // Log full error object for debugging
        console.error('❌ Upload error details:', {
          error: uploadError,
          message: uploadError.message,
          name: uploadError.name,
          errorDetails: JSON.stringify(uploadError, null, 2)
        })
        
        // Gi bedre feilmeldinger for vanlige feil
        const errorMsg = uploadError.message || uploadError.name || JSON.stringify(uploadError) || 'Ukjent feil'
        const fileSizeMB = (videoFile.size / (1024 * 1024)).toFixed(2)
        
        if (errorMsg.includes('exceeded') || errorMsg.includes('size') || errorMsg.includes('too large') || errorMsg.includes('maximum')) {
          throw new Error(
            `Videoen er for stor eller bucket har en lavere grense.\n\n` +
            `Fil størrelse: ${fileSizeMB}MB\n` +
            `Bucket limit: 30MB (satt i Supabase)\n\n` +
            `Sjekk i Supabase Dashboard:\n` +
            `1. Storage → Buckets → assets → Settings\n` +
            `2. Se "File size limit" - øk til minst ${Math.ceil(parseFloat(fileSizeMB)) + 5}MB\n` +
            `3. Sjekk at "Allowed MIME types" inkluderer video/*`
          )
        }
        
        // Generisk feilmelding med all tilgjengelig info
        throw new Error(
          `Kunne ikke laste opp video: ${errorMsg}\n\n` +
          `Fil: ${videoFile.name} (${fileSizeMB}MB)\n` +
          `Type: ${videoFile.type}\n\n` +
          `Sjekk browser console for mer detaljer.`
        )
      }

      console.log('✅ Video uploaded successfully:', uploadData)

      // Hent video-dimensjoner og varighet (forenklet - i produksjon bør dette gjøres server-side)
      let videoWidth: number | null = null
      let videoHeight: number | null = null
      let duration: number | null = null

      try {
        const video = document.createElement('video')
        video.src = videoPreview || ''
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = () => {
            videoWidth = video.videoWidth
            videoHeight = video.videoHeight
            duration = Math.floor(video.duration)
            resolve(null)
          }
          video.onerror = reject
        })
      } catch (err) {
        console.warn('Could not extract video metadata:', err)
      }

      // Last opp thumbnail hvis valgt
      let thumbnailPath: string | null = null
      if (thumbnailFile) {
        const thumbExt = thumbnailFile.name.split('.').pop()
        const thumbFileName = `${Math.random().toString(36).substring(2)}.${thumbExt}`
        const thumbPath = `videos/thumbnails/${thumbFileName}`

        const { error: thumbUploadError } = await supabase.storage
          .from('assets')
          .upload(thumbPath, thumbnailFile, {
            cacheControl: '3600',
            upsert: false
          })

        if (!thumbUploadError) {
          thumbnailPath = thumbPath
        }
      }

      // Parse tags
      const tagsArray = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)

      // Opprett video record i database
      const { error: dbError } = await supabase
        .from('video_library')
        .insert({
          filename: videoFile.name,
          file_path: videoPath,
          title: formData.title || null,
          description: formData.description || null,
          category: formData.category,
          subcategory: formData.subcategory || null,
          tags: tagsArray,
          duration: duration,
          width: videoWidth,
          height: videoHeight,
          file_size: videoFile.size,
          thumbnail_path: thumbnailPath
        })

      if (dbError) {
        throw dbError
      }

      // Video opprettet
      alert('✅ Video lastet opp!')
      router.push('/admin/videos')
      router.refresh()
    } catch (error) {
      // Log full error object for debugging
      console.error('❌ Error uploading video:', error)
      console.error('Error type:', typeof error)
      console.error('Error keys:', error && typeof error === 'object' ? Object.keys(error) : 'N/A')
      console.error('Error stringified:', JSON.stringify(error, null, 2))
      
      // Prøv å hente feilmelding fra ulike steder
      let errorMessage = 'Ukjent feil'
      
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (error && typeof error === 'object') {
        // Prøv å hente message fra error objektet
        errorMessage = (error as any).message || 
                      (error as any).error?.message || 
                      (error as any).statusText ||
                      JSON.stringify(error)
      } else {
        errorMessage = String(error)
      }
      
      // Sjekk for spesifikke feiltyper
      const errorStr = errorMessage.toLowerCase()
      const fileSizeMB = videoFile ? (videoFile.size / (1024 * 1024)).toFixed(2) : 'ukjent'
      
      if (errorStr.includes('exceeded') || errorStr.includes('size') || errorStr.includes('too large') || errorStr.includes('maximum')) {
        alert(
          `❌ Videoen er for stor!\n\n` +
          `Fil størrelse: ${fileSizeMB}MB\n` +
          `Bucket limit: 30MB (satt i Supabase)\n\n` +
          `Løsninger:\n` +
          `• Komprimer videoen til under 30MB\n` +
          `• Øk bucket limit i Supabase Dashboard\n` +
          `• Bruk en video-hosting service (Cloudflare Stream, Mux)`
        )
      } else if (errorStr.includes('permission') || errorStr.includes('unauthorized') || errorStr.includes('forbidden')) {
        alert(
          `❌ Ingen tilgang til å laste opp!\n\n` +
          `Sjekk i Supabase Dashboard:\n` +
          `1. Storage → Policies\n` +
          `2. Sjekk at det finnes en INSERT policy for 'assets' bucket\n` +
          `3. Sjekk at brukeren har riktige rettigheter`
        )
      } else {
        alert(
          `❌ Kunne ikke laste opp videoen\n\n` +
          `Feil: ${errorMessage}\n\n` +
          `Fil: ${videoFile?.name || 'ukjent'} (${fileSizeMB}MB)\n\n` +
          `Sjekk browser console for mer detaljer.`
        )
      }
    } finally {
      setLoading(false)
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <Button
            variant="ghost"
            onClick={() => router.push('/admin/videos')}
            className="mb-4 -ml-2"
          >
            ← Tilbake
          </Button>
          <Heading as="h1" size="lg" className="mb-2">Last opp video</Heading>
          <Text variant="muted">Legg til en ny video i biblioteket</Text>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Video Upload */}
          <Card>
            <label className="block mb-4">
              <Text variant="body" className="mb-2">Video *</Text>
              <input
                type="file"
                accept="video/*"
                onChange={handleVideoChange}
                className="hidden"
                id="video-upload"
              />
              <label
                htmlFor="video-upload"
                className="cursor-pointer inline-block w-full"
              >
                <div className="border-2 border-dashed border-zinc-700 rounded-lg p-8 text-center hover:border-zinc-600 transition-colors">
                  {videoPreview ? (
                    <div className="space-y-4">
                      <video
                        src={videoPreview}
                        className="w-full max-h-64 rounded"
                        controls
                      />
                      <Text variant="small" className="text-gray-400">
                        Klikk for å velge annen video
                      </Text>
                    </div>
                  ) : (
                    <div>
                      <Text variant="body" className="mb-2">🎬</Text>
                      <Text variant="body">Klikk for å velge video</Text>
                      <Text variant="small" className="text-gray-400 mt-2">
                        Max 50MB • MP4, WebM, MOV
                      </Text>
                      <Text variant="small" className="text-yellow-400 mt-1">
                        ⚠️ For større videoer, komprimer først eller bruk ekstern hosting
                      </Text>
                    </div>
                  )}
                </div>
              </label>
            </label>
          </Card>

          {/* Thumbnail Upload (valgfritt) */}
          <Card>
            <label className="block mb-4">
              <Text variant="body" className="mb-2">Thumbnail (valgfritt)</Text>
              <input
                type="file"
                accept="image/*"
                onChange={handleThumbnailChange}
                className="hidden"
                id="thumbnail-upload"
              />
              <label
                htmlFor="thumbnail-upload"
                className="cursor-pointer inline-block w-full"
              >
                <div className="border-2 border-dashed border-zinc-700 rounded-lg p-8 text-center hover:border-zinc-600 transition-colors">
                  {thumbnailPreview ? (
                    <div className="space-y-4">
                      <img
                        src={thumbnailPreview}
                        alt="Thumbnail preview"
                        className="w-full max-h-48 object-cover rounded mx-auto"
                      />
                      <Text variant="small" className="text-gray-400">
                        Klikk for å velge annen thumbnail
                      </Text>
                    </div>
                  ) : (
                    <div>
                      <Text variant="body" className="mb-2">🖼️</Text>
                      <Text variant="body">Klikk for å velge thumbnail</Text>
                      <Text variant="small" className="text-gray-400 mt-2">
                        Hvis ikke valgt, brukes første frame fra videoen
                      </Text>
                    </div>
                  )}
                </div>
              </label>
            </label>
          </Card>

          {/* Title */}
          <Input
            label="Tittel (valgfritt)"
            type="text"
            id="title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="F.eks. Hero video - Natur"
          />

          {/* Description */}
          <Textarea
            label="Beskrivelse (valgfritt)"
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Beskriv videoen..."
            rows={4}
          />

          {/* Category */}
          <div>
            <Text variant="body" className="mb-2 block">Kategori *</Text>
            <select
              value={formData.category}
              onChange={(e) => {
                setFormData({ ...formData, category: e.target.value, subcategory: '' })
              }}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-4 py-2 text-white"
              required
            >
              {Object.keys(categories).map((cat) => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Subcategory */}
          {categories[formData.category as keyof typeof categories] && (
            <div>
              <Text variant="body" className="mb-2 block">Underkategori (valgfritt)</Text>
              <select
                value={formData.subcategory}
                onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-4 py-2 text-white"
              >
                <option value="">Ingen underkategori</option>
                {categories[formData.category as keyof typeof categories].map((subcat) => (
                  <option key={subcat} value={`${formData.category}/${subcat}`}>
                    {subcat.charAt(0).toUpperCase() + subcat.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tags */}
          <Input
            label="Tags (komma-separert, valgfritt)"
            type="text"
            id="tags"
            value={formData.tags}
            onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
            placeholder="F.eks. hero, bakgrunn, natur"
          />

          {/* Submit */}
          <div className="flex gap-4">
            <Button
              type="submit"
              disabled={loading || uploading || !videoFile}
              variant="primary"
              className="flex-1"
            >
              {uploading ? 'Laster opp...' : loading ? 'Lagrer...' : 'Last opp video'}
            </Button>
            <Button
              type="button"
              onClick={() => router.push('/admin/videos')}
              variant="secondary"
            >
              Avbryt
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
