'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { ProjectLink } from '@/lib/types'
import { NudgeButton } from '@/components/shared/NudgeButton'
import { C } from '@/lib/admin-theme'

// Navngitte lenker knyttet til et prosjekt — samme mønster og visuelle stil
// som ProjectDocuments (components/project/ProjectDocuments.tsx), backet av
// project_links-tabellen (185_project_links.sql).
export function ProjectLinks({ projectId, defaultCollapsed = false }: { projectId: string; defaultCollapsed?: boolean }) {
  const [links, setLinks] = useState<ProjectLink[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  // Legg-til-skjema
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('project_links')
        .select('id, project_id, created_by, label, url, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      if (!cancelled) {
        setLoadError(error ? error.message : null)
        setLinks((data ?? []) as ProjectLink[])
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  async function handleAdd() {
    const trimmedLabel = newLabel.trim()
    let trimmedUrl = newUrl.trim()
    if (!trimmedLabel || !trimmedUrl) return

    // Legg til https:// hvis ingen protokoll er oppgitt
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      trimmedUrl = 'https://' + trimmedUrl
    }

    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: inserted, error: insertError } = await supabase
      .from('project_links')
      .insert({
        project_id: projectId,
        created_by: user?.id ?? null,
        label: trimmedLabel,
        url: trimmedUrl,
      })
      .select()
      .single()

    setSaving(false)
    if (insertError || !inserted) {
      alert('Kunne ikke lagre lenken. Prøv igjen.')
      return
    }
    setLinks(prev => [inserted as ProjectLink, ...prev])
    setNewLabel('')
    setNewUrl('')
    setAdding(false)
  }

  async function handleDelete(link: ProjectLink) {
    if (!confirm(`Slette «${link.label}»? Dette kan ikke angres.`)) return
    const supabase = createClient()
    const { error } = await supabase.from('project_links').delete().eq('id', link.id)
    if (error) {
      alert('Kunne ikke slette lenken. Prøv igjen.')
      return
    }
    setLinks(prev => prev.filter(l => l.id !== link.id))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: !collapsed && links.length > 0 ? 10 : 0 }}>
        <button
          onClick={() => setCollapsed(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span style={{ display: 'inline-block', transition: 'transform 0.12s', transform: collapsed ? 'none' : 'rotate(90deg)', color: C.text3, fontSize: '0.65rem' }}>▸</span>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.text3 }}>
            Lenker{links.length > 0 ? ` (${links.length})` : ''}
          </span>
        </button>
        <button
          onClick={() => { setAdding(v => !v); setCollapsed(false) }}
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 500, color: C.accent, background: 'none', border: `1px solid ${C.accent}`, borderRadius: 5, padding: '3px 10px', cursor: 'pointer' }}
        >
          {adding ? 'Avbryt' : '+ Legg til'}
        </button>
      </div>

      {adding && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, padding: '10px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6 }}>
          <input
            type="text"
            placeholder="Navn på lenke (f.eks. Google Drive, Dropbox)"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text,
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4,
              padding: '6px 10px', outline: 'none', width: '100%', boxSizing: 'border-box',
            }}
          />
          <input
            type="url"
            placeholder="URL (https://...)"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text,
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4,
              padding: '6px 10px', outline: 'none', width: '100%', boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handleAdd}
            disabled={saving || !newLabel.trim() || !newUrl.trim()}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600,
              padding: '6px 14px', borderRadius: 5, border: 'none', alignSelf: 'flex-end',
              background: saving || !newLabel.trim() || !newUrl.trim() ? C.surface2 : C.accent,
              color: saving || !newLabel.trim() || !newUrl.trim() ? C.text3 : '#fff',
              cursor: saving || !newLabel.trim() || !newUrl.trim() ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Lagrer...' : 'Lagre lenke'}
          </button>
        </div>
      )}

      {loadError && (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: '#f0b0b0', background: '#3a1d1d', border: '1px solid #E05555', borderRadius: 6, padding: '6px 10px' }}>
          Kunne ikke hente lenker: {loadError}
        </p>
      )}
      {!collapsed && !loading && !loadError && links.length === 0 && !adding && (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic' }}>
          Ingen lenker lagt til ennå.
        </p>
      )}
      {!collapsed && links.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {links.map(link => (
            <div
              key={link.id}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 4 }}
            >
              {/* Liten link-ikon */}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.text3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                title={link.url}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, textDecoration: 'underline', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {link.label}
              </a>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, flexShrink: 0 }}>
                {new Date(link.created_at).toLocaleDateString('nb-NO')}
              </span>
              <NudgeButton projectId={projectId} label={`lenken «${link.label}»`} />
              <button
                onClick={() => handleDelete(link)}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500, padding: '3px 9px', borderRadius: 3, cursor: 'pointer', background: 'rgba(224,85,85,0.1)', color: C.danger, border: '1px solid rgba(224,85,85,0.25)', flexShrink: 0 }}
              >
                Slett
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
