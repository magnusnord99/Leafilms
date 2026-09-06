'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { C } from '@/lib/admin-theme'
import { PIPELINE_STAGE_LABELS_SHORT } from '@/lib/types'
import { timeAgo } from '@/lib/format'

type PitchProject = {
  id: string
  title: string
  status: 'draft' | 'published' | 'archived'
  client_name: string | null
  pipeline_stage: string | null
  project_type: 'video' | 'photo' | 'mixed' | null
  updated_at: string
  customer_name?: string | null
}

const PIPELINE_LABEL: Record<string, string> = PIPELINE_STAGE_LABELS_SHORT

const PIPELINE_COLOR: Record<string, string> = {
  lead: C.text3,
  møte: '#4A9AC4',
  tilbud_sendt: C.accent,
  kontrakt: '#4CAF7D',
  pre_prod: '#F0A500',
  produksjon: '#F0A500',
  post_prod: '#F0A500',
  levering: '#E8A838',
  fakturert: '#4CAF7D',
  videresalg: C.text2,
}

const PROJECT_TYPE_LABEL: Record<string, string> = {
  video: 'Film',
  photo: 'Bilder',
  mixed: 'Film & Bilder',
}

export default function PitchesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<PitchProject[]>([])
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({})
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'published'>('all')
  const [filterType, setFilterType] = useState<'all' | 'video' | 'photo' | 'mixed'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => { fetchProjects() }, [])

  async function fetchProjects() {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id, title, status, client_name, pipeline_stage, project_type, updated_at,
          customers(name)
        `)
        .neq('status', 'archived')
        .order('updated_at', { ascending: false })

      if (error) throw error

      type PitchRow = { id: string; title: string; status: 'draft' | 'published' | 'archived'; client_name: string | null; pipeline_stage: string | null; project_type: 'video' | 'photo' | 'mixed' | null; updated_at: string; customers?: { name: string | null } | null }
      const mapped: PitchProject[] = ((data || []) as unknown as PitchRow[]).map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        client_name: p.client_name,
        pipeline_stage: p.pipeline_stage,
        project_type: p.project_type,
        updated_at: p.updated_at,
        customer_name: p.customers?.name ?? null,
      }))

      setProjects(mapped)

      const publishedIds = mapped.filter(p => p.status === 'published').map(p => p.id)
      if (publishedIds.length > 0) {
        const { data: sharesData } = await supabase
          .from('project_shares')
          .select('project_id, token')
          .in('project_id', publishedIds)
        if (sharesData) {
          const links: Record<string, string> = {}
          sharesData.forEach((s: { project_id: string; token: string }) => { links[s.project_id] = `${window.location.origin}/p/${s.token}` })
          setShareLinks(links)
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = projects.filter(p => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false
    if (filterType !== 'all' && p.project_type !== filterType) return false
    if (search) {
      const q = search.toLowerCase()
      const name = (p.customer_name || p.client_name || '').toLowerCase()
      const title = (p.title || '').toLowerCase()
      if (!title.includes(q) && !name.includes(q)) return false
    }
    return true
  })

  const totalPublished = projects.filter(p => p.status === 'published').length
  const totalDraft = projects.filter(p => p.status === 'draft').length

  async function handleArchive(project: PitchProject) {
    if (!confirm(`Arkivere pitchen "${project.title || '(uten tittel)'}"? Den forsvinner fra denne lista, men kan gjenopprettes senere.`)) return
    try {
      const { error } = await supabase.from('projects').update({ status: 'archived' }).eq('id', project.id)
      if (error) throw error
      setProjects(prev => prev.filter(p => p.id !== project.id))
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 16px 48px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 600, color: C.text, lineHeight: 1.2 }}>
              Pitcher
            </h1>
          </div>
          <Link href="/admin/pitches/new" style={{ textDecoration: 'none' }}>
            <button style={{
              padding: '8px 18px',
              background: C.accent,
              color: '#fff',
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.78rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}>
              + Ny pitch
            </button>
          </Link>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 180px', maxWidth: 260 }}>
            <svg
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              width="13" height="13" fill="none" stroke={C.text3} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Søk på tittel eller kunde..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 32px',
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.text,
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '1rem',
                outline: 'none',
              }}
            />
          </div>

          {/* Status tabs */}
          <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, alignSelf: 'flex-end' }}>
            {([['all', 'Alle', projects.length], ['draft', 'Utkast', totalDraft], ['published', 'Publisert', totalPublished]] as const).map(([val, label, count]) => (
              <button
                key={val}
                onClick={() => setFilterStatus(val)}
                style={{
                  padding: '8px 12px',
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.78rem',
                  fontWeight: filterStatus === val ? 600 : 400,
                  background: 'none',
                  border: 'none',
                  borderBottom: `2px solid ${filterStatus === val ? C.accent : 'transparent'}`,
                  color: filterStatus === val ? C.text : C.text3,
                  cursor: 'pointer',
                  marginBottom: -1,
                  transition: 'color 0.1s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {label}
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 500,
                  color: filterStatus === val
                    ? (val === 'published' ? '#4CAF7D' : C.accent)
                    : C.text3,
                  background: filterStatus === val
                    ? (val === 'published' ? 'rgba(76,175,125,0.12)' : C.accentBg)
                    : C.surface2,
                  padding: '1px 5px',
                  borderRadius: 4,
                  minWidth: 18,
                  textAlign: 'center',
                }}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          {/* Type filter */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignSelf: 'center' }}>
            {([['all', 'Alle typer'], ['video', 'Film'], ['photo', 'Bilder'], ['mixed', 'Begge']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilterType(val)}
                style={{
                  padding: '5px 10px',
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.72rem',
                  borderRadius: 6,
                  border: filterType === val ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
                  background: filterType === val ? C.accentBg : C.surface,
                  color: filterType === val ? C.accent : C.text3,
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 20, height: 20, border: `1.5px solid ${C.border}`, borderTop: `1.5px solid ${C.accent}`, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '56px 24px',
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            background: C.surface,
          }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>
              {projects.length === 0 ? 'Ingen pitcher ennå' : 'Ingen pitcher matcher filteret'}
            </p>
            {projects.length === 0 && (
              <Link href="/admin/pitches/new" style={{ textDecoration: 'none' }}>
                <button style={{
                  padding: '9px 20px',
                  background: C.accent,
                  color: '#fff',
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}>
                  Opprett første pitch
                </button>
              </Link>
            )}
          </div>
        ) : (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {filtered.map((project, i) => {
              const customerName = project.customer_name || project.client_name
              const stageColor = PIPELINE_COLOR[project.pipeline_stage ?? ''] ?? C.text3
              const shareLink = shareLinks[project.id]

              return (
                <div
                  key={project.id}
                  style={{
                    borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none',
                    background: C.surface,
                    transition: 'background 0.1s',
                    cursor: 'pointer',
                  }}
                  onClick={() => router.push(`/admin/projects/${project.id}/edit`)}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = C.surface2}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = C.surface}
                >
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 16px',
                  }}>

                    {/* Title + customer */}
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <p style={{
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: '0.82rem',
                        fontWeight: 500,
                        color: C.text,
                        marginBottom: customerName ? 2 : 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {project.title || '(uten tittel)'}
                      </p>
                      {customerName && (
                        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
                          {customerName}
                        </p>
                      )}
                    </div>

                    {/* Badges — fixed grid so all rows align */}
                    <div style={{ display: 'grid', gridTemplateColumns: '100px 100px 76px', gap: 5, alignItems: 'center', flexShrink: 0 }}>
                      <div>
                        {project.pipeline_stage && (
                          <span style={{
                            display: 'block',
                            fontFamily: 'var(--font-dm-sans)',
                            fontSize: '0.62rem',
                            fontWeight: 500,
                            color: stageColor,
                            background: `${stageColor}18`,
                            padding: '3px 8px',
                            borderRadius: 4,
                            whiteSpace: 'nowrap',
                            textAlign: 'center',
                          }}>
                            {PIPELINE_LABEL[project.pipeline_stage] ?? project.pipeline_stage}
                          </span>
                        )}
                      </div>
                      <div>
                        {project.project_type && (
                          <span style={{
                            display: 'block',
                            fontFamily: 'var(--font-dm-sans)',
                            fontSize: '0.62rem',
                            color: C.text2,
                            background: C.surface2,
                            padding: '3px 8px',
                            borderRadius: 4,
                            border: `1px solid ${C.border}`,
                            whiteSpace: 'nowrap',
                            textAlign: 'center',
                          }}>
                            {PROJECT_TYPE_LABEL[project.project_type] ?? project.project_type}
                          </span>
                        )}
                      </div>
                      <div>
                        <span style={{
                          display: 'block',
                          fontFamily: 'var(--font-dm-sans)',
                          fontSize: '0.62rem',
                          fontWeight: 500,
                          color: project.status === 'published' ? '#4CAF7D' : C.text3,
                          background: project.status === 'published' ? 'rgba(76,175,125,0.1)' : C.surface2,
                          padding: '3px 8px',
                          borderRadius: 4,
                          whiteSpace: 'nowrap',
                          textAlign: 'center',
                        }}>
                          {project.status === 'published' ? 'Publisert' : 'Utkast'}
                        </span>
                      </div>
                    </div>

                    {/* Date */}
                    <span style={{
                      fontFamily: 'var(--font-dm-sans)',
                      fontSize: '0.68rem',
                      color: C.text3,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}>
                      {timeAgo(project.updated_at)}
                    </span>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      {shareLink && (
                        <a
                          href={shareLink}
                          target="_blank"
                          rel="noreferrer"
                          title="Åpne pitch"
                          style={{
                            padding: '5px 8px',
                            background: 'transparent',
                            color: C.text3,
                            fontFamily: 'var(--font-dm-sans)',
                            fontSize: '0.72rem',
                            border: `1px solid ${C.border}`,
                            borderRadius: 6,
                            cursor: 'pointer',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            transition: 'color 0.12s, border-color 0.12s',
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLAnchorElement).style.color = C.text
                            ;(e.currentTarget as HTMLAnchorElement).style.borderColor = C.text2
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLAnchorElement).style.color = C.text3
                            ;(e.currentTarget as HTMLAnchorElement).style.borderColor = C.border
                          }}
                        >
                          <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                      <Link
                        href={`/admin/projects/${project.id}/quote-analytics`}
                        style={{ textDecoration: 'none' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <button style={{
                          padding: '5px 10px',
                          background: 'transparent',
                          color: C.text3,
                          fontFamily: 'var(--font-dm-sans)',
                          fontSize: '0.72rem',
                          border: `1px solid ${C.border}`,
                          borderRadius: 6,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'color 0.12s',
                        }}>
                          Statistikk
                        </button>
                      </Link>
                      <Link
                        href={`/admin/projects/${project.id}/edit`}
                        style={{ textDecoration: 'none' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <button style={{
                          padding: '5px 10px',
                          background: C.accentBg,
                          color: C.accent,
                          fontFamily: 'var(--font-dm-sans)',
                          fontSize: '0.72rem',
                          border: `1px solid rgba(124,92,252,0.2)`,
                          borderRadius: 6,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}>
                          Rediger
                        </button>
                      </Link>
                      <Link
                        href={`/admin/projects/${project.id}`}
                        style={{ textDecoration: 'none' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <button style={{
                          padding: '5px 10px',
                          background: 'transparent',
                          color: C.text3,
                          fontFamily: 'var(--font-dm-sans)',
                          fontSize: '0.72rem',
                          border: `1px solid ${C.border}`,
                          borderRadius: 6,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'color 0.12s',
                        }}>
                          Oversikt
                        </button>
                      </Link>
                      <button
                        onClick={() => handleArchive(project)}
                        title="Arkiver pitch"
                        style={{
                          padding: '5px 8px',
                          background: 'transparent',
                          color: C.text3,
                          border: `1px solid ${C.border}`,
                          borderRadius: 6,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          transition: 'color 0.12s, border-color 0.12s',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLButtonElement).style.color = C.danger
                          ;(e.currentTarget as HTMLButtonElement).style.borderColor = `${C.danger}66`
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.color = C.text3
                          ;(e.currentTarget as HTMLButtonElement).style.borderColor = C.border
                        }}
                      >
                        <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Results count */}
        {!loading && filtered.length > 0 && filtered.length !== projects.length && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, marginTop: 10, textAlign: 'right' }}>
            Viser {filtered.length} av {projects.length}
          </p>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
