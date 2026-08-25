import { useState } from 'react'

interface TicketsProps {
  sales: any[]
  allSales?: any[]
  onResend: (ticketId: string) => Promise<void>
  adminKey: string
  onReload: () => Promise<void> | void
  globalSearch?: string
  isPresentation?: boolean
  eventFilter?: string
  onEventFilterChange?: (val: string) => void
}

interface Ticket {
  id: string
  buyer: string
  email: string
  phone: string
  event: string
  type: string
  qty: number
  price: number
  generated: string
  expiry: string
  status: 'Active' | 'Scanned' | 'Cancelled' | 'Expired'
  qr: string
  pdf: string
  png: string
  showInPres?: boolean
  orderId: string
}

export default function Tickets({
  sales = [],
  allSales = [],
  onResend,
  adminKey,
  onReload,
  globalSearch = '',
  isPresentation = false,
  eventFilter: propEventFilter,
  onEventFilterChange: propOnEventFilterChange,
}: TicketsProps) {
  const [internalEventFilter, setInternalEventFilter] = useState<string>('all')
  const eventFilter = propEventFilter !== undefined ? propEventFilter : internalEventFilter
  const setEventFilter = propOnEventFilterChange !== undefined ? propOnEventFilterChange : setInternalEventFilter

  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [searchQ, setSearchQ] = useState('')
  const [optimisticPres, setOptimisticPres] = useState<Record<string, boolean>>({})

  const effectiveSearch = searchQ || globalSearch

  const baseTicketSales = sales.filter((s) => {
    if (!s.ticketId) return false

    const isVip =
      (s.gender || '').toLowerCase().includes('exclusive') ||
      (s.ticketType || '').toLowerCase().includes('exclusive') ||
      (s.ticketType || '').toLowerCase().includes('vip')

    const isAura = (s.event || '').toUpperCase().includes('AURA')
    const category = isVip ? 'ft lineup invite' : isAura ? 'aura genesis' : 'freshers takeover'

    if (eventFilter !== 'all' && category !== eventFilter)
      return false

    return true
  })

  // When searching, search against ALL sales (even hidden ones), otherwise just the visible ones
  const salesToSearch = effectiveSearch && isPresentation && allSales.length > 0 ? allSales : baseTicketSales

  const ticketSales = salesToSearch.filter((s) => {
    if (effectiveSearch) {
      const q = effectiveSearch.toLowerCase()
      return (
        (s.ticketId || '').toLowerCase().includes(q) ||
        (s.name || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const handleCancel = async (ticketId: string) => {
    if (
      !window.confirm(
        `Are you sure you want to CANCEL ticket ${ticketId}? Scanning it at the gate will be rejected.`
      )
    ) {
      return
    }
    setCancellingId(ticketId)
    try {
      const res = await fetch('/api/admin/cancel-ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({ ticketId }),
      })
      const data = await res.json()
      if (data.success) {
        alert(data.message)
        await onReload()
      } else {
        alert('Failed: ' + data.message)
      }
    } catch (err) {
      alert('Error cancelling ticket')
    } finally {
      setCancellingId(null)
    }
  }

  const togglePresMode = async (orderId: string, currentVal: boolean) => {
    if (!adminKey || isPresentation) return
    const newVal = !currentVal
    setOptimisticPres((prev) => ({ ...prev, [orderId]: newVal }))
    try {
      const res = await fetch('/api/admin/toggle-presentation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ orderId, showInPres: newVal }),
      })
      if (!res.ok) {
        setOptimisticPres((prev) => ({ ...prev, [orderId]: currentVal }))
      }
    } catch (err) {
      setOptimisticPres((prev) => ({ ...prev, [orderId]: currentVal }))
    }
  }

  const mapTicket = (s: any): Ticket => {
    const isCancelled = s.status === 'cancelled'
    const isScanned = s.status === 'scanned' || !!s.scannedAt
    return {
      id: s.ticketId,
      buyer: s.name,
      email: s.email,
      phone: s.phone || '—',
      event: s.event || 'DHOLIDA GARBA ROYALE',
      type:
        s.gender === 'male'
          ? 'Male Pass'
          : s.gender === 'female'
          ? 'Female Pass'
          : String(s.gender || '').toLowerCase().includes('exclusive')
          ? 'Exclusive VIP'
          : 'General',
      qty: s.quantity || 1,
      price: s.amount || 0,
      generated: s.generatedAt ? new Date(s.generatedAt).toLocaleString('en-IN') : '—',
      expiry: 'Event End',
      status: isCancelled ? 'Cancelled' : isScanned ? 'Scanned' : 'Active',
      qr: '✓',
      pdf: '✓',
      png: '✓',
      showInPres: s.showInPres || false,
      orderId: s.orderId,
    }
  }

  const baseTickets: Ticket[] = baseTicketSales.map(mapTicket)
  const tickets: Ticket[] = ticketSales.map(mapTicket)

  const totalAmount = baseTickets.reduce((a, t) => a + t.price, 0)
  const activeCount = baseTickets.filter((t) => t.status === 'Active').length
  const scannedCount = baseTickets.filter((t) => t.status === 'Scanned').length
  const cancelledCount = baseTickets.filter((t) => t.status === 'Cancelled').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gutter)' }}>
      {/* Reference KPI Stat Tiles */}
      <div className="kpi-row">
        <div className="tile tile-teal">
          <div className="tile-label">GENERATED PASSES</div>
          <div className="tile-value">{tickets.length}</div>
          <div className="tile-sub">Across all selected events</div>
          <div className="tile-delta">
            <span>🎫</span> Valid inventory
          </div>
        </div>

        <div className="tile tile-gold">
          <div className="tile-label">ACTIVE UNCLAIMED</div>
          <div className="tile-value">{activeCount}</div>
          <div className="tile-sub">Ready for gate scan</div>
          <div className="tile-delta">
            <span>✓</span> Gate ready
          </div>
        </div>

        <div className="tile tile-orange">
          <div className="tile-label">SCANNED AT GATE</div>
          <div className="tile-value">{scannedCount}</div>
          <div className="tile-sub">Validated entry passes</div>
          <div className="tile-delta">
            <span>↑</span> {scannedCount} entered
          </div>
        </div>

        <div className="tile tile-dark">
          <div className="tile-label">TOTAL TICKET VALUE</div>
          <div className="tile-value">₹{totalAmount.toLocaleString()}</div>
          <div className="tile-sub">{cancelledCount} cancelled passes</div>
          <div className="tile-delta up">
            <span>↑</span> Gross pass sales
          </div>
        </div>
      </div>

      {/* Reference Filter Bar */}
      <div className="filter-bar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px' }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search tickets by ID, buyer name, email..."
          />
        </div>

        <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
          <option value="all">All events</option>
          <option value="freshers takeover">DHOLIDA GARBA ROYALE</option>
          <option value="aura genesis">AURA GENESIS</option>
          <option value="ft lineup invite">FT LINEUP INVITE</option>
        </select>

        <button
          className="tb-icon-btn"
          onClick={() => {
            const txt = tickets.map((t) => `${t.id} - ${t.buyer} (${t.type})`).join('\n')
            navigator.clipboard.writeText(txt)
            alert('Ticket list copied to clipboard!')
          }}
          title="Copy List"
          style={{ width: '40px', height: '40px', borderRadius: '12px' }}
        >
          📋
        </button>
      </div>

      {/* Tickets Data Table Card */}
      <div className="card table-card">
        <div className="table-scroll scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Attendee</th>
                <th>Event</th>
                <th>Pass Type</th>
                <th>Price</th>
                <th>Status</th>
                <th>Generated</th>
                {!isPresentation && <th>Pres</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-faint)' }}>
                    No tickets generated yet.
                  </td>
                </tr>
              ) : (
                tickets.map((t) => {
                  const presVal =
                    optimisticPres[t.orderId] !== undefined
                      ? optimisticPres[t.orderId]
                      : t.showInPres

                  return (
                    <tr
                      key={t.id}
                      style={{
                        opacity: t.status === 'Cancelled' ? 0.5 : 1,
                      }}
                    >
                      <td>
                        <div className="cell-main">
                          <div
                            className="cell-thumb"
                            style={{
                              background:
                                t.status === 'Scanned'
                                  ? 'var(--grad-teal)'
                                  : t.status === 'Cancelled'
                                  ? 'var(--grad-orange)'
                                  : 'var(--grad-violet)',
                            }}
                          >
                            🎟
                          </div>
                          <div>
                            <div className="cell-title">#{t.id}</div>
                            <div className="cell-sub">{t.qty} ticket(s)</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{t.buyer}</div>
                        <div style={{ fontSize: '10.5px', color: 'var(--ink-faint)' }}>{t.email}</div>
                      </td>
                      <td>{t.event}</td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{t.type}</span>
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--ink)' }}>
                        {t.price === 0 ? 'FREE' : `₹${t.price.toLocaleString()}`}
                      </td>
                      <td>
                        {t.status === 'Active' ? (
                          <span className="badge badge-green">
                            <span className="badge-dot" />
                            Active
                          </span>
                        ) : t.status === 'Scanned' ? (
                          <span className="badge badge-blue">
                            <span className="badge-dot" />
                            Scanned
                          </span>
                        ) : (
                          <span className="badge badge-red">
                            <span className="badge-dot" />
                            Cancelled
                          </span>
                        )}
                      </td>
                      <td>{t.generated}</td>
                      {!isPresentation && (
                        <td>
                          <button
                            onClick={() => togglePresMode(t.orderId, !!presVal)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '14px',
                            }}
                            title="Toggle presentation visibility"
                          >
                            {presVal ? '👁️' : '🙈'}
                          </button>
                        </td>
                      )}
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <a
                            href={t.status === 'Cancelled' ? '#' : `/api/ticket/${t.id}/download`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-secondary"
                            style={{
                              height: '28px',
                              padding: '0 8px',
                              fontSize: '11px',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              pointerEvents: t.status === 'Cancelled' ? 'none' : 'auto',
                            }}
                          >
                            PDF
                          </a>
                          <button
                            className="btn-secondary"
                            onClick={() => onResend(t.id)}
                            style={{ height: '28px', padding: '0 8px', fontSize: '11px' }}
                            disabled={t.status === 'Cancelled'}
                          >
                            Resend
                          </button>
                          {t.status !== 'Cancelled' && (
                            <button
                              onClick={() => handleCancel(t.id)}
                              disabled={cancellingId === t.id}
                              style={{
                                height: '28px',
                                padding: '0 8px',
                                fontSize: '11px',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid rgba(255,107,107,0.3)',
                                backgroundColor: 'rgba(255,107,107,0.12)',
                                color: 'var(--red)',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              {cancellingId === t.id ? '...' : 'Cancel'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
