'use client'

import dynamic from 'next/dynamic'
import { Project, Section, Image, SectionImage, VideoLibrary, SectionVideo, OurSignature } from '@/lib/types'

const ContractSigningSection = dynamic(() => import('../ContractSigningSection'), { ssr: false })
import { Text } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useMemo, useCallback, useEffect } from 'react'
import { HeroSection, ContactSection, QuoteSection } from '@/components/sections'
import { useProjectAnalytics } from '@/hooks/useProjectAnalytics'
import { useQuoteContractState } from '@/hooks/useQuoteContractState'
import { useAuth } from '@/hooks/useAuth'

// Helper for å hente bilde-URL
function getImageUrl(filePath: string): string {
  return supabase.storage.from('assets').getPublicUrl(filePath).data.publicUrl
}

type SigningProjectClientProps = {
  project: Project
  sections: Section[]
  sectionImages: Record<string, Image[]>
  sectionImageData: Record<string, SectionImage[]>
  sectionVideos?: Record<string, VideoLibrary[]>
  sectionVideoData?: Record<string, SectionVideo[]>
  shareToken: string
  publishedContract?: {
    contractText: string
    isSigned: boolean
    signedBy: string | null
    ourSignature?: OurSignature | null
    pdfUrl?: string | null
    requestInvoiceInfo?: boolean
  } | null
  projectId?: string
}

