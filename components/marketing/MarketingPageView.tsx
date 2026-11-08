'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { CaseStudy } from '@/lib/types'
import { splitParagraphs } from '@/lib/industry-landing-pages'
import {
  IndustryLandingPageWithCases,
  updateIndustryLandingPage,
  setIndustryLandingPageCases,
  copyLibraryImageToPage,
  getIndustryLandingPageBySlug,
  IndustryLandingPageUpdate,
} from '@/lib/actions/industry-landing-pages'
import { HeroMedia } from './HeroMedia'
import { CasePickerModal } from '@/components/modals/CasePickerModal'
import { ImagePickerModal } from '@/components/modals/ImagePickerModal'
import { supabase } from '@/lib/supabase'

const italicSerif = { fontFamily: 'var(--font-newsreader)', fontStyle: 'italic' as const }

// case_studies.title er typisk VERSALER i databasen ("CORVUS ENERGY") — vises
// i tittelform her, rent presentasjonsmessig.
function toTitleCase(text: string): string {
  return text.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())
}

type Field = keyof IndustryLandingPageUpdate

// Stabil referanse — ImagePickerModal synker selectedIds fra denne proppen i
// et useEffect på hver endring av REFERANSEN (ikke innholdet). Et nytt []-
// literal her på hver render (f.eks. fra en annen felt-lagring som fullføres
// mens plukkeren er åpen) ville trigget effekten på nytt og nullstilt
// brukerens pågående valg midt i bruk (funnet under Codex-inspeksjon).
const EMPTY_SELECTION: string[] = []

// Delt styling for et "inline-redigerbart" tekstfelt — matcher det faktiske
// elementets typografi så nært som rimelig, slik at siden ser tilnærmet lik
// ut av og på redigeringsmodus (poenget med hele omleggingen: se hvordan
// siden faktisk vil se ut mens man velger innholdet).
const editableBase: React.CSSProperties = {
  display: 'block', width: '100%', background: 'rgba(124,92,252,0.08)',
  border: '1px dashed rgba(124,92,252,0.4)', borderRadius: 4,
  outline: 'none', resize: 'none', fontFamily: 'inherit', color: 'inherit',
}

