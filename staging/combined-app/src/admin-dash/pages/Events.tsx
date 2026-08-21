import { useState, useEffect } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────
interface EventTier {
  id?: string
  name: string
  price: number
  description?: string
  gender?: string
}

interface EventItem {
  id: string
  name: string
  tagline?: string
  date?: string
  venue?: string
  gradient?: string
  icon?: string
  active?: boolean
  isVip?: boolean
  tiers: EventTier[]
}

interface Sale {
  orderId: string
  event: string
  amount: number
  status: string
  scannedAt?: string
  createdAt: string
  gender?: string
  ticketType?: string
  name?: string
  email?: string
}

interface Props {
  sales: Sale[]
  adminKey?: string
  onNavigateToTickets?: () => void
}

// ── Constants ─────────────────────────────────────────────────────────────
const GRADIENTS = [
  'linear-gradient(135deg, #6C4CE0 0%, #3B63E8 100%)',
  'linear-gradient(135deg, #38D9C4 0%, #3B82F6 100%)',
  'linear-gradient(135deg, #F5C542 0%, #F5854D 100%)',
  'linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%)',
  'linear-gradient(135deg, #10B981 0%, #059669 100%)',
  'linear-gradient(135deg, #F97316 0%, #EF4444 100%)',
]
const ICONS = ['🎉', '✨', '⭐', '🔥', '🎵', '🎟️', '🎧', '⚡', '🌙', '🎆']

const EMPTY_TIERS: EventTier[] = [
  { name: 'Normal Entry', price: 499, description: 'General Access' },
  { name: 'VIP Entry',    price: 999, description: 'VIP Priority Access' },
]

