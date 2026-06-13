'use client'

import { Section } from '@/lib/types'

type ScheduleItem = {
  id: string
  event: string
  location: string
  date: string
  startDate: string
  endDate: string
  channels: string
  liveOn: string
  crew: number
  manualDays?: number
}

const DEFAULT_PARTNER_ITEMS: ScheduleItem[] = [
  {
    id: 'p1',
    event: 'Partner 1',
    location: 'TBA',
    date: 'TBA',
    startDate: '',
    endDate: '',
    channels: 'Web, Screen',
    liveOn: 'TBA',
    crew: 4,
    manualDays: 2,
  },
  {
    id: 'p2',
    event: 'Partner 2',
    location: 'TBA',
    date: 'TBA',
    startDate: '',
    endDate: '',
    channels: 'Web, Screen',
    liveOn: 'TBA',
    crew: 4,
    manualDays: 2,
  },
  {
    id: 'p3',
    event: 'Partner 3',
    location: 'TBA',
    date: 'TBA',
    startDate: '',
    endDate: '',
    channels: 'Web, Screen',
    liveOn: 'TBA',
    crew: 4,
    manualDays: 2,
  },
]

const DEFAULT_SCHEDULE_ITEMS: ScheduleItem[] = [
  {
    id: '1',
    event: 'Camp',
    location: 'Near Oslo',
    date: 'June 9–11, 2026',
    startDate: '2026-06-09',
    endDate: '2026-06-10',
    channels: 'IG, TikTok, YouTube',
    liveOn: 'July 1st',
    crew: 4,
  },
  {
    id: '2',
    event: 'Altitude Camp September',
    location: 'Europe',
    date: 'September 26',
    startDate: '2026-09-26',
    endDate: '2026-09-28',
    channels: 'IG, TikTok, YouTube',
    liveOn: 'October 1st',
    crew: 4,
  },
  {
    id: '3',
    event: 'Training Camp',
    location: 'Spain',
    date: 'October 2026',
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    channels: 'IG, TikTok, YouTube',
    liveOn: 'November 1st',
    crew: 2,
  },
  {
    id: '4',
    event: 'Season Opening',
    location: 'Norway',
    date: 'November 19th–21st, 2026',
    startDate: '2026-11-19',
    endDate: '2026-11-22',
    channels: 'IG, TikTok, YouTube',
    liveOn: 'November 25th',
    crew: 3,
  },
  {
    id: '5',
    event: 'Norwegian Championships',
    location: 'Norway',
    date: 'January 2027',
    startDate: '2027-01-15',
    endDate: '2027-01-17',
    channels: 'IG, TikTok, YouTube',
    liveOn: 'January 20th',
    crew: 3,
  },
  {
    id: '6',
    event: 'Marcialonga',
    location: 'Italy',
    date: 'January 31st, 2027',
    startDate: '2027-01-31',
    endDate: '2027-02-02',
    channels: 'IG, TikTok, YouTube',
    liveOn: 'February 7th',
    crew: 4,
  },
  {
    id: '7',
    event: 'World Championships',
    location: 'Falun, Sweden',
    date: 'February 2027',
    startDate: '2027-02-19',
    endDate: '2027-02-22',
    channels: 'IG, TikTok, YouTube',
    liveOn: 'March 1st',
    crew: 4,
  },
  {
    id: '8',
    event: 'Ski Classics Season',
    location: 'Final March 2027',
    date: 'March 2027',
    startDate: '2027-03-19',
    endDate: '2027-03-23',
    channels: 'IG, TikTok, YouTube',
    liveOn: 'April 1st',
    crew: 3,
  },
]

function getDays(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return diff + 1
}

