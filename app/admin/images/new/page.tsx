'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button, Input, Textarea, Card, Heading, Text } from '@/components/ui'

export default function NewImage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'landskap',
    subcategory: '',
    tags: ''
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

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
    const file = e.target.files?.[0]
    if (file) {
      // Valider bilde-type
      if (!file.type.startsWith('image/')) {
        alert('❌ Filen må være et bilde')
        return
      }

      // Valider størrelse (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('❌ Bildet er for stort. Maks størrelse er 10MB')
        return
      }

      setImageFile(file)
      const previewUrl = URL.createObjectURL(file)
      setImagePreview(previewUrl)
      
      // Analyser bildet automatisk med AI
      analyzeImage(file, previewUrl)
    }
  }

  async function analyzeImage(file: File, previewUrl: string) {
    try {
      setAnalyzing(true)
      
      // Konverter bilde til base64 for å sende til API
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64Image = reader.result as string
        
        // Kall AI-analyse API
        const response = await fetch('/api/analyze-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            imageUrl: base64Image
          })
        })

        if (!response.ok) {
          throw new Error('Kunne ikke analysere bilde')
        }

        const analysis = await response.json()

        // Fyll ut formen med AI-forslag
        setFormData(prev => ({
          ...prev,
          category: analysis.category || prev.category,
          subcategory: analysis.subcategory || prev.subcategory,
          title: analysis.title || prev.title,
          description: analysis.description || prev.description,
          tags: analysis.tags ? analysis.tags.join(', ') : prev.tags
        }))

        setAnalyzing(false)
      }

      reader.readAsDataURL(file)
    } catch (error) {
      console.error('Error analyzing image:', error)
      setAnalyzing(false)
      // Fortsett uten AI-forslag hvis det feiler
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!imageFile) {
      alert('❌ Vennligst velg et bilde')
      return
    }

    setLoading(true)

    try {
      // Last opp bilde til Supabase Storage
      setUploading(true)
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
        console.error('Upload error details:', uploadError)
        throw new Error(`Kunne ikke laste opp bilde: ${uploadError.message}`)
      }

      // Hent bilde-dimensjoner (valgfritt, kan gjøres senere)
      const img = new Image()
      img.src = URL.createObjectURL(imageFile)
      await new Promise((resolve) => {
        img.onload = resolve
      })

      // Parse tags (komma-separert)
      const tagsArray = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)

      // Opprett image record i database
      const { error: dbError } = await supabase
        .from('images')
        .insert({
          filename: imageFile.name,
          file_path: filePath,
          title: formData.title || null,
          description: formData.description || null,
          category: formData.category,
          subcategory: formData.subcategory || null,
          tags: tagsArray,
          width: img.width || null,
          height: img.height || null,
          file_size: imageFile.size
        })

      if (dbError) throw dbError

      setUploading(false)
      // Bilde lastet opp
      router.push('/admin/images')
      router.refresh()
    } catch (error) {
      console.error('Error uploading image:', error)
      alert('❌ Kunne ikke laste opp bilde')
      setUploading(false)
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
                {analyzing && (
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
                required
              />
              <label
                htmlFor="image-upload"
                className="cursor-pointer inline-block"
              >
                <div className="border-2 border-dashed border-zinc-700 rounded-lg p-8 text-center hover:border-zinc-600 transition-colors">
                  {imagePreview ? (
                    <div>
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="max-w-full max-h-64 mx-auto mb-4 rounded"
                      />
                      <Text variant="small" className="text-gray-400">
                        Klikk for å endre bilde
                      </Text>
                    </div>
                  ) : (
                    <div>
                      <Text variant="body" className="mb-2">📷</Text>
                      <Text variant="body">Klikk for å velge bilde</Text>
                      <Text variant="small" className="text-gray-400 mt-2">
                        Max 10MB • AI vil automatisk foreslå kategori og tags
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
              disabled={loading || uploading}
              variant="primary"
              className="flex-1"
            >
              {uploading ? 'Laster opp...' : loading ? 'Lagrer...' : 'Last opp bilde'}
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

