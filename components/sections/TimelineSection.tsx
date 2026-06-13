'use client'

import { useState } from 'react'
import { Section } from '@/lib/types'

type TimelineSectionProps = {
  section: Section
  editMode: boolean
  timelineSectionProgress: number
  timelineSectionRef: React.RefObject<HTMLDivElement | null>
  getSectionTitle: (type: string) => string
  updateSectionContent: (sectionId: string, key: string, value: unknown) => void
}

const defaultTimelineItems = [
  { title: 'Pre-produksjon', text: 'Idéutvikling, moodboards, storyboards og planlegging av konsept og visuell retning.', monthYear: 'Januar 2026' },
  { title: 'Produksjon', text: 'Gjennomføring av opptak, koordinering av team og sikring av alt nødvendig materiale.', monthYear: 'Februar 2026' },
  { title: 'Post-produksjon', text: 'Redigering, fargekorrigering, lyddesign og ferdigstilling av sluttprodukt.', monthYear: 'Mars 2026' },
  { title: 'Levering', text: 'Eksport i relevante formater, kvalitetssikring og overlevering til kunden.', monthYear: 'April 2026' },
]

// Card width + gap (must match the rendered card exactly)
const CARD_W = 280
const CARD_GAP = 16
const CARD_STEP = CARD_W + CARD_GAP // 296px per card slot

