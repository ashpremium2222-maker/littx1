import React, { useState, useMemo } from 'react'

interface OrdersProps {
  sales: any[]
  onResend: (ticketId: string) => Promise<void>
  globalSearch?: string
  isPresentation?: boolean
  adminKey?: string
  onReload?: () => void
}

type PaymentStatus = 'Paid' | 'Pending' | 'Failed' | 'Refunded' | 'Cancelled'
type EmailStatus = 'Delivered' | 'Opened' | 'Clicked' | 'Downloaded' | 'Queued' | 'Failed' | 'Spam' | 'Bounced'
type QRStatus = 'Not Scanned' | 'Scanned' | 'Duplicate Scan' | 'Expired' | 'Cancelled'

interface Order {
  id: string
  buyer: string
  email: string
  phone: string
  event: string
  ticketType: string
  qty: number
  subtotal: number
  tax: number
  discount: number
  final: number
  gateway: string
  txnId: string
  paymentStatus: PaymentStatus
  emailStatus: EmailStatus
  downloadStatus: string
  qrStatus: QRStatus
  time: string
  ticketId: string
  errorLog: any[]
  showInPres?: boolean
}

function OrderDrawer({
  order,
  onClose,
  onResend,
}: {
  order: Order
  onClose: () => void
  onResend: (id: string) => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />

      <div
        className="scroll"
        style={{
          position: 'relative',
          width: '460px',
          maxWidth: '90vw',
          height: '100vh',
          backgroundColor: 'var(--drawer-bg)',
          borderLeft: '2px solid var(--drawer-border)',
          boxShadow: '-8px 0 60px rgba(90, 50, 200, 0.15), -2px 0 20px rgba(0,0,0,0.3)',
          overflowY: 'auto',
          zIndex: 101,
          padding: '24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
            paddingBottom: '16px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>
              Order #{order.id.substring(0, 12)}
            </h3>
            <div style={{ fontSize: '11px', color: 'var(--ink-faint)', marginTop: '2px' }}>
              {order.time}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Buyer Info */}
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              color: 'var(--ink-faint)',
              marginBottom: '10px',
            }}
          >
            BUYER INFORMATION
          </div>
          <div className="cell-main">
            <div className="cell-thumb" style={{ width: '42px', height: '42px', fontSize: '15px', background: 'var(--grad-violet)' }}>
              {order.buyer.charAt(0)}
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{order.buyer}</div>
              <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>{order.email}</div>
              <div style={{ fontSize: '12px', color: 'var(--ink-faint)' }}>{order.phone || '—'}</div>
            </div>
          </div>
        </div>

        {/* Ticket Details */}
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              color: 'var(--ink-faint)',
              marginBottom: '10px',
            }}
          >
            TICKET DETAILS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ background: 'var(--panel-2)', padding: '10px', borderRadius: '10px', border: '1px solid var(--line)' }}>
              <div style={{ fontSize: '10px', color: 'var(--ink-faint)', fontWeight: 700 }}>EVENT</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginTop: '2px' }}>{order.event}</div>
            </div>
            <div style={{ background: 'var(--panel-2)', padding: '10px', borderRadius: '10px', border: '1px solid var(--line)' }}>
              <div style={{ fontSize: '10px', color: 'var(--ink-faint)', fontWeight: 700 }}>TICKET TYPE</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginTop: '2px' }}>{order.ticketType}</div>
            </div>
            <div style={{ background: 'var(--panel-2)', padding: '10px', borderRadius: '10px', border: '1px solid var(--line)' }}>
              <div style={{ fontSize: '10px', color: 'var(--ink-faint)', fontWeight: 700 }}>QUANTITY</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginTop: '2px' }}>{order.qty} pass(es)</div>
            </div>
            <div style={{ background: 'var(--panel-2)', padding: '10px', borderRadius: '10px', border: '1px solid var(--line)' }}>
              <div style={{ fontSize: '10px', color: 'var(--ink-faint)', fontWeight: 700 }}>QR SCAN STATUS</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginTop: '2px' }}>{order.qrStatus}</div>
            </div>
          </div>

          {order.ticketId && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <a
                href={`/api/ticket/${order.ticketId}/download`}
                target="_blank"
                rel="noreferrer"
                className="btn-primary"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 1, fontSize: '11.5px' }}
              >
                Download PDF
              </a>
              <button
                className="btn-secondary"
                onClick={() => onResend(order.ticketId)}
                style={{ flex: 1, fontSize: '11.5px' }}
              >
                Resend Email
              </button>
            </div>
          )}
        </div>

        {/* Payment Breakdown */}
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              color: 'var(--ink-faint)',
              marginBottom: '10px',
            }}
          >
            PAYMENT BREAKDOWN
          </div>
          <div style={{ background: 'var(--panel-2)', borderRadius: '12px', padding: '12px', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
              <span style={{ color: 'var(--ink-soft)' }}>Gateway</span>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{order.gateway} ({order.txnId})</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
              <span style={{ color: 'var(--ink-soft)' }}>Subtotal</span>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>₹{order.subtotal.toLocaleString()}</span>
            </div>
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800 }}>
              <span style={{ color: 'var(--ink)' }}>Total Paid</span>
              <span style={{ color: 'var(--violet)' }}>₹{order.final.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* System Error Diagnostics */}
        {order.errorLog && order.errorLog.length > 0 && (
          <div>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                color: 'var(--red)',
                marginBottom: '10px',
              }}
            >
              SYSTEM DIAGNOSTICS LOG
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {order.errorLog.map((err: any, idx: number) => (
                <div key={idx} style={{ background: 'rgba(255,107,107,0.12)', borderRadius: '10px', padding: '10px', border: '1px solid rgba(255,107,107,0.3)' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase' }}>
                    Stage: {err.stage}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', fontFamily: 'monospace', marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                    {err.error}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Orders({
  sales = [],
  onResend,
  globalSearch = '',
  isPresentation = false,
  adminKey = '',
}: OrdersProps) {
  const [selected, setSelected] = useState<Order | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [gatewayFilter, setGatewayFilter] = useState<string>('all')
  const [eventFilter, setEventFilter] = useState<string>('all')
  const [searchQ, setSearchQ] = useState('')
  const [showPhoneList, setShowPhoneList] = useState(false)
  const [phoneCopied, setPhoneCopied] = useState(false)
  const [optimisticPres, setOptimisticPres] = useState<Record<string, boolean>>({})

  const effectiveSearch = searchQ || globalSearch

  const orders: Order[] = useMemo(
    () =>
      sales.map((s: any) => {
        let paymentStatus: PaymentStatus = 'Pending'
        if (['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(s.status)) {
          paymentStatus = 'Paid'
        } else if (s.status === 'failed') {
          paymentStatus = 'Failed'
        }

        let emailStatus: EmailStatus = 'Queued'
        if (s.emailStatus === 'sent') {
          emailStatus = 'Delivered'
        } else if (s.emailStatus === 'failed') {
          emailStatus = 'Failed'
        }

        const tType =
          s.gender === 'male'
            ? 'Male Pass'
            : s.gender === 'female'
            ? 'Female Pass'
            : String(s.gender || '').toLowerCase().includes('exclusive')
            ? 'Exclusive VIP'
            : 'General'

        return {
          id: s.orderId,
          buyer: s.name,
          email: s.email,
          phone: s.phone,
          event: s.event || 'DHOLIDA GARBA ROYALE',
          ticketType: tType,
          qty: s.quantity || 1,
          subtotal: s.amount,
          tax: 0,
          discount: 0,
          final: s.amount,
          gateway: s.paymentId === 'manual' ? 'Manual' : 'Razorpay',
          txnId: s.paymentId || '—',
          paymentStatus,
          emailStatus,
          downloadStatus: s.ticketId ? 'PDF' : '—',
          qrStatus: s.status === 'scanned' || s.scannedAt ? 'Scanned' : 'Not Scanned',
          time: s.createdAt ? new Date(s.createdAt).toLocaleString('en-IN') : '—',
          ticketId: s.ticketId || '',
          errorLog: s.errorLog || [],
          showInPres: s.showInPres || false,
          prUserId: s.prUserId,
          prName: s.prName,
          paymentMethod: s.paymentMethod,
        }
      }),
    [sales]
  )

  const filtered = orders.filter((o) => {
    if (filter === 'paid' && o.paymentStatus !== 'Paid') return false
    if (filter === 'pending' && o.paymentStatus !== 'Pending') return false
    if (filter === 'failed' && o.paymentStatus !== 'Failed') return false

    if (gatewayFilter === 'razorpay' && o.gateway !== 'Razorpay') return false
    if (gatewayFilter === 'manual' && o.gateway !== 'Manual') return false

    if (eventFilter !== 'all' && o.event.toLowerCase() !== eventFilter) return false

    if (effectiveSearch) {
      const q = effectiveSearch.toLowerCase()
      if (
        !o.id.toLowerCase().includes(q) &&
        !o.buyer.toLowerCase().includes(q) &&
        !o.email.toLowerCase().includes(q) &&
        !o.txnId.toLowerCase().includes(q)
      ) {
        return false
      }
    }
    return true
  })

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

  const totalAmount = filtered.reduce((a, o) => {
    if (filter === 'all' && o.paymentStatus !== 'Paid') return a
    if (o.ticketType.toLowerCase().includes('exclusive')) return a
    return a + o.final
  }, 0)

  const totalPaidCount = filtered.filter(o => o.paymentStatus === 'Paid').length
  const totalPendingCount = filtered.filter(o => o.paymentStatus === 'Pending').length
  const totalFailedCount = filtered.filter(o => o.paymentStatus === 'Failed').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gutter)' }}>
      {/* Reference KPI Stat Tiles */}
      <div className="kpi-row">
        <div className="tile tile-orange">
          <div className="tile-label">ORDERS COMPLETED</div>
          <div className="tile-value">{totalPaidCount}</div>
          <div className="tile-sub">Fulfilled pass orders</div>
          <div className="tile-delta">
            <span>↑</span> {totalPaidCount} successful
          </div>
        </div>

        <div className="tile tile-teal">
          <div className="tile-label">IN PROGRESS</div>
          <div className="tile-value">{totalPendingCount}</div>
          <div className="tile-sub">Awaiting verification</div>
          <div className="tile-delta">
            <span>⏳</span> Live status
          </div>
        </div>

        <div className="tile tile-gold">
          <div className="tile-label">FAILED / REFUNDED</div>
          <div className="tile-value">{totalFailedCount}</div>
          <div className="tile-sub">Delivery or payment issues</div>
          <div className="tile-delta">
            <span>⚠</span> {totalFailedCount} needs review
          </div>
        </div>

        <div className="tile tile-dark">
          <div className="tile-label">FILTERED GROSS VALUE</div>
          <div className="tile-value">₹{totalAmount.toLocaleString()}</div>
          <div className="tile-sub">Across {filtered.length} total orders</div>
          <div className="tile-delta up">
            <span>↑</span> Verified sales
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
            placeholder="Search orders, buyer name, email..."
          />
        </div>

        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>

        <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
          <option value="all">All events</option>
          <option value="freshers takeover">DHOLIDA GARBA ROYALE</option>
          <option value="aura genesis">AURA GENESIS</option>
        </select>

        <select value={gatewayFilter} onChange={(e) => setGatewayFilter(e.target.value)}>
          <option value="all">All gateways</option>
          <option value="razorpay">Razorpay</option>
          <option value="manual">Manual</option>
        </select>

        <button
          className="tb-icon-btn"
          onClick={() => setShowPhoneList(true)}
          title="Phone Contact List"
          style={{ width: '40px', height: '40px', borderRadius: '12px' }}
        >
          📞
        </button>
      </div>

      {/* Orders Data Table Card */}
      <div className="card table-card">
        <div className="table-scroll scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Event</th>
                <th>Pass Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
                {!isPresentation && <th>Pres</th>}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-faint)' }}>
                    No orders matching criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((o) => {
                  const presVal = optimisticPres[o.id] !== undefined ? optimisticPres[o.id] : o.showInPres

                  return (
                    <tr key={o.id} onClick={() => setSelected(o)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div className="cell-main">
                          <div
                            className="cell-thumb"
                            style={{
                              background:
                                o.paymentStatus === 'Paid'
                                  ? 'var(--grad-violet)'
                                  : o.paymentStatus === 'Failed'
                                  ? 'var(--grad-orange)'
                                  : 'var(--grad-gold)',
                            }}
                          >
                            {o.buyer.charAt(0)}
                          </div>
                          <div>
                            <div className="cell-title">#{o.id.substring(0, 10)}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                              {o.gateway === 'Manual' ? (
                                <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'rgba(245, 197, 66, 0.15)', color: '#F5C542', border: '1px solid rgba(245, 197, 66, 0.25)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Manual</span>
                              ) : o.prUserId ? (
                                o.paymentMethod === 'cash' ? (
                                  <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.25)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cash by {o.prName || o.prUserId} ({o.prUserId})</span>
                                ) : (
                                  <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'rgba(124, 92, 250, 0.15)', color: '#7C5CFA', border: '1px solid rgba(124, 92, 250, 0.25)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Razorpay by {o.prName || o.prUserId} ({o.prUserId})</span>
                                )
                              ) : (
                                <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'rgba(124, 92, 250, 0.15)', color: '#7C5CFA', border: '1px solid rgba(124, 92, 250, 0.25)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Razorpay</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{o.buyer}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>{o.email}</div>
                      </td>
                      <td>{o.event}</td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{o.ticketType}</span> ({o.qty})
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--ink)' }}>₹{o.final.toLocaleString()}</td>
                      <td>
                        {o.paymentStatus === 'Paid' ? (
                          <span className="badge badge-green">
                            <span className="badge-dot" />
                            Completed
                          </span>
                        ) : o.paymentStatus === 'Failed' ? (
                          <span className="badge badge-red">
                            <span className="badge-dot" />
                            Failed
                          </span>
                        ) : (
                          <span className="badge badge-amber">
                            <span className="badge-dot" />
                            In Progress
                          </span>
                        )}
                      </td>
                      <td>{o.time}</td>
                      {!isPresentation && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => togglePresMode(o.id, !!presVal)}
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
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn-secondary"
                          onClick={() => setSelected(o)}
                          style={{ height: '28px', padding: '0 10px', fontSize: '11px' }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over Order Details Drawer */}
      {selected && (
        <OrderDrawer
          order={selected}
          onClose={() => setSelected(null)}
          onResend={onResend}
        />
      )}

      {/* Phone List Modal */}
      {showPhoneList && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <div className="card" style={{ width: '480px', maxWidth: '92vw', padding: '24px' }}>
            <div className="card-head">
              <h3>📞 Phone Contacts ({filtered.filter(o => o.phone).length})</h3>
              <button className="icon-btn" onClick={() => setShowPhoneList(false)}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={() => {
                  const txt = filtered.filter(o => o.phone).map(o => `${o.buyer} — ${o.phone}`).join('\n')
                  navigator.clipboard.writeText(txt)
                  setPhoneCopied(true)
                  setTimeout(() => setPhoneCopied(false), 2000)
                }}
              >
                {phoneCopied ? 'Copied ✓' : 'Copy All'}
              </button>
              <button
                className="btn-secondary"
                style={{ flex: 1 }}
                onClick={() => {
                  const csv = 'Name,Phone,Email,Event,Pass\n' + filtered.filter(o => o.phone).map(o => `"${o.buyer}","${o.phone}","${o.email}","${o.event}","${o.ticketType}"`).join('\n')
                  const blob = new Blob([csv], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = 'phone_contacts.csv'
                  a.click()
                }}
              >
                Download CSV
              </button>
            </div>

            <div className="scroll" style={{ maxHeight: '300px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {filtered.filter(o => o.phone).map((o, idx) => (
                <div key={idx} style={{ background: 'var(--panel-2)', padding: '8px 12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>{o.buyer}</div>
                    <div style={{ fontSize: '10.5px', color: 'var(--ink-faint)' }}>{o.event} · {o.ticketType}</div>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--violet)' }}>{o.phone}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
