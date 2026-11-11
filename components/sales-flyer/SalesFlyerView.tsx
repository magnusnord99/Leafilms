'use client'

import { useRef, useState } from 'react'
import { CaseStudy, SalesFlyerPackageCategory, QuotePackageShowcaseItem } from '@/lib/types'
import { splitParagraphs } from '@/lib/industry-landing-pages'
import {
  SalesFlyerWithRelations,
  SalesFlyerUpdate,
  updateSalesFlyer,
  setSalesFlyerCases,
  setSalesFlyerPackages,
  setSalesFlyerReferenceLinks,
  getReferenceLinkPreviewImage,
  copyLibraryImageToFlyer,
  copyLibraryVideoToFlyer,
  getSalesFlyerBySlug,
} from '@/lib/actions/sales-flyers'
import { listAllPackagesForPicker, PickerPackageItem } from '@/lib/actions/package-offers'
import { HeroMedia } from '@/components/marketing/HeroMedia'
import { CasePickerModal } from '@/components/modals/CasePickerModal'
import { ImagePickerModal } from '@/components/modals/ImagePickerModal'
import { VideoPickerModal } from '@/components/modals/VideoPickerModal'
import { PackagePickerModal } from '@/components/modals/PackagePickerModal'
import { PackageDetailModal } from '@/components/modals/PackageDetailModal'
import { supabase } from '@/lib/supabase'
import { FlyerGalleryDragArea, FlyerGalleryImage } from './FlyerGalleryDrag'
import { ShareFlyerButton } from './ShareFlyerButton'

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

function getVimeoId(caseStudy: CaseStudy): string | null {
  if (caseStudy.vimeo_id) return caseStudy.vimeo_id
  const match = caseStudy.vimeo_url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/)
  return match ? match[1] : null
}

function formatNok(amount: number): string {
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(amount)
}

// Leveranseoversikt i pakkekortene, basert på pakkens faktiske innhold.
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

