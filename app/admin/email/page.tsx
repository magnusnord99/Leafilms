'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { PipelineStage, PIPELINE_STAGE_LABELS_SHORT } from '@/lib/types'
import { C } from '@/lib/admin-theme'

const borderHover  = '#3A3328'
const accentBorder = 'rgba(124,92,252,0.35)'

const STAGE_ORDER: PipelineStage[] = ['tilbud_sendt', 'møte', 'kontrakt', 'levering', 'videresalg']

const STAGE_LABEL: Record<string, string> = PIPELINE_STAGE_LABELS_SHORT

const STAGE_COLOR: Record<string, { text: string; bg: string; border: string }> = {
  tilbud_sendt: { text: C.accent, bg: C.accentBg, border: 'rgba(124,92,252,0.30)' },
  møte:         { text: '#4A9AC4', bg: 'rgba(74,154,196,0.08)', border: 'rgba(74,154,196,0.30)' },
  kontrakt:     { text: '#4CAF7D', bg: 'rgba(76,175,125,0.08)', border: 'rgba(76,175,125,0.30)' },
  levering:     { text: '#E8A838', bg: 'rgba(232,168,56,0.08)', border: 'rgba(232,168,56,0.30)' },
  videresalg:   { text: '#B4B4CC', bg: 'rgba(155,155,173,0.08)', border: 'rgba(155,155,173,0.30)' },
}

type CrmProject = {
  id: string
  title: string
  pipeline_stage: PipelineStage
  customer: { name: string; company: string | null } | null
}

type EmailLogRow = {
  project_id: string
  sent_at: string
  subject: string
  type: string | null
}

type ProjectEmailSummary = {
  project: CrmProject
  lastSentAt: string | null
  lastSubject: string | null
  totalSent: number
  needsFollowUp: boolean
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })
}


function StageBadge({ stage }: { stage: PipelineStage }) {
  const color = STAGE_COLOR[stage] ?? { text: C.text3, bg: 'transparent', border: C.border }
  return (
    <span style={{
      fontFamily: 'var(--font-dm-sans)',
      fontSize: '0.6rem',
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: color.text,
      background: color.bg,
      border: `1px solid ${color.border}`,
      padding: '2px 8px',
      borderRadius: 4,
      whiteSpace: 'nowrap',
    }}>
      {STAGE_LABEL[stage] ?? stage}
    </span>
  )
}

function ProjectRow({ summary }: { summary: ProjectEmailSummary }) {
  const [hovered, setHovered] = useState(false)
  const { project, lastSentAt, lastSubject, totalSent } = summary

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? C.surface2 : C.surface,
        border: `1px solid ${hovered ? borderHover : C.border}`,
        borderRadius: 8,
        padding: '14px 18px',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '10px 16px',
        alignItems: 'center',
        transition: 'background 0.12s, border-color 0.12s',
      }}
    >
      {/* Left — title + customer + last email */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <Link
            href={`/admin/projects/${project.id}/email`}
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: C.text,
              textDecoration: 'none',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.accent }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.text }}
          >
            {project.title}
          </Link>
          <StageBadge stage={project.pipeline_stage} />
        </div>

        {project.customer && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 5 }}>
            {project.customer.name}
            {project.customer.company ? ` · ${project.customer.company}` : ''}
          </p>
        )}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {lastSentAt ? (
            <>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text2 }}>
                {formatDate(lastSentAt)}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.68rem',
                  color: C.text3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 260,
                }}
              >
                {lastSubject}
              </span>
            </>
          ) : (
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, fontStyle: 'italic' }}>
              Ingen sendt
            </span>
          )}
          {totalSent > 0 && (
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3, background: C.surface2, border: `1px solid ${C.border}`, padding: '1px 7px', borderRadius: 10 }}>
              {totalSent} sendt
            </span>
          )}
        </div>
      </div>

      {/* Right — send button */}
      <Link
        href={`/admin/projects/${project.id}/email`}
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: '0.72rem',
          fontWeight: 600,
          color: C.accent,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          padding: '6px 12px',
          borderRadius: 6,
          border: `1px solid ${accentBorder}`,
          background: C.accentBg,
          transition: 'background 0.12s, border-color 0.12s',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLAnchorElement
          el.style.background = 'rgba(124,92,252,0.14)'
          el.style.borderColor = C.accent
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLAnchorElement
          el.style.background = C.accentBg
          el.style.borderColor = accentBorder
        }}
      >
        Send e-post →
      </Link>
    </div>
  )
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {title}
      </span>
      {count > 0 && (
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3, background: C.surface2, border: `1px solid ${C.border}`, padding: '1px 7px', borderRadius: 10 }}>
          {count}
        </span>
      )}
    </div>
  )
}

