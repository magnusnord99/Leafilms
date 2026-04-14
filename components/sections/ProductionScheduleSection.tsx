'use client'

import { Section } from '@/lib/types'
import { Heading, Text } from '@/components/ui'

type ScheduleItem = {
  id: string
  event: string
  startDate: string
  endDate: string
  topic: string
  capture: string
  edit: string
  channels: string
  liveOn: string
}

const DEFAULT_SCHEDULE_ITEMS: ScheduleItem[] = [
  {
    id: '1',
    event: 'Camp June 9-11',
    startDate: '2026-06-09',
    endDate: '2026-06-11',
    topic: '',
    capture: '',
    edit: '',
    channels: 'IG, TikTok, YouTube',
    liveOn: 'July 1st',
  },
  {
    id: '2',
    event: 'Altitude Camp September, Europe (TBD)',
    startDate: '2026-09-01',
    endDate: '2026-09-14',
    topic: '',
    capture: '',
    edit: '',
    channels: 'IG, TikTok, YouTube',
    liveOn: 'October 1st',
  },
  {
    id: '3',
    event: 'Training Camp October, Spain (TBD)',
    startDate: '2026-10-01',
    endDate: '2026-10-14',
    topic: '',
    capture: '',
    edit: '',
    channels: 'IG, TikTok, YouTube',
    liveOn: 'November 1st',
  },
  {
    id: '4',
    event: 'Season Opening November 19th-21th, Norway',
    startDate: '2026-11-19',
    endDate: '2026-11-21',
    topic: '',
    capture: '',
    edit: '',
    channels: 'IG, TikTok, YouTube',
    liveOn: 'November 25th',
  },
  {
    id: '5',
    event: 'Norwegian Championships January 2027',
    startDate: '2027-01-15',
    endDate: '2027-01-19',
    topic: '',
    capture: '',
    edit: '',
    channels: 'IG, TikTok, YouTube',
    liveOn: 'January 20th?',
  },
  {
    id: '6',
    event: 'Marcialonga January 31st 2027, Italy',
    startDate: '2027-01-31',
    endDate: '2027-02-02',
    topic: '',
    capture: '',
    edit: '',
    channels: 'IG, TikTok, YouTube',
    liveOn: 'February 7th',
  },
  {
    id: '7',
    event: 'World Championships Falun Sweden, February 2027',
    startDate: '2027-02-19',
    endDate: '2027-03-02',
    topic: '',
    capture: '',
    edit: '',
    channels: 'IG, TikTok, YouTube',
    liveOn: 'March 1st',
  },
  {
    id: '8',
    event: 'Ski Classics Season Final March 2027',
    startDate: '2027-03-20',
    endDate: '2027-03-23',
    topic: '',
    capture: '',
    edit: '',
    channels: 'IG, TikTok, YouTube',
    liveOn: 'April 1st',
  },
]