function renderPackageDeliverables(counts: { hovedvideo: number; klipp: number; photo: number }) {
  const items = [
    { icon: <VideoChipIcon />, count: counts.hovedvideo, label: counts.hovedvideo === 1 ? 'hovedvideo' : 'hovedvideoer' },
    { icon: <PhotoChipIcon />, count: counts.photo, label: counts.photo === 1 ? 'bilde' : 'bilder' },
    { icon: <ClipChipIcon />, count: counts.klipp, label: 'nedklipp' },
  ].filter(item => item.count > 0)
  if (items.length === 0) return null
  return (
    <div className="border-t pt-6 @min-[420px]:border-l @min-[420px]:border-t-0 @min-[420px]:pl-8 @min-[420px]:pt-0" style={{ borderColor: BORDER }}>
      <div className="flex flex-wrap gap-x-6 gap-y-3 @min-[420px]:flex-col">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-3">
            <span aria-hidden="true" className="shrink-0" style={{ color: GOLD }}>{item.icon}</span>
            <p className="flex items-baseline gap-2">
              <span className="font-display text-3xl leading-none" style={{ color: CREAM, fontWeight: 300 }}>
                {new Intl.NumberFormat('nb-NO').format(item.count)}
              </span>
              <span className="text-sm" style={{ color: MUTED }}>{item.label}</span>
            </p>
          </div>
        ))}
      </div>
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
  const [logoCustomers, setLogoCustomers] = useState<{ id: string; name: string; logo_path: string | null }[]>([])
  const [logoCustomersLoading, setLogoCustomersLoading] = useState(false)
  const [galleryError, setGalleryError] = useState<string | null>(null)
  const gallerySwapInFlight = useRef(false)
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
  const [referenceImageLinkId, setReferenceImageLinkId] = useState<string | null>(null)
  const [videoPickerOpen, setVideoPickerOpen] = useState(false)

  const [casePickerOpen, setCasePickerOpen] = useState(false)
  const [pendingCaseIds, setPendingCaseIds] = useState<string[]>([])
  const [allCases, setAllCases] = useState<CaseStudy[]>([])
  // Case- og pakke-mutasjoner serialiseres hver for seg (to uavhengige lister):
  // knappene disables mens én mutasjon i SAMME liste er underveis, så en sent
  // ankommende rollback ikke kan overskrive en senere, vellykket mutasjon.
  const [caseMutating, setCaseMutating] = useState(false)
  const [casesError, setCasesError] = useState<string | null>(null)
  // Hvilket case-case som nettopp har blitt klikket på og spiller inline
  // (samme mønster som CasesSection.tsx på pitch-sidene) — kun én av gangen.
  const [playingCaseId, setPlayingCaseId] = useState<string | null>(null)

  const [packagePickerOpen, setPackagePickerOpen] = useState(false)
  const [pendingPackageIds, setPendingPackageIds] = useState<string[]>([])
  const [allPackages, setAllPackages] = useState<PickerPackageItem[]>([])
  // Egen "lastet"-flagg i stedet for allPackages.length === 0 — en tom liste
  // (ingen pakker opprettet ennå) er et gyldig svar og skal ikke hentes på nytt
  // hver gang plukkeren åpnes.
  const [packagesLoaded, setPackagesLoaded] = useState(false)
  const [packageMutating, setPackageMutating] = useState(false)
  const [packagesError, setPackagesError] = useState<string | null>(null)

  // "Se mer"-modalen — id-en til pakke-kortets EGEN id (sales_flyer_packages-
  // raden, pkg.id), ikke package_id, siden det er feltet hvert kort allerede
  // bruker som nøkkel.
  const [detailPackageId, setDetailPackageId] = useState<string | null>(null)

  // Referanselenker (eksterne nettsider Leafilms har levert innhold til,
  // f.eks. Asker Tennis) — fritekst, ikke et bibliotek-valg, så "legg til"
  // er et lite inline-skjema i stedet for en picker-modal (se linksMutating-
  // mønsteret under, speilet fra case-/pakke-listene).
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [linksMutating, setLinksMutating] = useState(false)
  const [linksError, setLinksError] = useState<string | null>(null)


  const slug = flyer.slug
  const engagementParagraphs = splitParagraphs(flyer.engagement_text)

  function set<K extends keyof SalesFlyerWithRelations>(key: K, value: SalesFlyerWithRelations[K]) {
    setFlyer(prev => ({ ...prev, [key]: value }))
  }

  async function toggleSettings() {
    setSettingsOpen(!settingsOpen)
    if (settingsOpen || !canEdit) return
    setLogoCustomersLoading(true)
    try {
      const { data, error } = await supabase.from('customers').select('id, name, logo_path').order('name')
      if (error) throw error
      setLogoCustomers(data ?? [])
    } catch {
      setFieldErrors(previous => ({ ...previous, customer_id: 'Kunne ikke hente kundene. Åpne innstillinger på nytt for å prøve igjen.' }))
    } finally { setLogoCustomersLoading(false) }
  }

  async function changeLogoCustomer(customerId: string) {
    const previous = { customer_id: flyer.customer_id, customer: flyer.customer }
    const selected = logoCustomers.find(customer => customer.id === customerId)
    const next = { customer_id: customerId || null, customer: selected ? { name: selected.name, logo_path: selected.logo_path } : null }
    markSaving('customer_id', true)
    setFlyer(current => ({ ...current, ...next }))
    try {
      const result = await updateSalesFlyer(flyer.id, { customer_id: next.customer_id })
      if ('error' in result) throw new Error(result.error)
      setFieldErrors(current => { const next = { ...current }; delete next.customer_id; return next })
    } catch {
      setFlyer(current => ({ ...current, ...previous }))
      setFieldErrors(current => ({ ...current, customer_id: 'Kunne ikke lagre kunden. Prøv igjen.' }))
    } finally { markSaving('customer_id', false) }
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
    setPendingPackageIds(flyer.packages.map(p => p.package_id))
    if (!packagesLoaded) {
      try {
        const packages = await listAllPackagesForPicker()
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

  function togglePackageSelection(packageId: string) {
    setPendingPackageIds(prev => prev.includes(packageId) ? prev.filter(id => id !== packageId) : [...prev, packageId])
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

  // Eksempelmedia redigeres nå inline i "Se mer"-modalen (PackageDetailModal)
  // i stedet for i et eget tabell-vindu — denne oppdaterer bare den ene
  // pakkens showcaseItems lokalt når modalen melder fra om en endring, uten
  // en full sideoppfriskning (feedback 2026-11-10).
  function updatePackageShowcaseItems(packageId: string, items: QuotePackageShowcaseItem[]) {
    set('packages', flyer.packages.map(p => p.package_id === packageId ? { ...p, showcaseItems: items } : p))
  }

  // Pakkene vises gruppert per kategori, så "flytt opp/ned" bytter plass med
  // nærmeste pakke i SAMME kategori i den flate, ordnede listen — ellers ville
  // et klikk ofte ikke gitt noen synlig endring (bytte med en pakke i en annen
  // kategori-gruppe).
  async function movePackage(packageId: string, direction: 'up' | 'down') {
    if (packageMutating) return
    const previous = flyer.packages
    const index = previous.findIndex(p => p.package_id === packageId)
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
      const result = await setSalesFlyerPackages(flyer.id, next.map(p => p.package_id))
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

  async function removePackage(packageId: string) {
    if (packageMutating) return
    const previous = flyer.packages
    const next = flyer.packages.filter(p => p.package_id !== packageId)
    set('packages', next)
    setPackageMutating(true)
    try {
      const result = await setSalesFlyerPackages(flyer.id, next.map(p => p.package_id))
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

  // ── Referanselenker ─────────────────────────────────────────────────────
  // Samme "mutér lokal liste, erstatt hele listen server-side"-mønster som
  // cases/pakker over, men listen inneholder fritekst (label+url) i stedet
  // for id-er mot et bibliotek — se setSalesFlyerReferenceLinks.

  function toLinkPayload(links: typeof flyer.referenceLinks) {
    return links.map(l => ({ label: l.label, url: l.url, preview_image_path: l.preview_image_path }))
  }

  async function addReferenceLink() {
    const label = newLinkLabel.trim()
    let url = newLinkUrl.trim()
    if (!label || !url || linksMutating) return
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url

    setLinksMutating(true)
    // Henter og:image FØR selve lenken legges til lokalt, slik at kortet
    // dukker opp ferdig med bilde med én gang (ikke uten, så en etterfølgende
    // oppdatering) — koster noen ekstra sekunder ved klikk, men gir et
    // enklere lagrings-flow (én persist-kall, ikke to).
    const { previewImagePath } = await getReferenceLinkPreviewImage(slug, url)

    const previous = flyer.referenceLinks
    const next = [...previous, { id: `pending-${Date.now()}`, flyer_id: flyer.id, label, url, preview_image_path: previewImagePath, order_index: previous.length, created_at: new Date().toISOString() }]
    set('referenceLinks', next)
    try {
      const result = await setSalesFlyerReferenceLinks(flyer.id, toLinkPayload(next))
      if ('error' in result) { setLinksError(`Kunne ikke lagre lenken: ${result.error}`); set('referenceLinks', previous); return }
      setLinksError(null)
      setNewLinkLabel('')
      setNewLinkUrl('')
      const fresh = await getSalesFlyerBySlug(slug, { includeDraft: true })
      if (fresh) set('referenceLinks', fresh.referenceLinks)
    } catch (err) {
      console.error('addReferenceLink:', err)
      setLinksError('Kunne ikke lagre lenken — sjekk nettforbindelsen')
      set('referenceLinks', previous)
    } finally {
      setLinksMutating(false)
    }
  }

  async function moveReferenceLink(index: number, direction: 'up' | 'down') {
    if (linksMutating) return
    const previous = flyer.referenceLinks
    const next = [...previous]
    const swapWith = direction === 'up' ? index - 1 : index + 1
    if (swapWith < 0 || swapWith >= next.length) return
    ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
    set('referenceLinks', next)
    setLinksMutating(true)
    try {
      const result = await setSalesFlyerReferenceLinks(flyer.id, toLinkPayload(next))
      if ('error' in result) { setLinksError(`Kunne ikke lagre rekkefølgen: ${result.error}`); set('referenceLinks', previous) }
      else setLinksError(null)
    } catch (err) {
      console.error('moveReferenceLink:', err)
      setLinksError('Kunne ikke lagre rekkefølgen — sjekk nettforbindelsen')
      set('referenceLinks', previous)
    } finally {
      setLinksMutating(false)
    }
  }

  async function removeReferenceLink(id: string) {
    if (linksMutating) return
    const previous = flyer.referenceLinks
    const next = previous.filter(l => l.id !== id)
    set('referenceLinks', next)
    setLinksMutating(true)
    try {
      const result = await setSalesFlyerReferenceLinks(flyer.id, toLinkPayload(next))
      if ('error' in result) { setLinksError(`Kunne ikke fjerne lenken: ${result.error}`); set('referenceLinks', previous) }
      else setLinksError(null)
    } catch (err) {
      console.error('removeReferenceLink:', err)
      setLinksError('Kunne ikke fjerne lenken — sjekk nettforbindelsen')
      set('referenceLinks', previous)
    } finally {
      setLinksMutating(false)
    }
  }

  // Henter og:image i etterkant for lenker som ble lagt til FØR previewbilde-
  // funksjonen fantes (migrasjon 197) og derfor mangler preview_image_path —
  // "Hent bilde"-knappen under, ikke automatisk ved sidelasting, se
  // feedback 2026-11-10.
  async function fetchMissingPreview(link: typeof flyer.referenceLinks[number]) {
    if (linksMutating) return
    setLinksMutating(true)
    try {
      const { previewImagePath } = await getReferenceLinkPreviewImage(slug, link.url)
      if (!previewImagePath) { setLinksError(`Fant ikke noe forhåndsvisningsbilde for ${link.label}`); return }
      const next = flyer.referenceLinks.map(l => l.id === link.id ? { ...l, preview_image_path: previewImagePath } : l)
      set('referenceLinks', next)
      const result = await setSalesFlyerReferenceLinks(flyer.id, toLinkPayload(next))
      if ('error' in result) { setLinksError(`Kunne ikke lagre bildet: ${result.error}`); set('referenceLinks', flyer.referenceLinks) }
      else setLinksError(null)
    } catch (err) {
      console.error('fetchMissingPreview:', err)
      setLinksError('Kunne ikke hente forhåndsvisningsbilde — sjekk nettforbindelsen')
    } finally {
      setLinksMutating(false)
    }
  }

  async function handleReferenceImagePicked(imageIds: string[]) {
    const linkId = referenceImageLinkId
    setReferenceImageLinkId(null)
    if (!linkId || !imageIds[0] || linksMutating) return
    setLinksMutating(true)
    setLinksError(null)
    try {
      const copied = await copyLibraryImageToFlyer(slug, imageIds[0], 'reference_preview')
      if ('error' in copied) { setLinksError(copied.error); return }
      const next = flyer.referenceLinks.map(link => link.id === linkId ? { ...link, preview_image_path: copied.url } : link)
      const result = await setSalesFlyerReferenceLinks(flyer.id, toLinkPayload(next))
      if ('error' in result) { setLinksError(result.error); return }
      setFlyer(previous => ({ ...previous, referenceLinks: next }))
    } catch (error) {
      console.error('handleReferenceImagePicked:', error)
      setLinksError('Kunne ikke lagre forhåndsvisningsbildet — prøv igjen')
    } finally {
      setLinksMutating(false)
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
  const listError = casesError ?? packagesError ?? linksError

  // Render-funksjon (ikke en indre komponent) så kortene ikke remountes på
  // hver render av forelderen.
  function renderPackageCard(pkg: FlyerPackage, positionInGroup: number, groupSize: number) {
    const amount = pkg.amount
    const title = pkg.package_label
    return (
      <div key={pkg.id} className="group @container relative flex flex-col justify-between rounded-[2px] p-6 transition duration-200 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(0,0,0,0.25)] focus-within:ring-1 focus-within:ring-[#C49434] md:p-8" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
        <button
          type="button"
          onClick={() => setDetailPackageId(pkg.id)}
          aria-label={`Se mer om ${title}`}
          aria-haspopup="dialog"
          className="absolute inset-0 z-10 cursor-pointer rounded-[2px] border border-transparent bg-transparent transition-colors group-hover:border-[#C49434] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C49434]"
        />
        {editing && (
          <div style={{ position: 'absolute', top: -14, right: -14, zIndex: 20, display: 'flex', gap: 4 }}>
            <button onClick={() => movePackage(pkg.package_id, 'up')} disabled={positionInGroup === 0 || packageMutating} aria-label="Flytt opp" style={{ width: 28, height: 28, borderRadius: 14, background: '#fff', color: '#1A1812', border: '1px solid #ccc', cursor: positionInGroup === 0 || packageMutating ? 'default' : 'pointer', opacity: packageMutating ? 0.5 : 1 }}>↑</button>
            <button onClick={() => movePackage(pkg.package_id, 'down')} disabled={positionInGroup === groupSize - 1 || packageMutating} aria-label="Flytt ned" style={{ width: 28, height: 28, borderRadius: 14, background: '#fff', color: '#1A1812', border: '1px solid #ccc', cursor: positionInGroup === groupSize - 1 || packageMutating ? 'default' : 'pointer', opacity: packageMutating ? 0.5 : 1 }}>↓</button>
            <button onClick={() => removePackage(pkg.package_id)} disabled={packageMutating} aria-label="Fjern pakke" style={{ width: 28, height: 28, borderRadius: 14, background: '#C0392B', color: '#fff', border: 'none', cursor: packageMutating ? 'default' : 'pointer', opacity: packageMutating ? 0.5 : 1 }}>×</button>
          </div>
        )}
        <div className={`grid gap-8 ${Object.values(pkg.deliverableCounts).some(count => count > 0) ? '@min-[420px]:grid-cols-[minmax(0,1fr)_minmax(140px,0.8fr)]' : ''}`}>
          <div className="flex min-w-0 flex-col justify-between">
            <div>
              <h4 className="font-display text-2xl md:text-3xl" style={{ color: CREAM, fontWeight: 400 }}>{title}</h4>
              {pkg.shootDays != null && pkg.shootDays > 0 && (
                <p className="mt-2 text-sm" style={{ color: MUTED }}>
                  {new Intl.NumberFormat('nb-NO').format(pkg.shootDays)} {pkg.shootDays === 1 ? 'dag' : 'dager'} med opptak
                </p>
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
              <span aria-hidden="true" className="mt-6 inline-flex items-center gap-2 rounded-[2px] border border-[#C49434] px-5 py-3 text-xs font-medium uppercase tracking-[0.15em] text-[#C49434] transition-colors group-hover:bg-[#C49434] group-hover:text-[#0C0B09] group-focus-within:bg-[#C49434] group-focus-within:text-[#0C0B09]">
                Se mer
                <span className="transition-transform duration-200 group-hover:translate-x-1 group-focus-within:translate-x-1">→</span>
              </span>
            </div>
          </div>
          {renderPackageDeliverables(pkg.deliverableCounts)}
        </div>
      </div>
    )
  }

  // ── Eksempelbilder: inntil åtte bilder, uten tomme plasser ───────────────
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
  const selectedExampleImages = exampleImageSlots.filter(slot => slot.path)
  const nextExampleImageSlot = exampleImageSlots.find(slot => !slot.path)
  const hasAnyExampleImage = selectedExampleImages.length > 0
  const exampleImageGroups = []
  for (let index = 1; index < selectedExampleImages.length; index += 3) {
    exampleImageGroups.push(selectedExampleImages.slice(index, index + 3))
  }

  const galleryBusy = Array.from(savingFields).some(field => field.startsWith('example_image_'))
  const galleryDragImages = selectedExampleImages.map(slot => ({ id: slot.target, path: slot.path }))

  async function swapExampleImages(source: string, destination: string) {
    if (!editing || galleryBusy || gallerySwapInFlight.current || source === destination) return
    const from = exampleImageSlots.find(slot => slot.target === source)
    const to = exampleImageSlots.find(slot => slot.target === destination)
    if (!from?.path || !to?.path) return
    const previous = {
      [from.field]: from.path, [from.posXField]: from.posX, [from.posYField]: from.posY,
      [to.field]: to.path, [to.posXField]: to.posX, [to.posYField]: to.posY,
    }
    const next = {
      [from.field]: to.path, [from.posXField]: to.posX, [from.posYField]: to.posY,
      [to.field]: from.path, [to.posXField]: from.posX, [to.posYField]: from.posY,
    }
    gallerySwapInFlight.current = true
    const fields = Object.keys(next) as Field[]
    fields.forEach(field => markSaving(field, true))
    setGalleryError(null)
    setFlyer(current => ({ ...current, ...next }))
    try {
      // Ett UPDATE lagrer begge bildene og utsnittene samlet.
      const result = await updateSalesFlyer(flyer.id, next as SalesFlyerUpdate)
      if ('error' in result) throw new Error(result.error)
    } catch {
      setFlyer(current => ({ ...current, ...previous }))
      setGalleryError('Kunne ikke bytte plass på bildene. Prøv igjen.')
    } finally {
      fields.forEach(field => markSaving(field, false))
      gallerySwapInFlight.current = false
    }
  }

  function renderExampleImageSlot(slot: typeof exampleImageSlots[number], className: string) {
    const { path, field, target, posXField, posYField, posX, posY } = slot
    return (
      <FlyerGalleryImage key={field} id={target} editing={editing} disabled={galleryBusy} className={className}>
        {path ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={path} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `${posX}% ${posY}%` }} />
            {editing && (
              <>
                <button
                  onClick={() => { set(field, null); saveField(field, null, path) }}
                  disabled={galleryBusy}
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
                    type="range" min={0} max={100} disabled={galleryBusy}
                    value={posX}
                    onChange={e => set(posXField, Number(e.target.value))}
                    onMouseUp={e => saveField(posXField, Number((e.target as HTMLInputElement).value))}
                    onTouchEnd={e => saveField(posXField, Number((e.target as HTMLInputElement).value))}
                    style={{ width: '100%', display: 'block' }}
                  />
                  <label style={{ display: 'block', fontSize: '0.6rem', color: '#fff', margin: '4px 0 2px' }}>Y</label>
                  <input
                    type="range" min={0} max={100} disabled={galleryBusy}
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
              disabled={galleryBusy}
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
      </FlyerGalleryImage>
    )
  }

  return (
    <main className="min-h-screen" style={{ background: '#0C0B09', color: CREAM, position: 'relative' }}>
      {canEdit && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 50, display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 'calc(100vw - 32px)', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            disabled={savingFields.has('published')}
            aria-pressed={flyer.published}
            title={flyer.published ? 'Klikk for å avpublisere flyeren' : 'Klikk for å publisere flyeren'}
            onClick={() => {
              const previous = flyer.published
              set('published', !previous)
              saveField('published', !previous, previous)
            }}
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '8px 12px', borderRadius: 20,
              background: flyer.published ? '#173A2C' : '#292216', color: flyer.published ? '#A1E5B8' : GOLD,
              border: `1px solid ${flyer.published ? '#438F61' : GOLD}`, cursor: savingFields.has('published') ? 'wait' : 'pointer' }}
          >
            {savingFields.has('published') ? 'Lagrer…' : flyer.published ? '✓ Publisert' : 'Ikke publisert · Publiser'}
          </button>
          {flyer.published && !savingFields.has('published') && <ShareFlyerButton slug={slug} />}
          <FieldError field="published" />
          {editing && (
            <button
              onClick={toggleSettings}
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
          {linksError && <p style={{ marginTop: casesError || packagesError ? 6 : 0 }}>{linksError}</p>}
          <button onClick={() => { setCasesError(null); setPackagesError(null); setLinksError(null) }} aria-label="Lukk" style={{ marginTop: 6, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>✕ Lukk</button>
        </div>
      )}
      {(savingFields.size > 0 || caseMutating || packageMutating || linksMutating) && (
        <div style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 50, background: '#1A1812', color: '#fff', padding: '6px 12px', borderRadius: 8, fontSize: '0.72rem', border: '1px solid #333' }}>
          Lagrer...
        </div>
      )}

      {settingsOpen && editing && (
        <div style={{ position: 'fixed', top: 64, right: 16, zIndex: 50, maxHeight: 'calc(100dvh - 80px)', overflowY: 'auto', background: '#fff', color: '#1A1812', border: '1px solid #ddd', borderRadius: 10, padding: 18, width: 300, boxShadow: '0 8px 30px rgba(0,0,0,0.4)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', marginBottom: 10 }}>/flyer/{slug}</p>

          <label style={settingsLabel} htmlFor="flyer-logo-customer">Kunde (logo ved tittelen)</label>
          <select id="flyer-logo-customer" value={flyer.customer_id ?? ''}
            disabled={logoCustomersLoading || savingFields.has('customer_id')}
            onChange={event => changeLogoCustomer(event.target.value)} style={settingsInput}>
            <option value="">Ingen kunde valgt</option>
            {flyer.customer_id && !logoCustomers.some(customer => customer.id === flyer.customer_id) && (
              <option value={flyer.customer_id}>{flyer.customer?.name ?? 'Valgt kunde'}</option>
            )}
            {logoCustomers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
          <FieldError field="customer_id" />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: '0.82rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={flyer.show_customer_logo ?? true}
              disabled={savingFields.has('show_customer_logo')}
              onChange={event => {
                const previous = flyer.show_customer_logo
                set('show_customer_logo', event.target.checked)
                saveField('show_customer_logo', event.target.checked, previous)
              }} />
            Vis kundelogo ved tittelen
          </label>
          <FieldError field="show_customer_logo" />
          {flyer.customer_id && !flyer.customer?.logo_path && (
            <p style={{ marginTop: 6, fontSize: '0.75rem', color: '#777' }}>Kunden har ingen logo ennå. Last den opp på kundesiden for å vise den her.</p>
          )}

          <label style={settingsLabel}>Pakke-e-post («Velg denne pakken»)</label>
          <input
            type="email"
            value={flyer.cta_email}
            placeholder="navn@leafilms.no"
            onChange={e => set('cta_email', e.target.value)}
            onBlur={e => saveField('cta_email', e.target.value)}
            style={settingsInput}
          />
          <FieldError field="cta_email" />

          <label style={settingsLabel}>Kontakt-e-post («Ta kontakt» nederst)</label>
          <input
            type="email"
            value={flyer.contact_email}
            placeholder="kontakt@leafilms.no"
            onChange={e => set('contact_email', e.target.value)}
            onBlur={e => saveField('contact_email', e.target.value)}
            style={settingsInput}
          />
          <FieldError field="contact_email" />

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

          <div className="flex max-w-5xl flex-col items-start gap-6 pb-6 md:flex-row md:items-center md:gap-8 md:pb-12">
            {flyer.show_customer_logo && flyer.customer?.logo_path && (
              <div className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={supabase.storage.from('assets').getPublicUrl(flyer.customer.logo_path).data.publicUrl}
                  alt={`${flyer.customer.name} logo`} className="max-h-20 w-auto max-w-36 object-contain md:max-h-28 md:max-w-44" />
              </div>
            )}
            <div className="min-w-0 flex-1">
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
                  {(() => {
                    const vimeoId = getVimeoId(caseStudy)
                    const isPlaying = playingCaseId === caseStudy.id && vimeoId
                    return (
                      <div
                        className="relative aspect-video w-full overflow-hidden"
                        style={{ background: SURFACE }}
                      >
                        {isPlaying ? (
                          <iframe
                            src={`https://player.vimeo.com/video/${vimeoId}?title=0&byline=0&portrait=0&color=C49434&autoplay=1`}
                            className="h-full w-full"
                            frameBorder="0"
                            allow="autoplay; fullscreen; picture-in-picture"
                            allowFullScreen
                            title={caseStudy.title}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => vimeoId && setPlayingCaseId(caseStudy.id)}
                            className="group block h-full w-full cursor-pointer"
                            aria-label={`Spill ${toTitleCase(caseStudy.title)}`}
                          >
                            {caseStudy.thumbnail_path && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={caseStudy.thumbnail_path}
                                alt={toTitleCase(caseStudy.title)}
                                loading={index < 2 ? 'eager' : 'lazy'}
                                className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
                              />
                            )}
                            {vimeoId && (
                              <span
                                className="absolute inset-0 flex items-center justify-center transition group-hover:scale-110"
                                style={{ pointerEvents: 'none' }}
                              >
                                <span
                                  className="flex items-center justify-center rounded-full"
                                  style={{ width: 64, height: 64, background: 'rgba(12,11,9,0.55)', border: `1px solid ${GOLD}` }}
                                >
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill={GOLD}>
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                </span>
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                    )
                  })()}
                  <h3 className="font-display mt-5 text-2xl md:text-3xl" style={{ color: CREAM, fontWeight: 400 }}>
                    {toTitleCase(caseStudy.title)}
                  </h3>
                  {caseStudy.description && (
                    <p className="mt-2 text-sm leading-relaxed md:text-base" style={{ color: MUTED }}>{caseStudy.description}</p>
                  )}
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

      {/* ── Eksempelbilder — rutenettet følger antall valgte bilder ── */}
      {(hasAnyExampleImage || editing) && (
        <section className="px-6 py-20 md:px-16 md:py-32" style={{ borderTop: `1px solid ${BORDER}` }}>
          <FlyerGalleryDragArea images={galleryDragImages} onSwap={swapExampleImages}>
            <div className="flex flex-col gap-0 md:hidden">
              {selectedExampleImages.map(slot => renderExampleImageSlot(slot, 'h-[400px]'))}
            </div>
          </FlyerGalleryDragArea>
          <FlyerGalleryDragArea images={galleryDragImages} onSwap={swapExampleImages}>
            <div className="hidden md:block">
              {selectedExampleImages[0] && renderExampleImageSlot(selectedExampleImages[0], 'h-[700px]')}
              {exampleImageGroups.map(group => (
                <div key={group[0].field} className={group.length > 1 ? 'grid grid-cols-2 gap-0' : ''}>
                  {group.length === 3 ? (
                    <>
                      <div className="row-span-2 h-[800px]">{renderExampleImageSlot(group[0], 'h-full')}</div>
                      {renderExampleImageSlot(group[1], 'h-[400px]')}
                      {renderExampleImageSlot(group[2], 'h-[400px]')}
                    </>
                  ) : group.map(slot => renderExampleImageSlot(slot, group.length === 1 ? 'h-[600px]' : 'h-[400px]'))}
                </div>
              ))}
            </div>
          </FlyerGalleryDragArea>

          {editing && (
            <div className="mt-6 flex items-center gap-4">
              <p className="text-xs" style={{ color: MUTED }}>{selectedExampleImages.length} av 8 bilder</p>
              {nextExampleImageSlot && (
                <button
                  type="button"
                  onClick={() => setImagePickerTarget(nextExampleImageSlot.target)}
                  disabled={EXAMPLE_IMAGE_TARGETS.some(target => savingFields.has(`${target}_path` as Field))}
                  style={smallControl}
                >+ Legg til bilde</button>
              )}
            </div>
          )}
          {editing && galleryError && <p role="alert" className="mt-3 text-sm" style={{ color: '#E05A4A' }}>{galleryError}</p>}
          {editing && exampleImageSlots.filter(slot => !slot.path && fieldErrors[slot.field]).map(slot => (
            <p key={slot.field} role="alert" className="mt-2 text-xs" style={{ color: '#E05A4A' }}>
              Ikke lagret: {fieldErrors[slot.field]}
            </p>
          ))}
        </section>
      )}

      {/* ── Live hos kundene — lenker til ferdige, publiserte nettsider
          (f.eks. Asker Tennis) som viser innholdet i praksis hos en ekte
          kunde, i tillegg til case-videoene over. Fritekst (navn + URL), se
          194_sales_flyer_reference_links.sql. */}
      {(flyer.referenceLinks.length > 0 || editing) && (
        <section className="px-6 py-20 md:px-16 md:py-32" style={{ borderTop: `1px solid ${BORDER}` }}>
          <div className="mb-12 flex items-center gap-6 md:mb-16">
            <span className="h-px w-12" style={{ background: GOLD }} />
            <p className="text-xs font-medium uppercase tracking-[0.3em]" style={{ color: MUTED }}>Live hos kundene</p>
          </div>

          {flyer.referenceLinks.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {flyer.referenceLinks.map((link, index) => {
                const isLast = index === flyer.referenceLinks.length - 1
                let hostname = link.url
                try { hostname = new URL(link.url).hostname.replace(/^www\./, '') } catch { /* lenken er ikke en gyldig URL (bør ikke skje, men vis rå-verdien i stedet for å krasje) */ }
                return (
                  <div key={link.id} className="group relative">
                    {editing && (
                      <div style={{ position: 'absolute', top: -14, right: -14, zIndex: 5, display: 'flex', gap: 4 }}>
                        <button onClick={() => moveReferenceLink(index, 'up')} disabled={index === 0 || linksMutating} aria-label="Flytt opp" style={{ width: 28, height: 28, borderRadius: 14, background: '#fff', color: '#1A1812', border: '1px solid #ccc', cursor: index === 0 || linksMutating ? 'default' : 'pointer', opacity: linksMutating ? 0.5 : 1 }}>↑</button>
                        <button onClick={() => moveReferenceLink(index, 'down')} disabled={isLast || linksMutating} aria-label="Flytt ned" style={{ width: 28, height: 28, borderRadius: 14, background: '#fff', color: '#1A1812', border: '1px solid #ccc', cursor: isLast || linksMutating ? 'default' : 'pointer', opacity: linksMutating ? 0.5 : 1 }}>↓</button>
                        <button onClick={() => removeReferenceLink(link.id)} disabled={linksMutating} aria-label="Fjern lenke" style={{ width: 28, height: 28, borderRadius: 14, background: '#C0392B', color: '#fff', border: 'none', cursor: linksMutating ? 'default' : 'pointer', opacity: linksMutating ? 0.5 : 1 }}>×</button>
                      </div>
                    )}
                    {editing && (
                      <button
                        type="button"
                        onClick={() => setReferenceImageLinkId(link.id)}
                        disabled={linksMutating}
                        className="mb-2 rounded-md px-3 py-2 text-xs font-semibold"
                        style={{ background: ADMIN, color: '#fff' }}
                      >
                        {link.preview_image_path ? 'Bytt bilde / skjermdump' : 'Legg ved bilde / skjermdump'}
                      </button>
                    )}
                    {editing && !link.preview_image_path && (
                      <button
                        onClick={() => fetchMissingPreview(link)}
                        disabled={linksMutating}
                        style={{ marginLeft: 8, marginBottom: 8, fontSize: '0.65rem', fontWeight: 600, padding: '5px 10px', borderRadius: 6, background: 'rgba(124,92,252,0.9)', color: '#fff', border: 'none', cursor: linksMutating ? 'default' : 'pointer', opacity: linksMutating ? 0.6 : 1 }}
                      >
                        Hent bilde
                      </button>
                    )}
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-full flex-col overflow-hidden rounded-[2px] transition hover:opacity-80"
                      style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
                    >
                      {link.preview_image_path && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={link.preview_image_path}
                          alt=""
                          className="aspect-video w-full object-cover"
                          style={{ borderBottom: `1px solid ${BORDER}` }}
                        />
                      )}
                      <span className="flex flex-1 items-center justify-between gap-4 p-6">
                        <span className="min-w-0">
                          <span className="font-display block text-xl md:text-2xl" style={{ color: CREAM, fontWeight: 400 }}>{link.label}</span>
                          <span className="mt-1 block truncate text-xs" style={{ color: MUTED }}>{hostname}</span>
                        </span>
                        <span aria-hidden style={{ color: GOLD, fontSize: '1.1rem', flexShrink: 0 }}>↗</span>
                      </span>
                    </a>
                  </div>
                )
              })}
            </div>
          )}

          {editing && (
            <div className="mt-12 max-w-lg">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={newLinkLabel}
                  onChange={e => setNewLinkLabel(e.target.value)}
                  placeholder="Navn, f.eks. Asker Tennis"
                  style={{ ...settingsInput, width: 'auto', flex: 1 }}
                />
                <input
                  type="text"
                  value={newLinkUrl}
                  onChange={e => setNewLinkUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addReferenceLink() }}
                  placeholder="askertennis.no"
                  style={{ ...settingsInput, width: 'auto', flex: 1 }}
                />
              </div>
              <button
                onClick={addReferenceLink}
                disabled={linksMutating || !newLinkLabel.trim() || !newLinkUrl.trim()}
                className="mt-3"
                style={{ fontSize: '0.78rem', fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: ADMIN, color: '#fff', border: 'none', cursor: linksMutating ? 'default' : 'pointer', opacity: linksMutating || !newLinkLabel.trim() || !newLinkUrl.trim() ? 0.6 : 1 }}
              >
                {linksMutating ? 'Henter forhåndsvisning…' : '+ Legg til lenke'}
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── Pakker ── */}
      {(packagesByCategory.length > 0 || editing) && (
        <section className="px-6 py-20 md:px-16 md:py-32" style={{ borderTop: `1px solid ${BORDER}` }}>
          <div className="mb-12 flex items-center gap-6 md:mb-16">
            <span className="h-px w-12" style={{ background: GOLD }} />
            <p className="text-xs font-medium uppercase tracking-[0.3em]" style={{ color: MUTED }}>Pakker</p>
          </div>

          <div className={`grid gap-x-6 gap-y-16 sm:grid-cols-2 ${flyer.packages.length > 2 ? 'lg:grid-cols-3' : ''}`}>
            {packagesByCategory.map(group => (
              <div key={group.category} className={`flex min-w-0 flex-col ${group.items.length >= 3 ? 'sm:col-span-2 lg:col-span-3' : group.items.length === 2 ? 'sm:col-span-2' : ''}`}>
                <h3 className="font-display mb-8 text-3xl md:text-5xl" style={{ color: CREAM, fontWeight: 300 }}>
                  {CATEGORY_LABEL[group.category]}
                </h3>
                <div className={`grid flex-1 gap-6 ${group.items.length >= 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : group.items.length === 2 ? 'sm:grid-cols-2' : ''}`}>
                  {group.items.map((pkg, i) => (
                    renderPackageCard(pkg, i, group.items.length)
                  ))}
                </div>
              </div>
            ))}
          </div>

          {packagesByCategory.length > 0 && (
            <div className="mt-12">
              {editing ? (
                <div className="max-w-2xl">
                  <textarea
                    aria-label="Tekst om skreddersøm og kvantumspakker"
                    value={flyer.package_customization_text}
                    onChange={e => set('package_customization_text', e.target.value)}
                    onBlur={e => saveField('package_customization_text', e.target.value)}
                    placeholder="Tekst om skreddersøm og kvantumspakker"
                    rows={4}
                    className="text-sm leading-relaxed md:text-base"
                    style={editableStyle({ color: MUTED })}
                  />
                  <FieldError field="package_customization_text" />
                </div>
              ) : flyer.package_customization_text && (
                <p className="max-w-2xl whitespace-pre-line text-sm leading-relaxed md:text-base" style={{ color: MUTED }}>
                  {flyer.package_customization_text.split(/(ta kontakt)/gi).map((part, index) =>
                    /^ta kontakt$/i.test(part) && flyer.contact_email ? (
                      <a key={index} href={`mailto:${flyer.contact_email}`}
                        className="underline decoration-[#C49434]/60 underline-offset-4 transition-colors hover:text-[#E8E1D5] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C49434]"
                        style={{ color: GOLD }}>
                        {part}
                      </a>
                    ) : part
                  )}
                </p>
              )}
              <p className="mt-4 text-xs" style={{ color: SUBTLE }}>Alle priser er oppgitt eks. mva., kost, losji og reise.</p>
            </div>
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

          {/* Generell kontakt har egen mottaker, uavhengig av pakkeforespørsler. */}
          {flyer.contact_email ? (
            <a
              href={`mailto:${flyer.contact_email}`}
              className="mt-12 inline-flex items-center gap-3 px-8 py-4 text-sm font-medium uppercase tracking-[0.15em] transition hover:opacity-90"
              style={{ background: GOLD, color: '#0C0B09' }}
            >
              Ta kontakt
              <span aria-hidden>→</span>
            </a>
          ) : editing ? (
            <p className="mt-12 text-sm" style={{ color: '#E05A4A' }}>
              Ingen kontakt-e-post satt — legg den inn under ⚙ Innstillinger, ellers vises ingen kontaktknapp.
            </p>
          ) : null}
        </div>

        <div className="mt-24 flex flex-col gap-2 text-xs md:flex-row md:justify-between" style={{ color: SUBTLE }}>
          <a
            href="https://leafilms.no"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 self-start uppercase tracking-[0.2em] transition-colors hover:text-[#C49434] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C49434]"
          >
            leafilms.no <span aria-hidden="true">↗</span>
          </a>
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
        selectedPackageIds={pendingPackageIds}
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
      <ImagePickerModal
        isOpen={referenceImageLinkId !== null}
        onClose={() => setReferenceImageLinkId(null)}
        onSelect={handleReferenceImagePicked}
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
        inquiryEmail={flyer.cta_email}
        flyerVideoPath={flyer.hero_video_path}
        flyerImages={selectedExampleImages.map(slot => slot.path).filter((path): path is string => Boolean(path))}
        items={detailPackage?.showcaseItems ?? []}
        deliverableCounts={detailPackage?.deliverableCounts}
        usageNotes={flyer.usageNotes}
        onUsageNotesChanged={usageNotes => setFlyer(previous => ({ ...previous, usageNotes }))}
        editable={editing && detailPackage ? { flyerId: flyer.id, packageId: detailPackage.package_id } : undefined}
        onItemsChanged={detailPackage ? items => updatePackageShowcaseItems(detailPackage.package_id, items) : undefined}
      />
    </main>
  )
}
