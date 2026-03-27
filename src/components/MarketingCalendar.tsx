'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

type EventCategory = 'linkedin' | 'email' | 'workshop' | 'cohort'
type EventStatus = 'planned' | 'draft' | 'scheduled' | 'published' | 'completed'

interface LinkedInMetadata {
  copy?: string
  hashtags?: string
  image_url?: string
  post_type?: 'text' | 'image' | 'carousel' | 'video' | 'article'
}

interface EmailMetadata {
  subject?: string
  audience?: string
  template_name?: string
  send_count?: number
}

interface WorkshopMetadata {
  venue?: string
  capacity?: number
  registration_url?: string
  event_name?: string
  speaker?: string
}

interface CohortMetadata {
  cohort_name?: string
  cohort_size?: number
  program_url?: string
  duration_weeks?: number
}

type EventMetadata = LinkedInMetadata | EmailMetadata | WorkshopMetadata | CohortMetadata

interface MarketingEvent {
  id: string
  date: string
  title: string
  category: EventCategory
  status: EventStatus
  time?: string
  notes?: string
  metadata: EventMetadata
}

// ─── Config ──────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<EventCategory, { label: string; color: string; bg: string; icon: string }> = {
  linkedin:  { label: 'LinkedIn Post',    color: '#6B8DD6', bg: 'rgba(107, 141, 214, 0.15)', icon: 'in' },
  email:     { label: 'Marketing Email',  color: '#D6A56B', bg: 'rgba(214, 165, 107, 0.15)', icon: '@'  },
  workshop:  { label: 'Workshop',         color: '#5B9A8B', bg: 'rgba(91, 154, 139, 0.15)',  icon: 'W'  },
  cohort:    { label: 'Cohort Start',     color: '#D66BB0', bg: 'rgba(214, 107, 176, 0.15)', icon: 'C'  },
}

const STATUS_CONFIG: Record<EventStatus, { label: string; color: string }> = {
  planned:   { label: 'Planned',   color: 'rgba(232, 230, 227, 0.4)' },
  draft:     { label: 'Draft',     color: '#D6A56B' },
  scheduled: { label: 'Scheduled', color: '#6B8DD6' },
  published: { label: 'Published', color: '#5B9A8B' },
  completed: { label: 'Completed', color: '#5B9A8B' },
}

