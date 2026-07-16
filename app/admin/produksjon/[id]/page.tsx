'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getOrCreateProjectConversation, getProductionInfo, type ProductionInfo } from '@/lib/actions/production-chat'
import { getCurrentUserProfile, getAllProfiles } from '@/lib/actions/pipeline'
import type { ConversationParticipant } from '@/lib/actions/messages'
import { ProductionChat } from '@/components/production/ProductionChat'
import { C } from '@/lib/admin-theme'

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

export default function ProduksjonPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<ProductionInfo | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [members, setMembers] = useState<ConversationParticipant[]>([])
  const [currentUser, setCurrentUser] = useState<ConversationParticipant | null>(null)
  const [allProfiles, setAllProfiles] = useState<ConversationParticipant[]>([])

  useEffect(() => {
    Promise.all([
      getProductionInfo(id),
      getOrCreateProjectConversation(id),
      getCurrentUserProfile(),
      getAllProfiles(),
    ]).then(([productionInfo, chat, user, profiles]) => {
      setInfo(productionInfo)
      if (chat) {
        setConversationId(chat.conversationId)
        setMembers(chat.members)
      }
      setCurrentUser(user)
      setAllProfiles(profiles)
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

  const shootRange = info.shootStart
    ? info.shootEnd && info.shootEnd !== info.shootStart
      ? `${formatDate(info.shootStart)} – ${formatDate(info.shootEnd)}`
      : formatDate(info.shootStart)
    : null

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '28px 28px 64px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Link href="/admin/pipeline" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textDecoration: 'none' }}>Pipeline</Link>
          <span style={{ color: C.text3, fontSize: '0.7rem' }}>/</span>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>Produksjon</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.3rem', fontWeight: 700, color: C.text, marginBottom: 24 }}>
          {info.title}
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
          {/* Nøkkelinfo */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 20px' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
              Nøkkelinfo
            </p>

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

            <div style={{ height: 1, background: C.border, margin: '14px 0' }} />
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Timeplan
            </p>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.76rem', color: C.text3, fontStyle: 'italic' }}>
              Kommer snart
            </p>
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