export function SigningProjectClient({
  project,
  sections,
  sectionImages,
  sectionImageData,
  sectionVideos = {},
  sectionVideoData = {},
  shareToken,
  publishedContract,
  projectId,
}: SigningProjectClientProps) {
  const sectionIds = useMemo(() => sections.map(s => s.id), [sections])

  const {
    optionalAddons,
    selectedAddonIds,
    baseFinalPriceExclVat,
    quoteDiscountFactor,
    contractSigned,
    handleToggleAddon,
    handleContractSigned,
    handleAddonsLoaded,
    handleBaseTotalsLoaded,
  } = useQuoteContractState({ shareToken, projectId, initialIsSigned: publishedContract?.isSigned ?? false })

  const scrollToContract = useCallback(() => {
    const el = document.getElementById('kontrakt')
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 40, behavior: 'smooth' })
  }, [])

  const { isAdmin, loading: authLoading } = useAuth()

  useProjectAnalytics(project.id, shareToken, sectionIds, isAdmin || authLoading)

  const lang = project.language === 'en' ? 'en' : 'no'

  // Rot-layouten setter <html lang="no"> globalt og kan ikke overstyres per rute i
  // App Router — juster attributtet fra klienten så skjermlesere/oversettere ser riktig språk
  useEffect(() => {
    if (lang === 'en') {
      document.documentElement.lang = 'en'
      return () => { document.documentElement.lang = 'no' }
    }
  }, [lang])

  const getBackgroundStyle = useCallback((sectionId: string, imageIndex = 0): React.CSSProperties => {
    const images = sectionImages[sectionId]
    const imageData = sectionImageData[sectionId]

    if (!images || !images[imageIndex]) return {}

    const image = images[imageIndex]
    const data = imageData?.[imageIndex]

    const posX = data?.background_position_x ?? 50
    const posY = data?.background_position_y ?? 50
    const zoom = data?.background_zoom

    const backgroundSize = zoom === null || zoom === undefined || zoom === 1.0
      ? 'cover'
      : `${zoom * 100}%`

    return {
      backgroundImage: `url(${getImageUrl(image.file_path)})`,
      backgroundSize: backgroundSize,
      backgroundPosition: `${posX}% ${posY}%`,
      backgroundRepeat: 'no-repeat'
    }
  }, [sectionImages, sectionImageData])

  // Stable noop functions (view mode — not used for mutations)
  const noop = useCallback(() => {}, [])
  const noopAsync = useCallback(async () => {}, [])
  const noopEvent = useCallback((e: React.MouseEvent) => { e.stopPropagation() }, [])
  const emptyImagePosition = useMemo(() => ({}), [])

  const heroSection = useMemo(() => sections.find(s => s.type === 'hero'), [sections])
  const quoteSection = useMemo(() => sections.find(s => s.type === 'quote'), [sections])
  const contactSection = useMemo(() => sections.find(s => s.type === 'contact'), [sections])

  if (!project) {
    console.error('[SigningProjectClient] No project provided')
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <Text variant="body" className="!text-foreground">
            Feil: Prosjekt ikke funnet
          </Text>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Signert-varsel — alltid synlig helt øverst, så kunden lett finner avtalen sin igjen */}
      {contractSigned && (
        <button
          onClick={scrollToContract}
          className="fixed top-0 left-1/2 -translate-x-1/2 z-50"
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#161410',
            border: '1px solid rgba(196,148,52,0.4)',
            borderRadius: 999,
            padding: '8px 18px',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.7rem',
            letterSpacing: '0.08em',
            color: '#C49434',
          }}
        >
          <span>✓</span>
          <span>{lang === 'en' ? 'The agreement is signed — view agreement' : 'Avtalen er signert — se avtalen'}</span>
        </button>
      )}

      {/* Hero Section (header) */}
      {heroSection && (
        <div data-section-id={heroSection.id}>
          <HeroSection
            section={heroSection}
            project={project}
            editMode={false}
            sectionImages={sectionImages}
            sectionImageData={sectionImageData}
            sectionVideos={sectionVideos}
            sectionVideoData={sectionVideoData}
            editingImageSectionId={null}
            imagePosition={emptyImagePosition}
            getBackgroundStyle={getBackgroundStyle}
            updateSectionContent={noop}
            saveBackgroundPosition={noopAsync}
            setImagePosition={noop}
            onImageClick={noop}
            onEditPositionClick={noopEvent}
            onImagePickerOpen={noop}
          />
        </div>
      )}

      {/* Quote Section (tilbudet) */}
      {quoteSection && (
        <section
          data-section-id={quoteSection.id}
          className="px-0 bg-background relative"
        >
          <div className="w-full">
            <QuoteSection
              section={quoteSection}
              project={project}
              editMode={false}
              updateSectionContent={noop}
              shareToken={shareToken}
              hasPublishedContract={!!publishedContract}
              isContractSigned={contractSigned}
              selectedAddonIds={selectedAddonIds}
              onToggleAddon={handleToggleAddon}
              onAddonsLoaded={handleAddonsLoaded}
              onBaseTotalsLoaded={handleBaseTotalsLoaded}
            />
          </div>
        </section>
      )}

      {/* Contract Signing Section (kontrakten) */}
      {publishedContract && projectId && (
        <ContractSigningSection
          projectId={projectId}
          shareToken={shareToken}
          contractText={publishedContract.contractText}
          isSigned={publishedContract.isSigned}
          signedBy={publishedContract.signedBy}
          ourSignature={publishedContract.ourSignature}
          pdfUrl={publishedContract.pdfUrl}
          language={lang}
          optionalAddons={optionalAddons}
          selectedAddonIds={selectedAddonIds}
          baseFinalPriceExclVat={baseFinalPriceExclVat}
          discountFactor={quoteDiscountFactor}
          requestInvoiceInfo={publishedContract.requestInvoiceInfo}
          onSigned={handleContractSigned}
        />
      )}

      {/* Contact Section — "Har du noen spørsmål" nederst */}
      {contactSection && contactSection.visible && (
        <section
          data-section-id={contactSection.id}
          className="px-0 bg-background relative"
        >
          <div className="w-full">
            <ContactSection
              section={contactSection}
              editMode={false}
              language={lang}
              updateSectionContent={noop}
            />
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="py-8 px-8" style={{ background: '#0C0B09', borderTop: '1px solid #1A1713' }}>
        <div className="max-w-5xl mx-auto flex items-center justify-center gap-6">
          <div style={{ flex: 1, maxWidth: 120, height: 1, background: '#1A1713' }} />
          <span style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.55rem',
            letterSpacing: '0.22em',
            color: '#38332A',
            textTransform: 'uppercase',
          }}>
            {new Date().getFullYear()} — Leafilms
          </span>
          <div style={{ flex: 1, maxWidth: 120, height: 1, background: '#1A1713' }} />
        </div>
      </footer>
    </div>
  )
}