// ── Component ─────────────────────────────────────────────────────────────
export default function Events({ sales = [], adminKey, onNavigateToTickets }: Props) {
  const [eventsList, setEventsList]     = useState<EventItem[]>([])
  const [loading, setLoading]           = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null)
  const [hovered, setHovered]           = useState<string | null>(null)

  // Modal
  const [showModal, setShowModal]       = useState(false)
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError]       = useState<string | null>(null)

  // Form fields
  const [fName, setFName]         = useState('')
  const [fTagline, setFTagline]   = useState('')
  const [fDate, setFDate]         = useState('')
  const [fVenue, setFVenue]       = useState('')
  const [fIcon, setFIcon]         = useState('🎉')
  const [fGradient, setFGradient] = useState(GRADIENTS[0])
  const [fTiers, setFTiers]       = useState<EventTier[]>(EMPTY_TIERS)

  // ── Fetch events ────────────────────────────────────────────────────────
  const fetchEvents = async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/events', { headers: { 'x-admin-key': adminKey || 'dash-2026' } })
      const data = await res.json()
      if (res.ok && data.success && Array.isArray(data.events)) {
        setEventsList(data.events)
      }
    } catch {
      setEventsList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchEvents() }, [])

  // ── Modal helpers ───────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingId(null); setFName(''); setFTagline(''); setFDate('')
    setFVenue(''); setFIcon('🎉'); setFGradient(GRADIENTS[0])
    setFTiers(EMPTY_TIERS.map(t => ({ ...t }))); setFormError(null)
    setShowModal(true)
  }

  const openEdit = (evt: EventItem, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(evt.id); setFName(evt.name); setFTagline(evt.tagline || '')
    setFDate(evt.date || ''); setFVenue(evt.venue || ''); setFIcon(evt.icon || '🎉')
    setFGradient(evt.gradient || GRADIENTS[0])
    setFTiers(evt.tiers.length > 0 ? evt.tiers.map(t => ({ ...t })) : EMPTY_TIERS.map(t => ({ ...t })))
    setFormError(null); setShowModal(true)
  }

  const addTier    = () => setFTiers([...fTiers, { name: 'New Tier', price: 499 }])
  const removeTier = (i: number) => {
    if (fTiers.length <= 1) return alert('Need at least 1 tier.')
    setFTiers(fTiers.filter((_, idx) => idx !== i))
  }
  const updateTier = (i: number, field: keyof EventTier, val: any) => {
    const next = [...fTiers]; next[i] = { ...next[i], [field]: val }; setFTiers(next)
  }

  // ── Save event ──────────────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fName.trim()) { setFormError('Event Name is required.'); return }
    setFormSubmitting(true); setFormError(null)
    try {
      const res  = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey || 'dash-2026' },
        body: JSON.stringify({
          id: editingId || `event_${Date.now()}`,
          name: fName.trim(), tagline: fTagline.trim() || fVenue || 'Live Event',
          date: fDate, venue: fVenue.trim(), icon: fIcon, gradient: fGradient,
          tiers: fTiers, active: true
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setShowModal(false); fetchEvents()
        if (selectedEvent && selectedEvent.id === editingId) setSelectedEvent(null)
      } else {
        setFormError(data.message || 'Failed to save event.')
      }
    } catch { setFormError('Network error. Try again.') }
    finally  { setFormSubmitting(false) }
  }

  // ── Delete event ────────────────────────────────────────────────────────
  const handleDelete = async (evt: EventItem, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Are you sure you want to delete "${evt.name}"? This action cannot be undone.`)) return

    // Optimistic UI update — remove immediately from screen
    setEventsList(prev => prev.filter(item => item.id !== evt.id && item.name !== evt.name))
    if (selectedEvent?.id === evt.id || selectedEvent?.name === evt.name) {
      setSelectedEvent(null)
    }

    try {
      const res = await fetch(`/api/admin/events/${encodeURIComponent(evt.id)}?name=${encodeURIComponent(evt.name)}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey || 'dash-2026' }
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        alert(data.message || 'Failed to delete event.')
        fetchEvents()
      }
    } catch {
      alert('Network error deleting event.')
      fetchEvents()
    }
  }

  // ── Sales aggregation ───────────────────────────────────────────────────
  const metricMap = new Map<string, { revenue: number; sold: number; scanned: number }>()
  eventsList.forEach(e => metricMap.set(e.name, { revenue: 0, sold: 0, scanned: 0 }))
  sales.forEach(s => {
    if (!['paid','scanned','generated','ticket_generated','emailed'].includes(s.status)) return
    const key = s.event || eventsList[0]?.name || ''
    if (!metricMap.has(key)) metricMap.set(key, { revenue: 0, sold: 0, scanned: 0 })
    const m = metricMap.get(key)!
    m.revenue += s.amount || 0; m.sold += 1; if (s.scannedAt) m.scanned += 1
  })

  const totalRevenue = Array.from(metricMap.values()).reduce((a, m) => a + m.revenue, 0)
  const totalSold    = Array.from(metricMap.values()).reduce((a, m) => a + m.sold,    0)
  const totalScanned = Array.from(metricMap.values()).reduce((a, m) => a + m.scanned, 0)

  // ── Detail view ─────────────────────────────────────────────────────────
  if (selectedEvent) {
    const evt = eventsList.find(e => e.id === selectedEvent.id) || selectedEvent
    const m   = metricMap.get(evt.name) || { revenue: 0, sold: 0, scanned: 0 }
    const pct = m.sold > 0 ? Math.round((m.scanned / m.sold) * 100) : 0
    const buyers = sales.filter(s =>
      s.event === evt.name &&
      ['paid','ticket_generated','emailed','scanned'].includes(s.status)
    )

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gutter)' }} className="fade-in-up">
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="btn-secondary" onClick={() => setSelectedEvent(null)} style={{ height: '32px', padding: '0 14px', fontSize: '11.5px' }}>
              ← All Events
            </button>
            <span style={{ color: 'var(--ink-faint)', fontSize: '12px' }}>/ {evt.name}</span>
          </div>
          <button className="btn-secondary" onClick={(e) => openEdit(evt, e)} style={{ height: '32px', padding: '0 14px', fontSize: '11.5px' }}>
            ✏️ Edit Event &amp; Tiers
          </button>
        </div>

        {/* Hero */}
        <div style={{ borderRadius: 'var(--radius-xl)', overflow: 'hidden', border: '1px solid var(--line)', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ height: '140px', background: evt.gradient || GRADIENTS[0], position: 'relative', display: 'flex', alignItems: 'flex-end', padding: '24px', color: '#fff' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 80% -20%, rgba(255,255,255,0.25), transparent 60%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px' }}>
              <span className="badge" style={{ background: 'rgba(61,220,132,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
                <span className="badge-dot" style={{ background: '#3DDC84' }} /> LIVE
              </span>
              {evt.isVip && (
                <span className="badge" style={{ background: 'rgba(245,197,66,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>⭐ VIP</span>
              )}
            </div>
            <div>
              <div style={{ fontSize: '30px', marginBottom: '4px' }}>{evt.icon || '🎉'}</div>
              <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>{evt.name}</div>
              <div style={{ fontSize: '12px', opacity: 0.85, marginTop: '2px' }}>{evt.tagline || evt.venue}</div>
            </div>
          </div>
          {/* Stats */}
          <div style={{ background: 'var(--panel)', padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', borderTop: '1px solid var(--line)' }}>
            {[
              { label: 'PASSES SOLD',   val: m.sold.toString() },
              { label: 'QR SCANNED',    val: m.scanned.toString() },
              { label: 'SCAN RATE',     val: `${pct}%` },
              { label: 'TOTAL REVENUE', val: evt.isVip ? 'FREE' : `₹${m.revenue.toLocaleString()}` },
            ].map(stat => (
              <div key={stat.label}>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--ink-faint)', marginBottom: '4px' }}>{stat.label}</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: stat.label === 'TOTAL REVENUE' ? 'var(--teal, #38d9c4)' : 'var(--ink)' }}>{stat.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tier cards */}
        <div className="card">
          <div className="card-head">
            <h3>🎟️ Pass Tiers &amp; Pricing ({evt.tiers?.length || 0})</h3>
            <div className="muted-sm">Live across Checkout, Seller Portal &amp; Shadow Panel</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginTop: '14px' }}>
            {evt.tiers?.map((tier, i) => (
              <div key={i} style={{ padding: '16px', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{tier.name}</div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--volt, #d4f700)', marginTop: '4px' }}>
                  {tier.price === 0 ? 'FREE' : `₹${tier.price}`}
                </div>
                {tier.description && <div style={{ fontSize: '11px', color: 'var(--ink-faint)', marginTop: '4px' }}>{tier.description}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Buyers */}
        <div className="card">
          <div className="card-head">
            <h3>👥 Ticket Buyers ({buyers.length})</h3>
          </div>
          <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            {buyers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-faint)', fontSize: '13px' }}>No buyers yet for this event.</div>
            ) : buyers.map((b, i) => (
              <div key={b.orderId || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: evt.gradient || GRADIENTS[0], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '13px' }}>
                    {(b.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{b.name || 'Unknown'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>{b.email || '—'}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>₹{(b.amount || 0).toLocaleString()}</div>
                  <div style={{ fontSize: '10px', color: 'var(--ink-faint)' }}>{b.ticketType || b.gender || 'pass'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Main grid view ────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gutter)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Event &amp; Tier Management</h2>
          <div className="muted-sm" style={{ marginTop: '3px' }}>Add, edit, and delete events with custom pass-tier pricing — synced across the entire platform</div>
        </div>
        <button className="btn-primary" onClick={openCreate} style={{ padding: '10px 20px', fontWeight: 800, fontSize: '13px' }}>
          ➕ Add New Event
        </button>
      </div>

      {/* KPIs */}
      <div className="kpi-row">
        <div className="tile tile-teal">
          <div className="tile-label">LIVE EVENTS</div>
          <div className="tile-value">{eventsList.length}</div>
          <div className="tile-sub">Dynamic events configured</div>
          <div className="tile-delta"><span>🟢</span> All Live</div>
        </div>
        <div className="tile tile-gold">
          <div className="tile-label">TOTAL PASSES SOLD</div>
          <div className="tile-value">{totalSold}</div>
          <div className="tile-sub">Across all events</div>
          <div className="tile-delta"><span>🎟</span> Active sales</div>
        </div>
        <div className="tile tile-orange">
          <div className="tile-label">TOTAL REVENUE</div>
          <div className="tile-value">₹{totalRevenue.toLocaleString()}</div>
          <div className="tile-sub">Gross confirmed income</div>
          <div className="tile-delta"><span>↑</span> Confirmed</div>
        </div>
        <div className="tile tile-dark">
          <div className="tile-label">GATE SCANS</div>
          <div className="tile-value">{totalScanned}</div>
          <div className="tile-sub">QR validated at entry</div>
          <div className="tile-delta up"><span>✓</span> Gate active</div>
        </div>
      </div>

      {/* Events grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '56px', color: 'var(--ink-faint)' }}>Loading events...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--gutter)' }}>
          {eventsList.map(evt => {
            const m   = metricMap.get(evt.name) || { revenue: 0, sold: 0, scanned: 0 }
            const pct = m.sold > 0 ? Math.round((m.scanned / m.sold) * 100) : 0
            const hov = hovered === evt.id

            return (
              <div
                key={evt.id}
                className="card"
                onClick={() => setSelectedEvent(evt)}
                onMouseEnter={() => setHovered(evt.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  cursor: 'pointer', padding: 0, overflow: 'hidden',
                  transform: hov ? 'translateY(-4px)' : 'translateY(0)',
                  boxShadow: hov ? '0 20px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08)' : 'var(--shadow-card)',
                  transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                }}
              >
                {/* Banner */}
                <div style={{ height: '130px', background: evt.gradient || GRADIENTS[0], position: 'relative', display: 'flex', alignItems: 'flex-end', padding: '16px 18px', color: '#fff' }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 90% -10%, rgba(255,255,255,0.2), transparent 60%)', pointerEvents: 'none' }} />

                  {/* Action buttons */}
                  <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px' }}>
                    <button
                      onClick={(e) => openEdit(evt, e)}
                      style={{ padding: '4px 9px', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: '6px', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                    >✏️</button>
                    <button
                      onClick={(e) => handleDelete(evt, e)}
                      style={{ padding: '4px 9px', background: 'rgba(220,38,38,0.75)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: '6px', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                    >🗑️</button>
                  </div>

                  <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '5px' }}>
                    <span className="badge" style={{ background: 'rgba(61,220,132,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', fontSize: '10px' }}>
                      <span className="badge-dot" style={{ background: '#3DDC84' }} /> LIVE
                    </span>
                    {evt.isVip && <span className="badge" style={{ background: 'rgba(245,197,66,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', fontSize: '10px' }}>VIP</span>}
                  </div>

                  <div>
                    <div style={{ fontSize: '22px', marginBottom: '3px' }}>{evt.icon || '🎉'}</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{evt.name}</div>
                    <div style={{ fontSize: '10.5px', opacity: 0.88, marginTop: '2px' }}>{evt.tagline || evt.venue || 'Live Event'}</div>
                  </div>
                </div>

                {/* Body */}
                <div style={{ padding: '14px 16px' }}>
                  {/* Tier badges */}
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    {evt.tiers?.map((t, i) => (
                      <span key={i} style={{ padding: '3px 8px', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: '6px', fontSize: '10.5px', fontWeight: 700, color: 'var(--volt, #d4f700)' }}>
                        {t.name}: {t.price === 0 ? 'FREE' : `₹${t.price}`}
                      </span>
                    ))}
                  </div>

                  {/* Mini stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                    {[
                      { label: 'REVENUE', val: evt.isVip ? 'FREE' : `₹${m.revenue.toLocaleString()}` },
                      { label: 'PASSES',  val: m.sold.toString() },
                      { label: 'SCANNED', val: m.scanned.toString() },
                    ].map(stat => (
                      <div key={stat.label} style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: '8px', padding: '7px 9px' }}>
                        <div style={{ fontSize: '9px', color: 'var(--ink-faint)', fontWeight: 700, letterSpacing: '0.05em' }}>{stat.label}</div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', marginTop: '2px' }}>{stat.val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Scan bar */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--ink-faint)', marginBottom: '4px' }}>
                      <span>Gate Scan Progress</span>
                      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{m.scanned}/{m.sold} ({pct}%)</span>
                    </div>
                    <div style={{ height: '4px', background: 'var(--panel-3, #1e1e2e)', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: evt.gradient || GRADIENTS[0], borderRadius: '99px', transition: 'width 0.8s ease' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '10px' }}>
                    <span style={{ fontSize: '10.5px', color: 'var(--ink-faint)' }}>Click to view detail →</span>
                    <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: 'var(--panel-2)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: 'var(--ink-soft)', transform: hov ? 'translateX(3px)' : 'none', transition: 'transform 0.2s' }}>→</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── ADD / EDIT MODAL ──────────────────────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ width: '100%', maxWidth: '660px', background: 'var(--bg-card, #0f0f1a)', border: '1px solid var(--border, rgba(255,255,255,0.12))', borderRadius: '18px', padding: '26px', maxHeight: '92vh', overflowY: 'auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)', margin: 0 }}>
                {editingId ? '✏️ Edit Event & Pass Tiers' : '➕ Create New Event'}
              </h3>
              <button onClick={() => setShowModal(false)} className="btn-secondary" style={{ padding: '4px 12px', fontSize: '12px' }}>✕ Close</button>
            </div>

            {formError && (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.5)', color: '#f87171', borderRadius: '10px', marginBottom: '16px', fontSize: '12px', fontWeight: 600 }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Event Name */}
              <div>
                <label style={LABEL_STYLE}>Event Name *</label>
                <input type="text" required placeholder="e.g. BOILER ROOM NIGHT" value={fName} onChange={e => setFName(e.target.value)} style={INPUT_STYLE} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={LABEL_STYLE}>Tagline / Subtitle</label>
                  <input type="text" placeholder="e.g. Electronic Showcase" value={fTagline} onChange={e => setFTagline(e.target.value)} style={INPUT_STYLE} />
                </div>
                <div>
                  <label style={LABEL_STYLE}>Venue / Location</label>
                  <input type="text" placeholder="e.g. Orchid Arena, Pune" value={fVenue} onChange={e => setFVenue(e.target.value)} style={INPUT_STYLE} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={LABEL_STYLE}>Event Date</label>
                  <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} style={INPUT_STYLE} />
                </div>
                <div>
                  <label style={LABEL_STYLE}>Icon Emoji</label>
                  <select value={fIcon} onChange={e => setFIcon(e.target.value)} style={INPUT_STYLE}>
                    {ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL_STYLE}>Banner Color</label>
                  <select value={fGradient} onChange={e => setFGradient(e.target.value)} style={INPUT_STYLE}>
                    {GRADIENTS.map((g, i) => <option key={i} value={g}>Preset {i + 1}</option>)}
                  </select>
                </div>
              </div>

              {/* Preview swatch */}
              <div style={{ height: '48px', borderRadius: '10px', background: fGradient, display: 'flex', alignItems: 'center', paddingLeft: '16px', color: '#fff', fontWeight: 800, fontSize: '15px', gap: '8px' }}>
                <span>{fIcon}</span> <span>{fName || 'Event Preview'}</span>
              </div>

              {/* ── TIER SECTION ── */}
              <div style={{ borderTop: '1px solid var(--border, rgba(255,255,255,0.1))', paddingTop: '16px', marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--volt, #d4f700)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>🎟️ Pass Tiers &amp; Pricing</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-faint)', marginTop: '2px' }}>Define VIP, Normal, Male, Female, Early Bird, etc.</div>
                  </div>
                  <button type="button" onClick={addTier} className="btn-secondary" style={{ fontSize: '11px', padding: '5px 12px' }}>
                    ➕ Add Tier
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {fTiers.map((tier, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: '8px', alignItems: 'center', padding: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px' }}>
                      <input
                        type="text" placeholder="Tier Name (e.g. VIP Entry)"
                        value={tier.name} onChange={e => updateTier(i, 'name', e.target.value)}
                        style={{ ...INPUT_STYLE, margin: 0 }}
                      />
                      <input
                        type="number" placeholder="Price ₹"
                        value={tier.price} onChange={e => updateTier(i, 'price', parseFloat(e.target.value) || 0)}
                        style={{ ...INPUT_STYLE, margin: 0, fontWeight: 800 }}
                      />
                      <input
                        type="text" placeholder="Description (optional)"
                        value={tier.description || ''} onChange={e => updateTier(i, 'description', e.target.value)}
                        style={{ ...INPUT_STYLE, margin: 0 }}
                      />
                      <button
                        type="button" onClick={() => removeTier(i)}
                        style={{ padding: '8px 10px', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', borderRadius: '8px', color: '#f87171', fontSize: '13px', cursor: 'pointer', flexShrink: 0 }}
                      >✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="submit" disabled={formSubmitting} className="btn-primary" style={{ flex: 1, padding: '13px', fontWeight: 800, fontSize: '13px' }}>
                  {formSubmitting ? 'Saving...' : `💾 ${editingId ? 'Update' : 'Create'} Event`}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" style={{ padding: '13px 20px' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────
const LABEL_STYLE: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 700,
  color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px'
}
const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '10px 13px', borderRadius: '9px',
  border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
  color: 'var(--ink)', fontSize: '13px', boxSizing: 'border-box' as const,
  outline: 'none'
}

// ── Default fallback events (if API unavailable) ──────────────────────────
const DEFAULT_EVENTS: EventItem[] = [
  {
    id: 'event_freshers', name: 'FRESHERS TAKEOVER',
    tagline: 'Pune College Fest · Main Event', date: '2026-09-15', venue: 'The Orchid, Pune',
    gradient: 'linear-gradient(135deg, #6C4CE0 0%, #3B63E8 100%)', icon: '🎉', active: true,
    tiers: [
      { name: 'Female Pass', price: 599, gender: 'female' },
      { name: 'Male Pass',   price: 699, gender: 'male'   },
      { name: 'VIP Entry',   price: 1299, gender: 'unisex' },
    ]
  },
  {
    id: 'event_aura', name: 'AURA GENESIS',
    tagline: 'Skyline Electronic Showcase', date: '2026-10-20', venue: 'JW Marriott Ground',
    gradient: 'linear-gradient(135deg, #38D9C4 0%, #3B82F6 100%)', icon: '✨', active: true,
    tiers: [
      { name: 'General Entry', price: 350, gender: 'unisex' },
      { name: 'VIP Entry',     price: 799, gender: 'unisex' },
    ]
  },
  {
    id: 'event_vip', name: 'FT LINEUP INVITE',
    tagline: 'Exclusive VIP Access · Invite Only', date: '2026-09-15', venue: 'Main Arena VIP Lounge',
    gradient: 'linear-gradient(135deg, #F5C542 0%, #F5854D 100%)', icon: '⭐', active: true, isVip: true,
    tiers: [
      { name: 'VIP Access Pass', price: 0, gender: 'unisex' },
    ]
  },
]
