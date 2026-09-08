'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { ProjectDocument } from '@/lib/types'

const C = {
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  danger:   '#E05555',
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Samme project_documents-tabell og "assets"-bucket som brukes på
// kundesiden (app/admin/customers/[id]/page.tsx) — se migrasjon
// 143_project_documents.sql. Selvstendig komponent (henter sin egen
// dokumentliste) siden denne alltid vises for ett prosjekt om gangen,
// i motsetning til kundesiden som batch-henter for flere prosjekter.
export function ProjectDocuments({ projectId }: { projectId: string }) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('project_documents')
        .select('id, project_id, uploaded_by, file_name, file_path, file_type, file_size, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      if (!cancelled) {
        setLoadError(error ? error.message : null)
        setDocuments((data ?? []) as ProjectDocument[])
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  async function handleUpload(file: File) {
    setUploading(true)
    const supabase = createClient()
    const path = `project-documents/${projectId}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('assets').upload(path, file)
    if (uploadError) {
      alert('Kunne ikke laste opp filen: ' + uploadError.message)
      setUploading(false)
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    const { data: inserted, error: insertError } = await supabase
      .from('project_documents')
      .insert({
        project_id: projectId,
        uploaded_by: user?.id ?? null,
        file_name: file.name,
        file_path: path,
        file_type: file.type || null,
        file_size: file.size,
      })
      .select()
      .single()
    setUploading(false)
    if (insertError || !inserted) {
      alert('Filen ble lastet opp, men kunne ikke lagres i prosjektet. Prøv igjen.')
      return
    }
    setDocuments(prev => [inserted as ProjectDocument, ...prev])
  }

  async function handleDelete(doc: ProjectDocument) {
    if (!confirm(`Slette «${doc.file_name}»? Dette kan ikke angres.`)) return
    const supabase = createClient()
    await supabase.storage.from('assets').remove([doc.file_path])
    const { error } = await supabase.from('project_documents').delete().eq('id', doc.id)
    if (error) {
      alert('Kunne ikke slette dokumentet. Prøv igjen.')
      return
    }
    setDocuments(prev => prev.filter(d => d.id !== doc.id))
  }

  const inputId = `doc-upload-${projectId}`

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: documents.length > 0 ? 10 : 0 }}>
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.text3 }}>Filer</span>
        <label
          htmlFor={inputId}
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 500, color: C.accent, background: 'none', border: `1px solid ${C.accent}`, borderRadius: 5, padding: '3px 10px', cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}
        >
          {uploading ? 'Laster opp...' : '+ Last opp'}
        </label>
        <input
          id={inputId}
          type="file"
          disabled={uploading}
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) handleUpload(file)
            e.target.value = ''
          }}
        />
      </div>
      {loadError && (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: '#f0b0b0', background: '#3a1d1d', border: '1px solid #E05555', borderRadius: 6, padding: '6px 10px' }}>
          Kunne ikke hente filer: {loadError}
        </p>
      )}
      {!loading && !loadError && documents.length === 0 && (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic' }}>
          Ingen filer lastet opp ennå.
        </p>
      )}
      {documents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {documents.map(doc => {
            const supabase = createClient()
            const docUrl = supabase.storage.from('assets').getPublicUrl(doc.file_path).data.publicUrl
            return (
              <div
                key={doc.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 4 }}
              >
                <a
                  href={docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, textDecoration: 'underline', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {doc.file_name}
                </a>
                {doc.file_size != null && (
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, flexShrink: 0 }}>
                    {formatFileSize(doc.file_size)}
                  </span>
                )}
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, flexShrink: 0 }}>
                  {new Date(doc.created_at).toLocaleDateString('nb-NO')}
                </span>
                <button
                  onClick={() => handleDelete(doc)}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500, padding: '3px 9px', borderRadius: 3, cursor: 'pointer', background: 'rgba(224,85,85,0.1)', color: C.danger, border: '1px solid rgba(224,85,85,0.25)', flexShrink: 0 }}
                >
                  Slett
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