function TimelineCard({
  index,
  item,
  isActive,
  editMode,
  section,
  updateSectionContent,
}: {
  index: number
  item: { title: string; text: string; monthYear?: string }
  isActive: boolean
  editMode: boolean
  section: Section
  updateSectionContent: (sectionId: string, key: string, value: unknown) => void
}) {
  return (
    <div
      className="flex-shrink-0 p-7 transition-all"
      style={{
        width: CARD_W,
        background: isActive ? '#201D18' : '#161410',
        border: isActive ? '1px solid #38332A' : '1px solid #2A261F',
        borderTop: isActive ? '2px solid #C49434' : '2px solid transparent',
        transform: isActive ? 'translateY(-6px)' : 'translateY(0)',
        boxShadow: isActive ? '0 24px 48px rgba(0,0,0,0.5)' : 'none',
        transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Step number */}
      <div style={{
        fontFamily: 'var(--font-cormorant)',
        fontSize: '2.75rem',
        fontWeight: 300,
        color: isActive ? '#C49434' : '#2A261F',
        lineHeight: 1,
        marginBottom: '1rem',
        transition: 'color 0.35s',
        userSelect: 'none',
      }}>
        {String(index + 1).padStart(2, '0')}
      </div>

      {/* Title */}
      <p
        className={editMode ? 'edit-outline px-2 py-1' : ''}
        style={{
          fontFamily: 'var(--font-cormorant)',
          fontSize: '1.25rem',
          fontWeight: 500,
          color: '#E8E1D5',
          letterSpacing: '0.02em',
          marginBottom: '0.75rem',
        }}
        contentEditable={editMode}
        suppressContentEditableWarning
        onBlur={(e) => {
          if (!editMode) return
          const items = [...(section.content.timelineItems || defaultTimelineItems)]
          if (!items[index]) items[index] = { title: '', text: '', monthYear: '' }
          items[index] = { ...items[index], title: e.currentTarget.textContent || '' }
          updateSectionContent(section.id, 'timelineItems', items)
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {item.title || (editMode ? 'Tittel...' : 'Fase')}
      </p>

      {/* Body */}
      <p
        className={editMode ? 'edit-outline px-2 py-1 min-h-[80px]' : ''}
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: '0.85rem',
          color: '#9E9287',
          lineHeight: 1.65,
          fontWeight: 300,
          marginBottom: '1.25rem',
        }}
        contentEditable={editMode}
        suppressContentEditableWarning
        onBlur={(e) => {
          if (!editMode) return
          const items = [...(section.content.timelineItems || defaultTimelineItems)]
          if (!items[index]) items[index] = { title: '', text: '', monthYear: '' }
          items[index] = { ...items[index], text: e.currentTarget.textContent || '' }
          updateSectionContent(section.id, 'timelineItems', items)
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {item.text || (editMode ? 'Klikk for å redigere tekst...' : '')}
      </p>

      {/* Date */}
      <p
        className={editMode ? 'edit-outline px-2 py-1' : ''}
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: '0.78rem',
          letterSpacing: '0.12em',
          color: isActive ? '#C49434' : '#38332A',
          textTransform: 'uppercase',
          fontWeight: 500,
          transition: 'color 0.35s',
        }}
        contentEditable={editMode}
        suppressContentEditableWarning
        onBlur={(e) => {
          if (!editMode) return
          const items = [...(section.content.timelineItems || defaultTimelineItems)]
          if (!items[index]) items[index] = { title: '', text: '', monthYear: '' }
          items[index] = { ...items[index], monthYear: e.currentTarget.textContent || '' }
          updateSectionContent(section.id, 'timelineItems', items)
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {item.monthYear || (editMode ? 'Måned År' : '')}
      </p>
    </div>
  )
}

export function TimelineSection({
  section,
  editMode,
  timelineSectionProgress,
  timelineSectionRef,
  getSectionTitle,
  updateSectionContent,
}: TimelineSectionProps) {
  const [mobileIndex, setMobileIndex] = useState(0)
  const timelineItems: { title: string; text: string; monthYear?: string }[] =
    section.content.timelineItems || defaultTimelineItems

  // Active card = whichever card is closest to center based on scroll progress
  // progress 0→1 maps across 3 transitions (4 cards)
  const activeIndex = Math.min(Math.round(timelineSectionProgress * 3), 3)

  // Horizontal offset: at progress=0, card[0] is centered; at progress=1, card[3] is centered.
  // translateX = 50vw - half_card_width - progress * CARD_STEP * 3
  // We can't do 50vw in JS, so we use CSS calc()
  const translateX = `calc(50vw - ${CARD_W / 2}px - ${timelineSectionProgress * CARD_STEP * 3}px)`

  // EDIT MODE: simple flat layout, all 4 cards visible
  if (editMode) {
    return (
      <div ref={timelineSectionRef} className="w-full py-6 md:py-8">
        <div className="px-8 md:px-16 mb-12">
          <div className="flex items-center gap-5 mb-5">
            <div style={{ width: 32, height: 1, background: '#C49434' }} />
            <span
              className={editMode ? 'edit-outline px-2 py-1 cursor-text' : ''}
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.78rem',
                letterSpacing: '0.16em',
                color: '#C49434',
                textTransform: 'uppercase',
                fontWeight: 500,
              }}
              contentEditable={editMode}
              suppressContentEditableWarning
              onBlur={(e) => {
                if (editMode) updateSectionContent(section.id, 'sectionLabel', e.currentTarget.textContent || '')
              }}
            >
              {section.content.sectionLabel || getSectionTitle(section.type)}
            </span>
          </div>
          <h2
            className="edit-outline px-2 py-1 cursor-text"
            style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: 'clamp(2.25rem, 4vw, 3.75rem)',
              fontWeight: 300,
              fontStyle: 'italic',
              color: '#E8E1D5',
              lineHeight: 1.15,
              maxWidth: '28ch',
            }}
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => {
              updateSectionContent(section.id, 'sectionHeading', e.currentTarget.textContent || '')
            }}
          >
            {section.content.sectionHeading || 'Fra idé til ferdig produksjon'}
          </h2>
        </div>
        <div className="flex gap-4 px-8 md:px-16 overflow-x-auto pb-4">
          {[0, 1, 2, 3].map((i) => (
            <TimelineCard
              key={i}
              index={i}
              item={timelineItems[i] || { title: 'Fase', text: '', monthYear: '' }}
              isActive={i === 0}
              editMode={editMode}
              section={section}
              updateSectionContent={updateSectionContent}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    // Outer tall div — gives the scroll room needed for the animation.
    // The sticky inner content stays fixed while user scrolls through this space.
    <div
      ref={timelineSectionRef}
      style={{ position: 'relative', height: '280vh' }}
    >
      {/* Sticky viewport — stays fixed while parent scrolls */}
      <div style={{
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        paddingTop: 'env(safe-area-inset-top)',
      }}>
        {/*
          Vertical drift wrapper: as scroll progress increases, the entire content
          slowly drifts upward — giving the feeling of slowly scrolling downward
          through the section while cards animate horizontally.
        */}
        <div style={{
          transform: `translateY(${-timelineSectionProgress * 10}vh)`,
          willChange: 'transform',
        }}>

        {/* Section label + heading */}
        <div className="px-6 md:px-16 mb-10 md:mb-14">
          <div className="flex items-center gap-5 mb-5">
            <div style={{ width: 32, height: 1, background: '#C49434' }} />
            <span
              className={editMode ? 'edit-outline px-2 py-1 cursor-text' : ''}
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.78rem',
                letterSpacing: '0.16em',
                color: '#C49434',
                textTransform: 'uppercase',
                fontWeight: 500,
              }}
              contentEditable={editMode}
              suppressContentEditableWarning
              onBlur={(e) => {
                if (editMode) updateSectionContent(section.id, 'sectionLabel', e.currentTarget.textContent || '')
              }}
            >
              {section.content.sectionLabel || getSectionTitle(section.type)}
            </span>
          </div>
          <h2
            className={editMode ? 'edit-outline px-2 py-1 cursor-text' : ''}
            style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: 'clamp(2.25rem, 4vw, 3.75rem)',
              fontWeight: 300,
              fontStyle: 'italic',
              color: '#E8E1D5',
              lineHeight: 1.15,
              maxWidth: '28ch',
            }}
            contentEditable={editMode}
            suppressContentEditableWarning
            onBlur={(e) => {
              if (editMode) updateSectionContent(section.id, 'sectionHeading', e.currentTarget.textContent || '')
            }}
          >
            {section.content.sectionHeading || 'Fra idé til ferdig produksjon'}
          </h2>
        </div>

        {/* Mobile: carousel */}
        <div className="lg:hidden relative flex items-center justify-center gap-3 px-4">
          <button
            type="button"
            onClick={() => setMobileIndex(i => Math.max(0, i - 1))}
            disabled={mobileIndex === 0}
            aria-label="Forrige fase"
            className="flex-shrink-0 w-9 h-9 rounded-full border border-[#2A261F] flex items-center justify-center text-[#9E9287] hover:border-[#C49434] hover:text-[#C49434] disabled:opacity-25 disabled:cursor-not-allowed transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0 flex justify-center">
            <TimelineCard
              index={mobileIndex}
              item={timelineItems[mobileIndex] || { title: 'Fase', text: '', monthYear: '' }}
              isActive
              editMode={false}
              section={section}
              updateSectionContent={updateSectionContent}
            />
          </div>
          <button
            type="button"
            onClick={() => setMobileIndex(i => Math.min(timelineItems.length - 1, i + 1))}
            disabled={mobileIndex === timelineItems.length - 1}
            aria-label="Neste fase"
            className="flex-shrink-0 w-9 h-9 rounded-full border border-[#2A261F] flex items-center justify-center text-[#9E9287] hover:border-[#C49434] hover:text-[#C49434] disabled:opacity-25 disabled:cursor-not-allowed transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Mobile step dots */}
        <div className="lg:hidden flex items-center justify-center gap-2 mt-6">
          {timelineItems.map((_: unknown, i: number) => (
            <button
              key={i}
              onClick={() => setMobileIndex(i)}
              style={{
                width: i === mobileIndex ? 20 : 4,
                height: 2,
                background: i === mobileIndex ? '#C49434' : '#2A261F',
                borderRadius: 1,
                transition: 'all 0.25s',
              }}
            />
          ))}
        </div>

        {/* Desktop: horizontal strip, translated smoothly */}
        <div
          className="hidden lg:block"
          style={{ overflow: 'visible' }}
        >
          <div
            style={{
              display: 'flex',
              gap: CARD_GAP,
              // The translateX drives which card is centered
              transform: `translateX(${translateX})`,
              // willChange tells the GPU to composite this layer — reduces jank
              willChange: 'transform',
              // No CSS transition here! We want it to track scroll 1:1 without lag.
              // The easing comes from natural scroll momentum.
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <TimelineCard
                key={i}
                index={i}
                item={timelineItems[i] || { title: 'Fase', text: '', monthYear: '' }}
                isActive={activeIndex === i}
                editMode={false}
                section={section}
                updateSectionContent={updateSectionContent}
              />
            ))}
          </div>
        </div>

        {/* Progress indicator (desktop) — line + dots */}
        <div className="hidden lg:flex flex-col items-center mt-10 gap-4">
          {/* Connected progress line */}
          <div className="relative flex items-center gap-0" style={{ width: 200 }}>
            {/* Track */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: 1,
              background: '#2A261F',
              transform: 'translateY(-50%)',
            }} />
            {/* Filled portion */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              width: `${(activeIndex / (timelineItems.length - 1)) * 100}%`,
              height: 1,
              background: '#C49434',
              transform: 'translateY(-50%)',
              transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
            }} />
            {/* Dot markers */}
            <div className="relative w-full flex justify-between">
              {timelineItems.map((_: unknown, i: number) => (
                <div
                  key={i}
                  style={{
                    width: i === activeIndex ? 8 : 4,
                    height: i === activeIndex ? 8 : 4,
                    borderRadius: '50%',
                    background: i <= activeIndex ? '#C49434' : '#2A261F',
                    border: i === activeIndex ? '1px solid rgba(196,148,52,0.4)' : 'none',
                    boxShadow: i === activeIndex ? '0 0 8px rgba(196,148,52,0.5)' : 'none',
                    transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                    zIndex: 1,
                    position: 'relative',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Active date label */}
          <span style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.72rem',
            letterSpacing: '0.18em',
            color: '#C49434',
            textTransform: 'uppercase',
            fontWeight: 500,
            transition: 'opacity 0.3s',
          }}>
            {timelineItems[activeIndex]?.monthYear || ''}
          </span>
        </div>

        </div>{/* end vertical drift wrapper */}
      </div>
    </div>
  )
}
