'use client'

import { useState } from 'react'
import { CaseStudy, SalesFlyerPackageCategory } from '@/lib/types'
import { splitParagraphs } from '@/lib/industry-landing-pages'
import {
  SalesFlyerWithRelations,
  SalesFlyerUpdate,
  updateSalesFlyer,
  setSalesFlyerCases,
  setSalesFlyerPackages,
  copyLibraryImageToFlyer,
  copyLibraryVideoToFlyer,
  getSalesFlyerBySlug,
} from '@/lib/actions/sales-flyers'
import { listPackageTemplateQuotes, PackageTemplateQuote } from '@/lib/actions/quote-packages'
import { HeroMedia } from '@/components/marketing/HeroMedia'
import { CasePickerModal } from '@/components/modals/CasePickerModal'
import { ImagePickerModal } from '@/components/modals/ImagePickerModal'
import { VideoPickerModal } from '@/components/modals/VideoPickerModal'
import { PackagePickerModal } from '@/components/modals/PackagePickerModal'
import { PackageDetailModal } from '@/components/modals/PackageDetailModal'
import { PackageShowcasePanel } from '@/components/quote/PackageShowcasePanel'
import { supabase } from '@/lib/supabase'

// Visuell stil: pitch-sidenes cinematiske tema (Cormorant Garamond + DM Sans,
// #0C0B09 / #C49434), som allerede er rot-standarden i app/layout.tsx og
// app/globals.css. Bevisst IKKE MarketingChrome (bransjesidenes Schibsted/
// Newsreader-stil) — se 2026-11-08-sales-flyers-design.md. Selve
// redigeringsmønsteret (per-felt-feil, serialiserte liste-mutasjoner) er
// speilet fra components/marketing/MarketingPageView.tsx.

const GOLD = '#C49434'
const CREAM = '#E8E1D5'
const MUTED = '#9E9287'
const SUBTLE = '#62594E'
const SURFACE = '#161410'
const BORDER = '#2A261F'
// Redigeringskontroller er admin-krom og bruker admin-lilla, slik
// MarketingPageView gjør — besøkende ser dem aldri.
const ADMIN = '#7C5CFC'

const CATEGORY_ORDER: SalesFlyerPackageCategory[] = ['foto', 'film', 'foto_film']
const CATEGORY_LABEL: Record<SalesFlyerPackageCategory, string> = {
  foto: 'Bilder',
  film: 'Film',
  foto_film: 'Bilder og film',
}

// case_studies.title er typisk VERSALER i databasen — vises i tittelform.
function toTitleCase(text: string): string {
  return text.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())
}

function formatNok(amount: number): string {
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(amount)
}

// Pakkekortets ikon-chips — ett ikon pr. leveransegruppe (hovedvideo/bilder/nedklipp), se
// 2026-11-09-flyer-package-showcase-design.md §"Ikon-chips". Kun grupper med count > 0 vises;
// en pakke uten leveranser (f.eks. en helt ny mal) viser ingen chip-rad.
function VideoChipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="15" height="14" rx="2" />
      <path d="M17 10l5-3v10l-5-3" />
    </svg>
  )
}

function PhotoChipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

function ClipChipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12" />
    </svg>
  )
}

function renderDeliverableChips(counts: { hovedvideo: number; klipp: number; photo: number }) {
  const chips: { icon: React.ReactNode; label: string }[] = [
    { icon: <VideoChipIcon />, label: `${counts.hovedvideo} hovedvideo${counts.hovedvideo === 1 ? '' : 'er'}` },
    { icon: <PhotoChipIcon />, label: `${counts.photo} bilde${counts.photo === 1 ? '' : 'r'}` },
    { icon: <ClipChipIcon />, label: `${counts.klipp} nedklipp` },
  ].filter((_, i) => [counts.hovedvideo, counts.photo, counts.klipp][i] > 0)

  if (chips.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {chips.map((chip, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 text-sm" style={{ color: MUTED }}>
          {chip.icon}
          {chip.label}
        </span>
      ))}
    </div>
  )
}

type Field = keyof SalesFlyerUpdate
type FlyerPackage = SalesFlyerWithRelations['packages'][number]

// Stabil referanse — ImagePickerModal synker selectedIds fra denne proppen i
// et useEffect på hver endring av REFERANSEN. Et nytt []-literal per render
// ville nullstilt brukerens pågående valg (samme grunn som i MarketingPageView).
const EMPTY_SELECTION: string[] = []

const editableBase: React.CSSProperties = {
  display: 'block', width: '100%', background: 'rgba(124,92,252,0.08)',
  border: '1px dashed rgba(124,92,252,0.4)', borderRadius: 4,
  outline: 'none', resize: 'none', fontFamily: 'inherit', color: 'inherit',
}

const smallControl: React.CSSProperties = {
  fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: '0.72rem', padding: '6px 10px', borderRadius: 6,
  background: '#fff', color: '#1A1812', border: '1px solid #ccc', cursor: 'pointer',
}

const settingsInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: '0.8rem', padding: '6px 8px',
  border: '1px solid #ccc', borderRadius: 6, background: '#fff', color: '#1A1812',
}

const settingsLabel: React.CSSProperties = {
  display: 'block', fontSize: '0.68rem', fontWeight: 600, color: '#888', margin: '10px 0 4px',
}

interface SalesFlyerViewProps {
  initialFlyer: SalesFlyerWithRelations
  canEdit: boolean
}

