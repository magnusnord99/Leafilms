'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { C } from '@/lib/admin-theme'
import { PIPELINE_STAGES, PipelineStage, ProjectType, QuoteBuilderData } from '@/lib/types'
import { getQuoteAmountExclVat } from '@/lib/quote-builder-utils'
import { timeAgo } from '@/lib/format'
import { useAuth } from '@/hooks/useAuth'
import { isStageAllowed, isStaffRole } from '@/lib/permissions'

// ─── Pipeline-hjelpere ────────────────────────────────────────────────────────

const STAGE_INDEX: Record<string, number> = Object.fromEntries(
  PIPELINE_STAGES.map((s, i) => [s.value, i])
)
const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  PIPELINE_STAGES.map(s => [s.value, s.label])
)

type StageGroup = 'salg' | 'produksjon' | 'post' | 'fullført'

const STAGE_GROUP: Record<PipelineStage, StageGroup> = {
  lead: 'salg', møte: 'salg', tilbud_sendt: 'salg',
  kontrakt: 'produksjon', pre_prod: 'produksjon', produksjon: 'produksjon',
  post_prod: 'post', levering: 'post',
  fakturert: 'fullført', videresalg: 'fullført',
}

const GROUP_COLOR: Record<StageGroup, string> = {
  salg: '#4A8FA8',
  produksjon: '#F0A500',
  post: '#7C5CFC',
  fullført: '#4CAF7D',
}

const GROUP_FILTERS: { value: StageGroup; label: string }[] = [
  { value: 'salg', label: 'Salg' },
  { value: 'produksjon', label: 'Produksjon' },
  { value: 'post', label: 'Post & levering' },
  { value: 'fullført', label: 'Fullført' },
]

const PROJECT_TYPE_LABEL: Record<string, string> = {
  video: 'Film',
  photo: 'Bilder',
  mixed: 'Film & Bilder',
}

function fmtShootDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })
}

function fmtMoney(n: number): string {
  return `kr ${Math.round(n).toLocaleString('nb-NO')}`
}

// ─── Datatyper ────────────────────────────────────────────────────────────────

type ProjectRow = {
  id: string
  title: string | null
  status: string
  client_name: string | null
  updated_at: string
  parent_project_id: string | null
  version_number: number | null
  pipeline_stage: PipelineStage | null
  project_type: ProjectType | null
  shoot_start: string | null
  shoot_end: string | null
  customer_name: string | null
  customer_company: string | null
}

type TaskRow = { project_id: string; pipeline_stage: string; status: string }
type QuoteRow = { project_id: string; accepted: boolean; total: number; updated_at: string }

type ProjectCard = {
  rootId: string
  title: string
  customer: string | null
  stage: PipelineStage
  group: StageGroup
  type: ProjectType | null
  shootStart: string | null
  shootEnd: string | null
  quoteTotal: number | null
  quoteAccepted: boolean
  tasksDone: number
  tasksTotal: number
  versionCount: number
  updatedAt: string
  overviewId: string
  editId: string
  shareLink: string | null
  allIds: string[]
}