export function MarketingPageView({
  initialPage,
  canEdit,
}: {
  initialPage: IndustryLandingPageWithCases
  canEdit: boolean
}) {
  const [page, setPage] = useState(initialPage)
  const [editing, setEditing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Per felt, ikke ett delt par — en mislykket lagring av ett felt skal ikke
  // kunne bli usynlig fordi et HELT ANNET felt lagres (og lykkes) rett etter.
  // Hvert felts feilmelding vises inline under nettopp det feltet, og tømmes
  // kun av dette feltets egen vellykkede lagring (funnet under Codex-
  // inspeksjon, round 4 — round 3 sin fiks løste kun "tømmes ved start",
  // ikke "tømmes av en annens suksess").
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({})
  const [savingFields, setSavingFields] = useState<Set<Field>>(new Set())
  const [casePickerOpen, setCasePickerOpen] = useState(false)
  const [pendingCaseIds, setPendingCaseIds] = useState<string[]>([])
  const [allCases, setAllCases] = useState<CaseStudy[]>([])
  const [imagePickerTarget, setImagePickerTarget] = useState<'hero_poster' | 'about' | null>(null)
  // Case-mutasjoner (legg til/fjern/flytt) disables mens én er underveis —
  // serialiserer dem fullstendig i stedet for å måtte rekonsiliere utfall som
  // kommer tilbake i annen rekkefølge enn de ble sendt (funnet under Codex-
  // inspeksjon: to raske fjern-klikk før den første var ferdig kunne la en
  // mislykket førstes rollback overskrive en vellykket andres resultat).
  const [caseMutating, setCaseMutating] = useState(false)
  const [casesError, setCasesError] = useState<string | null>(null)

  const heroFileInputRef = useRef<HTMLInputElement>(null)
  const aboutFileInputRef = useRef<HTMLInputElement>(null)

  const slug = page.slug
  const aboutParagraphs = splitParagraphs(page.about_content)

  function set<K extends keyof IndustryLandingPageWithCases>(key: K, value: IndustryLandingPageWithCases[K]) {
    setPage(prev => ({ ...prev, [key]: value }))
  }

  // `previousValue`: hvis gitt, settes feltet tilbake til denne verdien hvis
  // lagringen feiler — brukt for diskrete felter (f.eks. publisert-bryteren)
  // der en gjenværende feil UI-tilstand som ikke matcher databasen er en reell
  // fare (admin tror siden er publisert/skjult når den ikke er det). Fritekst
  // forblir urørt ved feil — reverter man det brukeren nettopp skrev, mister
  // de arbeidet sitt i stedet for bare å få en feilmelding å prøve på nytt
  // fra.
  async function saveField<K extends keyof IndustryLandingPageWithCases>(
    field: Field,
    value: string | boolean,
    previousValue?: IndustryLandingPageWithCases[K]
  ) {
    setSavingFields(prev => new Set(prev).add(field))
    try {
      const result = await updateIndustryLandingPage(page.id, { [field]: value } as IndustryLandingPageUpdate)
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
      <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#C0392B', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
        ⚠ Ikke lagret: {message}
      </p>
    )
  }

  async function uploadToStorage(file: File, prefix: string): Promise<string | null> {
    try {
      const ext = file.name.split('.').pop()
      const fileName = `${prefix}-${Math.random().toString(36).substring(2)}.${ext}`
      const filePath = `landing-pages/${slug}/${fileName}`
      const { error } = await supabase.storage.from('assets').upload(filePath, file)
      if (error) {
        console.error('uploadToStorage:', error)
        return null
      }
      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(filePath)
      return publicUrl
    } catch (err) {
      console.error('uploadToStorage:', err)
      return null
    }
  }

  async function handleHeroFileChange(file: File) {
    if (page.hero_type === 'video') {
      const url = await uploadToStorage(file, 'hero-video')
      if (url) { set('hero_video_path', url); await saveField('hero_video_path', url) }
      else setFieldErrors(prev => ({ ...prev, hero_video_path: 'kunne ikke laste opp' }))
    } else {
      const url = await uploadToStorage(file, 'hero')
      if (url) { set('hero_poster_path', url); await saveField('hero_poster_path', url) }
      else setFieldErrors(prev => ({ ...prev, hero_poster_path: 'kunne ikke laste opp' }))
    }
  }

  async function handleAboutFileChange(file: File) {
    const url = await uploadToStorage(file, 'about')
    if (url) { set('about_image_path', url); await saveField('about_image_path', url) }
    else setFieldErrors(prev => ({ ...prev, about_image_path: 'kunne ikke laste opp' }))
  }

  async function handleImagePicked(imageIds: string[]) {
    const target = imagePickerTarget
    setImagePickerTarget(null)
    if (!target || imageIds.length === 0) return
    const field = target === 'hero_poster' ? 'hero_poster_path' : 'about_image_path'
    try {
      const result = await copyLibraryImageToPage(slug, imageIds[0], target)
      if ('url' in result) {
        set(field, result.url)
        await saveField(field, result.url)
      } else {
        setFieldErrors(prev => ({ ...prev, [field]: result.error }))
      }
    } catch (err) {
      console.error('handleImagePicked:', err)
      setFieldErrors(prev => ({ ...prev, [field]: 'sjekk nettforbindelsen' }))
    }
  }

  async function openCasePicker() {
    setPendingCaseIds(page.cases.map(c => c.id))
    if (allCases.length === 0) {
      const { data } = await supabase.from('case_studies').select('*').order('title', { ascending: true })
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
      const result = await setIndustryLandingPageCases(page.id, pendingCaseIds)
      if ('error' in result) { setCasesError(`Kunne ikke lagre case-listen: ${result.error}`); return }
      // Case-dataene (tittel/bilde/url) for et nytt valg er ikke lokalt
      // tilgjengelige — henter kun cases på nytt og slår dem inn i den
      // eksisterende lokale tilstanden, i stedet for en full side-reload som
      // ville kastet bort ulagrede/mislykkede tekstfelt-endringer andre steder
      // på siden.
      const fresh = await getIndustryLandingPageBySlug(slug, { includeDraft: true })
      if (fresh) { set('cases', fresh.cases); setCasesError(null) }
    } catch (err) {
      console.error('handleCasePickerSave:', err)
      setCasesError('Kunne ikke lagre case-listen — sjekk nettforbindelsen')
    } finally {
      setCaseMutating(false)
    }
  }

  // caseMutating gjør knappene under utilgjengelige mens én mutasjon er
  // underveis, så move/remove ikke kan overlappe — unngår at en sent
  // ankommende feilrevert fra en TIDLIGERE, men senere fullført forespørsel
  // overskriver resultatet av en senere, raskere lykkes forespørsel.
  async function moveCase(index: number, direction: 'up' | 'down') {
    if (caseMutating) return
    const previous = page.cases
    const next = [...page.cases]
    const swapWith = direction === 'up' ? index - 1 : index + 1
    if (swapWith < 0 || swapWith >= next.length) return
    ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
    set('cases', next)
    setCaseMutating(true)
    try {
      const result = await setIndustryLandingPageCases(page.id, next.map(c => c.id))
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
    const previous = page.cases
    const next = page.cases.filter(c => c.id !== caseId)
    set('cases', next)
    setCaseMutating(true)
    try {
      const result = await setIndustryLandingPageCases(page.id, next.map(c => c.id))
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

  const editableStyle = (extra?: React.CSSProperties): React.CSSProperties => ({ ...editableBase, ...extra })

  return (
    <main className="bg-[#ffffff] text-[#1A1812]" style={{ position: 'relative' }}>
      {canEdit && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 50, display: 'flex', gap: 8, alignItems: 'center' }}>
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
            style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: '0.75rem', fontWeight: 600, padding: '8px 14px', borderRadius: 20, background: editing ? '#1A1812' : '#7C5CFC', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            {editing ? '✓ Ferdig' : '✎ Rediger'}
          </button>
        </div>
      )}

      {casesError && (
        <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 50, background: '#C0392B', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: '0.8rem', maxWidth: 320 }}>
          {casesError}
          <button onClick={() => setCasesError(null)} style={{ marginLeft: 10, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
        </div>
      )}
      {(savingFields.size > 0 || caseMutating) && (
        <div style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 50, background: '#1A1812', color: '#fff', padding: '6px 12px', borderRadius: 8, fontSize: '0.72rem' }}>
          Lagrer...
        </div>
      )}

      {settingsOpen && editing && (
        <div style={{ position: 'fixed', top: 64, right: 16, zIndex: 50, background: '#fff', border: '1px solid #ddd', borderRadius: 10, padding: 18, width: 300, boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', marginBottom: 10 }}>/{slug}</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: '0.82rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={page.published}
              onChange={e => { const prev = page.published; set('published', e.target.checked); saveField('published', e.target.checked, prev) }}
            />
            Publisert
          </label>
          <FieldError field="published" />
          <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, color: '#888', marginBottom: 4 }}>SEO-tittel</label>
          <input
            type="text"
            value={page.meta_title}
            onChange={e => set('meta_title', e.target.value)}
            onBlur={e => saveField('meta_title', e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.8rem', padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6 }}
          />
          <FieldError field="meta_title" />
          <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, color: '#888', margin: '10px 0 4px' }}>SEO-beskrivelse</label>
          <textarea
            value={page.meta_description}
            onChange={e => set('meta_description', e.target.value)}
            onBlur={e => saveField('meta_description', e.target.value)}
            rows={2}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.8rem', padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6 }}
          />
          <FieldError field="meta_description" />
        </div>
      )}

      {/* Hero */}
      <section className="relative h-screen min-h-[640px] w-full bg-[#ffffff]">
        <div className="relative h-full w-full overflow-hidden bg-[#16140F]">
          <HeroMedia type={page.hero_type} src={page.hero_video_path} poster={page.hero_poster_path} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />

          {editing && (
            <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 20, display: 'flex', gap: 8 }}>
              <select
                value={page.hero_type}
                onChange={e => { const t = e.target.value as 'video' | 'image'; set('hero_type', t); saveField('hero_type', t) }}
                style={{ fontSize: '0.72rem', padding: '6px 8px', borderRadius: 6 }}
              >
                <option value="video">Video</option>
                <option value="image">Bilde</option>
              </select>
              <input ref={heroFileInputRef} type="file" accept={page.hero_type === 'video' ? 'video/mp4' : 'image/*'} hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) handleHeroFileChange(f); e.target.value = '' }} />
              <button onClick={() => heroFileInputRef.current?.click()} style={{ fontSize: '0.72rem', padding: '6px 10px', borderRadius: 6, background: '#fff', border: '1px solid #ccc', cursor: 'pointer' }}>
                Last opp {page.hero_type === 'video' ? 'video' : 'bilde'}
              </button>
              <button onClick={() => setImagePickerTarget('hero_poster')} style={{ fontSize: '0.72rem', padding: '6px 10px', borderRadius: 6, background: '#fff', border: '1px solid #ccc', cursor: 'pointer' }}>
                Velg {page.hero_type === 'video' ? 'poster' : 'bilde'} fra bibliotek
              </button>
            </div>
          )}
          {editing && (page.hero_type === 'video' ? fieldErrors.hero_video_path : fieldErrors.hero_poster_path) && (
            <div style={{ position: 'absolute', top: 52, left: 16, zIndex: 20, background: '#fff', borderRadius: 6, padding: '4px 10px' }}>
              <FieldError field={page.hero_type === 'video' ? 'hero_video_path' : 'hero_poster_path'} />
            </div>
          )}

          <div className="relative z-10 flex h-full flex-col justify-between px-6 py-8 md:px-8 md:py-10">
            <p className="text-sm font-semibold tracking-[0.08em] text-[#ffffff]">LEAFILMS</p>

            <div className="max-w-3xl">
              {editing ? (
                <>
                  <textarea
                    value={page.hero_headline}
                    onChange={e => set('hero_headline', e.target.value)}
                    onBlur={e => saveField('hero_headline', e.target.value)}
                    rows={3}
                    className="text-4xl font-bold leading-[1.05] sm:text-5xl md:text-7xl"
                    style={editableStyle({ color: '#fff' })}
                  />
                  <FieldError field="hero_headline" />
                </>
              ) : (
                <h1 className="text-4xl font-bold leading-[1.05] text-[#ffffff] sm:text-5xl md:text-7xl">
                  {page.hero_headline}
                </h1>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Lede */}
      {(page.lede_text || editing) && (
        <section className="px-6 pt-16 md:px-12 md:pt-24">
          {editing ? (
            <>
              <textarea
                value={page.lede_text}
                onChange={e => set('lede_text', e.target.value)}
                onBlur={e => saveField('lede_text', e.target.value)}
                rows={2}
                className="max-w-2xl text-2xl font-semibold leading-snug sm:text-3xl md:text-4xl"
                style={editableStyle()}
              />
              <FieldError field="lede_text" />
            </>
          ) : (
            <p className="max-w-2xl text-2xl font-semibold leading-snug sm:text-3xl md:text-4xl">
              {page.lede_text}
            </p>
          )}
        </section>
      )}

      {/* Cases */}
      {page.cases.map((caseStudy, index) => {
        const isOffset = index % 2 === 1
        const isLast = index === page.cases.length - 1
        return (
          <section
            key={caseStudy.id}
            className={index === 0 ? 'px-6 pt-12 md:px-12 md:pt-16' : 'px-6 py-16 md:px-12 md:py-24'}
          >
            <div className={`relative group${isOffset ? ' md:ml-[22%]' : ''}`} style={{ maxWidth: 672 }}>
              {editing && (
                <div style={{ position: 'absolute', top: -14, right: -14, zIndex: 5, display: 'flex', gap: 4 }}>
                  <button onClick={() => moveCase(index, 'up')} disabled={index === 0 || caseMutating} style={{ width: 28, height: 28, borderRadius: 14, background: '#fff', border: '1px solid #ccc', cursor: index === 0 || caseMutating ? 'default' : 'pointer', opacity: caseMutating ? 0.5 : 1 }}>↑</button>
                  <button onClick={() => moveCase(index, 'down')} disabled={isLast || caseMutating} style={{ width: 28, height: 28, borderRadius: 14, background: '#fff', border: '1px solid #ccc', cursor: isLast || caseMutating ? 'default' : 'pointer', opacity: caseMutating ? 0.5 : 1 }}>↓</button>
                  <button onClick={() => removeCase(caseStudy.id)} disabled={caseMutating} style={{ width: 28, height: 28, borderRadius: 14, background: '#C0392B', color: '#fff', border: 'none', cursor: caseMutating ? 'default' : 'pointer', opacity: caseMutating ? 0.5 : 1 }}>×</button>
                </div>
              )}
              <a href={caseStudy.vimeo_url} target="_blank" rel="noopener noreferrer" className="block">
                <div className="relative aspect-video w-full overflow-hidden bg-[#EDEAE2]">
                  {caseStudy.thumbnail_path && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={caseStudy.thumbnail_path}
                      alt={toTitleCase(caseStudy.title)}
                      loading={index === 0 ? 'eager' : 'lazy'}
                      fetchPriority={index === 0 ? 'high' : undefined}
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.02]"
                    />
                  )}
                </div>
                <div className="mt-5">
                  <h2 className="text-3xl font-bold sm:text-4xl">{toTitleCase(caseStudy.title)}</h2>
                  {caseStudy.description && <p className="mt-2 text-lg text-[#6B675E]">{caseStudy.description}</p>}
                </div>
              </a>
            </div>

            {isLast && slug === 'energi' && (
              <Link
                href="/energi/arbeid"
                className={`mt-10 inline-block border-b border-[#1A1812] pb-0.5 text-base font-medium${isOffset ? ' md:ml-[22%]' : ''}`}
              >
                Se mer av arbeidet vårt
              </Link>
            )}
          </section>
        )
      })}

      {editing && (
        <section className="px-6 pb-8 md:px-12">
          <button onClick={openCasePicker} disabled={caseMutating} style={{ fontSize: '0.78rem', fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: '#7C5CFC', color: '#fff', border: 'none', cursor: caseMutating ? 'default' : 'pointer', opacity: caseMutating ? 0.6 : 1 }}>
            + Legg til case
          </button>
        </section>
      )}

      {/* Om oss */}
      {(aboutParagraphs.length > 0 || page.about_image_path || editing) && (
        <section className="border-t border-[#EDEAE2] px-6 py-20 md:px-12 md:py-28">
          {editing ? (
            <>
              <input
                type="text"
                value={page.about_heading}
                onChange={e => set('about_heading', e.target.value)}
                onBlur={e => saveField('about_heading', e.target.value)}
                className="text-3xl font-bold sm:text-4xl"
                style={editableStyle()}
              />
              <FieldError field="about_heading" />
            </>
          ) : (
            <h2 className="text-3xl font-bold sm:text-4xl">{page.about_heading}</h2>
          )}

          <div className="mt-8 grid gap-10 md:grid-cols-[1.3fr_1fr] md:gap-16">
            {editing ? (
              <div>
                <textarea
                  value={page.about_content}
                  onChange={e => set('about_content', e.target.value)}
                  onBlur={e => saveField('about_content', e.target.value)}
                  rows={10}
                  className="text-lg leading-relaxed md:text-xl"
                  style={editableStyle()}
                />
                <FieldError field="about_content" />
              </div>
            ) : (
              <div className="space-y-6 text-lg leading-relaxed text-[#3A372F] md:text-xl">
                {aboutParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              </div>
            )}

            <div className="relative aspect-square w-full overflow-hidden bg-[#EDEAE2] md:aspect-auto group">
              {page.about_image_path && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={page.about_image_path} alt={page.about_heading} loading="lazy" className="h-full w-full object-cover object-left" />
              )}
              {editing && (
                <div style={{ position: 'absolute', bottom: 10, left: 10, display: 'flex', gap: 8 }}>
                  <input ref={aboutFileInputRef} type="file" accept="image/*" hidden
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleAboutFileChange(f); e.target.value = '' }} />
                  <button onClick={() => aboutFileInputRef.current?.click()} style={{ fontSize: '0.72rem', padding: '6px 10px', borderRadius: 6, background: '#fff', border: '1px solid #ccc', cursor: 'pointer' }}>
                    Last opp
                  </button>
                  <button onClick={() => setImagePickerTarget('about')} style={{ fontSize: '0.72rem', padding: '6px 10px', borderRadius: 6, background: '#fff', border: '1px solid #ccc', cursor: 'pointer' }}>
                    Fra bibliotek
                  </button>
                </div>
              )}
              {editing && fieldErrors.about_image_path && (
                <div style={{ position: 'absolute', bottom: 46, left: 10, background: '#fff', borderRadius: 6, padding: '4px 10px' }}>
                  <FieldError field="about_image_path" />
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Avsluttende CTA */}
      <section className="bg-[#16140F] px-6 py-28 text-[#ffffff] md:px-12 md:py-36">
        {editing ? (
          <>
            <textarea
              value={page.cta_headline}
              onChange={e => set('cta_headline', e.target.value)}
              onBlur={e => saveField('cta_headline', e.target.value)}
              rows={2}
              className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl"
              style={editableStyle({ color: '#fff' })}
            />
            <FieldError field="cta_headline" />
          </>
        ) : (
          <h2 className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">{page.cta_headline}</h2>
        )}

        {editing ? (
          <>
            <textarea
              value={page.cta_subtext}
              onChange={e => set('cta_subtext', e.target.value)}
              onBlur={e => saveField('cta_subtext', e.target.value)}
              rows={2}
              className="mt-5 max-w-lg text-xl"
              style={{ ...editableStyle({ color: 'rgba(255,255,255,0.8)' }), ...italicSerif }}
            />
            <FieldError field="cta_subtext" />
          </>
        ) : page.cta_subtext ? (
          <p className="mt-5 max-w-lg text-xl text-[#ffffff]/80" style={italicSerif}>{page.cta_subtext}</p>
        ) : null}

        {editing ? (
          <>
            <input
              type="email"
              value={page.cta_email}
              onChange={e => set('cta_email', e.target.value)}
              onBlur={e => saveField('cta_email', e.target.value)}
              className="mt-8 text-xl font-semibold"
              style={editableStyle({ color: '#fff', maxWidth: 320 })}
            />
            <FieldError field="cta_email" />
          </>
        ) : (
          <a href={`mailto:${page.cta_email}?subject=Film%20og%20foto%20for%20oss`} className="mt-8 inline-block border-b-2 border-[#B8641F] pb-1 text-xl font-semibold">
            {page.cta_email}
          </a>
        )}

        <div className="mt-24 flex flex-col gap-2 text-sm text-[#ffffff]/50 md:flex-row md:justify-between">
          <p>Leafilms</p>
          <p>Denne siden er laget for deg — ikke offentlig delt.</p>
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
      <ImagePickerModal
        isOpen={imagePickerTarget !== null}
        onClose={() => setImagePickerTarget(null)}
        onSelect={handleImagePicked}
        selectedImageIds={EMPTY_SELECTION}
        maxSelection={1}
      />
    </main>
  )
}