function getDays(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return diff + 1
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

const COLUMNS = ['EVENT', 'TOPIC', 'CAPTURE', 'EDIT', 'CHANNELS', 'LIVE ON', 'DAYS']

type ProductionScheduleSectionProps = {
  section: Section
  editMode: boolean
  updateSectionContent: (sectionId: string, key: string, value: any) => void
}

export function ProductionScheduleSection({
  section,
  editMode,
  updateSectionContent,
}: ProductionScheduleSectionProps) {
  const items: ScheduleItem[] = section.content.scheduleItems ?? DEFAULT_SCHEDULE_ITEMS
  const sectionTitle: string = section.content.title ?? 'SCHEDULE OF CONTENT PRODUCTION'
  const sectionSubtitle: string = section.content.subtitle ?? 'Timeline of content production and roll out'

  function updateItem(id: string, field: keyof ScheduleItem, value: string) {
    const updated = items.map((item) =>
      item.id === id ? { ...item, [field]: value } : item
    )
    updateSectionContent(section.id, 'scheduleItems', updated)
  }

  function addRow() {
    const newItem: ScheduleItem = {
      id: generateId(),
      event: 'New Event',
      startDate: '',
      endDate: '',
      topic: '',
      capture: '',
      edit: '',
      channels: 'IG, TikTok, YouTube',
      liveOn: '',
    }
    updateSectionContent(section.id, 'scheduleItems', [...items, newItem])
  }

  function removeRow(id: string) {
    updateSectionContent(
      section.id,
      'scheduleItems',
      items.filter((item) => item.id !== id)
    )
  }

  const editClass = editMode
    ? 'cursor-text hover:outline hover:outline-2 hover:outline-dark/20 hover:outline-dashed rounded'
    : ''

  return (
    <section className="py-section px-2 md:px-4 bg-background">
      <div className="max-w-7xl mx-auto">

        {/* Section header — same pattern as other sections */}
        <div className="mb-10">
          <Heading
            as="h3"
            className={`mb-2 ${editMode ? 'cursor-text hover:outline hover:outline-2 hover:outline-dark/20 hover:outline-dashed rounded px-1' : ''}`}
            contentEditable={editMode}
            suppressContentEditableWarning
            onBlur={(e) => {
              if (editMode) {
                updateSectionContent(section.id, 'title', e.currentTarget.textContent || '')
              }
            }}
          >
            {sectionTitle}
          </Heading>
          <Text
            variant="body"
            className={`opacity-60 ${editMode ? 'cursor-text hover:outline hover:outline-2 hover:outline-dark/20 hover:outline-dashed rounded px-1' : ''}`}
            contentEditable={editMode}
            suppressContentEditableWarning
            onBlur={(e) => {
              if (editMode) {
                updateSectionContent(section.id, 'subtitle', e.currentTarget.textContent || '')
              }
            }}
          >
            {sectionSubtitle}
          </Text>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr style={{ backgroundColor: 'var(--color-background-widget-dark)' }}>
                {COLUMNS.map((col) => (
                  <th
                    key={col}
                    className="px-5 py-4 text-left text-xs font-bold uppercase tracking-widest"
                    style={{ color: 'var(--color-background-widget)' }}
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
                    : null

                const rowStyle: React.CSSProperties =
                  index % 2 === 0
                    ? { backgroundColor: 'var(--color-background-widget)' }
                    : { backgroundColor: 'var(--color-background-widget-medium)' }

                const cellBase = `px-5 py-4 text-sm text-dark align-top`

                return (
                  <tr key={item.id} style={rowStyle}>
                    {/* EVENT */}
                    <td
                      className={`${cellBase} font-semibold w-[200px] ${editClass}`}
                      contentEditable={editMode}
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        if (editMode) updateItem(item.id, 'event', e.currentTarget.textContent || '')
                      }}
                    >
                      {item.event}
                    </td>

                    {/* TOPIC */}
                    <td
                      className={`${cellBase} ${editClass}`}
                      contentEditable={editMode}
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        if (editMode) updateItem(item.id, 'topic', e.currentTarget.textContent || '')
                      }}
                    >
                      {item.topic}
                    </td>

                    {/* CAPTURE */}
                    <td
                      className={`${cellBase} ${editClass}`}
                      contentEditable={editMode}
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        if (editMode) updateItem(item.id, 'capture', e.currentTarget.textContent || '')
                      }}
                    >
                      {item.capture}
                    </td>

                    {/* EDIT */}
                    <td
                      className={`${cellBase} ${editClass}`}
                      contentEditable={editMode}
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        if (editMode) updateItem(item.id, 'edit', e.currentTarget.textContent || '')
                      }}
                    >
                      {item.edit}
                    </td>

                    {/* CHANNELS */}
                    <td
                      className={`${cellBase} ${editClass}`}
                      contentEditable={editMode}
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        if (editMode) updateItem(item.id, 'channels', e.currentTarget.textContent || '')
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
                        if (editMode) updateItem(item.id, 'liveOn', e.currentTarget.textContent || '')
                      }}
                    >
                      {item.liveOn}
                    </td>

                    {/* DAYS */}
                    <td className={`${cellBase} whitespace-nowrap min-w-[90px]`}>
                      {days !== null && (
                        <span className="font-semibold">{days}d</span>
                      )}
                      {editMode && (
                        <div className="mt-2 flex flex-col gap-1">
                          <input
                            type="date"
                            className="text-xs rounded px-1.5 py-1 w-full border border-dark/20 bg-background focus:outline-none"
                            value={item.startDate}
                            onChange={(e) => updateItem(item.id, 'startDate', e.target.value)}
                            title="Start date"
                          />
                          <input
                            type="date"
                            className="text-xs rounded px-1.5 py-1 w-full border border-dark/20 bg-background focus:outline-none"
                            value={item.endDate}
                            onChange={(e) => updateItem(item.id, 'endDate', e.target.value)}
                            title="End date"
                          />
                        </div>
                      )}
                    </td>

                    {/* Remove row button */}
                    {editMode && (
                      <td className="px-3 py-4 text-center align-top">
                        <button
                          onClick={() => removeRow(item.id)}
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
                  colSpan={6}
                  className="px-5 py-4 text-xs font-bold uppercase tracking-widest text-right"
                  style={{ color: 'var(--color-background-widget)' }}
                >
                  Totalt
                </td>
                <td
                  className="px-5 py-4 text-xs font-bold uppercase tracking-widest whitespace-nowrap"
                  style={{ color: 'var(--color-background-widget)' }}
                >
                  {items.reduce((sum, item) => {
                    if (!item.startDate || !item.endDate) return sum
                    return sum + getDays(item.startDate, item.endDate)
                  }, 0)}d
                </td>
                {editMode && <td />}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Add row */}
        {editMode && (
          <div className="mt-4">
            <button
              onClick={addRow}
              className="text-sm text-dark opacity-50 hover:opacity-100 border border-dark/30 hover:border-dark/60 rounded px-4 py-2 transition-opacity"
            >
              + Legg til rad
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