// ─── Side ─────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const router = useRouter()
  const { profile } = useAuth()
  const role = isStaffRole(profile?.role) ? profile.role : 'admin'
  // Økonomi er kun for admin. Fail-closed: vis ingenting før profilen faktisk er lastet,
  // i motsetning til `role` over som faller tilbake til 'admin' mens profilen hentes.
  const canSeeEconomy = profile?.role === 'admin'
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [filterGroup, setFilterGroup] = useState<'all' | StageGroup>('all')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    try {
      const [projectsRes, tasksRes, quotesRes] = await Promise.all([
        supabase
          .from('projects')
          .select(`
            id, title, status, client_name, updated_at, parent_project_id,
            version_number, pipeline_stage, project_type, shoot_start, shoot_end,
            customers(name, company)
          `)
          .neq('status', 'lost')
          .order('updated_at', { ascending: false }),
        supabase.from('tasks').select('project_id, pipeline_stage, status'),
        supabase
          .from('quotes')
          .select('project_id, status, quote_data, selected_addon_ids, updated_at')
          .not('quote_data', 'is', null),
      ])

      if (projectsRes.error) throw projectsRes.error

      type RawProject = Omit<ProjectRow, 'customer_name' | 'customer_company'> & {
        customers: { name: string | null; company: string | null } | null
      }
      const rawProjects = (projectsRes.data ?? []) as unknown as RawProject[]

      setProjects(rawProjects.map(p => ({
        ...p,
        customers: undefined,
        customer_name: p.customers?.name ?? null,
        customer_company: p.customers?.company ?? null,
      })))

      setTasks((tasksRes.data ?? []) as TaskRow[])

      type RawQuote = { project_id: string; status: string; quote_data: QuoteBuilderData; selected_addon_ids: string[] | null; updated_at: string }
      setQuotes(((quotesRes.data ?? []) as unknown as RawQuote[]).flatMap(q => {
        // Kundens avkryssede tillegg telles med — samme beregning som Økonomi-siden
        const amount = getQuoteAmountExclVat(q.quote_data, q.selected_addon_ids ?? [])
        if (amount === null || !Number.isFinite(amount) || amount <= 0) return []
        return [{
          project_id: q.project_id,
          accepted: q.status === 'accepted',
          total: amount,
          updated_at: q.updated_at,
        }]
      }))

      const publishedIds = rawProjects.filter(p => p.status === 'published').map(p => p.id)
      if (publishedIds.length > 0) {
        const { data: sharesData } = await supabase
          .from('project_shares')
          .select('project_id, token')
          .in('project_id', publishedIds)
        if (sharesData) {
          const links: Record<string, string> = {}
          ;(sharesData as { project_id: string; token: string }[]).forEach(s => {
            links[s.project_id] = `${window.location.origin}/p/${s.token}`
          })
          setShareLinks(links)
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Grupper versjoner til prosjektkort. Representativ versjon = den som har
  // kommet lengst i pipelinen (nyeste ved likt steg).
  const cards = useMemo<ProjectCard[]>(() => {
    const byRoot = new Map<string, ProjectRow[]>()
    for (const p of projects) {
      const rootId = p.parent_project_id ?? p.id
      const list = byRoot.get(rootId) ?? []
      list.push(p)
      byRoot.set(rootId, list)
    }

    return Array.from(byRoot.entries()).map(([rootId, versions]) => {
      const rep = [...versions].sort((a, b) => {
        const stageDiff = (STAGE_INDEX[b.pipeline_stage ?? 'lead'] ?? 0) - (STAGE_INDEX[a.pipeline_stage ?? 'lead'] ?? 0)
        if (stageDiff !== 0) return stageDiff
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      })[0]

      const newest = [...versions].sort((a, b) => (b.version_number ?? 1) - (a.version_number ?? 1))[0]
      const allIds = versions.map(v => v.id)
      const stage = rep.pipeline_stage ?? 'lead'

      const stageTasks = tasks.filter(t => allIds.includes(t.project_id) && t.pipeline_stage === stage)

      const groupQuotes = quotes
        .filter(q => allIds.includes(q.project_id))
        .sort((a, b) => {
          if (a.accepted !== b.accepted) return a.accepted ? -1 : 1
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        })
      const quote = groupQuotes[0] ?? null

      const sharedVersion = [...versions]
        .sort((a, b) => (b.version_number ?? 1) - (a.version_number ?? 1))
        .find(v => shareLinks[v.id])

      return {
        rootId,
        title: (rep.title || '').replace(/\s+V\d+$/, '').trim() || rep.title || '(uten tittel)',
        customer: rep.customer_company || rep.customer_name || rep.client_name,
        stage,
        group: STAGE_GROUP[stage],
        type: rep.project_type,
        shootStart: rep.shoot_start,
        shootEnd: rep.shoot_end,
        quoteTotal: quote?.total ?? null,
        quoteAccepted: quote?.accepted ?? false,
        tasksDone: stageTasks.filter(t => t.status === 'done').length,
        tasksTotal: stageTasks.length,
        versionCount: versions.length,
        updatedAt: versions.reduce((max, v) => v.updated_at > max ? v.updated_at : max, versions[0].updated_at),
        overviewId: rep.id,
        editId: newest.id,
        shareLink: sharedVersion ? shareLinks[sharedVersion.id] : null,
        allIds,
      }
    })
      .filter(card => isStageAllowed(role, card.stage))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [projects, tasks, quotes, shareLinks, role])

  const filtered = cards.filter(card => {
    if (filterGroup !== 'all' && card.group !== filterGroup) return false
    if (search) {
      const q = search.toLowerCase()
      if (!card.title.toLowerCase().includes(q) && !(card.customer ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const groupCounts = useMemo(() => {
    const counts: Record<StageGroup, number> = { salg: 0, produksjon: 0, post: 0, fullført: 0 }
    for (const card of cards) counts[card.group]++
    return counts
  }, [cards])

  // Tilbudsverdi for prosjekter som er i arbeid (kontrakt → levering)
  const activeValue = useMemo(() =>
    cards
      .filter(c => (c.group === 'produksjon' || c.group === 'post') && c.quoteTotal !== null)
      .reduce((sum, c) => sum + (c.quoteTotal ?? 0), 0),
  [cards])

  async function handleDelete(card: ProjectCard) {
    const versionNote = card.versionCount > 1 ? ` og alle ${card.versionCount} pitch-versjoner` : ''
    if (!confirm(`Slett prosjektet "${card.title}"${versionNote}? Dette kan ikke angres.`)) return
    try {
      await supabase.from('projects').delete().in('id', card.allIds)
      fetchAll()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh' }}>

      {/* Sidehode */}
      <div style={{ padding: '28px 16px 24px', background: C.sidebar, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 24, height: 1, background: C.accent }} />
                <span style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.58rem', letterSpacing: '0.16em',
                  color: C.accent, textTransform: 'uppercase', fontWeight: 500,
                }}>
                  Produksjon
                </span>
              </div>
              <h1 style={{
                fontFamily: 'var(--font-cormorant)', fontSize: 'clamp(1.8rem, 3vw, 2.5rem)',
                fontWeight: 300, fontStyle: 'italic', color: C.text, lineHeight: 1.1,
              }}>
                Prosjekter
              </h1>
            </div>
            <Link href="/admin/projects/new" style={{ textDecoration: 'none' }}>
              <button style={{
                padding: '9px 18px', background: C.accent, color: '#fff',
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.12em',
                textTransform: 'uppercase', fontWeight: 600, border: 'none', borderRadius: 3,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                + Nytt prosjekt
              </button>
            </Link>
          </div>

          {/* Nøkkeltall */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, rowGap: 10 }}>
            {[
              { label: 'Totalt', value: String(cards.length), color: C.text },
              ...GROUP_FILTERS.map(g => ({ label: g.label, value: String(groupCounts[g.value]), color: GROUP_COLOR[g.value] })),
              ...(activeValue > 0 && canSeeEconomy ? [{ label: 'I arbeid', value: fmtMoney(activeValue), color: C.text }] : []),
            ].map(stat => (
              <div key={stat.label}>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.2rem', fontWeight: 600, color: stat.color }}>
                  {stat.value}
                </span>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3, letterSpacing: '0.06em', marginLeft: 6 }}>
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Innhold */}
      <div style={{ padding: '24px 16px 48px', maxWidth: 1100, margin: '0 auto' }}>

        {/* Filtre */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
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
                width: '100%', padding: '8px 12px 8px 32px', background: C.surface,
                border: `1px solid ${C.border}`, borderRadius: 3, color: C.text,
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {([{ value: 'all' as const, label: 'Alle' }, ...GROUP_FILTERS]).map(g => {
              const active = filterGroup === g.value
              const color = g.value === 'all' ? C.accent : GROUP_COLOR[g.value]
              return (
                <button
                  key={g.value}
                  onClick={() => setFilterGroup(g.value)}
                  style={{
                    padding: '6px 12px', fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem',
                    letterSpacing: '0.04em', borderRadius: 3,
                    border: active ? `1px solid ${color}` : `1px solid ${C.border}`,
                    background: active ? `${color}14` : C.surface,
                    color: active ? color : C.text3,
                    cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  {g.label}{g.value !== 'all' ? ` · ${groupCounts[g.value]}` : ''}
                </button>
              )
            })}
          </div>
        </div>

        {/* Kort */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 20, height: 20, border: `1.5px solid ${C.border}`, borderTop: `1.5px solid ${C.accent}`, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 24px', border: `1px solid ${C.border}`, borderRadius: 4, background: C.surface }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>
              {cards.length === 0 ? 'Ingen prosjekter ennå' : 'Ingen prosjekter matcher filteret'}
            </p>
            {cards.length === 0 && (
              <Link href="/admin/projects/new" style={{ textDecoration: 'none' }}>
                <button style={{
                  padding: '9px 20px', background: C.accent, color: '#fff',
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.12em',
                  textTransform: 'uppercase', fontWeight: 600, border: 'none', borderRadius: 3, cursor: 'pointer',
                }}>
                  Opprett første prosjekt
                </button>
              </Link>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 14 }}>
            {filtered.map(card => {
              const stageColor = GROUP_COLOR[card.group]
              const stageIndex = STAGE_INDEX[card.stage] ?? 0
              const progress = (stageIndex + 1) / PIPELINE_STAGES.length

              return (
                <div
                  key={card.rootId}
                  onClick={() => router.push(`/admin/projects/${card.overviewId}?from=/admin/projects`)}
                  style={{
                    display: 'flex', flexDirection: 'column',
                    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
                    padding: '16px 16px 12px', cursor: 'pointer',
                    transition: 'background 0.12s, border-color 0.12s',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLDivElement
                    el.style.background = C.surface2
                    el.style.borderColor = `${stageColor}55`
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLDivElement
                    el.style.background = C.surface
                    el.style.borderColor = C.border
                  }}
                >
                  {/* Steg + type + sist endret */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{
                        fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 500,
                        color: stageColor, background: `${stageColor}18`, padding: '3px 8px',
                        borderRadius: 3, whiteSpace: 'nowrap',
                      }}>
                        {STAGE_LABEL[card.stage] ?? card.stage}
                      </span>
                      {card.type && (
                        <span style={{
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text2,
                          background: C.surface2, padding: '3px 8px', borderRadius: 3,
                          border: `1px solid ${C.border}`, whiteSpace: 'nowrap',
                        }}>
                          {PROJECT_TYPE_LABEL[card.type]}
                        </span>
                      )}
                    </div>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3, whiteSpace: 'nowrap' }}>
                      {timeAgo(card.updatedAt)}
                    </span>
                  </div>

                  {/* Tittel + kunde */}
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.92rem', fontWeight: 600, color: C.text, lineHeight: 1.3, marginBottom: 2 }}>
                    {card.title}
                  </p>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 14 }}>
                    {card.customer ?? 'Ingen kunde tilknyttet'}
                  </p>

                  {/* Pipeline-fremdrift */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ height: 3, background: C.surface2, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${progress * 100}%`, height: '100%', background: stageColor, borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.58rem', color: C.text3, marginTop: 4, letterSpacing: '0.04em' }}>
                      Steg {stageIndex + 1} av {PIPELINE_STAGES.length}
                    </p>
                  </div>

                  {/* Nøkkelinfo */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14, flex: 1 }}>
                    {[
                      {
                        label: 'Opptak',
                        value: card.shootStart
                          ? card.shootEnd && card.shootEnd !== card.shootStart
                            ? `${fmtShootDate(card.shootStart)} – ${fmtShootDate(card.shootEnd)}`
                            : fmtShootDate(card.shootStart)
                          : '—',
                        color: C.text2,
                      },
                      // Kun admin skal se økonomitall — tilbudsraden droppes helt for andre roller
                      // i stedet for å blanke verdien, slik at kortet faktisk blir mindre.
                      canSeeEconomy && {
                        label: 'Tilbud',
                        value: card.quoteTotal !== null
                          ? `${fmtMoney(card.quoteTotal)}${card.quoteAccepted ? ' · akseptert' : ''}`
                          : '—',
                        color: card.quoteAccepted ? '#4CAF7D' : C.text2,
                      },
                      {
                        label: 'Oppgaver',
                        value: card.tasksTotal > 0 ? `${card.tasksDone} av ${card.tasksTotal} fullført` : '—',
                        color: card.tasksTotal > 0 && card.tasksDone === card.tasksTotal ? '#4CAF7D' : C.text2,
                      },
                    ].filter((row): row is { label: string; value: string; color: string } => Boolean(row)).map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
                          {row.label}
                        </span>
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500, color: row.value === '—' ? C.text3 : row.color, textAlign: 'right' }}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Bunnlinje */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 10, borderTop: `1px solid ${C.border}` }}
                    onClick={e => e.stopPropagation()}
                  >
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3 }}>
                      {card.versionCount > 1 ? `${card.versionCount} pitch-versjoner` : '1 pitch-versjon'}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {card.shareLink && (
                        <a
                          href={card.shareLink}
                          target="_blank"
                          rel="noreferrer"
                          title="Åpne publisert pitch"
                          style={{
                            padding: '5px 9px', color: C.text3, border: `1px solid ${C.border}`,
                            borderRadius: 3, textDecoration: 'none', display: 'inline-flex',
                            alignItems: 'center', transition: 'color 0.12s, border-color 0.12s',
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
                      <Link href={`/admin/projects/${card.editId}/edit`} style={{ textDecoration: 'none' }}>
                        <button style={{
                          padding: '5px 12px', background: 'transparent', color: C.text3,
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', letterSpacing: '0.06em',
                          border: `1px solid ${C.border}`, borderRadius: 3, cursor: 'pointer',
                          whiteSpace: 'nowrap', transition: 'color 0.12s',
                        }}>
                          Pitch
                        </button>
                      </Link>
                      <Link href={`/admin/projects/${card.overviewId}?from=/admin/projects`} style={{ textDecoration: 'none' }}>
                        <button style={{
                          padding: '5px 12px', background: C.accentBg, color: C.accent,
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', letterSpacing: '0.06em',
                          border: `1px solid rgba(124,92,252,0.2)`, borderRadius: 3, cursor: 'pointer',
                          whiteSpace: 'nowrap', transition: 'background 0.12s',
                        }}>
                          Oversikt
                        </button>
                      </Link>
                      <button
                        onClick={() => handleDelete(card)}
                        title="Slett prosjekt"
                        style={{
                          padding: '5px 9px', background: 'transparent', color: C.text3,
                          border: `1px solid ${C.border}`, borderRadius: 3, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', transition: 'color 0.12s, border-color 0.12s',
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

        {/* Resultatteller */}
        {!loading && filtered.length > 0 && filtered.length !== cards.length && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 12, textAlign: 'right' }}>
            Viser {filtered.length} av {cards.length}
          </p>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