export function SalesFlyerView({ initialFlyer, canEdit }: SalesFlyerViewProps) {
  const [flyer, setFlyer] = useState(initialFlyer)
  const [editing, setEditing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Per felt, ikke ett delt par — en mislykket lagring av ett felt skal ikke
  // kunne bli usynlig fordi et HELT ANNET felt lagres (og lykkes) rett etter.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({})
  const [savingFields, setSavingFields] = useState<Set<Field>>(new Set())
  // Samme ImagePickerModal gjenbrukes for tre ulike bildefelt (hero-poster,
  // de to BTS-bildene) — target husker hvilket felt plukkeren nettopp åpnet
  // for, siden handleImagePicked ellers ikke vet hvor valget skal lagres.
  const [imagePickerTarget, setImagePickerTarget] = useState<'hero_poster' | 'bts_image_1' | 'bts_image_2' |
    'example_image_1' | 'example_image_2' | 'example_image_3' | 'example_image_4' |
    'example_image_5' | 'example_image_6' | 'example_image_7' | 'example_image_8' | null>(null)
  // Hvilken pakkes eksempelmedia (quote_id) som redigeres akkurat nå — satt via
  // "Eksempelmedia"-knappen på pakkekortet, null når editoren er lukket.
  const [showcaseEditorQuoteId, setShowcaseEditorQuoteId] = useState<string | null>(null)
  const [videoPickerOpen, setVideoPickerOpen] = useState(false)

  const [casePickerOpen, setCasePickerOpen] = useState(false)
  const [pendingCaseIds, setPendingCaseIds] = useState<string[]>([])
  const [allCases, setAllCases] = useState<CaseStudy[]>([])
  // Case- og pakke-mutasjoner serialiseres hver for seg (to uavhengige lister):
  // knappene disables mens én mutasjon i SAMME liste er underveis, så en sent
  // ankommende rollback ikke kan overskrive en senere, vellykket mutasjon.
  const [caseMutating, setCaseMutating] = useState(false)
  const [casesError, setCasesError] = useState<string | null>(null)

  const [packagePickerOpen, setPackagePickerOpen] = useState(false)
  const [pendingPackageIds, setPendingPackageIds] = useState<string[]>([])
  const [allPackages, setAllPackages] = useState<PackageTemplateQuote[]>([])
  // Egen "lastet"-flagg i stedet for allPackages.length === 0 — en tom liste
  // (ingen pakker opprettet ennå) er et gyldig svar og skal ikke hentes på nytt
  // hver gang plukkeren åpnes.
  const [packagesLoaded, setPackagesLoaded] = useState(false)
  const [packageMutating, setPackageMutating] = useState(false)
  const [packagesError, setPackagesError] = useState<string | null>(null)

  // "Se mer"-modalen — id-en til pakke-kortets EGEN id (sales_flyer_packages-
  // raden, pkg.id), ikke quote_id, siden det er feltet hvert kort allerede
  // bruker som nøkkel.
  const [detailPackageId, setDetailPackageId] = useState<string | null>(null)


  const slug = flyer.slug
  const engagementParagraphs = splitParagraphs(flyer.engagement_text)

  function set<K extends keyof SalesFlyerWithRelations>(key: K, value: SalesFlyerWithRelations[K]) {
    setFlyer(prev => ({ ...prev, [key]: value }))
  }

  function markSaving(field: Field, on: boolean) {
    setSavingFields(prev => {
      const next = new Set(prev)
      if (on) next.add(field)
      else next.delete(field)
      return next
    })
  }

  // `previousValue`: hvis gitt, settes feltet tilbake til denne verdien hvis
  // lagringen feiler — brukt for diskrete felter (publisert-bryteren) der en
  // gjenværende feil UI-tilstand er en reell fare (admin tror flyeren er
  // publisert/skjult når den ikke er det). Fritekst (inkl. cta_email) forblir
  // urørt ved feil — brukeren skal ikke miste det de nettopp skrev.
  async function saveField<K extends keyof SalesFlyerWithRelations>(
    field: Field,
    value: string | boolean | number | null,
    previousValue?: SalesFlyerWithRelations[K]
  ) {
    setSavingFields(prev => new Set(prev).add(field))
    try {
      const result = await updateSalesFlyer(flyer.id, { [field]: value } as SalesFlyerUpdate)
      if ('error' in result) {
        setFieldErrors(prev => ({ ...prev, [field]: result.error }))
        if (previousValue !== undefined) set(field as K, previousValue)
      } else {
        setFieldErrors(prev => { const next = { ...prev }; delete next[field]; return next })
      }
    } catch (err) {
      console.error('saveField:', err)
      setFieldErrors(prev => ({ ...prev, [field]: 'sjekk nettforbindelsen' }))
      if (previousValue !== undefined) set(field as K, previousValue)
    } finally {
      setSavingFields(prev => { const next = new Set(prev); next.delete(field); return next })
    }
  }

  function FieldError({ field }: { field: Field }) {
    const message = fieldErrors[field]
    if (!message) return null
    return (
      <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#E05A4A', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
        ⚠ Ikke lagret: {message}
      </p>
    )
  }

  // Hero-media velges alltid fra biblioteket (video_library/images), aldri
  // en direkte rå-opplasting her — Magnus var eksplisitt på dette. Biblioteks-
  // plukkerne (VideoPickerModal/ImagePickerModal) har sin egen "last opp ny"-
  // flyt innebygd, så en ny video/bilde kan legges til biblioteket uten å
  // forlate denne plukkeren. Selve filen KOPIERES inn i flyerens egne
  // sales-flyers/${slug}/-mappe (copyLibraryImageToFlyer/copyLibraryVideoToFlyer)
  // i stedet for å peke direkte på biblioteks-raden — samme begrunnelse som på
  // bransjesidene: en senere sletting i biblioteket skal ikke kunne brekke en
  // allerede publisert flyer.
  async function handleVideoPicked(videoIds: string[]) {
    setVideoPickerOpen(false)
    if (videoIds.length === 0) return
    const field = 'hero_video_path'
    markSaving(field, true)
    try {
      const result = await copyLibraryVideoToFlyer(slug, videoIds[0], 'hero_video')
      if ('url' in result) {
        set(field, result.url)
        await saveField(field, result.url)
      } else {
        markSaving(field, false)
        setFieldErrors(prev => ({ ...prev, [field]: result.error }))
      }
    } catch (err) {
      console.error('handleVideoPicked:', err)
      markSaving(field, false)
      setFieldErrors(prev => ({ ...prev, [field]: 'sjekk nettforbindelsen' }))
    }
  }

  async function handleImagePicked(imageIds: string[]) {
    const target = imagePickerTarget
    setImagePickerTarget(null)
    if (imageIds.length === 0 || !target) return
    // Alle mål (gamle og nye) følger nøyaktig <target>_path-navnekonvensjonen.
    const field = `${target}_path` as Field
    markSaving(field, true)
    try {
      const result = await copyLibraryImageToFlyer(slug, imageIds[0], target)
      if ('url' in result) {
        set(field, result.url)
        await saveField(field, result.url)
      } else {
        markSaving(field, false)
        setFieldErrors(prev => ({ ...prev, [field]: result.error }))
      }
    } catch (err) {
      console.error('handleImagePicked:', err)
      markSaving(field, false)
      setFieldErrors(prev => ({ ...prev, [field]: 'sjekk nettforbindelsen' }))
    }
  }

  // ── Cases ────────────────────────────────────────────────────────────────

  async function openCasePicker() {
    setPendingCaseIds(flyer.cases.map(c => c.id))
    if (allCases.length === 0) {
      const { data, error } = await supabase.from('case_studies').select('*').order('title', { ascending: true })
      if (error) {
        console.error('openCasePicker:', error)
        setCasesError('Kunne ikke hente case-biblioteket')
        return
      }
      setAllCases((data ?? []) as CaseStudy[])
    }
    setCasePickerOpen(true)
  }

  function toggleCaseSelection(caseId: string) {
    setPendingCaseIds(prev => prev.includes(caseId) ? prev.filter(id => id !== caseId) : [...prev, caseId])
  }

  async function handleCasePickerSave() {
    setCasePickerOpen(false)
    setCaseMutating(true)
    try {
      const result = await setSalesFlyerCases(flyer.id, pendingCaseIds)
      if ('error' in result) { setCasesError(`Kunne ikke lagre case-listen: ${result.error}`); return }
      // Case-dataene for et nytt valg er ikke lokalt tilgjengelige — henter
      // flyeren på nytt og slår KUN cases inn i lokal tilstand, i stedet for
      // en full reload som ville kastet bort ulagrede tekstfelt-endringer.
      const fresh = await getSalesFlyerBySlug(slug, { includeDraft: true })
      if (fresh) { set('cases', fresh.cases); setCasesError(null) }
      else setCasesError('Case-listen ble lagret, men kunne ikke hentes på nytt — last siden på nytt')
    } catch (err) {
      console.error('handleCasePickerSave:', err)
      setCasesError('Kunne ikke lagre case-listen — sjekk nettforbindelsen')
    } finally {
      setCaseMutating(false)
    }
  }

  async function moveCase(index: number, direction: 'up' | 'down') {
    if (caseMutating) return
    const previous = flyer.cases
    const next = [...flyer.cases]
    const swapWith = direction === 'up' ? index - 1 : index + 1
    if (swapWith < 0 || swapWith >= next.length) return
    ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
    set('cases', next)
    setCaseMutating(true)
    try {
      const result = await setSalesFlyerCases(flyer.id, next.map(c => c.id))
      if ('error' in result) { setCasesError(`Kunne ikke lagre rekkefølgen: ${result.error}`); set('cases', previous) }
      else setCasesError(null)
    } catch (err) {
      console.error('moveCase:', err)
      setCasesError('Kunne ikke lagre rekkefølgen — sjekk nettforbindelsen')
      set('cases', previous)
    } finally {
      setCaseMutating(false)
    }
  }

  async function removeCase(caseId: string) {
    if (caseMutating) return
    const previous = flyer.cases
    const next = flyer.cases.filter(c => c.id !== caseId)
    set('cases', next)
    setCaseMutating(true)
    try {
      const result = await setSalesFlyerCases(flyer.id, next.map(c => c.id))
      if ('error' in result) { setCasesError(`Kunne ikke fjerne caset: ${result.error}`); set('cases', previous) }
      else setCasesError(null)
    } catch (err) {
      console.error('removeCase:', err)
      setCasesError('Kunne ikke fjerne caset — sjekk nettforbindelsen')
      set('cases', previous)
    } finally {
      setCaseMutating(false)
    }
  }

  // ── Pakker ───────────────────────────────────────────────────────────────

  async function openPackagePicker() {
    setPendingPackageIds(flyer.packages.map(p => p.quote_id))
    if (!packagesLoaded) {
      try {
        const packages = await listPackageTemplateQuotes()
        setAllPackages(packages)
        setPackagesLoaded(true)
      } catch (err) {
        console.error('openPackagePicker:', err)
        setPackagesError('Kunne ikke hente pakkene — sjekk nettforbindelsen')
        return
      }
    }
    setPackagePickerOpen(true)
  }

  function togglePackageSelection(quoteId: string) {
    setPendingPackageIds(prev => prev.includes(quoteId) ? prev.filter(id => id !== quoteId) : [...prev, quoteId])
  }

  async function handlePackagePickerSave() {
    setPackagePickerOpen(false)
    setPackageMutating(true)
    try {
      const result = await setSalesFlyerPackages(flyer.id, pendingPackageIds)
      if ('error' in result) { setPackagesError(`Kunne ikke lagre pakke-listen: ${result.error}`); return }
      // Samme som for cases: tilbudsdataene (navn/kategori/beløp) for nye valg
      // finnes ikke lokalt — henter på nytt og slår KUN packages inn.
      const fresh = await getSalesFlyerBySlug(slug, { includeDraft: true })
      if (fresh) { set('packages', fresh.packages); setPackagesError(null) }
      else setPackagesError('Pakke-listen ble lagret, men kunne ikke hentes på nytt — last siden på nytt')
    } catch (err) {
      console.error('handlePackagePickerSave:', err)
      setPackagesError('Kunne ikke lagre pakke-listen — sjekk nettforbindelsen')
    } finally {
      setPackageMutating(false)
    }
  }

  // Henter pakkelisten på nytt etter at eksempelmedia er redigert i den nye,
  // per-flyer "Eksempelmedia"-editoren — samme mønster som handlePackagePickerSave,
  // slik at "Se mer"-knappens synlighet oppdateres uten en full sideoppfriskning.
  async function refreshPackagesAfterShowcaseEdit() {
    const fresh = await getSalesFlyerBySlug(slug, { includeDraft: true })
    if (fresh) set('packages', fresh.packages)
  }

  function closeShowcaseEditor() {
    setShowcaseEditorQuoteId(null)
    refreshPackagesAfterShowcaseEdit()
  }

  // Pakkene vises gruppert per kategori, så "flytt opp/ned" bytter plass med
  // nærmeste pakke i SAMME kategori i den flate, ordnede listen — ellers ville
  // et klikk ofte ikke gitt noen synlig endring (bytte med en pakke i en annen
  // kategori-gruppe).
  async function movePackage(quoteId: string, direction: 'up' | 'down') {
    if (packageMutating) return
    const previous = flyer.packages
    const index = previous.findIndex(p => p.quote_id === quoteId)
    if (index === -1) return
    const category = previous[index].package_category
    let swapWith = -1
    if (direction === 'up') {
      for (let i = index - 1; i >= 0; i--) if (previous[i].package_category === category) { swapWith = i; break }
    } else {
      for (let i = index + 1; i < previous.length; i++) if (previous[i].package_category === category) { swapWith = i; break }
    }
    if (swapWith === -1) return
    const next = [...previous]
    ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
    set('packages', next)
    setPackageMutating(true)
    try {
      const result = await setSalesFlyerPackages(flyer.id, next.map(p => p.quote_id))
      if ('error' in result) { setPackagesError(`Kunne ikke lagre rekkefølgen: ${result.error}`); set('packages', previous) }
      else setPackagesError(null)
    } catch (err) {
      console.error('movePackage:', err)
      setPackagesError('Kunne ikke lagre rekkefølgen — sjekk nettforbindelsen')
      set('packages', previous)
    } finally {
      setPackageMutating(false)
    }
  }

  async function removePackage(quoteId: string) {
    if (packageMutating) return
    const previous = flyer.packages
    const next = flyer.packages.filter(p => p.quote_id !== quoteId)
    set('packages', next)
    setPackageMutating(true)
    try {
      const result = await setSalesFlyerPackages(flyer.id, next.map(p => p.quote_id))
      if ('error' in result) { setPackagesError(`Kunne ikke fjerne pakken: ${result.error}`); set('packages', previous) }
      else setPackagesError(null)
    } catch (err) {
      console.error('removePackage:', err)
      setPackagesError('Kunne ikke fjerne pakken — sjekk nettforbindelsen')
      set('packages', previous)
    } finally {
      setPackageMutating(false)
    }
  }

  // Gruppering etter kategori, flyerens egen rekkefølge innen hver gruppe.
  // getOrderedPackages (lib/actions/sales-flyers.ts) filtrerer allerede bort
  // pakker uten kategori server-side, så package_category er alltid satt her.
  const packagesByCategory = CATEGORY_ORDER
    .map(category => ({ category, items: flyer.packages.filter(p => p.package_category === category) }))
    .filter(group => group.items.length > 0)

  const detailPackage = flyer.packages.find(p => p.id === detailPackageId) ?? null

  const editableStyle = (extra?: React.CSSProperties): React.CSSProperties => ({ ...editableBase, ...extra })
  const heroHasMedia = Boolean(flyer.hero_video_path || flyer.hero_poster_path)
  const listError = casesError ?? packagesError

  // Render-funksjon (ikke en indre komponent) så kortene ikke remountes på
  // hver render av forelderen.
  function renderPackageCard(pkg: FlyerPackage, positionInGroup: number, groupSize: number) {
    const amount = pkg.amount
    const title = pkg.package_label
    const hasShowcase = pkg.showcaseItems.length > 0
    return (
      <div key={pkg.id} className="relative flex flex-col justify-between rounded-[2px] p-6 md:p-8" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
        {editing && (
          <div style={{ position: 'absolute', top: -14, right: -14, zIndex: 5, display: 'flex', gap: 4 }}>
            <button onClick={() => movePackage(pkg.quote_id, 'up')} disabled={positionInGroup === 0 || packageMutating} aria-label="Flytt opp" style={{ width: 28, height: 28, borderRadius: 14, background: '#fff', color: '#1A1812', border: '1px solid #ccc', cursor: positionInGroup === 0 || packageMutating ? 'default' : 'pointer', opacity: packageMutating ? 0.5 : 1 }}>↑</button>
            <button onClick={() => movePackage(pkg.quote_id, 'down')} disabled={positionInGroup === groupSize - 1 || packageMutating} aria-label="Flytt ned" style={{ width: 28, height: 28, borderRadius: 14, background: '#fff', color: '#1A1812', border: '1px solid #ccc', cursor: positionInGroup === groupSize - 1 || packageMutating ? 'default' : 'pointer', opacity: packageMutating ? 0.5 : 1 }}>↓</button>
            <button onClick={() => removePackage(pkg.quote_id)} disabled={packageMutating} aria-label="Fjern pakke" style={{ width: 28, height: 28, borderRadius: 14, background: '#C0392B', color: '#fff', border: 'none', cursor: packageMutating ? 'default' : 'pointer', opacity: packageMutating ? 0.5 : 1 }}>×</button>
          </div>
        )}
        <div>
          <h4 className="font-display text-2xl md:text-3xl" style={{ color: CREAM, fontWeight: 400 }}>{title}</h4>
          {renderDeliverableChips(pkg.deliverableCounts)}
          {hasShowcase && (
            <button
              type="button"
              onClick={() => setDetailPackageId(pkg.id)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] transition hover:opacity-80"
              style={{ color: GOLD, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              Se mer
              <span aria-hidden>→</span>
            </button>
          )}
          {editing && (
            <button
              type="button"
              onClick={() => setShowcaseEditorQuoteId(pkg.quote_id)}
              className="mt-3 block text-xs font-medium uppercase tracking-[0.12em] transition hover:opacity-80"
              style={{ color: ADMIN, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              Eksempelmedia
            </button>
          )}
        </div>
        <div className="mt-8">
          {amount !== null ? (
            <>
              <p className="font-display text-3xl md:text-4xl" style={{ color: GOLD, fontWeight: 400 }}>{formatNok(amount)}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.12em]" style={{ color: SUBTLE }}>eks. mva</p>
            </>
          ) : (
            <p className="text-sm" style={{ color: MUTED }}>Pris på forespørsel</p>
          )}
          {/* Egen CTA pr. pakke — mailto med pakkenavnet i emnefeltet, så
              henvendelsen allerede sier hvilken pakke det gjelder. Samme
              cta_email som flyerens hoved-CTA, siden det er én mottaker pr.
              flyer, ikke pr. pakke. */}
          {flyer.cta_email ? (
            <a
              href={`mailto:${flyer.cta_email}?subject=${encodeURIComponent(`Forespørsel: ${title}`)}&body=${encodeURIComponent(`Hei,\n\nJeg er interessert i "${title}". Kan dere ta kontakt?`)}`}
              className="mt-6 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.15em] transition hover:opacity-80"
              style={{ color: GOLD }}
            >
              Spør om denne pakken
              <span aria-hidden>→</span>
            </a>
          ) : editing ? (
            <p className="mt-6 text-xs" style={{ color: '#E05A4A' }}>
              Ingen CTA-e-post satt — legg den inn under ⚙ Innstillinger.
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  // ── Eksempelbilder (8 faste bilder i et asymmetrisk rutenett) ────────────
  const EXAMPLE_IMAGE_TARGETS = [
    'example_image_1', 'example_image_2', 'example_image_3', 'example_image_4',
    'example_image_5', 'example_image_6', 'example_image_7', 'example_image_8',
  ] as const
  const exampleImageSlots = EXAMPLE_IMAGE_TARGETS.map(target => {
    const field = `${target}_path` as Field
    const posXField = `${target}_position_x` as Field
    const posYField = `${target}_position_y` as Field
    return {
      target, field, posXField, posYField,
      path: (flyer[field] as string | null),
      posX: (flyer[posXField] as unknown as number) ?? 50,
      posY: (flyer[posYField] as unknown as number) ?? 50,
    }
  })
  const hasAnyExampleImage = exampleImageSlots.some(s => s.path)

  function renderExampleImageSlot(slot: typeof exampleImageSlots[number], className: string) {
    const { path, field, target, posXField, posYField, posX, posY } = slot
    return (
      <div key={field} className={`relative overflow-hidden ${className}`} style={{ background: SURFACE }}>
        {path ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={path} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `${posX}% ${posY}%` }} />
            {editing && (
              <>
                <button
                  onClick={() => { set(field, null); saveField(field, null) }}
                  disabled={savingFields.has(field)}
                  aria-label="Fjern bilde"
                  style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, background: '#C0392B', color: '#fff', border: 'none', fontSize: '0.8rem', lineHeight: 1, cursor: savingFields.has(field) ? 'default' : 'pointer', opacity: savingFields.has(field) ? 0.5 : 1 }}
                >
                  ×
                </button>
                {/* Posisjonering innenfor rammen — lagres kun på slipp (mouseUp/touchEnd),
                    ikke på hvert onChange-tick, for å unngå én lagring pr. piksel dratt. */}
                <div style={{ position: 'absolute', top: 8, left: 8, right: 44, background: 'rgba(0,0,0,0.55)', borderRadius: 6, padding: '6px 8px' }}>
                  <label style={{ display: 'block', fontSize: '0.6rem', color: '#fff', marginBottom: 2 }}>X</label>
                  <input
                    type="range" min={0} max={100}
                    value={posX}
                    onChange={e => set(posXField, Number(e.target.value))}
                    onMouseUp={e => saveField(posXField, Number((e.target as HTMLInputElement).value))}
                    onTouchEnd={e => saveField(posXField, Number((e.target as HTMLInputElement).value))}
                    style={{ width: '100%', display: 'block' }}
                  />
                  <label style={{ display: 'block', fontSize: '0.6rem', color: '#fff', margin: '4px 0 2px' }}>Y</label>
                  <input
                    type="range" min={0} max={100}
                    value={posY}
                    onChange={e => set(posYField, Number(e.target.value))}
                    onMouseUp={e => saveField(posYField, Number((e.target as HTMLInputElement).value))}
                    onTouchEnd={e => saveField(posYField, Number((e.target as HTMLInputElement).value))}
                    style={{ width: '100%', display: 'block' }}
                  />
                </div>
              </>
            )}
          </>
        ) : editing ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs" style={{ color: SUBTLE }}>Ingen bilde ennå</p>
          </div>
        ) : null}
        {editing && (
          <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12 }}>
            <button
              onClick={() => setImagePickerTarget(target)}
              disabled={savingFields.has(field)}
              style={smallControl}
            >
              {savingFields.has(field) ? 'Henter bilde…' : 'Velg bilde'}
            </button>
            {fieldErrors[field] && (
              <div style={{ marginTop: 4, background: '#fff', borderRadius: 6, padding: '4px 10px', display: 'inline-block' }}>
                <FieldError field={field} />
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <main className="min-h-screen" style={{ background: '#0C0B09', color: CREAM, position: 'relative' }}>
      {canEdit && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 50, display: 'flex', gap: 8, alignItems: 'center' }}>
          {!flyer.published && (
            <span style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: '0.7rem', fontWeight: 600, padding: '6px 10px', borderRadius: 20, background: 'rgba(196,148,52,0.15)', color: GOLD, border: `1px solid ${GOLD}` }}>
              Kladd — ikke publisert
            </span>
          )}
          {editing && (
            <button
              onClick={() => setSettingsOpen(s => !s)}
              style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: '0.75rem', fontWeight: 600, padding: '8px 14px', borderRadius: 20, background: '#fff', color: '#1A1812', border: '1px solid #ccc', cursor: 'pointer' }}
            >
              ⚙ Innstillinger
            </button>
          )}
          <button
            onClick={() => setEditing(e => !e)}
            style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: '0.75rem', fontWeight: 600, padding: '8px 14px', borderRadius: 20, background: editing ? '#1A1812' : ADMIN, color: '#fff', border: editing ? '1px solid #444' : 'none', cursor: 'pointer' }}
          >
            {editing ? '✓ Ferdig' : '✎ Rediger'}
          </button>
        </div>
      )}

      {listError && (
        <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 50, background: '#C0392B', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: '0.8rem', maxWidth: 320 }}>
          {casesError && <p>{casesError}</p>}
          {packagesError && <p style={{ marginTop: casesError ? 6 : 0 }}>{packagesError}</p>}
          <button onClick={() => { setCasesError(null); setPackagesError(null) }} aria-label="Lukk" style={{ marginTop: 6, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>✕ Lukk</button>
        </div>
      )}
      {(savingFields.size > 0 || caseMutating || packageMutating) && (
        <div style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 50, background: '#1A1812', color: '#fff', padding: '6px 12px', borderRadius: 8, fontSize: '0.72rem', border: '1px solid #333' }}>
          Lagrer...
        </div>
      )}

      {settingsOpen && editing && (
        <div style={{ position: 'fixed', top: 64, right: 16, zIndex: 50, background: '#fff', color: '#1A1812', border: '1px solid #ddd', borderRadius: 10, padding: 18, width: 300, boxShadow: '0 8px 30px rgba(0,0,0,0.4)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', marginBottom: 10 }}>/flyer/{slug}</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: '0.82rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={flyer.published}
              onChange={e => { const prev = flyer.published; set('published', e.target.checked); saveField('published', e.target.checked, prev) }}
            />
            Publisert
          </label>
          <FieldError field="published" />

          <label style={settingsLabel}>CTA-e-post (mottaker av forespørsler)</label>
          <input
            type="email"
            value={flyer.cta_email}
            placeholder="navn@leafilms.no"
            onChange={e => set('cta_email', e.target.value)}
            onBlur={e => saveField('cta_email', e.target.value)}
            style={settingsInput}
          />
          <FieldError field="cta_email" />

          <label style={settingsLabel}>SEO-tittel</label>
          <input
            type="text"
            value={flyer.meta_title}
            onChange={e => set('meta_title', e.target.value)}
            onBlur={e => saveField('meta_title', e.target.value)}
            style={settingsInput}
          />
          <FieldError field="meta_title" />

          <label style={settingsLabel}>SEO-beskrivelse</label>
          <textarea
            value={flyer.meta_description}
            onChange={e => set('meta_description', e.target.value)}
            onBlur={e => saveField('meta_description', e.target.value)}
            rows={2}
            style={settingsInput}
          />
          <FieldError field="meta_description" />
        </div>
      )}

      {/* ── Hero ── */}
      <section className="relative h-dvh min-h-[600px] w-full overflow-hidden" style={{ background: '#0C0B09' }}>
        {flyer.hero_video_path ? (
          <HeroMedia type="video" src={flyer.hero_video_path} poster={flyer.hero_poster_path} />
        ) : flyer.hero_poster_path ? (
          <HeroMedia type="image" src={null} poster={flyer.hero_poster_path} />
        ) : null}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(12,11,9,0.95) 0%, rgba(12,11,9,0.35) 50%, rgba(12,11,9,0.15) 100%)' }} />

        {editing && !heroHasMedia && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-[2px] border border-dashed px-10 py-8 text-center" style={{ borderColor: '#38332A', color: SUBTLE }}>
              <p className="text-sm">Ingen hero-video ennå</p>
            </div>
          </div>
        )}

        {editing && (
          <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 20, display: 'flex', gap: 8, flexWrap: 'wrap', maxWidth: 'calc(100% - 32px)' }}>
            <button onClick={() => setVideoPickerOpen(true)} disabled={savingFields.has('hero_video_path')} style={smallControl}>
              {savingFields.has('hero_video_path') ? 'Henter video…' : 'Velg video'}
            </button>
            <button onClick={() => setImagePickerTarget('hero_poster')} disabled={savingFields.has('hero_poster_path')} style={smallControl}>
              {savingFields.has('hero_poster_path') ? 'Henter bilde…' : 'Velg bilde'}
            </button>
          </div>
        )}
        {editing && (fieldErrors.hero_video_path || fieldErrors.hero_poster_path) && (
          <div style={{ position: 'absolute', top: 56, left: 16, zIndex: 20, background: '#fff', borderRadius: 6, padding: '4px 10px' }}>
            <FieldError field="hero_video_path" />
            <FieldError field="hero_poster_path" />
          </div>
        )}

        <div className="relative z-10 flex h-full flex-col justify-between px-6 py-8 md:px-16 md:py-12">
          <p className="text-xs font-medium uppercase tracking-[0.3em]" style={{ color: GOLD }}>Leafilms</p>

          <div className="max-w-4xl pb-6 md:pb-12">
            {editing ? (
              <>
                <textarea
                  value={flyer.headline}
                  placeholder="Overskrift"
                  onChange={e => set('headline', e.target.value)}
                  onBlur={e => saveField('headline', e.target.value)}
                  rows={3}
                  className="font-display text-5xl leading-[1.02] md:text-7xl lg:text-8xl"
                  style={editableStyle({ color: CREAM, fontWeight: 300 })}
                />
                <FieldError field="headline" />
              </>
            ) : flyer.headline ? (
              <h1 className="font-display text-5xl leading-[1.02] md:text-7xl lg:text-8xl" style={{ color: CREAM, fontWeight: 300 }}>
                {flyer.headline}
              </h1>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── Eksempler på arbeid ── */}
      {(flyer.cases.length > 0 || editing) && (
        <section className="px-6 py-20 md:px-16 md:py-32">
          <div className="mb-12 flex items-center gap-6 md:mb-16">
            <span className="h-px w-12" style={{ background: GOLD }} />
            <p className="text-xs font-medium uppercase tracking-[0.3em]" style={{ color: MUTED }}>Tidligere arbeid</p>
          </div>

          <div className="grid gap-x-8 gap-y-14 md:grid-cols-2">
            {flyer.cases.map((caseStudy, index) => {
              const isLast = index === flyer.cases.length - 1
              return (
                <div key={caseStudy.id} className="group relative">
                  {editing && (
                    <div style={{ position: 'absolute', top: -14, right: -14, zIndex: 5, display: 'flex', gap: 4 }}>
                      <button onClick={() => moveCase(index, 'up')} disabled={index === 0 || caseMutating} aria-label="Flytt opp" style={{ width: 28, height: 28, borderRadius: 14, background: '#fff', color: '#1A1812', border: '1px solid #ccc', cursor: index === 0 || caseMutating ? 'default' : 'pointer', opacity: caseMutating ? 0.5 : 1 }}>↑</button>
                      <button onClick={() => moveCase(index, 'down')} disabled={isLast || caseMutating} aria-label="Flytt ned" style={{ width: 28, height: 28, borderRadius: 14, background: '#fff', color: '#1A1812', border: '1px solid #ccc', cursor: isLast || caseMutating ? 'default' : 'pointer', opacity: caseMutating ? 0.5 : 1 }}>↓</button>
                      <button onClick={() => removeCase(caseStudy.id)} disabled={caseMutating} aria-label="Fjern case" style={{ width: 28, height: 28, borderRadius: 14, background: '#C0392B', color: '#fff', border: 'none', cursor: caseMutating ? 'default' : 'pointer', opacity: caseMutating ? 0.5 : 1 }}>×</button>
                    </div>
                  )}
                  <a href={caseStudy.vimeo_url} target="_blank" rel="noopener noreferrer" className="block">
                    <div className="relative aspect-video w-full overflow-hidden" style={{ background: SURFACE }}>
                      {caseStudy.thumbnail_path && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={caseStudy.thumbnail_path}
                          alt={toTitleCase(caseStudy.title)}
                          loading={index < 2 ? 'eager' : 'lazy'}
                          className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
                        />
                      )}
                    </div>
                    <h3 className="font-display mt-5 text-2xl md:text-3xl" style={{ color: CREAM, fontWeight: 400 }}>
                      {toTitleCase(caseStudy.title)}
                    </h3>
                    {caseStudy.description && (
                      <p className="mt-2 text-sm leading-relaxed md:text-base" style={{ color: MUTED }}>{caseStudy.description}</p>
                    )}
                  </a>
                </div>
              )
            })}
          </div>

          {editing && (
            <div className="mt-12">
              <button onClick={openCasePicker} disabled={caseMutating} style={{ fontSize: '0.78rem', fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: ADMIN, color: '#fff', border: 'none', cursor: caseMutating ? 'default' : 'pointer', opacity: caseMutating ? 0.6 : 1 }}>
                + Legg til case
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── Eksempelbilder — 8 bilder i et fast asymmetrisk rutenett, utvidelse
          av pitch-byggerens ExampleWorkSection-rytme (hero/tårn/tårn/bunn) ── */}
      {(hasAnyExampleImage || editing) && (
        <section className="px-6 py-20 md:px-16 md:py-32" style={{ borderTop: `1px solid ${BORDER}` }}>
          {/* Mobil: vertikal stabling */}
          <div className="flex flex-col gap-0 md:hidden">
            {exampleImageSlots.map(slot => renderExampleImageSlot(slot, 'h-[400px]'))}
          </div>

          {/* Desktop: hero / tårn-blokk / tårn-blokk / bunn */}
          <div className="hidden md:block">
            {renderExampleImageSlot(exampleImageSlots[0], 'h-[700px]')}
            <div className="grid grid-cols-2 gap-0">
              <div className="row-span-2 h-[800px]">{renderExampleImageSlot(exampleImageSlots[1], 'h-full')}</div>
              {renderExampleImageSlot(exampleImageSlots[2], 'h-[400px]')}
              {renderExampleImageSlot(exampleImageSlots[3], 'h-[400px]')}
            </div>
            <div className="grid grid-cols-2 gap-0">
              <div className="row-span-2 h-[800px]">{renderExampleImageSlot(exampleImageSlots[4], 'h-full')}</div>
              {renderExampleImageSlot(exampleImageSlots[5], 'h-[400px]')}
              {renderExampleImageSlot(exampleImageSlots[6], 'h-[400px]')}
            </div>
            {renderExampleImageSlot(exampleImageSlots[7], 'h-[600px]')}
          </div>
        </section>
      )}

      {/* ── Pakker ── */}
      {(packagesByCategory.length > 0 || editing) && (
        <section className="px-6 py-20 md:px-16 md:py-32" style={{ borderTop: `1px solid ${BORDER}` }}>
          <div className="mb-12 flex items-center gap-6 md:mb-16">
            <span className="h-px w-12" style={{ background: GOLD }} />
            <p className="text-xs font-medium uppercase tracking-[0.3em]" style={{ color: MUTED }}>Pakker</p>
          </div>

          <div className="space-y-16 md:space-y-20">
            {packagesByCategory.map(group => (
              <div key={group.category}>
                <h3 className="font-display mb-8 text-3xl md:text-5xl" style={{ color: CREAM, fontWeight: 300 }}>
                  {CATEGORY_LABEL[group.category]}
                </h3>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((pkg, i) => (
                    renderPackageCard(pkg, i, group.items.length)
                  ))}
                </div>
              </div>
            ))}
          </div>

          {packagesByCategory.length > 0 && (
            <p className="mt-12 text-xs" style={{ color: SUBTLE }}>Alle priser er oppgitt eks. mva.</p>
          )}

          {editing && (
            <div className="mt-12">
              <button onClick={openPackagePicker} disabled={packageMutating} style={{ fontSize: '0.78rem', fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: ADMIN, color: '#fff', border: 'none', cursor: packageMutating ? 'default' : 'pointer', opacity: packageMutating ? 0.6 : 1 }}>
                + Velg pakker
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── Engasjement-tekst — vises som et sitat/hilsen fra Leafilms, ikke
          løpende brødtekst. Standardverdi satt i createSalesFlyer, redigerbar
          per flyer. */}
      {(engagementParagraphs.length > 0 || editing) && (
        <section className="px-6 py-20 text-center md:px-16 md:py-28" style={{ borderTop: `1px solid ${BORDER}` }}>
          <div className="mx-auto max-w-3xl">
            <span className="font-display block select-none" aria-hidden style={{ color: GOLD, fontSize: '4.5rem', lineHeight: 0.5, fontWeight: 300 }}>&ldquo;</span>
            {editing ? (
              <>
                <textarea
                  value={flyer.engagement_text}
                  placeholder="Kort tekst om hvorfor godt innhold engasjerer"
                  onChange={e => set('engagement_text', e.target.value)}
                  onBlur={e => saveField('engagement_text', e.target.value)}
                  rows={4}
                  className="font-display text-center text-2xl italic leading-snug md:text-4xl"
                  style={editableStyle({ color: CREAM, fontWeight: 300 })}
                />
                <FieldError field="engagement_text" />
              </>
            ) : (
              <div className="space-y-6">
                {engagementParagraphs.map((paragraph, index) => (
                  <p key={index} className="font-display text-2xl italic leading-snug md:text-4xl" style={{ color: CREAM, fontWeight: 300 }}>
                    {paragraph}
                  </p>
                ))}
              </div>
            )}
            <p className="mt-8 text-xs font-medium uppercase tracking-[0.3em]" style={{ color: GOLD }}>— Leafilms</p>
          </div>
        </section>
      )}

      {/* ── BTS-bilder — to bilder side ved side, rett under sitatet ── */}
      {(flyer.bts_image_1_path || flyer.bts_image_2_path || editing) && (
        <section className="grid grid-cols-2">
          {([
            { path: flyer.bts_image_1_path, field: 'bts_image_1_path' as const, target: 'bts_image_1' as const },
            { path: flyer.bts_image_2_path, field: 'bts_image_2_path' as const, target: 'bts_image_2' as const },
          ]).map(({ path, field, target }) => (
            <div key={field} className="relative aspect-square md:aspect-[4/5]" style={{ background: SURFACE }}>
              {path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={path} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : editing ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-xs" style={{ color: SUBTLE }}>Ingen bilde ennå</p>
                </div>
              ) : null}
              {editing && (
                <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12 }}>
                  <button
                    onClick={() => setImagePickerTarget(target)}
                    disabled={savingFields.has(field)}
                    style={smallControl}
                  >
                    {savingFields.has(field) ? 'Henter bilde…' : 'Velg bilde'}
                  </button>
                  {fieldErrors[field] && (
                    <div style={{ marginTop: 4, background: '#fff', borderRadius: 6, padding: '4px 10px', display: 'inline-block' }}>
                      <FieldError field={field} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ── CTA ── */}
      <section className="px-6 py-28 md:px-16 md:py-40" style={{ background: SURFACE, borderTop: `1px solid ${BORDER}` }}>
        <div className="max-w-3xl">
          {editing ? (
            <>
              <textarea
                value={flyer.cta_headline}
                placeholder="CTA-overskrift"
                onChange={e => set('cta_headline', e.target.value)}
                onBlur={e => saveField('cta_headline', e.target.value)}
                rows={2}
                className="font-display text-4xl leading-tight md:text-6xl"
                style={editableStyle({ color: CREAM, fontWeight: 300 })}
              />
              <FieldError field="cta_headline" />
            </>
          ) : flyer.cta_headline ? (
            <h2 className="font-display text-4xl leading-tight md:text-6xl" style={{ color: CREAM, fontWeight: 300 }}>{flyer.cta_headline}</h2>
          ) : null}

          {editing ? (
            <>
              <textarea
                value={flyer.cta_subtext}
                placeholder="CTA-undertekst"
                onChange={e => set('cta_subtext', e.target.value)}
                onBlur={e => saveField('cta_subtext', e.target.value)}
                rows={2}
                className="mt-6 max-w-xl text-base leading-relaxed md:text-lg"
                style={editableStyle({ color: MUTED })}
              />
              <FieldError field="cta_subtext" />
            </>
          ) : flyer.cta_subtext ? (
            <p className="mt-6 max-w-xl text-base leading-relaxed md:text-lg" style={{ color: MUTED }}>{flyer.cta_subtext}</p>
          ) : null}

          {/* cta_email redigeres i innstillingspanelet, ikke her — knappen ser
              lik ut av og på redigeringsmodus. Uten e-post vises ingen knapp
              for besøkende (en tom mailto: er en død lenke). */}
          {flyer.cta_email ? (
            <a
              href={`mailto:${flyer.cta_email}`}
              className="mt-12 inline-flex items-center gap-3 px-8 py-4 text-sm font-medium uppercase tracking-[0.15em] transition hover:opacity-90"
              style={{ background: GOLD, color: '#0C0B09' }}
            >
              Ta kontakt
              <span aria-hidden>→</span>
            </a>
          ) : editing ? (
            <p className="mt-12 text-sm" style={{ color: '#E05A4A' }}>
              Ingen CTA-e-post satt — legg den inn under ⚙ Innstillinger, ellers vises ingen kontaktknapp.
            </p>
          ) : null}
        </div>

        <div className="mt-24 flex flex-col gap-2 text-xs md:flex-row md:justify-between" style={{ color: SUBTLE }}>
          <p className="uppercase tracking-[0.3em]">Leafilms</p>
        </div>
      </section>

      <CasePickerModal
        isOpen={casePickerOpen}
        onClose={() => setCasePickerOpen(false)}
        allCases={allCases}
        selectedCaseIds={pendingCaseIds}
        onToggleSelection={toggleCaseSelection}
        onSave={handleCasePickerSave}
      />
      <PackagePickerModal
        isOpen={packagePickerOpen}
        onClose={() => setPackagePickerOpen(false)}
        allPackages={allPackages}
        selectedQuoteIds={pendingPackageIds}
        onToggleSelection={togglePackageSelection}
        onSave={handlePackagePickerSave}
      />
      <ImagePickerModal
        isOpen={imagePickerTarget !== null}
        onClose={() => setImagePickerTarget(null)}
        onSelect={handleImagePicked}
        selectedImageIds={EMPTY_SELECTION}
        maxSelection={1}
      />
      <VideoPickerModal
        isOpen={videoPickerOpen}
        onClose={() => setVideoPickerOpen(false)}
        onSelect={handleVideoPicked}
        selectedVideoIds={EMPTY_SELECTION}
        maxSelection={1}
        category="hero"
      />
      <PackageDetailModal
        key={detailPackage?.id ?? 'none'}
        isOpen={detailPackage !== null}
        onClose={() => setDetailPackageId(null)}
        packageLabel={detailPackage?.package_label ?? ''}
        items={detailPackage?.showcaseItems ?? []}
      />
      {showcaseEditorQuoteId && (
        // z-index:50, ikke høyere — PackageShowcasePanels egne interne
        // ImagePickerModal/VideoPickerModal bruker også z-50 og stables oppå
        // via DOM-rekkefølge (rendret etter denne overlayen i markup), ikke zIndex.
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', color: '#1A1812', border: '1px solid #ddd', borderRadius: 10, padding: 20, width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,0.4)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888' }}>
                Eksempelmedia for Se mer-visningen
              </p>
              <button onClick={closeShowcaseEditor} aria-label="Lukk" style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#888' }}>×</button>
            </div>
            <PackageShowcasePanel flyerId={flyer.id} quoteId={showcaseEditorQuoteId} />
          </div>
        </div>
      )}
    </main>
  )
}
