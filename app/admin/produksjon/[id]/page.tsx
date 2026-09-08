'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getOrCreateProjectConversation, getProductionInfo, type ProductionInfo } from '@/lib/actions/production-chat'
import { getCurrentUserProfile, getAllProfiles } from '@/lib/actions/pipeline'
import { getProductionBoardSummary, type ProductionBoardSummary } from '@/lib/actions/boards'
import type { ConversationParticipant } from '@/lib/actions/messages'
import type { PreprodCrewMember } from '@/lib/actions/preprod'
import type { DeliverableItem } from '@/lib/types'
import { ProductionChat } from '@/components/production/ProductionChat'
import { CrewSection } from '@/components/admin/CrewSection'
import { DeliverablesButton, summarizeDeliverables } from '@/components/project/DeliverablesButton'
import { getAvatarColor } from '@/lib/avatar-colors'
import { C } from '@/lib/admin-theme'
import { getStageAccess } from '@/lib/pipeline-stage-lock'
import { STAGE_LABEL } from '@/lib/pipeline-ui'
import { PastStageBanner } from '@/components/admin/PastStageBanner'

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
        {label}
      </p>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text }}>
        {value}
      </p>
    </div>
  )
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {title}
        </p>
        {action}
      </div>
      {children}
    </div>
  )
}

// Skrivebeskyttet — samme person, hentet fra boardet der den faktisk lagres/redigeres
// (BoardContacts). Kun en visning her, ingen egen editor.
function ContactPill({ label, name, sub }: { label: string; name: string; sub: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        background: getAvatarColor({ id: name, color: null }), color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 700,
      }}>
        {name[0]?.toUpperCase() ?? '?'}
      </span>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}{sub ? ` · ${sub}` : ''}
        </p>
      </div>
    </div>
  )
}

const mapsUrl = (location: string | null, link: string | null): string | null => {
  if (link) return link
  if (location) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
  return null
}