const CATEGORIES = Object.keys(CATEGORY_CONFIG) as EventCategory[]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateWeeks(startDate: string, numWeeks: number): string[][] {
  const weeks: string[][] = []
  const start = new Date(startDate + 'T00:00:00')
  const day = start.getDay()
  const diff = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + diff)

  for (let w = 0; w < numWeeks; w++) {
    const week: string[] = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(start)
      date.setDate(start.getDate() + w * 7 + d)
      week.push(date.toISOString().split('T')[0])
    }
    weeks.push(week)
  }
  return weeks
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatWeekLabel(week: string[]): string {
  const start = new Date(week[0] + 'T00:00:00')
  const end = new Date(week[6] + 'T00:00:00')
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = start.getMonth() === end.getMonth()
    ? end.getDate().toString()
    : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${startStr}\u2013${endStr}`
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split('T')[0]
}

function isPast(dateStr: string): boolean {
  return dateStr < new Date().toISOString().split('T')[0]
}

const inputClass = 'w-full bg-[var(--color-card)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-teal)] placeholder:text-[var(--color-text-muted)]'

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiGet(): Promise<MarketingEvent[]> {
  const res = await fetch('/api/marketing-calendar')
  if (!res.ok) return []
  return res.json()
}

async function apiCreate(event: Omit<MarketingEvent, 'id'>): Promise<MarketingEvent | null> {
  const res = await fetch('/api/marketing-calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  })
  if (!res.ok) return null
  return res.json()
}

async function apiUpdate(event: MarketingEvent): Promise<MarketingEvent | null> {
  const res = await fetch('/api/marketing-calendar', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  })
  if (!res.ok) return null
  return res.json()
}

async function apiDelete(id: string): Promise<boolean> {
  const res = await fetch(`/api/marketing-calendar?id=${id}`, { method: 'DELETE' })
  return res.ok
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MarketingCalendar({ initialEvents }: { initialEvents?: MarketingEvent[] }) {
  const [events, setEvents] = useState<MarketingEvent[]>(initialEvents ?? [])
  const [showModal, setShowModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<MarketingEvent | null>(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [filterCategory, setFilterCategory] = useState<EventCategory | 'all'>('all')
  const [saving, setSaving] = useState(false)

  const refreshEvents = useCallback(async () => {
    const data = await apiGet()
    setEvents(data)
  }, [])

  useEffect(() => {
    if (!initialEvents) refreshEvents()
  }, [initialEvents, refreshEvents])

  const weeks = generateWeeks('2026-03-23', 8)
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  function handleAddEvent(date: string) {
    setEditingEvent(null)
    setSelectedDate(date)
    setShowModal(true)
  }

  function handleEditEvent(event: MarketingEvent) {
    setEditingEvent(event)
    setSelectedDate(event.date)
    setShowModal(true)
  }

  async function handleDeleteEvent(id: string) {
    setSaving(true)
    const ok = await apiDelete(id)
    if (ok) setEvents(prev => prev.filter(e => e.id !== id))
    setSaving(false)
    setShowModal(false)
    setEditingEvent(null)
  }

  async function handleSaveEvent(payload: Omit<MarketingEvent, 'id'>) {
    setSaving(true)
    if (editingEvent) {
      const updated = await apiUpdate({ ...payload, id: editingEvent.id })
      if (updated) setEvents(prev => prev.map(e => e.id === editingEvent.id ? updated : e))
    } else {
      const created = await apiCreate(payload)
      if (created) setEvents(prev => [...prev, created])
    }
    setSaving(false)
    setShowModal(false)
    setEditingEvent(null)
  }

  function getEventsForDate(date: string) {
    return events
      .filter(e => e.date === date)
      .filter(e => filterCategory === 'all' || e.category === filterCategory)
      .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  }

  // Stats
  const totalEvents = events.length
  const categoryBreakdown = CATEGORIES.map(cat => ({
    ...CATEGORY_CONFIG[cat],
    category: cat,
    count: events.filter(e => e.category === cat).length,
  })).filter(c => c.count > 0)

  return (
    <div>
      {/* Stats bar */}
      <div className="flex items-center gap-6 mb-6 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-semibold text-[var(--color-text-primary)]">{totalEvents}</span>
          <span className="text-sm text-[var(--color-text-secondary)]">events planned</span>
        </div>
        <div className="h-5 w-px bg-[var(--color-border)]" />
        <div className="flex items-center gap-3 flex-wrap">
          {categoryBreakdown.map(cat => (
            <span key={cat.category} className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full" style={{ background: cat.color }} />
              <span style={{ color: cat.color }}>{cat.count} {cat.label}</span>
            </span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-[var(--color-text-muted)]">Filter:</label>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value as EventCategory | 'all')}
            className="text-xs bg-[var(--color-card)] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:border-[var(--color-teal)]"
          >
            <option value="all">All Types</option>
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{CATEGORY_CONFIG[cat].label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-[100px] p-2 text-left kith-label">Week</th>
              {dayLabels.map(day => (
                <th key={day} className="p-2 text-center kith-label">{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi} className="border-t border-[var(--color-border)]">
                <td className="p-2 align-top">
                  <span className="text-xs text-[var(--color-text-tertiary)] font-mono whitespace-nowrap">
                    {formatWeekLabel(week)}
                  </span>
                  <span className="block text-[10px] text-[var(--color-text-muted)]">Wk {wi + 1}</span>
                </td>
                {week.map(date => {
                  const dayEvents = getEventsForDate(date)
                  const today = isToday(date)
                  const past = isPast(date)
                  return (
                    <td
                      key={date}
                      onClick={() => handleAddEvent(date)}
                      className={`p-1 align-top min-w-[120px] border-l border-[var(--color-border)] transition-colors group cursor-pointer hover:bg-[rgba(91,154,139,0.04)] ${
                        today ? 'bg-[rgba(91,154,139,0.06)]' : ''
                      } ${past ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-1 px-1">
                        <span className={`text-xs font-mono ${
                          today ? 'text-[#5B9A8B] font-semibold' : 'text-[var(--color-text-tertiary)]'
                        }`}>
                          {formatDate(date)}
                        </span>
                        <span className="w-4 h-4 flex items-center justify-center rounded text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                          +
                        </span>
                      </div>
                      <div className="space-y-0.5 min-h-[40px]">
                        {dayEvents.map(event => {
                          const cfg = CATEGORY_CONFIG[event.category]
                          return (
                            <button
                              key={event.id}
                              onClick={(e) => { e.stopPropagation(); handleEditEvent(event) }}
                              className="w-full text-left px-1.5 py-1 rounded text-[11px] leading-tight transition-all hover:brightness-125"
                              style={{
                                background: cfg.bg,
                                color: cfg.color,
                                borderLeft: `2px solid ${cfg.color}`,
                              }}
                              title={event.title}
                            >
                              <span className="flex items-center gap-1">
                                <span className="font-mono text-[9px] opacity-60 shrink-0">{cfg.icon}</span>
                                <span className="truncate">{event.title}</span>
                              </span>
                              {event.time && (
                                <span className="block text-[9px] opacity-50 mt-0.5">{event.time}</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex items-center gap-4 flex-wrap">
        <span className="text-xs text-[var(--color-text-muted)]">Types:</span>
        {CATEGORIES.map(cat => (
          <span key={cat} className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
            <span
              className="w-2.5 h-2.5 rounded-sm flex items-center justify-center text-[8px] font-mono"
              style={{
                background: CATEGORY_CONFIG[cat].bg,
                color: CATEGORY_CONFIG[cat].color,
                borderLeft: `2px solid ${CATEGORY_CONFIG[cat].color}`,
              }}
            />
            {CATEGORY_CONFIG[cat].label}
          </span>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <EventModal
          date={selectedDate}
          event={editingEvent}
          saving={saving}
          onSave={handleSaveEvent}
          onDelete={editingEvent ? () => handleDeleteEvent(editingEvent.id) : undefined}
          onClose={() => { setShowModal(false); setEditingEvent(null) }}
        />
      )}
    </div>
  )
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function EventModal({
  date,
  event,
  saving,
  onSave,
  onDelete,
  onClose,
}: {
  date: string
  event: MarketingEvent | null
  saving: boolean
  onSave: (event: Omit<MarketingEvent, 'id'>) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(event?.title ?? '')
  const [category, setCategory] = useState<EventCategory>(event?.category ?? 'linkedin')
  const [status, setStatus] = useState<EventStatus>(event?.status ?? 'planned')
  const [time, setTime] = useState(event?.time ?? '')
  const [notes, setNotes] = useState(event?.notes ?? '')
  const [eventDate, setEventDate] = useState(date)
  const [metadata, setMetadata] = useState<EventMetadata>(event?.metadata ?? {})

  // Reset metadata when category changes (only for new events)
  useEffect(() => {
    if (!event) setMetadata({})
  }, [category, event])

  function updateMeta(key: string, value: string | number) {
    setMetadata(prev => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onSave({
      date: eventDate,
      title: title.trim(),
      category,
      status,
      time: time || undefined,
      notes: notes.trim() || undefined,
      metadata,
    })
  }

  const catCfg = CATEGORY_CONFIG[category]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="kith-card w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--color-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header with category color accent */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <span
              className="w-8 h-8 rounded flex items-center justify-center text-sm font-mono font-bold"
              style={{ background: catCfg.bg, color: catCfg.color }}
            >
              {catCfg.icon}
            </span>
            <div>
              <h3 className="text-base font-medium text-[var(--color-text-primary)]">
                {event ? 'Edit Event' : 'New Event'}
              </h3>
              <span className="text-xs font-mono text-[var(--color-text-tertiary)]">
                {formatDate(eventDate)}
              </span>
            </div>
          </div>
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded"
            style={{ background: catCfg.bg, color: catCfg.color }}
          >
            {catCfg.label}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Common fields */}
          <div>
            <label className="kith-label block mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={category === 'linkedin' ? 'e.g. AI in Climate — thought leadership post' :
                category === 'email' ? 'e.g. Workshop reminder — registered leads' :
                category === 'workshop' ? 'e.g. Green Skills Workshop #5' :
                'e.g. Cohort 2 — June Start'}
              className={inputClass}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="kith-label block mb-1.5">Type</label>
              <select value={category} onChange={e => setCategory(e.target.value as EventCategory)} className={inputClass}>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{CATEGORY_CONFIG[cat].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="kith-label block mb-1.5">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as EventStatus)} className={inputClass}>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="kith-label block mb-1.5">Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="kith-label block mb-1.5">Date</label>
            <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className={inputClass} />
          </div>

          {/* ── Category-specific fields ── */}
          <div className="border-t border-[var(--color-border)] pt-4">
            <span className="kith-label block mb-3" style={{ color: catCfg.color }}>
              {catCfg.label} Details
            </span>

            {category === 'linkedin' && (
              <LinkedInFields metadata={metadata as LinkedInMetadata} updateMeta={updateMeta} />
            )}
            {category === 'email' && (
              <EmailFields metadata={metadata as EmailMetadata} updateMeta={updateMeta} />
            )}
            {category === 'workshop' && (
              <WorkshopFields metadata={metadata as WorkshopMetadata} updateMeta={updateMeta} />
            )}
            {category === 'cohort' && (
              <CohortFields metadata={metadata as CohortMetadata} updateMeta={updateMeta} />
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="kith-label block mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Additional details..."
              className={inputClass + ' resize-none'}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={saving}
                className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
              >
                Delete event
              </button>
            ) : <div />}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || saving}
                className="px-4 py-1.5 text-sm rounded font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: catCfg.bg, color: catCfg.color }}
              >
                {saving ? 'Saving...' : event ? 'Update' : 'Add Event'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Category-specific field components ──────────────────────────────────────

function LinkedInFields({ metadata, updateMeta }: { metadata: LinkedInMetadata; updateMeta: (k: string, v: string) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="kith-label block mb-1.5">Post Type</label>
        <select value={metadata.post_type ?? 'text'} onChange={e => updateMeta('post_type', e.target.value)} className={inputClass}>
          <option value="text">Text</option>
          <option value="image">Image</option>
          <option value="carousel">Carousel</option>
          <option value="video">Video</option>
          <option value="article">Article</option>
        </select>
      </div>
      <div>
        <label className="kith-label block mb-1.5">Copy / Key Message</label>
        <textarea
          value={metadata.copy ?? ''}
          onChange={e => updateMeta('copy', e.target.value)}
          rows={3}
          placeholder="Post copy or key talking points..."
          className={inputClass + ' resize-none'}
        />
      </div>
      <div>
        <label className="kith-label block mb-1.5">Hashtags</label>
        <input
          type="text"
          value={metadata.hashtags ?? ''}
          onChange={e => updateMeta('hashtags', e.target.value)}
          placeholder="#ClimateAI #GreenSkills #Sustainability"
          className={inputClass}
        />
      </div>
      <div>
        <label className="kith-label block mb-1.5">Image URL</label>
        <input
          type="text"
          value={metadata.image_url ?? ''}
          onChange={e => updateMeta('image_url', e.target.value)}
          placeholder="https://..."
          className={inputClass}
        />
      </div>
    </div>
  )
}

function EmailFields({ metadata, updateMeta }: { metadata: EmailMetadata; updateMeta: (k: string, v: string) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="kith-label block mb-1.5">Subject Line</label>
        <input
          type="text"
          value={metadata.subject ?? ''}
          onChange={e => updateMeta('subject', e.target.value)}
          placeholder="e.g. You're invited: Green Skills Workshop"
          className={inputClass}
        />
      </div>
      <div>
        <label className="kith-label block mb-1.5">Audience / Segment</label>
        <input
          type="text"
          value={metadata.audience ?? ''}
          onChange={e => updateMeta('audience', e.target.value)}
          placeholder="e.g. All registered leads, Workshop attendees"
          className={inputClass}
        />
      </div>
      <div>
        <label className="kith-label block mb-1.5">Template Name</label>
        <input
          type="text"
          value={metadata.template_name ?? ''}
          onChange={e => updateMeta('template_name', e.target.value)}
          placeholder="e.g. workshop-invite, cohort-announcement"
          className={inputClass}
        />
      </div>
    </div>
  )
}

function WorkshopFields({ metadata, updateMeta }: { metadata: WorkshopMetadata; updateMeta: (k: string, v: string) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="kith-label block mb-1.5">Event Name</label>
        <input
          type="text"
          value={metadata.event_name ?? ''}
          onChange={e => updateMeta('event_name', e.target.value)}
          placeholder="e.g. Green Skills Workshop #5"
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="kith-label block mb-1.5">Venue</label>
          <input
            type="text"
            value={metadata.venue ?? ''}
            onChange={e => updateMeta('venue', e.target.value)}
            placeholder="e.g. Zoom, In-person London"
            className={inputClass}
          />
        </div>
        <div>
          <label className="kith-label block mb-1.5">Capacity</label>
          <input
            type="number"
            value={metadata.capacity ?? ''}
            onChange={e => updateMeta('capacity', e.target.value)}
            placeholder="e.g. 50"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className="kith-label block mb-1.5">Speaker</label>
        <input
          type="text"
          value={metadata.speaker ?? ''}
          onChange={e => updateMeta('speaker', e.target.value)}
          placeholder="e.g. Diego Espinosa"
          className={inputClass}
        />
      </div>
      <div>
        <label className="kith-label block mb-1.5">Registration URL</label>
        <input
          type="text"
          value={metadata.registration_url ?? ''}
          onChange={e => updateMeta('registration_url', e.target.value)}
          placeholder="https://..."
          className={inputClass}
        />
      </div>
    </div>
  )
}

function CohortFields({ metadata, updateMeta }: { metadata: CohortMetadata; updateMeta: (k: string, v: string) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="kith-label block mb-1.5">Cohort Name</label>
        <input
          type="text"
          value={metadata.cohort_name ?? ''}
          onChange={e => updateMeta('cohort_name', e.target.value)}
          placeholder="e.g. Cohort 2 — June 2026"
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="kith-label block mb-1.5">Cohort Size</label>
          <input
            type="number"
            value={metadata.cohort_size ?? ''}
            onChange={e => updateMeta('cohort_size', e.target.value)}
            placeholder="e.g. 20"
            className={inputClass}
          />
        </div>
        <div>
          <label className="kith-label block mb-1.5">Duration (weeks)</label>
          <input
            type="number"
            value={metadata.duration_weeks ?? ''}
            onChange={e => updateMeta('duration_weeks', e.target.value)}
            placeholder="e.g. 6"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className="kith-label block mb-1.5">Program URL</label>
        <input
          type="text"
          value={metadata.program_url ?? ''}
          onChange={e => updateMeta('program_url', e.target.value)}
          placeholder="https://kithclimate.com/cohort"
          className={inputClass}
        />
      </div>
    </div>
  )
}
