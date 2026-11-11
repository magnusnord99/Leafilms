'use client'

import { useRef, useState } from 'react'
import { QuotePackageShowcaseItem, QuotePackageShowcaseKind, PackageUsageNote } from '@/lib/types'
import { ImagePickerModal } from '@/components/modals/ImagePickerModal'
import { VideoPickerModal } from '@/components/modals/VideoPickerModal'
import {
  copyLibraryImageToPackage,
  copyLibraryVideoToPackage,
  setPackageShowcaseItems,
} from '@/lib/actions/quote-package-showcase'
import { updatePackageUsageNote } from '@/lib/actions/package-usage-notes'
import { DEFAULT_PACKAGE_USAGE_NOTES } from '@/lib/package-usage-notes'

// Samme cinematiske fargesett som components/sales-flyer/SalesFlyerView.tsx
// (denne modalen er kun montert fra den filen, og vises for anonyme flyer-
// besøkende — ikke admin-lilla, se feedback_palette.md — selv i redigerbar
// tilstand, siden den samme visningen nå brukes til redigering).
const GOLD = '#C49434'
const CREAM = '#E8E1D5'
const MUTED = '#9E9287'
const SUBTLE = '#62594E'
const SURFACE = '#161410'
const BORDER = '#2A261F'
const BLACK = '#0C0B09'

// Når satt, redigeres eksempelmedia inline i denne visningen i stedet for i
// det tidligere separate PackageShowcasePanel-tabellvinduet (feedback
// 2026-11-10: "redigeringen ... bli inline ... ikke i en tabell"). Panelet
// er fjernet — all legg til/fjern/flytt-logikk bor nå her.
type EditableTarget = { flyerId: string; packageId: string }

interface PackageDetailModalProps {
  isOpen: boolean
  onClose: () => void
  packageLabel: string
  inquiryEmail?: string
  flyerVideoPath?: string | null
  flyerImages?: string[]
  items: QuotePackageShowcaseItem[]
  editable?: EditableTarget
  onItemsChanged?: (items: QuotePackageShowcaseItem[]) => void
  // Reell leveranse-mengde fra tilbudet (f.eks. "20 bilder"), ikke antall
  // opplastede eksempelbilder — se PhotoStack sin `count`-prop.
  deliverableCounts?: { hovedvideo: number; klipp: number; photo: number }
  usageNotes: PackageUsageNote[]
  onUsageNotesChanged?: (notes: PackageUsageNote[]) => void
}

// Beskrivende tekst ved siden av hver seksjon i redigeringsmodus — forklarer
// hva hvert innholdsslot faktisk brukes til (feedback 2026-11-10).
const KIND_LABEL: Record<QuotePackageShowcaseKind, string> = {
  main_video: 'Hovedvideo — vises på landingssiden',
  social_clip: 'Klipp — vises på sosiale medier',
  photo: 'Bilder — vises på sosiale medier',
  website_photo: 'Bilder — vises på nettsiden',
}

// Hvilken picker-modal som er åpen akkurat nå, og hvilken kind/media_type den
// skriver til. 'social_clip' har to varianter siden den kinden kan ta begge
// media-typer (migrasjonens CHECK-constraint) — samme mønster som det
// tidligere PackageShowcasePanel.
type PickerTarget = 'main_video' | 'social_clip_video' | 'social_clip_image' | 'photo' | 'website_photo' | null

const EMPTY_IDS: string[] = []