function formatDateRange(startDate: string, endDate: string): string {
  if (!startDate) return ''
  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : null
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  if (!end || startDate === endDate) {
    return `${monthNames[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()}`
  }
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${monthNames[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`
  }
  return `${monthNames[start.getMonth()]} ${start.getDate()} – ${monthNames[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

const COLUMNS = ['WHAT', 'LOCATION', 'DATE', 'CHANNELS', 'LIVE ON', 'PROD. DAYS', 'CREW']

type ProductionScheduleSectionProps = {
  section: Section
  editMode: boolean
  updateSectionContent: (sectionId: string, key: string, value: unknown) => void
}

type TableBlockProps = {
  title: string
  subtitle: string
  items: ScheduleItem[]
  editMode: boolean
  headerFooterTextColor: string
  editClass: string
  onUpdateTitle?: (val: string) => void
  onUpdateSubtitle?: (val: string) => void
  onUpdateItem: (id: string, field: keyof ScheduleItem, value: string | number) => void
  onAddRow: () => void
  onRemoveRow: (id: string) => void
  showScrollHint?: boolean
}

function TableBlock({
  title,
  subtitle,
  items,
  editMode,
  headerFooterTextColor,
  editClass,
  onUpdateTitle,
  onUpdateSubtitle,
  onUpdateItem,
  onAddRow,
  onRemoveRow,
  showScrollHint,
}: TableBlockProps) {
  const totalDays = items.reduce((sum, item) => {
    if (item.startDate && item.endDate) return sum + getDays(item.startDate, item.endDate)
    if (item.manualDays) return sum + item.manualDays
    return sum
  }, 0)

  return (
    <div className="mb-16">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-4 mb-5">
          <div style={{ width: 32, height: 1, background: '#C49434' }} />
          <span
            className={editMode && onUpdateTitle ? 'edit-outline px-2 py-1' : ''}
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.78rem',
              letterSpacing: '0.16em',
              color: '#C49434',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
            contentEditable={editMode && !!onUpdateTitle}
            suppressContentEditableWarning
            onBlur={(e) => {
              if (editMode && onUpdateTitle) onUpdateTitle(e.currentTarget.textContent || '')
            }}
          >
            {title}
          </span>
        </div>
        <p
          className={editMode && onUpdateSubtitle ? 'edit-outline px-2 py-1' : ''}
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: 'clamp(1.75rem, 2.8vw, 2.5rem)',
            fontWeight: 300,
            fontStyle: 'italic',
            color: '#E8E1D5',
            lineHeight: 1.3,
          }}
          contentEditable={editMode && !!onUpdateSubtitle}
          suppressContentEditableWarning
          onBlur={(e) => {
            if (editMode && onUpdateSubtitle) onUpdateSubtitle(e.currentTarget.textContent || '')
          }}
        >
          {subtitle}
        </p>
      </div>

      {/* Table */}
      <div className="relative">
        <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr style={{ backgroundColor: 'var(--color-background-widget-dark)' }}>
                {COLUMNS.map((col) => (
                  <th
                    key={col}
                    className="px-5 py-4 text-left text-xs font-bold uppercase tracking-widest"
                    style={{ color: headerFooterTextColor }}
                  >
                    {col}
                  </th>
                ))}
                {editMode && <th className="px-3 py-4 w-8" />}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const days =
                  item.startDate && item.endDate
                    ? getDays(item.startDate, item.endDate)
                    : item.manualDays ?? null

                const rowStyle: React.CSSProperties =
                  index % 2 === 0
                    ? { backgroundColor: 'var(--color-background-widget)' }
                    : { backgroundColor: 'var(--color-background-widget-medium)' }

                const cellBase = `px-5 py-4 text-sm text-dark align-top`

                return (
                  <tr key={item.id} style={rowStyle}>
                    {/* WHAT */}
                    <td
                      className={`${cellBase} font-semibold w-[200px] ${editClass}`}
                      contentEditable={editMode}
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        if (editMode) onUpdateItem(item.id, 'event', e.currentTarget.textContent || '')
                      }}
                    >
                      {item.event}
                    </td>

                    {/* LOCATION */}
                    <td
                      className={`${cellBase} ${editClass}`}
                      contentEditable={editMode}
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        if (editMode) onUpdateItem(item.id, 'location', e.currentTarget.textContent || '')
                      }}
                    >
                      {item.location}
                    </td>

                    {/* DATE */}
                    <td className={`${cellBase} min-w-[160px]`}>
                      {editMode ? (
                        <div className="flex flex-col gap-1">
                          <label className="text-xs opacity-50">Fra</label>
                          <input
                            type="date"
                            className="text-xs rounded px-1.5 py-1 w-full border border-dark/20 bg-background focus:outline-none cursor-pointer"
                            value={item.startDate}
                            onChange={(e) => onUpdateItem(item.id, 'startDate', e.target.value)}
                            onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                          />
                          <label className="text-xs opacity-50 mt-1">Til</label>
                          <input
                            type="date"
                            className="text-xs rounded px-1.5 py-1 w-full border border-dark/20 bg-background focus:outline-none cursor-pointer"
                            value={item.endDate}
                            onChange={(e) => onUpdateItem(item.id, 'endDate', e.target.value)}
                            onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                          />
                        </div>
                      ) : (
                        formatDateRange(item.startDate, item.endDate) || item.date
                      )}
                    </td>

                    {/* CHANNELS */}
                    <td
                      className={`${cellBase} ${editClass}`}
                      contentEditable={editMode}
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        if (editMode) onUpdateItem(item.id, 'channels', e.currentTarget.textContent || '')
                      }}
                    >
                      {item.channels}
                    </td>

                    {/* LIVE ON */}
                    <td
                      className={`${cellBase} font-semibold ${editClass}`}
                      contentEditable={editMode}
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        if (editMode) onUpdateItem(item.id, 'liveOn', e.currentTarget.textContent || '')
                      }}
                    >
                      {item.liveOn}
                    </td>

                    {/* PROD. DAYS */}
                    <td className={`${cellBase} whitespace-nowrap`}>
                      {days !== null && (
                        <span className="font-semibold">{days}d</span>
                      )}
                    </td>

                    {/* CREW */}
                    <td
                      className={`${cellBase} font-semibold ${editClass}`}
                      contentEditable={editMode}
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        const val = parseInt(e.currentTarget.textContent || '0', 10)
                        if (editMode) onUpdateItem(item.id, 'crew', isNaN(val) ? 0 : val)
                      }}
                    >
                      {item.crew || ''}
                    </td>

                    {/* Remove row button */}
                    {editMode && (
                      <td className="px-3 py-4 text-center align-top">
                        <button
                          onClick={() => onRemoveRow(item.id)}
                          className="opacity-40 hover:opacity-80 text-dark font-bold text-base leading-none transition-opacity"
                          title="Fjern rad"
                        >
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: 'var(--color-background-widget-dark)' }}>
                <td
                  colSpan={5}
                  className="px-5 py-4 text-xs font-bold uppercase tracking-widest text-right"
                  style={{ color: headerFooterTextColor }}
                >
                  Total days production Leafilms
                </td>
                <td
                  className="px-5 py-4 text-xs font-bold uppercase tracking-widest whitespace-nowrap"
                  style={{ color: headerFooterTextColor }}
                >
                  {totalDays}d
                </td>
                <td className="px-5 py-4" />
                {editMode && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
        {/* Scroll hint — mobile only */}
        {showScrollHint && (
          <>
            <div
              className="md:hidden pointer-events-none absolute top-0 right-0 bottom-0 w-16"
              style={{ background: 'linear-gradient(to right, transparent, rgba(22,20,16,0.85))' }}
            />
            <div
              className="md:hidden flex items-center justify-end gap-1 mt-2 pr-1"
              style={{ color: '#C49434', fontSize: '0.78rem', letterSpacing: '0.12em' }}
            >
              <span style={{ fontFamily: 'var(--font-dm-sans)', textTransform: 'uppercase', fontWeight: 500 }}>Scroll</span>
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                <path d="M9 1l4 4-4 4M1 5h12" stroke="#C49434" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </>
        )}
      </div>

      {/* Add row */}
      {editMode && (
        <div className="mt-4">
          <button
            onClick={onAddRow}
            className="text-sm opacity-50 hover:opacity-100 transition-opacity px-4 py-2"
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.78rem',
              letterSpacing: '0.12em',
              color: '#9E9287',
              border: '1px dashed #38332A',
            }}
          >
            + LEGG TIL RAD
          </button>
        </div>
      )}
    </div>
  )
}