// Skrivebeskyttet gjengivelse av ett schedule-kort — redigering skjer på boardet selv.
function ScheduleTable({ title, items }: { title: string | null; items: ProductionBoardSummary['schedules'][number]['items'] }) {
  return (
    <div style={{ marginBottom: 18 }}>
      {title && (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, color: C.text2, marginBottom: 8 }}>
          {title}
        </p>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr>
              {['Tid', 'Programpunkt', 'Lokasjon', 'Folk'].map(h => (
                <th key={h} style={{ textAlign: 'left', fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.text3, padding: '0 10px 8px' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const link = mapsUrl(item.location, item.locationLink)
              return (
                <tr key={item.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: '10px', verticalAlign: 'top', fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>
                    {item.time}
                  </td>
                  <td style={{ padding: '10px', verticalAlign: 'top', fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text }}>
                    {item.label}
                  </td>
                  <td style={{ padding: '10px', verticalAlign: 'top', fontFamily: 'var(--font-dm-sans)', fontSize: '0.76rem', color: C.text2 }}>
                    {item.location}
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer" style={{ display: 'block', color: C.accent, fontSize: '0.7rem', textDecoration: 'none', marginTop: 2 }}>
                        📍 Maps
                      </a>
                    )}
                  </td>
                  <td style={{ padding: '10px', verticalAlign: 'top', fontFamily: 'var(--font-dm-sans)', fontSize: '0.76rem', color: C.text2 }}>
                    {item.people.length > 0 ? item.people.map(p => p.name).join(', ') : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ProduksjonPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<ProductionInfo | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [members, setMembers] = useState<ConversationParticipant[]>([])
  const [currentUser, setCurrentUser] = useState<ConversationParticipant | null>(null)
  const [allProfiles, setAllProfiles] = useState<ConversationParticipant[]>([])
  const [boardSummary, setBoardSummary] = useState<ProductionBoardSummary | null>(null)
  const [prodCrew, setProdCrew] = useState<PreprodCrewMember[]>([])
  const [deliverables, setDeliverables] = useState<DeliverableItem[]>([])
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    Promise.all([
      getProductionInfo(id),
      getOrCreateProjectConversation(id),
      getCurrentUserProfile(),
      getAllProfiles(),
      getProductionBoardSummary(id),
    ]).then(([productionInfo, chat, user, profiles, board]) => {
      setInfo(productionInfo)
      if (chat) {
        setConversationId(chat.conversationId)
        setMembers(chat.members)
      }
      setCurrentUser(user)
      setAllProfiles(profiles)
      setBoardSummary(board)
      setProdCrew(productionInfo?.prodCrew ?? [])
      setDeliverables(productionInfo?.deliverables ?? [])
      setLoading(false)
    })
  }, [id])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, letterSpacing: '0.08em' }}>Laster...</p>
      </div>
    )
  }

  if (!info || !conversationId || !currentUser) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: C.text2, marginBottom: 12 }}>Fant ikke prosjektet</p>
          <button onClick={() => router.push('/admin/pipeline')} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
            Tilbake til Pipeline
          </button>
        </div>
      </div>
    )
  }

  const access = getStageAccess('produksjon', info.pipelineStage)

  if (access === 'not_yet_reached') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>
            Prosjektet har ikke nådd produksjon ennå
          </p>
          <button onClick={() => router.push('/admin/pipeline')} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
            ← Tilbake
          </button>
        </div>
      </div>
    )
  }

  const readOnly = access === 'past' && !unlocked

  const shootRange = info.shootStart
    ? info.shootEnd && info.shootEnd !== info.shootStart
      ? `${formatDate(info.shootStart)} – ${formatDate(info.shootEnd)}`
      : formatDate(info.shootStart)
    : null

  const allScheduleItems = boardSummary?.schedules.flatMap(s => s.items) ?? []
  const deliverySummary = summarizeDeliverables(deliverables)

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '28px 28px 64px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        {access === 'past' && (
          <PastStageBanner
            currentStageLabel={STAGE_LABEL[info.pipelineStage]}
            unlocked={unlocked}
            onUnlock={() => setUnlocked(true)}
          />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Link href="/admin/pipeline" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textDecoration: 'none' }}>Pipeline</Link>
          <span style={{ color: C.text3, fontSize: '0.7rem' }}>/</span>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>Produksjon</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.3rem', fontWeight: 700, color: C.text, marginBottom: 24 }}>
          {info.title}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_360px]" style={{ gap: 20, alignItems: 'start' }}>
          {/* Hovedinnhold */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Nøkkelinfo */}
            <SectionCard title="Nøkkelinfo">
              <InfoRow label="Prosjektleder" value={info.projectLead ? (info.projectLead.name || info.projectLead.email) : null} />
              <InfoRow label="Opptaksdato" value={shootRange} />
              {info.shootStart && (
                <div style={{ marginBottom: 12 }}>
                  <span style={{
                    display: 'inline-block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600,
                    padding: '3px 8px', borderRadius: 12,
                    background: info.shootConfirmed ? 'rgba(76,175,125,0.12)' : 'rgba(240,165,0,0.12)',
                    color: info.shootConfirmed ? '#4CAF7D' : '#F0A500',
                  }}>
                    {info.shootConfirmed ? 'Bekreftet' : 'Ikke bekreftet'}
                  </span>
                </div>
              )}

              {info.customer && (
                <>
                  <div style={{ height: 1, background: C.border, margin: '14px 0' }} />
                  <InfoRow label="Kunde" value={info.customer.name} />
                  <InfoRow label="Telefon" value={info.customer.phone} />
                  <InfoRow label="E-post" value={info.customer.email} />
                  <InfoRow label="Adresse" value={info.customer.address} />
                </>
              )}
            </SectionCard>

            {/* Team */}
            <CrewSection
              title="Team"
              crew={prodCrew}
              projectId={id}
              field="prod_crew"
              profiles={allProfiles}
              onChange={setProdCrew}
              readOnly={readOnly}
            />

            {/* Kontaktpersoner + board-lenke */}
            <SectionCard
              title="Kontaktpersoner"
              action={boardSummary && (
                <Link href={`/admin/boards/${boardSummary.boardId}`} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600, color: C.accent, textDecoration: 'none' }}>
                  ▦ Åpne board
                </Link>
              )}
            >
              {!boardSummary ? (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.76rem', color: C.text3, fontStyle: 'italic' }}>
                  Ingen board opprettet for dette prosjektet ennå.
                </p>
              ) : !boardSummary.leadContact && !boardSummary.customerContact ? (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.76rem', color: C.text3, fontStyle: 'italic' }}>
                  Ingen kontaktpersoner satt på boardet ennå.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {boardSummary.leadContact && (
                    <ContactPill label="Leafilms" name={boardSummary.leadContact.name ?? boardSummary.leadContact.email} sub={boardSummary.leadContact.phone} />
                  )}
                  {boardSummary.customerContact && (
                    <ContactPill label="Kunde" name={boardSummary.customerContact.name} sub={boardSummary.customerContact.role} />
                  )}
                </div>
              )}
            </SectionCard>

            {/* Timeplan */}
            <SectionCard title="Timeplan">
              {!boardSummary ? (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.76rem', color: C.text3, fontStyle: 'italic' }}>
                  Ingen board opprettet for dette prosjektet ennå.
                </p>
              ) : allScheduleItems.length === 0 ? (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.76rem', color: C.text3, fontStyle: 'italic' }}>
                  Ingen timeplan lagt til på boardet ennå.
                </p>
              ) : (
                boardSummary.schedules
                  .filter(s => s.items.length > 0)
                  .map(s => <ScheduleTable key={s.cardId} title={s.title} items={s.items} />)
              )}
            </SectionCard>

            {/* Leveranser */}
            <SectionCard title="Leveranser">
              {deliverySummary && (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text2, marginBottom: 12 }}>
                  {deliverySummary}
                </p>
              )}
              <DeliverablesButton projectId={id} items={deliverables} onSaved={setDeliverables} readOnly={readOnly} />
            </SectionCard>
          </div>

          {/* Produksjonschat */}
          <div style={{ height: 'calc(100vh - 160px)' }}>
            <ProductionChat
              conversationId={conversationId}
              currentUser={currentUser}
              initialMembers={members}
              allProfiles={allProfiles.filter((p) => p.id !== currentUser.id)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
