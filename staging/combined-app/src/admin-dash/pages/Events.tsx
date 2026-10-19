import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

interface Sale {
  orderId: string
  name?: string
  email?: string
  event: string
  eventId?: string
  amount: number
  customerTotal?: number
  quantity?: number
  status: string
  scannedAt?: string
  createdAt: string
  gender?: string
  ticketType?: string
}

interface Props {
  sales: Sale[]
  adminKey?: string
  onNavigateToTickets?: () => void
}

const PAID_STATUSES = ['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned']

function eventNameForSale(sale: Sale) {
  return String(sale.event || 'Unassigned event').trim() || 'Unassigned event'
}

function amountForSale(sale: Sale) {
  const amount = Number(sale.customerTotal ?? sale.amount ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function metaForEvent(name: string) {
  return { gradient: 'linear-gradient(135deg, #6C4CE0 0%, #3B63E8 100%)', icon: '🎟', tagline: name || 'Event dashboard' }
}

function lineupForEvent(name: string) {
  return [{ time: 'Event details', name, stage: 'Venue managed by organizer', status: 'Configured', badge: 'green' }]
}

interface DashboardEvent { id: string; name: string; status?: string; active?: boolean; city?: string; venue?: string; date?: string; startsAt?: string; category?: string; companyId?: string }

export default function Events({ sales = [], adminKey, onNavigateToTickets }: Props) {
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [catalogEvents, setCatalogEvents] = useState<DashboardEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsLoadError, setEventsLoadError] = useState('')
  const [eventSearch, setEventSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [eventSort, setEventSort] = useState('name')
  const [eventPage, setEventPage] = useState(1)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [draft, setDraft] = useState({ name: '', companyId: '', city: '', venue: '', category: '', ticketName: '', price: '' })

  const authHeaders = () => ({
    'x-auth-token': sessionStorage.getItem('littx_token') || '',
    ...(adminKey ? { 'x-admin-key': adminKey } : {}),
  })

  useEffect(() => {
    fetch('/api/admin/events', { headers: authHeaders() })
      .then(async response => {
        const data = await response.json()
        if (!response.ok || !data.success || !Array.isArray(data.events)) throw new Error(data.message || 'Events could not be loaded.')
        setCatalogEvents(data.events)
      })
      .catch((error: unknown) => setEventsLoadError(error instanceof Error ? error.message : 'Events could not be loaded.'))
      .finally(() => setEventsLoading(false))
  }, [])

  async function createEvent(event: FormEvent) {
    event.preventDefault()
    setCreateBusy(true); setCreateError('')
    try {
      const response = await fetch('/api/admin/events', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name, companyId: draft.companyId, city: draft.city, venue: draft.venue, category: draft.category,
          ticketCategories: draft.ticketName ? [{ name: draft.ticketName, price: Number(draft.price) }] : []
        })
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Event could not be created.')
      setCatalogEvents(current => [...current, data.event])
      setDraft({ name: '', companyId: '', city: '', venue: '', category: '', ticketName: '', price: '' })
      setShowCreateForm(false)
    } catch (reason) { setCreateError(reason instanceof Error ? reason.message : 'Event could not be created.') }
    finally { setCreateBusy(false) }
  }

  async function transitionEvent(record: DashboardEvent, status: string) {
    const confirmations: Record<string, string> = {
      published: `Publish ${record.name}? It will become visible according to its event visibility setting.`,
      cancelled: `Cancel ${record.name}? This changes its lifecycle state for attendees and sales.`,
      completed: `Mark ${record.name} completed and archive it from active-event listings? Existing orders and tickets will be preserved.`,
    }
    if (confirmations[status] && !window.confirm(confirmations[status])) return
    try {
      const response = await fetch(`/api/admin/events/${encodeURIComponent(record.id)}/transition`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ status })
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Event status could not be changed.')
      setCatalogEvents(current => current.map(item => item.id === record.id ? data.event : item))
    } catch (reason) { setCreateError(reason instanceof Error ? reason.message : 'Event status could not be changed.') }
  }

  const currentRole = (() => { try { return JSON.parse(sessionStorage.getItem('littx_user') || '{}').role || '' } catch { return '' } })()

  // Build event data map
  const eventMap = new Map<string, {
    name: string; totalRevenue: number; ticketsSold: number; scanned: number; firstSale: string; lastSale: string
  }>()

  const eventNames = new Set<string>(catalogEvents.map(event => event.name).filter(Boolean))
  sales.forEach((sale) => {
    const name = eventNameForSale(sale)
    eventNames.add(name)
  })

  eventNames.forEach(name => {
    eventMap.set(name, { name, totalRevenue: 0, ticketsSold: 0, scanned: 0, firstSale: '', lastSale: '' })
  })

  sales.forEach((s) => {
    const name = eventNameForSale(s)
    const isPaid = PAID_STATUSES.includes(s.status) && (!(s as any).paymentStatus || (s as any).paymentStatus === 'paid')

    const entry = eventMap.get(name) || { name, totalRevenue: 0, ticketsSold: 0, scanned: 0, firstSale: '', lastSale: '' }
    eventMap.set(name, entry)
    if (isPaid) {
      entry.totalRevenue += amountForSale(s)
      entry.ticketsSold += Math.max(0, Number((s as any).admissionCount) || Number(s.quantity) || 1)
    }
    if (s.scannedAt || s.status === 'scanned') {
      entry.scanned += Math.max(0, Number((s as any).scannedAdmissionCount) || Number((s as any).admissionCount) || Number(s.quantity) || 1)
    }
    if (s.createdAt) {
      if (!entry.firstSale || s.createdAt < entry.firstSale) entry.firstSale = s.createdAt
      if (!entry.lastSale || s.createdAt > entry.lastSale) entry.lastSale = s.createdAt
    }
  })

  const events = Array.from(eventMap.values())
  const totalRevenueSum = events.reduce((acc, evt) => acc + evt.totalRevenue, 0)
  const totalSoldSum = events.reduce((acc, evt) => acc + evt.ticketsSold, 0)
  const totalScanned = events.reduce((acc, evt) => acc + evt.scanned, 0)
  const eventStatus = (record?: DashboardEvent) => record ? String(record.status || (record.active === false ? 'draft' : 'published')).toLowerCase() : 'historical'
  const filteredEvents = events
    .filter(event => {
      const record = catalogEvents.find(item => item.name === event.name)
      const matchesSearch = `${event.name} ${record?.companyId || ''} ${record?.city || ''} ${record?.venue || ''}`.toLowerCase().includes(eventSearch.trim().toLowerCase())
      const status = eventStatus(record)
      return matchesSearch && (statusFilter === 'all' || status === statusFilter)
    })
    .sort((a, b) => eventSort === 'status'
      ? eventStatus(catalogEvents.find(item => item.name === a.name)).localeCompare(eventStatus(catalogEvents.find(item => item.name === b.name)))
      : eventSort === 'admissions' ? b.ticketsSold - a.ticketsSold : a.name.localeCompare(b.name))
  const eventsPerPage = 9
  const eventPageCount = Math.max(1, Math.ceil(filteredEvents.length / eventsPerPage))
  const pagedEvents = filteredEvents.slice((eventPage - 1) * eventsPerPage, eventPage * eventsPerPage)

  // ── Detail View ─────────────────────────────────────────────────────────
  if (selectedEvent) {
    const evtData = eventMap.get(selectedEvent) || { name: selectedEvent, totalRevenue: 0, ticketsSold: 0, scanned: 0, firstSale: '', lastSale: '' }
    const meta = metaForEvent(selectedEvent)
    const lineup = lineupForEvent(selectedEvent)
    const selectedRecord = catalogEvents.find(event => event.name === selectedEvent)
    meta.tagline = [selectedRecord?.venue, selectedRecord?.city, selectedRecord?.startsAt || selectedRecord?.date].filter(Boolean).join(' · ') || 'Historical sales event'
    const scanPct = evtData.ticketsSold > 0 ? Math.round((evtData.scanned / evtData.ticketsSold) * 100) : 0

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gutter)' }} className="fade-in-up">
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="btn-secondary" onClick={() => setSelectedEvent(null)} style={{ height: '32px', padding: '0 14px', fontSize: '11.5px' }}>
            ← All Events
          </button>
          <span style={{ color: 'var(--ink-faint)', fontSize: '12px' }}>/ {evtData.name}</span>
        </div>

        {/* Hero Profile Card */}
        <div style={{
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-card)',
        }}>
          {/* Banner */}
          <div style={{
            height: '140px',
            background: meta.gradient,
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-end',
            padding: '24px',
            color: '#fff',
          }}>
            <div style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
              background: 'radial-gradient(ellipse at 80% -20%, rgba(255,255,255,0.25), transparent 60%)',
              pointerEvents: 'none',
            }} />
            <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px' }}>
              <span className="badge" style={{ background: 'rgba(61,220,132,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
                <span className="badge-dot" style={{ background: selectedRecord?.status === 'published' ? '#3DDC84' : '#F5B942' }} /> {selectedRecord?.status || 'historical'}
              </span>
            </div>
            <div>
              <div style={{ fontSize: '32px', marginBottom: '4px' }}>{meta.icon}</div>
              <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>{evtData.name}</div>
              <div style={{ fontSize: '12px', opacity: 0.85, marginTop: '2px' }}>{meta.tagline}</div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{
            background: 'var(--panel)',
            padding: '20px 24px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
            borderTop: '1px solid var(--line)',
          }}>
            {[
              { label: 'PASSES SOLD', val: evtData.ticketsSold.toString() },
              { label: 'QR SCANNED', val: evtData.scanned.toString() },
              { label: 'SCAN RATE', val: `${scanPct}%` },
              { label: 'TOTAL REVENUE', val: `₹${evtData.totalRevenue.toLocaleString()}` },
            ].map(stat => (
              <div key={stat.label}>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--ink-faint)', marginBottom: '4px' }}>{stat.label}</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)' }}>{stat.val}</div>
              </div>
            ))}
          </div>
        </div>

        {selectedRecord && <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {selectedRecord.status === 'draft' && <button className="btn-secondary" onClick={() => transitionEvent(selectedRecord, 'pending_review')}>Submit for review</button>}
          {selectedRecord.status === 'pending_review' && currentRole === 'master_admin' && <button className="btn-primary" onClick={() => transitionEvent(selectedRecord, 'published')}>Publish event</button>}
          {selectedRecord.status === 'published' && <>
            <button className="btn-secondary" onClick={() => transitionEvent(selectedRecord, 'postponed')}>Postpone</button>
            <button className="btn-secondary" onClick={() => transitionEvent(selectedRecord, 'cancelled')}>Cancel event</button>
            <button className="btn-secondary" onClick={() => transitionEvent(selectedRecord, 'completed')}>Archive as completed</button>
          </>}
          {selectedRecord.status === 'postponed' && currentRole === 'master_admin' && <button className="btn-primary" onClick={() => transitionEvent(selectedRecord, 'published')}>Republish event</button>}
        </div>}
        {createError && <div role="alert" style={{ color: '#ff7777' }}>{createError}</div>}

        {/* Split Content */}
        <div className="main-row">
          {/* Left Column: Ticket Buyers */}
          <div className="left-col" style={{ flex: 1.2 }}>
            <div className="card">
              <div className="card-head">
                <h3>👥 Ticket Buyers ({(() => {
                  const buyersList = sales.filter(s => {
                    const category = eventNameForSale(s)
                    const isPaid = PAID_STATUSES.includes(s.status)
                    return isPaid && category === selectedEvent
                  })
                  return buyersList.length
                })()})</h3>
                <div className="muted-sm">Attendees registered for this event</div>
              </div>
              <div className="scroll" style={{ maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(() => {
                  const buyersList = sales.filter(s => {
                    const category = eventNameForSale(s)
                    const isPaid = PAID_STATUSES.includes(s.status)
                    return isPaid && category === selectedEvent
                  })

                  if (buyersList.length === 0) {
                    return (
                      <div style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-faint)', fontSize: '13px' }}>
                        No buyers registered yet.
                      </div>
                    )
                  }

                  return buyersList.map((s, idx) => (
                    <div
                      key={s.orderId || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        background: 'var(--panel-2)',
                        border: '1px solid var(--line)',
                        borderRadius: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          background: 'var(--grad-violet)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: '13px',
                          fontWeight: 700,
                        }}>
                          {(s.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{s.name || 'Unknown'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>{s.email || '—'}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
                          {`₹${amountForSale(s).toLocaleString()}`}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--ink-faint)' }}>{s.ticketType || s.gender || 'pass'}</div>
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </div>
          </div>

          {/* Right Column: Lineup & Schedule */}
          <div className="right-col">
            <div className="card">
              <div className="card-head">
                <h3>Event Schedule</h3>
                <div className="muted-sm">Confirmed lineup & times</div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {lineup.map((act, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px',
                    background: 'var(--panel-2)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                  }}>
                    <div style={{
                      padding: '4px 8px',
                      background: 'var(--panel-3)',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: 800,
                      color: 'var(--ink)',
                      minWidth: '65px',
                      textAlign: 'center',
                    }}>
                      {act.time}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)' }}>{act.name}</div>
                      <div style={{ fontSize: '10.5px', color: 'var(--ink-soft)' }}>{act.stage}</div>
                    </div>
                    <div>
                      <span className={`badge badge-${act.badge}`} style={{ fontSize: '9px' }}>
                        {act.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              
              <div style={{ marginTop: '20px' }}>
                <button className="btn-primary" style={{ width: '100%' }} onClick={() => onNavigateToTickets?.()}>
                  View Event Tickets →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Events Grid View ────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gutter)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div><h2 style={{ margin: 0 }}>Event management</h2><p className="muted-sm">Create organizer-owned drafts and review event status.</p></div>
        <button className="btn-primary" onClick={() => { setCreateError(''); setShowCreateForm(value => !value) }}>{showCreateForm ? 'Close form' : 'Create event'}</button>
      </div>
      {showCreateForm && <form className="card" onSubmit={createEvent} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>
        <input required placeholder="Event title" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} />
        <input placeholder="City" value={draft.city} onChange={event => setDraft({ ...draft, city: event.target.value })} />
        <input placeholder="Venue" value={draft.venue} onChange={event => setDraft({ ...draft, venue: event.target.value })} />
        <input placeholder="Category" value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })} />
        {currentRole === 'master_admin' && <input required placeholder="Organizer company ID" value={draft.companyId} onChange={event => setDraft({ ...draft, companyId: event.target.value })} />}
        <input placeholder="First ticket category" value={draft.ticketName} onChange={event => setDraft({ ...draft, ticketName: event.target.value })} />
        <input type="number" min="0" step="0.01" placeholder="Ticket price" value={draft.price} onChange={event => setDraft({ ...draft, price: event.target.value })} />
        <button className="btn-primary" disabled={createBusy}>{createBusy ? 'Saving…' : 'Save draft'}</button>
      </form>}
      {createError && <div role="alert" style={{ color: '#ff7777' }}>{createError}</div>}
      {eventsLoadError && <div role="alert" style={{ color: '#ff7777' }}>{eventsLoadError}</div>}
      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input aria-label="Search events" placeholder="Search event, organizer, venue or city" value={eventSearch} onChange={event => { setEventSearch(event.target.value); setEventPage(1) }} />
        <select aria-label="Filter event status" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setEventPage(1) }}>
          <option value="all">All statuses</option><option value="draft">Draft</option><option value="pending_review">Pending review</option><option value="published">Published</option><option value="postponed">Postponed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="historical">Historical</option>
        </select>
        <select aria-label="Sort events" value={eventSort} onChange={event => { setEventSort(event.target.value); setEventPage(1) }}>
          <option value="name">Sort by name</option><option value="status">Sort by status</option><option value="admissions">Sort by admissions</option>
        </select>
      </div>
      {/* KPI Row */}
      <div className="kpi-row">
        <div className="tile tile-teal">
          <div className="tile-label">EVENTS</div>
          <div className="tile-value">{catalogEvents.length}</div>
          <div className="tile-sub">{catalogEvents.filter(record => eventStatus(record) === 'published').length} active · {catalogEvents.filter(record => eventStatus(record) === 'draft').length} draft · {catalogEvents.filter(record => eventStatus(record) === 'completed').length} completed</div>
          <div className="tile-delta"><span>🟢</span> {catalogEvents.filter(record => eventStatus(record) === 'pending_review').length} pending review</div>
        </div>
        <div className="tile tile-gold">
          <div className="tile-label">TOTAL PASSES SOLD</div>
          <div className="tile-value">{totalSoldSum}</div>
          <div className="tile-sub">Across all visible events</div>
          <div className="tile-delta"><span>🎟</span> Active sales</div>
        </div>
        <div className="tile tile-orange">
          <div className="tile-label">TOTAL REVENUE</div>
          <div className="tile-value">₹{totalRevenueSum.toLocaleString()}</div>
          <div className="tile-sub">Verified gross income</div>
          <div className="tile-delta"><span>↑</span> Confirmed</div>
        </div>
        <div className="tile tile-dark">
          <div className="tile-label">GATE SCANS</div>
          <div className="tile-value">{totalScanned}</div>
          <div className="tile-sub">QR validated at entry</div>
          <div className="tile-delta up"><span>✓</span> Gate active</div>
        </div>
      </div>

      {eventsLoading && <div role="status" className="card">Loading events…</div>}
      {/* Events Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--gutter)' }}>
        {pagedEvents.map((event) => {
          const meta = metaForEvent(event.name)
          const eventRecord = catalogEvents.find(record => record.name === event.name)
          meta.tagline = [eventRecord?.venue, eventRecord?.city, eventRecord?.startsAt || eventRecord?.date].filter(Boolean).join(' · ') || 'Historical sales event'
          const scanPct = event.ticketsSold > 0 ? Math.round((event.scanned / event.ticketsSold) * 100) : 0
          const isHov = hovered === event.name

          return (
            <div
              key={event.name}
              className="card"
              onClick={() => setSelectedEvent(event.name)}
              onMouseEnter={() => setHovered(event.name)}
              onMouseLeave={() => setHovered(null)}
              style={{
                cursor: 'pointer',
                padding: 0,
                overflow: 'hidden',
                transform: isHov ? 'translateY(-4px)' : 'translateY(0)',
                boxShadow: isHov
                  ? '0 20px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08)'
                  : 'var(--shadow-card)',
                transition: 'transform 0.25s ease, box-shadow 0.25s ease',
              }}
            >
              {/* Banner */}
              <div style={{
                height: '130px',
                background: meta.gradient,
                position: 'relative',
                display: 'flex',
                alignItems: 'flex-end',
                padding: '16px 18px',
                color: '#fff',
              }}>
                {/* Shimmer overlay */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'radial-gradient(ellipse at 90% -10%, rgba(255,255,255,0.22), transparent 60%)',
                  pointerEvents: 'none',
                }} />

                <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px' }}>
                  <span className="badge" style={{ background: 'rgba(61,220,132,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', fontSize: '10px' }}>
                    <span className="badge-dot" style={{ background: eventStatus(eventRecord) === 'published' ? '#3DDC84' : '#F5B942' }} /> {eventStatus(eventRecord)}
                  </span>
                </div>

                <div>
                  <div style={{ fontSize: '22px', marginBottom: '4px' }}>{meta.icon}</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                    {event.name}
                  </div>
                  <div style={{ fontSize: '10.5px', opacity: 0.85, marginTop: '3px' }}>{meta.tagline}</div>
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: '16px 18px' }}>
                {/* Mini stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                  {[
                    { label: 'REVENUE', val: `₹${event.totalRevenue.toLocaleString()}` },
                    { label: 'ADMISSIONS', val: event.ticketsSold.toString() },
                    { label: 'SCANNED', val: event.scanned.toString() },
                  ].map(stat => (
                    <div key={stat.label} style={{
                      background: 'var(--panel-2)',
                      border: '1px solid var(--line)',
                      borderRadius: '10px',
                      padding: '8px 10px',
                    }}>
                      <div style={{ fontSize: '9px', color: 'var(--ink-faint)', fontWeight: 700, letterSpacing: '0.06em' }}>{stat.label}</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', marginTop: '2px' }}>{stat.val}</div>
                    </div>
                  ))}
                </div>

                {/* Scan progress */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--ink-faint)', marginBottom: '5px' }}>
                    <span>Gate Scan Progress</span>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{event.scanned}/{event.ticketsSold} ({scanPct}%)</span>
                  </div>
                  <div style={{ height: '5px', backgroundColor: 'var(--panel-3)', borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.max(scanPct > 0 ? scanPct : 0, 0)}%`,
                      background: meta.gradient,
                      borderRadius: '99px',
                      transition: 'width 0.8s ease',
                    }} />
                  </div>
                </div>

                {/* CTA row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '10.5px', color: 'var(--ink-faint)' }}>Click to view detail →</span>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: 'var(--panel-2)', border: '1px solid var(--line)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', color: 'var(--ink-soft)',
                    transform: isHov ? 'translateX(3px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                  }}>→</div>
                </div>
              </div>
            </div>
          )
        })}
        {!eventsLoading && !pagedEvents.length && <div className="card muted-sm">{events.length ? 'No events match these filters.' : 'No events or historical sales are available.'}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
        <span className="muted-sm">{filteredEvents.length} events · page {eventPage} of {eventPageCount}</span>
        <button className="btn-secondary" disabled={eventPage <= 1} onClick={() => setEventPage(page => Math.max(1, page - 1))}>Previous</button>
        <button className="btn-secondary" disabled={eventPage >= eventPageCount} onClick={() => setEventPage(page => Math.min(eventPageCount, page + 1))}>Next</button>
      </div>
    </div>
  )
}
