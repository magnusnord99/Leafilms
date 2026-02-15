'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button, Input, Textarea, Card, Heading, Text } from '@/components/ui'

export default function NewImage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'landskap',
    subcategory: '',
    tags: ''
  })
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<Array<{ file: File; preview: string; analysis?: any; analyzing: boolean; analysisError?: string }>>([])
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState<number | null>(null)

  // Kategorier med underkategorier
  const categories = {
    landskap: ['fjell', 'kyst', 'by', 'natur', 'skog'],
    sport: ['ski', 'løping', 'sykkel', 'vannsport', 'klatring', 'fotball'],
    closeup: ['produkt', 'detalj', 'tekstur', 'ansikt'],
    portrett: ['enkel', 'gruppe', 'bedrift'],
    event: ['konsert', 'konferanse', 'festival', 'sport'],
    kommersiell: ['produkt', 'merkevare', 'reklame'],
    abstrakt: ['kunst', 'mønster', 'farge'],
    bts: ['opptak', 'rigging', 'team', 'utstyr', 'lokasjon']
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // Valider alle filer
    const validFiles: File[] = []
    for (const file of files) {
      // Valider bilde-type
      if (!file.type.startsWith('image/')) {
        alert(`❌ ${file.name} er ikke et bilde og blir hoppet over`)
        continue
      }

      // Valider størrelse (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert(`❌ ${file.name} er for stort (max 10MB) og blir hoppet over`)
        continue
      }

      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    // Legg til nye filer til listen
    const newPreviews = validFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      analyzing: false
    }))

    setImageFiles(prev => [...prev, ...validFiles])
    setImagePreviews(prev => [...prev, ...newPreviews])

    // Vent på at React har oppdatert state, så analyser bilder én om gangen
    const startIndex = imagePreviews.length
    const filesToAnalyze = [...validFiles]
    const previewsToUse = [...newPreviews]
    setTimeout(async () => {
      for (let i = 0; i < filesToAnalyze.length; i++) {
        const previewIndex = startIndex + i
        await analyzeImage(filesToAnalyze[i], previewsToUse[i].preview, previewIndex)
      }
    }, 0)
  }

  /** Hent base64-data for API – komprimerer store bilder, FileReader for små */
  async function getImageBase64(file: File): Promise<string> {
    // Under 800KB: bruk FileReader (raskere, støtter alle formater)
    if (file.size < 800 * 1024) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Kunne ikke lese bilde'))
        reader.readAsDataURL(file)
      })
    }
    // Store bilder: komprimer via canvas, fallback til FileReader hvis canvas feiler
    try {
      return await compressImageForAnalysis(file)
    } catch {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Kunne ikke lese bilde'))
        reader.readAsDataURL(file)
      })
    }
  }

  /** Komprimer bilde via canvas (max 1024px, JPEG 0.8) – fallback for store filer */
  async function compressImageForAnalysis(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const blobUrl = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(blobUrl)
        const MAX_SIZE = 1024
        let w = img.width
        let h = img.height
        if (w > MAX_SIZE || h > MAX_SIZE) {
          if (w > h) {
            h = (h * MAX_SIZE) / w
            w = MAX_SIZE
          } else {
            w = (w * MAX_SIZE) / h
            h = MAX_SIZE
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Kunne ikke lage canvas'))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        resolve(dataUrl)
      }
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl)
        reject(new Error('Kunne ikke laste bilde'))
      }
      img.src = blobUrl
    })
  }

  async function analyzeImage(file: File, _previewUrl: string, previewIndex: number) {
    const updateAnalyzing = (analyzing: boolean, analysis?: any, error?: string) => {
      setImagePreviews(prev => {
        const updated = [...prev]
        if (updated[previewIndex]) {
          updated[previewIndex] = {
            ...updated[previewIndex],
            analyzing,
            analysis: analysis !== undefined ? analysis : updated[previewIndex].analysis,
            analysisError: error
          }
        }
        return updated
      })
    }

    try {
      updateAnalyzing(true)
      const base64Image = await getImageBase64(file)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 25000)
      const response = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: base64Image }),
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      const data = await response.json()

      if (!response.ok) {
        const errMsg = data?.error || `Feil: ${response.status}`
        updateAnalyzing(false, undefined, errMsg)
        console.error('Analyze API error:', errMsg)
        return
      }

      updateAnalyzing(false, data)

      // Fyll inn skjema med AI-forslag (særlig ved ett bilde)
      if (data && previewIndex === 0) {
        setFormData(prev => ({
          ...prev,
          title: data.title || prev.title,
          description: data.description || prev.description,
          category: data.category && Object.keys(categories).includes(data.category) ? data.category : prev.category,
          subcategory: data.subcategory || prev.subcategory,
          tags: Array.isArray(data.tags) ? data.tags.join(', ') : (data.tags || prev.tags)
        }))
      }
    } catch (error) {
      console.error('Error analyzing image:', error)
      let errMsg = 'Kunne ikke analysere bilde'
      if (error instanceof Error) {
        errMsg = error.name === 'AbortError' ? 'Tidsavbrutt – prøv igjen eller sjekk internettforbindelsen' : error.message
      }
      updateAnalyzing(false, undefined, errMsg)
    }
  }

  const removeImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index))
    setImagePreviews(prev => {
      const removed = prev[index]
      URL.revokeObjectURL(removed.preview) // Cleanup
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (imageFiles.length === 0) {
      alert('❌ Vennligst velg minst ett bilde')
      return
    }

    setLoading(true)
    setUploading(true)

    try {
      // Sjekk om Supabase er riktig konfigurert
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      
      if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder')) {
        console.error('Supabase not configured:', { supabaseUrl, hasKey: !!supabaseKey })
        throw new Error('Supabase er ikke riktig konfigurert. Sjekk environment variables.')
      }

      let successCount = 0
      let errorCount = 0

      // Prosesser hvert bilde en etter en
      for (let i = 0; i < imageFiles.length; i++) {
        const imageFile = imageFiles[i]
        const previewData = imagePreviews[i]
        
        try {
          setCurrentProcessingIndex(i)
          
          // Last opp bilde til Supabase Storage
          const fileExt = imageFile.name.split('.').pop()
          const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
          const filePath = `images/${fileName}`

          const { error: uploadError } = await supabase.storage
            .from('assets')
            .upload(filePath, imageFile, {
              cacheControl: '3600',
              upsert: false
            })

          if (uploadError) {
            console.error(`Upload error for ${imageFile.name}:`, uploadError)
            errorCount++
            continue
          }

          // Hent bilde-dimensjoner
          const img = new Image()
          img.src = URL.createObjectURL(imageFile)
          await new Promise((resolve) => {
            img.onload = resolve
          })

          // Bruk AI-analyse hvis tilgjengelig, ellers bruk formData
          const analysis = previewData?.analysis
          const tagsArray = analysis?.tags 
            ? analysis.tags 
            : formData.tags
              .split(',')
              .map(t => t.trim())
              .filter(t => t.length > 0)

          // Opprett image record i database
          const { error: dbError } = await supabase
            .from('images')
            .insert({
              filename: imageFile.name,
              file_path: filePath,
              title: analysis?.title || formData.title || null,
              description: analysis?.description || formData.description || null,
              category: analysis?.category || formData.category,
              subcategory: analysis?.subcategory || formData.subcategory || null,
              tags: tagsArray,
              width: img.width || null,
              height: img.height || null,
              file_size: imageFile.size
            })

          if (dbError) {
            console.error(`Database error for ${imageFile.name}:`, dbError)
            errorCount++
            continue
          }

          successCount++
        } catch (error) {
          console.error(`Error processing ${imageFile.name}:`, error)
          errorCount++
        }
      }

      setUploading(false)
      setCurrentProcessingIndex(null)
      
      // Vis resultat
      if (successCount > 0) {
        alert(`✅ ${successCount} bilde${successCount > 1 ? 'r' : ''} lastet opp${errorCount > 0 ? `\n❌ ${errorCount} bilde${errorCount > 1 ? 'r' : ''} feilet` : ''}`)
        router.push('/admin/images')
        router.refresh()
      } else {
        alert(`❌ Kunne ikke laste opp bildene`)
      }
    } catch (error) {
      console.error('Error uploading images:', error)
      alert('❌ Kunne ikke laste opp bildene')
      setUploading(false)
      setCurrentProcessingIndex(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <Button
            variant="ghost"
            onClick={() => router.push('/admin/images')}
            className="mb-4 -ml-2"
          >
            ← Tilbake
          </Button>
          <Heading as="h1" size="lg" className="mb-2">Last opp bilde</Heading>
          <Text variant="muted">Legg til et nytt bilde i biblioteket</Text>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Image Upload */}
          <Card>
            <label className="block mb-4">
              <div className="flex items-center justify-between mb-2">
                <Text variant="body">Bilde *</Text>
                {imagePreviews.some(p => p.analyzing) && (
                  <Text variant="small" className="text-blue-400">
                    ✨ AI analyserer bildet...
                  </Text>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
                id="image-upload"
                multiple
              />
              <label
                htmlFor="image-upload"
                className="cursor-pointer inline-block"
              >
                <div className="border-2 border-dashed border-zinc-700 rounded-lg p-8 text-center hover:border-zinc-600 transition-colors">
                  {imagePreviews.length > 0 ? (
                    <div className="space-y-4">
                      <Text variant="body" className="mb-4">
                        {imagePreviews.length} bilde{imagePreviews.length > 1 ? 'r' : ''} valgt
                      </Text>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {imagePreviews.map((preview, index) => (
                          <div key={index} className="relative">
                            <img
                              src={preview.preview}
                              alt={`Preview ${index + 1}`}
                              className="w-full h-32 object-cover rounded mb-2"
                            />
                            {preview.analyzing && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded">
                                <Text variant="small" className="text-blue-400">
                                  ✨ Analyserer...
                                </Text>
                              </div>
                            )}
                            {preview.analysis && !preview.analyzing && !preview.analysisError && (
                              <div className="absolute top-1 right-1 bg-green-500 rounded-full w-4 h-4 flex items-center justify-center">
                                <span className="text-white text-xs">✓</span>
                              </div>
                            )}
                            {preview.analysisError && !preview.analyzing && (
                              <div className="absolute bottom-8 left-1 right-1">
                                <button
                                  type="button"
                                  onClick={() => analyzeImage(preview.file, preview.preview, index)}
                                  className="w-full py-1 bg-amber-600 hover:bg-amber-500 rounded text-xs"
                                >
                                  ✨ Prøv AI-analysen igjen
                                </button>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => removeImage(index)}
                              className="absolute top-1 left-1 bg-red-500 hover:bg-red-600 rounded-full w-6 h-6 flex items-center justify-center text-white text-xs"
                            >
                              ×
                            </button>
                            {currentProcessingIndex === index && uploading && (
                              <div className="absolute bottom-0 left-0 right-0 bg-blue-500 text-white text-xs py-1 rounded-b">
                                Laster opp...
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <Text variant="small" className="text-gray-400">
                        Klikk for å legge til flere bilder
                      </Text>
                    </div>
                  ) : (
                    <div>
                      <Text variant="body" className="mb-2">📷</Text>
                      <Text variant="body">Klikk for å velge bilde(r)</Text>
                      <Text variant="small" className="text-gray-400 mt-2">
                        Du kan velge flere bilder • Max 10MB per bilde • AI analyserer automatisk
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
            placeholder="F.eks. Fjelltopp i Lofoten"
          />

          {/* Description */}
          <Textarea
            label="Beskrivelse (valgfritt)"
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Beskriv bildet..."
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
            placeholder="F.eks. sommer, utendørs, action"
          />

          {/* Submit */}
          <div className="flex gap-4">
            <Button
              type="submit"
              disabled={loading || uploading || imageFiles.length === 0}
              variant="primary"
              className="flex-1"
            >
              {uploading 
                ? currentProcessingIndex !== null 
                  ? `Laster opp ${currentProcessingIndex + 1}/${imageFiles.length}...` 
                  : 'Laster opp...' 
                : loading 
                  ? 'Lagrer...' 
                  : `Last opp ${imageFiles.length} bilde${imageFiles.length > 1 ? 'r' : ''}`}
            </Button>
            <Button
              type="button"
              onClick={() => router.push('/admin/images')}
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

