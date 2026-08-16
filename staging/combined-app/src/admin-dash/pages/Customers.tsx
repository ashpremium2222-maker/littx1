import { useState } from 'react'

interface Sale {
  orderId: string
  name: string
  email: string
  phone?: string
  gender?: string
  quantity: number
  amount: number
  event: string
  createdAt: string
  status: string
  ticketId?: string
  paymentId?: string
}

interface CustomerRecord {
  name: string
  email: string
  phone: string
  orders: number
  spend: number
  lastPurchase: string
  refunds: number
  avatar: string
}

interface Props {
  sales: Sale[]
  adminKey: string
  globalSearch?: string
}

export default function Customers({ sales = [], globalSearch = '' }: Props) {
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null)

  // Deduplicate by orderId, paymentId, and ticketId
  const seenOrderIds = new Set<string>()
  const seenPaymentIds = new Set<string>()
  const seenTicketIds = new Set<string>()

  const deduped = sales.filter((s) => {
    if (!s.orderId || seenOrderIds.has(s.orderId)) return false
    seenOrderIds.add(s.orderId)
    if (s.paymentId && s.paymentId !== 'manual' && s.paymentId !== '—' && s.paymentId !== '-') {
      if (seenPaymentIds.has(s.paymentId)) return false
      seenPaymentIds.add(s.paymentId)
    }
    if (s.ticketId) {
      if (seenTicketIds.has(s.ticketId)) return false
      seenTicketIds.add(s.ticketId)
    }
    return true
  })

  // Derive real customers from sales data
  const customerMap = new Map<string, CustomerRecord>()
  deduped.forEach((sale) => {
    const key = sale.email
    const existing = customerMap.get(key)
    const isPaid = ['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(
      sale.status
    )
    if (!isPaid) {
      if (!existing) {
        const initials = (sale.name || 'Unknown')
          .split(' ')
          .map((w: string) => w[0]?.toUpperCase() || '')
          .slice(0, 2)
          .join('')
        customerMap.set(key, {
          name: sale.name || 'Unknown',
          email: sale.email,
          phone: sale.phone || '—',
          orders: 0,
          spend: 0,
          lastPurchase: sale.createdAt || '',
          refunds: 0,
          avatar: initials || '??',
        })
      }
      return
    }
    if (existing) {
      existing.orders += 1
      existing.spend += sale.amount || 0
      if (sale.createdAt && (!existing.lastPurchase || sale.createdAt > existing.lastPurchase)) {
        existing.lastPurchase = sale.createdAt
      }
    } else {
      const initials = (sale.name || 'Unknown')
        .split(' ')
        .map((w: string) => w[0]?.toUpperCase() || '')
        .slice(0, 2)
        .join('')
      customerMap.set(key, {
        name: sale.name || 'Unknown',
        email: sale.email,
        phone: sale.phone || '—',
        orders: 1,
        spend: sale.amount || 0,
        lastPurchase: sale.createdAt || '',
        refunds: 0,
        avatar: initials || '??',
      })
    }
  })

  const customers = Array.from(customerMap.values())
    .filter((c) => c.orders > 0)
    .sort((a, b) => b.spend - a.spend)

  const effectiveSearch = search || globalSearch
  const filtered = customers.filter((c) => {
    const q = effectiveSearch.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
  })

  const totalSpendSum = customers.reduce((a, c) => a + c.spend, 0)
  const avgLtv = customers.length > 0 ? Math.round(totalSpendSum / customers.length) : 0
  const repeatCount = customers.filter((c) => c.orders > 1).length
  const repeatPct = customers.length > 0 ? Math.round((repeatCount / customers.length) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gutter)' }}>
      {/* Reference KPI Stat Tiles */}
      <div className="kpi-row">
        <div className="tile tile-gold">
          <div className="tile-label">TOTAL CUSTOMERS</div>
          <div className="tile-value">{customers.length}</div>
          <div className="tile-sub">Active attendee accounts</div>
          <div className="tile-delta">
            <span>👤</span> Verified profiles
          </div>
        </div>

        <div className="tile tile-teal">
          <div className="tile-label">AVG LIFETIME VALUE</div>
          <div className="tile-value">₹{avgLtv.toLocaleString()}</div>
          <div className="tile-sub">Average spend per buyer</div>
          <div className="tile-delta">
            <span>↑</span> ₹{totalSpendSum.toLocaleString()} total
          </div>
        </div>

        <div className="tile tile-orange">
          <div className="tile-label">REPEAT BUYERS</div>
          <div className="tile-value">{repeatPct}%</div>
          <div className="tile-sub">{repeatCount} buyers with 2+ passes</div>
          <div className="tile-delta">
            <span>🔥</span> High loyalty
          </div>
        </div>

        <div className="tile tile-dark">
          <div className="tile-label">TOTAL SPEND</div>
          <div className="tile-value">₹{totalSpendSum.toLocaleString()}</div>
          <div className="tile-sub">Gross customer volume</div>
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers by name, email..."
          />
        </div>

        <div className="pill-toggle">
          <button
            className={view === 'grid' ? 'active' : ''}
            onClick={() => setView('grid')}
          >
            Grid
          </button>
          <button
            className={view === 'list' ? 'active' : ''}
            onClick={() => setView('list')}
          >
            List
          </button>
        </div>
      </div>

      {/* Customer Grid or Table */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-faint)' }}>
          👥 No customer records found matching search.
        </div>
      ) : view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--gutter)' }}>
          {filtered.map((c, i) => (
            <div className="card" key={i} onClick={() => setSelectedCustomer(c)} style={{ display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  className="cell-thumb"
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    fontSize: '16px',
                    background:
                      i % 3 === 0
                        ? 'var(--grad-violet)'
                        : i % 3 === 1
                        ? 'var(--grad-teal)'
                        : 'var(--grad-gold)',
                  }}
                >
                  {c.avatar}
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-faint)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {c.email}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  background: 'var(--panel-2)',
                  padding: '10px',
                  borderRadius: '12px',
                  border: '1px solid var(--line)',
                }}
              >
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--ink-faint)', fontWeight: 700 }}>ORDERS</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{c.orders} pass(es)</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--ink-faint)', fontWeight: 700 }}>SPEND</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--violet)' }}>₹{c.spend.toLocaleString()}</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--ink-faint)' }}>
                <span>Phone: {c.phone || '—'}</span>
                <span className="badge badge-blue">
                  <span className="badge-dot" />
                  Verified
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card table-card">
          <div className="table-scroll scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Orders</th>
                  <th>Total Spend</th>
                  <th>Last Active</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={i} onClick={() => setSelectedCustomer(c)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div className="cell-main">
                        <div
                          className="cell-thumb"
                          style={{
                            background:
                              i % 3 === 0
                                ? 'var(--grad-violet)'
                                : i % 3 === 1
                                ? 'var(--grad-teal)'
                                : 'var(--grad-gold)',
                          }}
                        >
                          {c.avatar}
                        </div>
                        <div className="cell-title">{c.name}</div>
                      </div>
                    </td>
                    <td>{c.email}</td>
                    <td>{c.phone || '—'}</td>
                    <td style={{ fontWeight: 700 }}>{c.orders}</td>
                    <td style={{ fontWeight: 700, color: 'var(--ink)' }}>₹{c.spend.toLocaleString()}</td>
                    <td>{c.lastPurchase ? new Date(c.lastPurchase).toLocaleDateString('en-IN') : '—'}</td>
                    <td>
                      <span className="badge badge-blue">
                        <span className="badge-dot" />
                        LitTix Direct
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {selectedCustomer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setSelectedCustomer(null)}
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
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '420px',
              maxWidth: '90vw',
              height: '100vh',
              background: 'var(--drawer-bg)',
              borderLeft: '2px solid var(--drawer-border)',
              boxShadow: '-8px 0 60px rgba(90, 50, 200, 0.15), -2px 0 20px rgba(0,0,0,0.3)',
              overflowY: 'auto',
              zIndex: 201,
              padding: '28px',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--line)' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>Customer Profile</h3>
              <button
                onClick={() => setSelectedCustomer(null)}
                style={{
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line)',
                  color: 'var(--ink)',
                  width: '32px',
                  height: '32px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>

            {/* Avatar + Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  background: 'var(--grad-violet)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '20px',
                  fontWeight: 800,
                }}
              >
                {selectedCustomer.avatar}
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>{selectedCustomer.name}</div>
                <span className="badge badge-blue" style={{ marginTop: '4px' }}>
                  <span className="badge-dot" />
                  Verified Customer
                </span>
              </div>
            </div>

            {/* Contact Info */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-faint)', marginBottom: '12px' }}>
                CONTACT INFORMATION
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { label: 'Email Address', value: selectedCustomer.email, icon: '✉️' },
                  { label: 'Phone Number', value: selectedCustomer.phone || '—', icon: '📱' },
                ].map(item => (
                  <div key={item.label} style={{ background: 'var(--panel-2)', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '16px' }}>{item.icon}</span>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--ink-faint)', fontWeight: 700 }}>{item.label}</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginTop: '2px' }}>{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Purchase Stats */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-faint)', marginBottom: '12px' }}>
                PURCHASE STATISTICS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  { label: 'TOTAL ORDERS', value: `${selectedCustomer.orders} pass(es)` },
                  { label: 'TOTAL SPEND', value: `₹${selectedCustomer.spend.toLocaleString()}` },
                  { label: 'LAST PURCHASE', value: selectedCustomer.lastPurchase ? new Date(selectedCustomer.lastPurchase).toLocaleDateString('en-IN') : '—' },
                  { label: 'REFUNDS', value: `${selectedCustomer.refunds}` },
                ].map(item => (
                  <div key={item.label} style={{ background: 'var(--panel-2)', padding: '12px', borderRadius: '12px', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--ink-faint)', fontWeight: 700 }}>{item.label}</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginTop: '4px' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Purchase History */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-faint)', marginBottom: '12px' }}>
                ORDER HISTORY
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sales.filter(s => s.email === selectedCustomer.email && ['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(s.status)).map((s: any, idx: number) => (
                  <div key={s.orderId || idx} style={{ background: 'var(--panel-2)', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>{s.event || 'FRESHERS TAKEOVER'}</div>
                      <div style={{ fontSize: '10.5px', color: 'var(--ink-faint)' }}>{s.createdAt ? new Date(s.createdAt).toLocaleString('en-IN') : '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--violet)' }}>₹{(s.amount || 0).toLocaleString()}</div>
                      <span className={`badge badge-${s.status === 'scanned' ? 'green' : 'blue'}`} style={{ fontSize: '9px' }}>
                        <span className="badge-dot" />
                        {s.status === 'scanned' ? 'Scanned' : 'Paid'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