export function ProductionScheduleSection({
  section,
  editMode,
  updateSectionContent,
}: ProductionScheduleSectionProps) {
  const items: ScheduleItem[] = section.content.scheduleItems ?? DEFAULT_SCHEDULE_ITEMS
  const partnerItems: ScheduleItem[] = section.content.partnerItems ?? DEFAULT_PARTNER_ITEMS

  const sectionTitle: string = section.content.title ?? 'SCHEDULE OF CONTENT PRODUCTION'
  const sectionSubtitle: string = section.content.subtitle ?? 'Timeline of content production and roll out'
  const partnerTitle: string = section.content.partnerTitle ?? 'SPECIFIC PRODUCTION ON LOCATION FOR TAD PARTNERS'
  const partnerSubtitle: string = section.content.partnerSubtitle ?? 'Production on location for partner brands'

  const editClass = editMode
    ? 'cursor-text hover:outline hover:outline-1 hover:outline-[#38332A] hover:outline-dashed'
    : ''

  const headerFooterTextColor = '#E8E1D5'

  function makeUpdater(contentKey: string, currentItems: ScheduleItem[]) {
    return (id: string, field: keyof ScheduleItem, value: string | number) => {
      const updated = currentItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
      updateSectionContent(section.id, contentKey, updated)
    }
  }

  function makeAdder(contentKey: string, currentItems: ScheduleItem[], defaultChannels: string) {
    return () => {
      const newItem: ScheduleItem = {
        id: generateId(),
        event: 'New Event',
        location: '',
        date: '',
        startDate: '',
        endDate: '',
        channels: defaultChannels,
        liveOn: '',
        crew: 0,
      }
      updateSectionContent(section.id, contentKey, [...currentItems, newItem])
    }
  }

  function makeRemover(contentKey: string, currentItems: ScheduleItem[]) {
    return (id: string) => {
      updateSectionContent(section.id, contentKey, currentItems.filter((item) => item.id !== id))
    }
  }

  return (
    <section className="py-16 md:py-24 px-4 sm:px-8 md:px-16 bg-background">
      <div className="max-w-7xl mx-auto">

        {/* Section header */}
        <div className="mb-16 md:mb-20">
          <div className="flex items-center gap-4 mb-6">
            <div style={{ width: 48, height: 1, background: '#C49434' }} />
            <span style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.72rem',
              letterSpacing: '0.22em',
              color: '#C49434',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}>
              PRODUKSJONSPLAN
            </span>
          </div>
          <h2 style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: 'clamp(2.5rem, 4.5vw, 4rem)',
            fontWeight: 300,
            fontStyle: 'italic',
            color: '#E8E1D5',
            lineHeight: 1.2,
            maxWidth: '42ch',
          }}>
            Oversikt over produksjonsdager og innholdsleveranser
          </h2>
        </div>

        {/* Partner table — above main schedule */}
        <TableBlock
          title={partnerTitle}
          subtitle={partnerSubtitle}
          items={partnerItems}
          editMode={editMode}
          headerFooterTextColor={headerFooterTextColor}
          editClass={editClass}
          onUpdateTitle={(val) => updateSectionContent(section.id, 'partnerTitle', val)}
          onUpdateSubtitle={(val) => updateSectionContent(section.id, 'partnerSubtitle', val)}
          onUpdateItem={makeUpdater('partnerItems', partnerItems)}
          onAddRow={makeAdder('partnerItems', partnerItems, 'Web, Screen')}
          onRemoveRow={makeRemover('partnerItems', partnerItems)}
          showScrollHint
        />

        {/* Main production schedule */}
        <TableBlock
          title={sectionTitle}
          subtitle={sectionSubtitle}
          items={items}
          editMode={editMode}
          headerFooterTextColor={headerFooterTextColor}
          editClass={editClass}
          onUpdateTitle={(val) => updateSectionContent(section.id, 'title', val)}
          onUpdateSubtitle={(val) => updateSectionContent(section.id, 'subtitle', val)}
          onUpdateItem={makeUpdater('scheduleItems', items)}
          onAddRow={makeAdder('scheduleItems', items, 'IG, TikTok, YouTube')}
          onRemoveRow={makeRemover('scheduleItems', items)}
          showScrollHint
        />

      </div>
    </section>
  )
}