function makeTempId(): string {
  return `tmp-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

function withOrderIndex(list: QuotePackageShowcaseItem[]): QuotePackageShowcaseItem[] {
  return list.map((item, idx) => ({ ...item, order_index: idx }))
}

const arrowButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 16,
  background: 'rgba(0,0,0,0.6)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.3)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1rem',
  lineHeight: 1,
}

// pointer-events-none på strippen + pointer-events-auto kun på knappene —
// videoene her er autoplay/loop uten native kontroller (se under), så dette
// er ikke lenger strengt nødvendig for å unngå å dekke en kontroll-bar, men
// holder likevel resten av mediet klikkbart (f.eks. lenker) utenom knappene.
function CarouselArrows({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-between px-2">
      <button type="button" onClick={onPrev} aria-label="Forrige" className="pointer-events-auto" style={arrowButtonStyle}>
        ‹
      </button>
      <button type="button" onClick={onNext} aria-label="Neste" className="pointer-events-auto" style={arrowButtonStyle}>
        ›
      </button>
    </div>
  )
}

// Rekkefølgen her er bevisst "bakerst til fremst" sett fra array-indeks 0 —
// pos[0] gjelder det FØRSTE bildet som ble valgt, som havner øverst i bunken
// (z-index satt eksplisitt lenger ned, ikke via DOM-rekkefølge).
const STACK_TRANSFORMS = [
  'rotate(0deg) translate(0px, 0px)',
  'rotate(5deg) translate(10px, -6px)',
  'rotate(-6deg) translate(-10px, 8px)',
]

// Bunke med bilder + et synlig antall — kommuniserer volum uten å vise hvert
// bilde enkeltvis. Pakker har sjelden mer enn noen få bilder (se feedback
// 2026-11-10: "jeg kommer aldri til å legge 40 bilder inn her"), så en enkel,
// statisk bunke er nok — ingen egen bla-i-bunken-interaksjon.
// `count` er den reelle leveranse-mengden (f.eks. fra tilbudets "20 bilder"-
// linje), IKKE antall opplastede eksempelbilder — de to kan avvike siden
// staff normalt bare laster opp noen få eksempler, ikke hele leveransen
// (feedback 2026-11-10: badge viste 5 mens leveransen var 20). Faller
// tilbake til photos.length kun hvis ingen leveranse-tall er tilgjengelig.
function PhotoStack({ photos, size = 150, count }: { photos: QuotePackageShowcaseItem[]; size?: number; count?: number }) {
  if (photos.length === 0) return null
  const displayCount = count ?? photos.length
  const visible = photos.slice(0, 3)
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {visible.map((photo, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={photo.id}
          src={photo.path}
          alt=""
          className="absolute inset-0 h-full w-full rounded-[3px] object-cover"
          style={{
            transform: STACK_TRANSFORMS[i] ?? 'none',
            zIndex: visible.length - i,
            boxShadow: '0 8px 20px rgba(0,0,0,0.55)',
            border: `2px solid ${SURFACE}`,
          }}
        />
      ))}
      <div
        className="absolute flex items-center justify-center rounded-full"
        style={{
          bottom: -12,
          right: -12,
          width: 34,
          height: 34,
          background: GOLD,
          color: '#1A1812',
          fontSize: '0.78rem',
          fontWeight: 700,
          fontFamily: 'var(--font-dm-sans)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          zIndex: visible.length + 1,
        }}
      >
        {displayCount}
      </div>
    </div>
  )
}

// Desktop: hovedvideoen vist som om den var hero-seksjonen på en ekte
// nettside, med egne "nettside-bilder" (website_photo) som innholdsrader
// under — adresserer "lite forklarende" (feedback 2026-11-09): man ser
// umiddelbart hva videoen faktisk brukes til, i stedet for en bar
// 16:9-ramme uten kontekst.
function WebsiteMock({
  video,
  websitePhotos,
  onPrevVideo,
  onNextVideo,
  hasMultipleVideos,
}: {
  video: QuotePackageShowcaseItem | null
  websitePhotos: QuotePackageShowcaseItem[]
  onPrevVideo: () => void
  onNextVideo: () => void
  hasMultipleVideos: boolean
}) {
  const heroPhoto = video ? null : websitePhotos[0]
  const contentPhotos = video ? websitePhotos.slice(0, 2) : websitePhotos.slice(1, 2)
  return (
    <div className="overflow-hidden rounded-[6px]" style={{ border: `1px solid ${BORDER}`, background: BLACK }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: '#211D16', borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E05A4A', display: 'inline-block' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E0B23D', display: 'inline-block' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#4CAF7D', display: 'inline-block' }} />
        <div className="ml-2 flex-1 truncate rounded-full px-3 py-1" style={{ background: SURFACE, color: SUBTLE, fontSize: '0.65rem' }}>
          leafilms.no
        </div>
      </div>
      {/* Fiktiv nav-rad — ren pynt, ikke redigerbar. Gjør at det ser ut som en
          faktisk nettside og ikke bare en videospiller med en adresselinje. */}
      <div className="flex items-center justify-between gap-3 px-5 py-3" style={{ background: BLACK, borderBottom: `1px solid ${BORDER}` }}>
        <span className="font-display text-sm tracking-wide" style={{ color: CREAM }}>leafilms</span>
        <div className="flex items-center gap-4">
          {['Hjem', 'Om oss', 'Tjenester', 'Kontakt'].map(item => (
            <span key={item} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: MUTED }}>{item}</span>
          ))}
        </div>
        <span
          className="rounded-full px-3 py-1"
          style={{ background: GOLD, color: '#1A1812', fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          Kontakt oss
        </span>
      </div>
      <div className="relative w-full" style={{ aspectRatio: '21 / 9', background: '#000' }}>
        {video && (
          <video key={video.id} autoPlay muted loop playsInline src={video.path} className="hero-bg-video absolute inset-0 h-full w-full object-cover animate-[fade-in_0.3s_ease-out]" />
        )}
        {!video && heroPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroPhoto.path} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {/* Fiktiv hero-tekst oppå videoen — samme pynt-begrunnelse som nav-raden over. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 p-5"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78), transparent)' }}
        >
          <p className="font-display text-lg md:text-xl" style={{ color: CREAM, fontWeight: 400 }}>Opplevelser som blir med deg</p>
          <p className="mt-1" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: MUTED }}>
            Finn inspirasjon til ditt neste øyeblikk
          </p>
        </div>
        {hasMultipleVideos && <CarouselArrows onPrev={onPrevVideo} onNext={onNextVideo} />}
      </div>
      <div className={`grid gap-4 px-5 py-4 ${contentPhotos.length > 0 ? 'grid-cols-[1.1fr_1fr]' : ''}`} style={{ background: BLACK }}>
        <div>
          <p className="text-[0.55rem] uppercase tracking-[0.2em]" style={{ color: GOLD }}>Velkommen til oss</p>
          <p className="font-display mt-1.5 text-lg" style={{ color: CREAM }}>Oppdag mulighetene</p>
          <p className="mt-1.5 max-w-md text-[0.65rem] leading-relaxed" style={{ color: MUTED }}>
            Bli kjent med oss og finn inspirasjon til nye opplevelser. Vi hjelper deg med å finne det som passer for deg.
          </p>
        </div>
        {contentPhotos.length > 0 && (
          <div className="grid items-center gap-2" style={{ gridTemplateColumns: `repeat(${contentPhotos.length}, minmax(0, 1fr))` }}>
            {contentPhotos.map(photo => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={photo.id} src={photo.path} alt="" className="h-24 w-full rounded-[2px] object-cover md:h-28" style={{ background: SURFACE }} />
            ))}
          </div>
        )}
      </div>
      {/* Fiktiv footer — fullfører "dette er en nettside"-illusjonen. */}
      <div className="px-5 py-2 text-center" style={{ borderTop: `1px solid ${BORDER}` }}>
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: SUBTLE }}>© {new Date().getFullYear()} leafilms.no — Alle rettigheter reservert</span>
      </div>
    </div>
  )
}

// Enkel, stabil pseudo-tilfeldig "liker dette"-tall per kort — deterministisk
// fra id-en (ikke Math.random(), som ville gitt hydration-mismatch mellom
// server- og klient-render siden denne modalen er 'use client').
function fakeLikeCount(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return 200 + (hash % 1800)
}

// Mobil: hvert innholdselement som sitt eget "sosiale medier-post"-kort i en
// bla-karusell (scroll-snap) — adresserer "vil kunne bla mellom innholdet"
// og "se mer ut som en sosiale medier post" (feedback 2026-11-10). Header
// med verifisert-merke, handlingsikoner (like/kommenter/del/lagre) og
// "X liker dette" er ren pynt for å forsterke illusjonen — ikke ekte tall.
function SocialPostCard({ id, children, caption, cardWidth }: { id: string; children: React.ReactNode; caption?: string | null; cardWidth: number }) {
  const likes = fakeLikeCount(id)
  return (
    <div className="shrink-0" style={{ width: cardWidth, scrollSnapAlign: 'center' }}>
      <div className="overflow-hidden rounded-[14px]" style={{ border: `1px solid ${BORDER}`, background: SURFACE }}>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <span
            className="flex items-center justify-center rounded-full"
            style={{ width: 26, height: 26, background: GOLD, color: '#1A1812', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 700, flexShrink: 0 }}
          >
            L
          </span>
          <span className="flex items-center gap-1" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.74rem', fontWeight: 600, color: CREAM }}>
            leafilms
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="12" r="10" fill={GOLD} />
              <path d="M8 12.5l2.5 2.5L16 9.5" stroke="#1A1812" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="ml-auto flex gap-[3px]" aria-hidden>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: SUBTLE }} />
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: SUBTLE }} />
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: SUBTLE }} />
          </span>
        </div>
        <div className="relative w-full" style={{ aspectRatio: '4 / 5', background: '#000' }}>
          {children}
        </div>
        <div className="flex items-center gap-3 px-3 pt-2.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={CREAM} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20.8 7.6c0-2.8-2.3-4.9-5-4.9-1.8 0-3.4 1-4.3 2.4C10.6 3.7 9 2.7 7.2 2.7c-2.7 0-5 2.1-5 4.9 0 5.4 7.1 9.9 9.3 11.2.3.2.7.2 1 0 2.2-1.3 9.3-5.8 9.3-11.2Z" />
          </svg>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={CREAM} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 11.5a8.4 8.4 0 0 1-8.9 8.4 9 9 0 0 1-3.5-.8L3 20l1.1-5a8.3 8.3 0 0 1-.8-3.5 8.4 8.4 0 0 1 8.4-8.9h.3a8.4 8.4 0 0 1 8 8Z" />
          </svg>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={CREAM} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
          </svg>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={CREAM} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="ml-auto" aria-hidden>
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
          </svg>
        </div>
        <p className="px-3 pt-2 pb-3" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: CREAM }}>
          {likes.toLocaleString('nb-NO')} liker dette
        </p>
      </div>
      {caption && (
        <p className="mt-2 px-1" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: MUTED }}>
          <span style={{ fontWeight: 600, color: CREAM }}>leafilms</span> {caption}
        </p>
      )}
    </div>
  )
}

function editButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    fontFamily: 'var(--font-dm-sans)',
    fontSize: '0.64rem',
    fontWeight: 600,
    padding: '0 10px',
    height: 56,
    display: 'flex',
    alignItems: 'center',
    borderRadius: 6,
    cursor: disabled ? 'default' : 'pointer',
    background: 'rgba(196,148,52,0.1)',
    color: GOLD,
    border: '1px solid rgba(196,148,52,0.3)',
    opacity: disabled ? 0.6 : 1,
    whiteSpace: 'nowrap',
  }
}

// Kompakt redigerings-rad under hver seksjon — legg til/fjern/flytt/bildetekst
// for én kind. Erstatter det tidligere, separate PackageShowcasePanel-
// tabellvinduet: redigering skjer nå inline i selve "Se mer"-visningen
// (feedback 2026-11-10).
function EditStrip({
  kindItems,
  busy,
  onRemove,
  onMove,
  onCaptionChange,
  addLabel,
  onAdd,
  secondAddLabel,
  onSecondAdd,
}: {
  kindItems: QuotePackageShowcaseItem[]
  busy: boolean
  onRemove: (id: string) => void
  onMove: (id: string, direction: 'up' | 'down') => void
  onCaptionChange?: (id: string, caption: string) => void
  addLabel: string
  onAdd: () => void
  secondAddLabel?: string
  onSecondAdd?: () => void
}) {
  return (
    <div className="mt-3 flex flex-wrap items-start gap-2">
      {kindItems.map((item, idx) => (
        <div key={item.id} style={{ width: 86 }}>
          <div className="relative overflow-hidden rounded-[4px]" style={{ width: 86, height: 56, background: BLACK, border: `1px solid ${BORDER}` }}>
            {item.media_type === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.path} alt="" className="h-full w-full object-cover" />
            ) : (
              <video src={item.path} muted className="h-full w-full object-cover" />
            )}
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              disabled={busy}
              aria-label="Fjern"
              style={{ position: 'absolute', top: 2, right: 2, width: 17, height: 17, borderRadius: 9, background: '#C0392B', color: '#fff', border: 'none', fontSize: '0.62rem', lineHeight: 1, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}
            >
              ×
            </button>
          </div>
          {kindItems.length > 1 && (
            <div className="mt-1 flex items-center justify-center gap-1">
              <button type="button" onClick={() => onMove(item.id, 'up')} disabled={idx === 0 || busy} aria-label="Flytt opp" style={{ width: 20, height: 20, borderRadius: 10, background: SURFACE, color: CREAM, border: `1px solid ${BORDER}`, fontSize: '0.6rem', lineHeight: 1, cursor: idx === 0 || busy ? 'default' : 'pointer', opacity: idx === 0 || busy ? 0.4 : 1 }}>↑</button>
              <button type="button" onClick={() => onMove(item.id, 'down')} disabled={idx === kindItems.length - 1 || busy} aria-label="Flytt ned" style={{ width: 20, height: 20, borderRadius: 10, background: SURFACE, color: CREAM, border: `1px solid ${BORDER}`, fontSize: '0.6rem', lineHeight: 1, cursor: idx === kindItems.length - 1 || busy ? 'default' : 'pointer', opacity: idx === kindItems.length - 1 || busy ? 0.4 : 1 }}>↓</button>
            </div>
          )}
          {onCaptionChange && (
            <input
              type="text"
              defaultValue={item.caption ?? ''}
              placeholder="Bildetekst"
              disabled={busy}
              onBlur={e => onCaptionChange(item.id, e.target.value)}
              style={{ marginTop: 4, width: '100%', fontSize: '0.6rem', padding: '3px 5px', borderRadius: 3, background: BLACK, border: `1px solid ${BORDER}`, color: CREAM, fontFamily: 'var(--font-dm-sans)' }}
            />
          )}
        </div>
      ))}
      <button type="button" onClick={onAdd} disabled={busy} style={editButtonStyle(busy)}>{addLabel}</button>
      {secondAddLabel && onSecondAdd && (
        <button type="button" onClick={onSecondAdd} disabled={busy} style={editButtonStyle(busy)}>{secondAddLabel}</button>
      )}
    </div>
  )
}

function sectionLabelStyle(): React.CSSProperties {
  return { fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }
}

function UsageNoteEditor({ value, editable, busy, saving, onSave }: {
  value: PackageUsageNote
  editable: boolean
  busy: boolean
  saving: boolean
  onSave: (kind: QuotePackageShowcaseKind, label: string, note: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(value.label)
  const [note, setNote] = useState(value.note)
  const fieldStyle = { width: '100%', background: BLACK, color: CREAM, border: `1px solid ${BORDER}`, borderRadius: 4, padding: 8, fontSize: '0.78rem' }

  if (editable && editing) {
    return (
      <form className="flex flex-col gap-2" onSubmit={async event => {
        event.preventDefault()
        if (await onSave(value.kind, label, note)) setEditing(false)
      }}>
        <label style={{ color: MUTED, fontSize: '0.74rem' }}>
          Overskrift
          <input value={label} onChange={event => setLabel(event.target.value)} required maxLength={80} disabled={busy} style={fieldStyle} />
        </label>
        <label style={{ color: MUTED, fontSize: '0.74rem' }}>
          Beskrivelse
          <textarea value={note} onChange={event => setNote(event.target.value)} required maxLength={2000} rows={4} disabled={busy} style={fieldStyle} />
        </label>
        <div className="flex gap-4 text-xs">
          <button type="submit" disabled={busy || !label.trim() || !note.trim()} style={{ color: GOLD }}>{saving ? 'Lagrer…' : 'Lagre'}</button>
          <button type="button" disabled={busy} onClick={() => setEditing(false)} style={{ color: MUTED }}>Avbryt</button>
        </div>
      </form>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p style={{ ...sectionLabelStyle(), color: GOLD }}>{value.label}</p>
        {editable && (
          <button type="button" disabled={busy} className="text-xs" style={{ color: GOLD }} aria-label={`Rediger ${value.label}`} onClick={() => {
            setLabel(value.label)
            setNote(value.note)
            setEditing(true)
          }}>Rediger</button>
        )}
      </div>
      <p className="mt-1 whitespace-pre-wrap" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', lineHeight: 1.5, color: MUTED }}>{value.note}</p>
    </div>
  )
}

export function PackageDetailModal({
  isOpen, onClose, packageLabel, items: initialItems, editable, onItemsChanged,
  deliverableCounts, usageNotes: initialUsageNotes, onUsageNotesChanged, inquiryEmail,
  flyerVideoPath, flyerImages,
}: PackageDetailModalProps) {
  const [mainVideoIndex, setMainVideoIndex] = useState(0)
  const [socialClipIndex, setSocialClipIndex] = useState(0)
  const [items, setItems] = useState(initialItems)
  const [usageNotes, setUsageNotes] = useState(() => DEFAULT_PACKAGE_USAGE_NOTES.map(
    fallback => initialUsageNotes.find(note => note.kind === fallback.kind) ?? fallback
  ))
  const savingNoteRef = useRef(false)
  const [savingNoteKind, setSavingNoteKind] = useState<QuotePackageShowcaseKind | null>(null)
  const [savingKinds, setSavingKinds] = useState<Record<QuotePackageShowcaseKind, boolean>>({
    main_video: false,
    social_clip: false,
    photo: false,
    website_photo: false,
  })
  const [activePicker, setActivePicker] = useState<PickerTarget>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  async function saveUsageNote(kind: QuotePackageShowcaseKind, label: string, note: string): Promise<boolean> {
    if (savingNoteRef.current) return false
    savingNoteRef.current = true
    setSavingNoteKind(kind)
    setError(null)
    try {
      const result = await updatePackageUsageNote(kind, label, note)
      if ('error' in result) {
        setError(result.error)
        return false
      }
      const next = usageNotes.map(n => n.kind === kind ? result.data : n)
      setUsageNotes(next)
      onUsageNotesChanged?.(next)
      return true
    } catch (err) {
      console.error('PackageDetailModal saveUsageNote:', err)
      setError('Kunne ikke lagre teksten — sjekk nettforbindelsen')
      return false
    } finally {
      savingNoteRef.current = false
      setSavingNoteKind(null)
    }
  }

  function setSaving(kind: QuotePackageShowcaseKind, value: boolean) {
    setSavingKinds(prev => ({ ...prev, [kind]: value }))
  }

  function itemsForKind(kind: QuotePackageShowcaseKind): QuotePackageShowcaseItem[] {
    return items.filter(i => i.kind === kind).sort((a, b) => a.order_index - b.order_index)
  }

  // Erstatter hele vareliste-fanen for én kind — aldri en partiell diff, se
  // setPackageShowcaseItems' atomiske replace-kontrakt.
  async function persistKind(kind: QuotePackageShowcaseKind, nextKindItems: QuotePackageShowcaseItem[]) {
    if (!editable) return
    const previousKindItems = itemsForKind(kind)
    const next = [...items.filter(i => i.kind !== kind), ...nextKindItems]
    setItems(next)
    onItemsChanged?.(next)
    setSaving(kind, true)
    try {
      const payload = nextKindItems.map(i => ({ media_type: i.media_type, path: i.path, caption: i.caption }))
      const result = await setPackageShowcaseItems(editable.flyerId, editable.packageId, kind, payload)
      if ('error' in result) {
        setError(result.error)
        const reverted = [...items.filter(i => i.kind !== kind), ...previousKindItems]
        setItems(reverted)
        onItemsChanged?.(reverted)
      } else {
        setError(null)
      }
    } catch (err) {
      console.error('PackageDetailModal persistKind:', err)
      setError('Kunne ikke lagre eksempelmedia — sjekk nettforbindelsen')
      const reverted = [...items.filter(i => i.kind !== kind), ...previousKindItems]
      setItems(reverted)
      onItemsChanged?.(reverted)
    } finally {
      setSaving(kind, false)
    }
  }

  async function handlePickedVideos(kind: 'main_video' | 'social_clip', ids: string[]) {
    if (!editable || ids.length === 0) return
    setError(null)
    setSaving(kind, true)
    try {
      const current = itemsForKind(kind)
      const additions: QuotePackageShowcaseItem[] = []
      for (const id of ids) {
        const result = await copyLibraryVideoToPackage(editable.flyerId, editable.packageId, id, kind)
        if ('error' in result) {
          setError(result.error)
          return
        }
        additions.push({
          id: makeTempId(),
          package_id: editable.packageId,
          flyer_id: editable.flyerId,
          kind,
          media_type: 'video',
          path: result.url,
          caption: null,
          order_index: 0,
        })
      }
      await persistKind(kind, withOrderIndex([...current, ...additions]))
    } finally {
      setSaving(kind, false)
    }
  }

  async function handlePickedImages(kind: 'photo' | 'social_clip' | 'website_photo', ids: string[]) {
    if (!editable || ids.length === 0) return
    setError(null)
    setSaving(kind, true)
    try {
      const current = itemsForKind(kind)
      const additions: QuotePackageShowcaseItem[] = []
      for (const id of ids) {
        const result = await copyLibraryImageToPackage(editable.flyerId, editable.packageId, id, kind)
        if ('error' in result) {
          setError(result.error)
          return
        }
        additions.push({
          id: makeTempId(),
          package_id: editable.packageId,
          flyer_id: editable.flyerId,
          kind,
          media_type: 'image',
          path: result.url,
          caption: null,
          order_index: 0,
        })
      }
      await persistKind(kind, withOrderIndex([...current, ...additions]))
    } finally {
      setSaving(kind, false)
    }
  }

  function moveItem(kind: QuotePackageShowcaseKind, id: string, direction: 'up' | 'down') {
    if (savingKinds[kind]) return
    const kindItems = itemsForKind(kind)
    const index = kindItems.findIndex(i => i.id === id)
    if (index === -1) return
    const swapWith = direction === 'up' ? index - 1 : index + 1
    if (swapWith < 0 || swapWith >= kindItems.length) return
    const next = [...kindItems]
    ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
    persistKind(kind, withOrderIndex(next))
  }

  function removeItem(kind: QuotePackageShowcaseKind, id: string) {
    if (savingKinds[kind]) return
    const next = itemsForKind(kind).filter(i => i.id !== id)
    persistKind(kind, withOrderIndex(next))
  }

  function updateCaption(id: string, caption: string) {
    if (savingKinds.social_clip) return
    const current = itemsForKind('social_clip')
    const existing = current.find(i => i.id === id)
    if (!existing) return
    const trimmed = caption.trim()
    const nextCaption = trimmed.length > 0 ? trimmed : null
    if (existing.caption === nextCaption) return
    const next = current.map(i => i.id === id ? { ...i, caption: nextCaption } : i)
    persistKind('social_clip', next)
  }

  function automaticItem(kind: QuotePackageShowcaseKind, path: string, index: number): QuotePackageShowcaseItem {
    return {
      id: `flyer-${kind}-${index}-${path}`, package_id: '', flyer_id: '', kind,
      media_type: kind === 'main_video' ? 'video' : 'image', path,
      caption: null, order_index: index,
    }
  }
  const hasMainVideo = deliverableCounts === undefined || deliverableCounts.hovedvideo > 0
  const mainVideos = !hasMainVideo ? [] : flyerVideoPath !== undefined
    ? flyerVideoPath ? [automaticItem('main_video', flyerVideoPath, 0)] : []
    : itemsForKind('main_video')
  const socialClips = itemsForKind('social_clip')
  const photos = flyerImages !== undefined
    ? flyerImages.map((path, index) => automaticItem('photo', path, index))
    : itemsForKind('photo')
  const websitePhotos = flyerImages !== undefined
    ? flyerImages.map((path, index) => automaticItem('website_photo', path, index))
    : itemsForKind('website_photo')
  const photoCount = deliverableCounts?.photo ?? photos.length

  const activeVideo = mainVideos.length > 0 ? mainVideos[Math.min(mainVideoIndex, mainVideos.length - 1)] : null
  const activeClip = socialClips.length > 0 ? socialClips[Math.min(socialClipIndex, socialClips.length - 1)] : null

  function showPrevVideo() {
    setMainVideoIndex(i => (i - 1 + mainVideos.length) % mainVideos.length)
  }
  function showNextVideo() {
    setMainVideoIndex(i => (i + 1) % mainVideos.length)
  }
  function showPrevClip() {
    setSocialClipIndex(i => (i - 1 + socialClips.length) % socialClips.length)
  }
  function showNextClip() {
    setSocialClipIndex(i => (i + 1) % socialClips.length)
  }

  const isEmpty = mainVideos.length === 0 && socialClips.length === 0 && photos.length === 0 && websitePhotos.length === 0

  const visibleNotes = usageNotes.filter(note => {
    if (note.kind === 'main_video') return hasMainVideo && (editable || mainVideos.length > 0)
    if (note.kind === 'website_photo') return editable || websitePhotos.length > 0
    if (note.kind === 'photo') return editable || photos.length > 0
    return editable || socialClips.length > 0
  })
  const usageNotesPanel = visibleNotes.length > 0 ? (
    <div className="flex w-full flex-col gap-5 md:max-w-[280px]">
      <p className="font-display text-xl" style={{ color: CREAM, fontWeight: 400 }}>Slik bruker du leveransen</p>
      {editable && (
        <p style={{ fontSize: '0.74rem', color: MUTED }}>Tekstene er felles for alle pakker og landingssider.</p>
      )}
      {visibleNotes.map(note => (
        <UsageNoteEditor
          key={note.kind}
          value={note}
          editable={!!editable}
          busy={savingNoteKind !== null}
          saving={savingNoteKind === note.kind}
          onSave={saveUsageNote}
        />
      ))}
    </div>
  ) : null

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center p-2 sm:p-6 md:p-8 z-50"
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="max-w-5xl w-full max-h-[95vh] sm:max-h-[85vh] overflow-y-auto rounded-[2px] p-6 md:p-8"
        style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
        data-lenis-prevent
      >
        <div className="flex items-start justify-between mb-6 md:mb-8">
          <h2 className="font-display text-2xl md:text-3xl" style={{ color: CREAM, fontWeight: 400 }}>
            {packageLabel}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            style={{ color: SUBTLE, lineHeight: 0, flexShrink: 0, marginLeft: 16 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M2 2l12 12M14 2L2 14" />
            </svg>
          </button>
        </div>

        {error && (
          <p role="alert" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.74rem', color: '#E05A4A', marginBottom: 14 }}>
            {error}
          </p>
        )}

        {isEmpty && !editable && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: MUTED }}>
            Ingen eksempelmedia lagt til ennå.
          </p>
        )}

        {/* ── Mobil: svip-karusell av "sosiale medier"-kort (kun visning — redigering skjer i desktop-seksjonen under) ── */}
        {!isEmpty && (
          <div
            className="md:hidden -mx-6 flex gap-4 overflow-x-auto px-6 pb-2"
            style={{ scrollSnapType: 'x mandatory' }}
          >
            {mainVideos.map(video => (
              <SocialPostCard key={video.id} id={video.id} cardWidth={240}>
                <video autoPlay muted loop playsInline src={video.path} className="hero-bg-video absolute inset-0 h-full w-full object-cover" />
              </SocialPostCard>
            ))}
            {socialClips.map(clip => (
              <SocialPostCard key={clip.id} id={clip.id} cardWidth={240} caption={clip.caption}>
                {clip.media_type === 'video' ? (
                  <video autoPlay muted loop playsInline src={clip.path} className="hero-bg-video absolute inset-0 h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={clip.path} alt="" className="absolute inset-0 h-full w-full object-cover" />
                )}
              </SocialPostCard>
            ))}
            {photos.length > 0 && (
              <div className="flex shrink-0 flex-col items-center justify-center" style={{ width: 240, scrollSnapAlign: 'center' }}>
                <PhotoStack photos={photos} size={170} count={photoCount} />
                <p className="mt-5" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: MUTED }}>
                  {photoCount} bilder inkludert
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Desktop: nettside-mock (video + nettside-bilder) + klipp/bunke, med inline redigering når `editable` ── */}
        {(!isEmpty || editable) && (
          <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_240px] md:gap-8 lg:gap-10">
            <div className="min-w-0">
            {editable && <p style={sectionLabelStyle()}>{hasMainVideo ? KIND_LABEL.main_video : 'Bilder — vises på nettsiden'}</p>}
            {activeVideo || websitePhotos.length > 0 ? (
              <div className={`w-full max-w-[640px] ${editable ? 'mt-2' : ''}`}>
                <WebsiteMock
                  video={activeVideo}
                  websitePhotos={websitePhotos}
                  onPrevVideo={showPrevVideo}
                  onNextVideo={showNextVideo}
                  hasMultipleVideos={mainVideos.length > 1}
                />
              </div>
            ) : editable ? (
              <p className="mt-2" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.74rem', color: SUBTLE }}>
                {hasMainVideo ? 'Ingen hovedvideo eller nettsidebilder lagt til ennå.' : 'Ingen nettsidebilder lagt til ennå.'}
              </p>
            ) : null}
            {editable && hasMainVideo && flyerVideoPath !== undefined && (
              <p className="mt-3 text-sm" style={{ color: MUTED }}>Hentes automatisk fra videoen øverst på flyeren. Endre toppvideoen for å bytte eksempel.</p>
            )}
            {editable && hasMainVideo && flyerVideoPath === undefined && (
              <EditStrip
                kindItems={mainVideos}
                busy={savingKinds.main_video}
                onRemove={id => removeItem('main_video', id)}
                onMove={(id, dir) => moveItem('main_video', id, dir)}
                addLabel="+ Legg til video"
                onAdd={() => setActivePicker('main_video')}
              />
            )}

            {editable && <p className="mt-8" style={sectionLabelStyle()}>{KIND_LABEL.website_photo}</p>}
            {editable && flyerImages !== undefined && (
              <p className="mt-3 text-sm" style={{ color: MUTED }}>Bildene hentes automatisk fra flyeren og følger rekkefølgen der.</p>
            )}
            {editable && flyerImages === undefined && (
              <EditStrip
                kindItems={websitePhotos}
                busy={savingKinds.website_photo}
                onRemove={id => removeItem('website_photo', id)}
                onMove={(id, dir) => moveItem('website_photo', id, dir)}
                addLabel="+ Legg til bilde"
                onAdd={() => setActivePicker('website_photo')}
              />
            )}

            {(mainVideos.length > 0 || socialClips.length > 0 || photos.length > 0 || websitePhotos.length > 0 || editable) && (
              <div className="mt-10 flex flex-wrap items-start gap-12">
                {(socialClips.length > 0 || editable) && (
                  <div className="flex flex-col items-start" style={{ width: 200 }}>
                    {editable && <p className="mb-2" style={sectionLabelStyle()}>{KIND_LABEL.social_clip}</p>}
                    {socialClips.length > 0 ? (
                      <div className="relative self-center" style={{ width: 200 }}>
                        <div
                          className="relative overflow-hidden"
                          style={{ aspectRatio: '9 / 16', background: '#000', borderRadius: 24, border: '6px solid #000' }}
                        >
                          {activeClip && activeClip.media_type === 'video' ? (
                            <video key={activeClip.id} autoPlay muted loop playsInline src={activeClip.path} className="hero-bg-video absolute inset-0 h-full w-full object-cover animate-[fade-in_0.3s_ease-out]" />
                          ) : activeClip ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={activeClip.id} src={activeClip.path} alt="" className="absolute inset-0 h-full w-full object-cover animate-[fade-in_0.3s_ease-out]" />
                          ) : null}

                          {/* Reels/Stories-stil UI-overlegg oppå mediet — samme
                              "se ut som en ekte sosiale medier-post"-begrunnelse
                              som SocialPostCard, men lagt oppå i stedet for under
                              siden 9:16-formatet her etterligner en faktisk
                              Reel/Story, ikke en klassisk feed-post. */}
                          {activeClip && (
                            <>
                              <div
                                className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-1.5 p-2.5"
                                style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.65), transparent)' }}
                              >
                                <span
                                  className="flex items-center justify-center rounded-full"
                                  style={{ width: 18, height: 18, background: GOLD, color: '#1A1812', fontFamily: 'var(--font-dm-sans)', fontSize: '0.55rem', fontWeight: 700, flexShrink: 0 }}
                                >
                                  L
                                </span>
                                <span className="flex items-center gap-1" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, color: '#fff' }}>
                                  leafilms
                                  <svg width="9" height="9" viewBox="0 0 24 24" aria-hidden>
                                    <circle cx="12" cy="12" r="10" fill={GOLD} />
                                    <path d="M8 12.5l2.5 2.5L16 9.5" stroke="#1A1812" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </span>
                              </div>

                              {/* bottom, ikke midtstilt — unngår kollisjon med
                                  CarouselArrows, som er vertikalt sentrert i
                                  rammen når det er flere klipp å bla mellom. */}
                              <div className="pointer-events-none absolute flex flex-col items-center gap-3" style={{ right: 10, bottom: 18 }}>
                                <div className="flex flex-col items-center gap-0.5">
                                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <path d="M20.8 7.6c0-2.8-2.3-4.9-5-4.9-1.8 0-3.4 1-4.3 2.4C10.6 3.7 9 2.7 7.2 2.7c-2.7 0-5 2.1-5 4.9 0 5.4 7.1 9.9 9.3 11.2.3.2.7.2 1 0 2.2-1.3 9.3-5.8 9.3-11.2Z" />
                                  </svg>
                                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.52rem', fontWeight: 600, color: '#fff' }}>
                                    {fakeLikeCount(activeClip.id)}
                                  </span>
                                </div>
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M21 11.5a8.4 8.4 0 0 1-8.9 8.4 9 9 0 0 1-3.5-.8L3 20l1.1-5a8.3 8.3 0 0 1-.8-3.5 8.4 8.4 0 0 1 8.4-8.9h.3a8.4 8.4 0 0 1 8 8Z" />
                                </svg>
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
                                </svg>
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
                                </svg>
                              </div>

                              {activeClip.caption && (
                                <div
                                  className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5 pr-9"
                                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)' }}
                                >
                                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', lineHeight: 1.4, color: '#fff' }}>
                                    <span style={{ fontWeight: 600 }}>leafilms</span> {activeClip.caption}
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        {socialClips.length > 1 && <CarouselArrows onPrev={showPrevClip} onNext={showNextClip} />}
                      </div>
                    ) : editable ? (
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.74rem', color: SUBTLE }}>
                        Ingen klipp lagt til ennå.
                      </p>
                    ) : null}
                    {editable && (
                      <EditStrip
                        kindItems={socialClips}
                        busy={savingKinds.social_clip}
                        onRemove={id => removeItem('social_clip', id)}
                        onMove={(id, dir) => moveItem('social_clip', id, dir)}
                        onCaptionChange={updateCaption}
                        addLabel="+ Legg til video"
                        onAdd={() => setActivePicker('social_clip_video')}
                        secondAddLabel="+ Legg til bilde"
                        onSecondAdd={() => setActivePicker('social_clip_image')}
                      />
                    )}
                  </div>
                )}

                {(photos.length > 0 || editable) && (
                  <div className="flex flex-col items-start">
                    {editable && <p className="mb-2" style={sectionLabelStyle()}>{KIND_LABEL.photo}</p>}
                    {photos.length > 0 ? (
                      <div className="flex flex-col items-center self-center">
                        <PhotoStack photos={photos} count={photoCount} />
                        <p className="mt-5" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: MUTED }}>
                          {photoCount} bilder inkludert
                        </p>
                      </div>
                    ) : editable ? (
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.74rem', color: SUBTLE }}>
                        Ingen bilder lagt til ennå.
                      </p>
                    ) : null}
                    {editable && flyerImages !== undefined && (
                      <p className="mt-3 text-sm" style={{ color: MUTED }}>Bildene hentes automatisk fra flyeren.</p>
                    )}
                    {editable && flyerImages === undefined && (
                      <EditStrip
                        kindItems={photos}
                        busy={savingKinds.photo}
                        onRemove={id => removeItem('photo', id)}
                        onMove={(id, dir) => moveItem('photo', id, dir)}
                        addLabel="+ Legg til bilde"
                        onAdd={() => setActivePicker('photo')}
                      />
                    )}
                  </div>
                )}

              </div>
            )}
            </div>
            {usageNotesPanel && (
              <aside className="border-l pl-6 lg:pl-8" style={{ borderColor: BORDER }}>
                {usageNotesPanel}
              </aside>
            )}
          </div>
        )}

        <div className="mt-8 border-t pt-6 md:hidden" style={{ borderColor: BORDER }}>{usageNotesPanel}</div>

        <p className="mt-8 text-sm" style={{ fontFamily: 'var(--font-dm-sans)', color: MUTED }}>
          Reise, kost og losji er ikke inkludert i prisen.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          {inquiryEmail ? (
            <a
              href={`mailto:${inquiryEmail}?subject=${encodeURIComponent(`Forespørsel: ${packageLabel}`)}&body=${encodeURIComponent(`Hei,\n\nJeg er interessert i "${packageLabel}". Kan dere ta kontakt?`)}`}
              className="inline-flex items-center gap-3 rounded-[2px] px-6 py-4 text-xs font-medium uppercase tracking-[0.12em] transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C49434]"
              style={{ background: GOLD, color: BLACK }}
            >
              Velg denne pakken
              <span aria-hidden="true">→</span>
            </a>
          ) : editable ? (
            <p className="text-sm" style={{ color: MUTED }}>Legg inn pakke-e-post under Innstillinger for å vise «Velg denne pakken».</p>
          ) : <span />}
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium uppercase tracking-[0.12em]"
            style={{ color: GOLD }}
          >
            Lukk
          </button>
        </div>
      </div>

      {editable && (
        <>
          <ImagePickerModal
            isOpen={activePicker === 'photo' || activePicker === 'social_clip_image' || activePicker === 'website_photo'}
            onClose={() => setActivePicker(null)}
            onSelect={(ids) => {
              if (activePicker === 'photo') handlePickedImages('photo', ids)
              else if (activePicker === 'social_clip_image') handlePickedImages('social_clip', ids)
              else if (activePicker === 'website_photo') handlePickedImages('website_photo', ids)
            }}
            selectedImageIds={EMPTY_IDS}
          />
          <VideoPickerModal
            isOpen={activePicker === 'main_video' || activePicker === 'social_clip_video'}
            onClose={() => setActivePicker(null)}
            onSelect={(ids) => {
              if (activePicker === 'main_video') handlePickedVideos('main_video', ids)
              else if (activePicker === 'social_clip_video') handlePickedVideos('social_clip', ids)
            }}
            selectedVideoIds={EMPTY_IDS}
          />
        </>
      )}
    </div>
  )
}
