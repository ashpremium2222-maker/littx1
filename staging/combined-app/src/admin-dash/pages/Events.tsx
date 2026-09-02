import { useState } from 'react'

interface Sale {
  orderId: string
  event: string
  amount: number
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

const EVENT_META: Record<string, { gradient: string; icon: string; tagline: string; isVip?: boolean }> = {
  'DHOLIDA GARBA ROYALE': {
    gradient: 'linear-gradient(135deg, #7C4CE0 0%, #C84CE0 100%)',
    icon: '🎉',
    tagline: 'Pethkar Ground, Kothrud, Pune · 17th October',
  }
}

const LINEUPS: Record<string, { time: string; name: string; stage: string; status: string; badge: string }[]> = {
  'DHOLIDA GARBA ROYALE': [
    { time: '4:00 PM', name: 'Gates Open', stage: 'Main Entrance', status: 'Confirmed', badge: 'green' },
    { time: '4:00 PM onwards', name: 'Garba & Performances', stage: 'Main Stage', status: 'Confirmed', badge: 'green' },
    { time: 'VIP', name: 'VIP Zone Access', stage: 'VIP Section', status: 'VIP Pass', badge: 'amber' },
  ]
}

export default function Events({ sales = [], onNavigateToTickets }: Props) {
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  // Build event data map
  const eventMap = new Map<string, {
    name: string; totalRevenue: number; ticketsSold: number; scanned: number; firstSale: string; lastSale: string
  }>()

  // Pre-seed the 1 event
  Object.keys(EVENT_META).forEach(name => {
    eventMap.set(name, { name, totalRevenue: 0, ticketsSold: 0, scanned: 0, firstSale: '', lastSale: '' })
  })

  sales.forEach((s) => {
    const name = 'DHOLIDA GARBA ROYALE'
    const isPaid = ['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(s.status)

    const entry = eventMap.get(name)!
    if (isPaid) {
      entry.totalRevenue += (s.amount || 0)
      entry.ticketsSold += 1
    }
    if (s.scannedAt || s.status === 'scanned') {
      entry.scanned += 1
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

  // ── Detail View ─────────────────────────────────────────────────────────
  if (selectedEvent) {
    const evtData = eventMap.get(selectedEvent)!
    const meta = EVENT_META[selectedEvent] || EVENT_META['DHOLIDA GARBA ROYALE']
    const lineup = LINEUPS[selectedEvent] || LINEUPS['DHOLIDA GARBA ROYALE']
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
                <span className="badge-dot" style={{ background: '#3DDC84' }} /> LIVE
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

        {/* Split Content */}
        <div className="main-row">
          {/* Left Column: Ticket Buyers */}
          <div className="left-col" style={{ flex: 1.2 }}>
            <div className="card">
              <div className="card-head">
                <h3>👥 Ticket Buyers ({(() => {
                  const buyersList = sales.filter(s => {
                    const category = 'DHOLIDA GARBA ROYALE'
                    const isPaid = ['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(s.status)
                    return isPaid && category === selectedEvent
                  })
                  return buyersList.length
                })()})</h3>
                <div className="muted-sm">Attendees registered for this event</div>
              </div>
              <div className="scroll" style={{ maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(() => {
                  const buyersList = sales.filter(s => {
                    const category = 'DHOLIDA GARBA ROYALE'
                    const isPaid = ['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(s.status)
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
                          {`₹${(s.amount || 0).toLocaleString()}`}
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
      {/* KPI Row */}
      <div className="kpi-row">
        <div className="tile tile-teal">
          <div className="tile-label">LIVE EVENTS</div>
          <div className="tile-value">1</div>
          <div className="tile-sub">Dholida Garba Royale</div>
          <div className="tile-delta"><span>🟢</span> All Live</div>
        </div>
        <div className="tile tile-gold">
          <div className="tile-label">TOTAL PASSES SOLD</div>
          <div className="tile-value">{totalSoldSum}</div>
          <div className="tile-sub">Dholida Garba Royale</div>
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

      {/* Events Grid — 3 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--gutter)' }}>
        {events.map((event) => {
          const meta = EVENT_META[event.name] || EVENT_META['DHOLIDA GARBA ROYALE']
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
                    <span className="badge-dot" style={{ background: '#3DDC84' }} /> LIVE
                  </span>
                  {meta.isVip && (
                    <span className="badge" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', fontSize: '10px' }}>
                      VIP
                    </span>
                  )}
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
                    { label: 'PASSES', val: event.ticketsSold.toString() },
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
      </div>
    </div>
  )
}