export default function EmailCrmPage() {
  const [summaries, setSummaries] = useState<ProjectEmailSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()

      const [projectsResult, logsResult] = await Promise.all([
        supabase
          .from('projects')
          .select('id, title, pipeline_stage, customer:customers(name, company)')
          .in('pipeline_stage', STAGE_ORDER),
        supabase
          .from('email_log')
          .select('project_id, sent_at, subject, type')
          .order('sent_at', { ascending: true }),
      ])

      const projects: CrmProject[] = (projectsResult.data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        title: row.title as string,
        pipeline_stage: row.pipeline_stage as PipelineStage,
        customer: Array.isArray(row.customer)
          ? (row.customer[0] as { name: string; company: string | null } | undefined) ?? null
          : (row.customer as { name: string; company: string | null } | null),
      }))

      const logRows: EmailLogRow[] = (logsResult.data ?? []) as EmailLogRow[]

      // Grupper logs per project_id — siste entry er den siste i sortert liste
      const logsByProject = new Map<string, EmailLogRow[]>()
      for (const row of logRows) {
        if (!logsByProject.has(row.project_id)) logsByProject.set(row.project_id, [])
        logsByProject.get(row.project_id)!.push(row)
      }

      const now = Date.now()
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

      const result: ProjectEmailSummary[] = projects.map(project => {
        const entries = logsByProject.get(project.id) ?? []
        const last = entries.length > 0 ? entries[entries.length - 1] : null
        const lastSentAt = last?.sent_at ?? null
        const lastSubject = last?.subject ?? null
        const totalSent = entries.length
        const needsFollowUp = !lastSentAt || now - new Date(lastSentAt).getTime() > SEVEN_DAYS_MS
        return { project, lastSentAt, lastSubject, totalSent, needsFollowUp }
      })

      setSummaries(result)
      setLoading(false)
    }

    fetchData()
  }, [])

  const needsFollowUp = summaries
    .filter(s => s.needsFollowUp)
    .sort((a, b) =>
      STAGE_ORDER.indexOf(a.project.pipeline_stage) - STAGE_ORDER.indexOf(b.project.pipeline_stage)
    )

  const sentRecently = summaries.filter(s => !s.needsFollowUp)

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>

        {/* Breadcrumb + header */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 6 }}>
            <Link href="/admin" style={{ color: C.text3, textDecoration: 'none' }}>Dashboard</Link>
            {' › '}E-post
          </p>
          <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 700, color: C.text, lineHeight: 1.2, marginBottom: 4 }}>
            E-post
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>
            Aktive prosjekter som trenger kundekommunikasjon
          </p>
        </div>

        {loading ? (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, paddingTop: 64, textAlign: 'center' }}>
            Laster...
          </p>
        ) : summaries.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>
              Ingen aktive prosjekter i relevante salgssteg
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>

            {/* Seksjon 1 — Trenger oppfølging */}
            {needsFollowUp.length > 0 && (
              <section>
                <SectionHeader title="Trenger oppfølging" count={needsFollowUp.length} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 6 }}>
                  {needsFollowUp.map(s => (
                    <ProjectRow key={s.project.id} summary={s} />
                  ))}
                </div>
              </section>
            )}

            {/* Seksjon 2 — Sendt nylig */}
            {sentRecently.length > 0 && (
              <section>
                <SectionHeader title="Sendt nylig" count={sentRecently.length} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 6 }}>
                  {sentRecently.map(s => (
                    <ProjectRow key={s.project.id} summary={s} />
                  ))}
                </div>
              </section>
            )}

          </div>
        )}

      </div>
    </div>
  )
}
