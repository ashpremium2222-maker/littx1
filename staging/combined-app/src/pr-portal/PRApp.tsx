import { useState, useEffect, useCallback } from 'react'

// ==================== TYPES ====================
interface PRUser {
  id: string
  username: string
  displayName: string
}

interface Sale {
  orderId: string
  name: string
  email: string
  phone: string
  gender: string
  amount: number
  status: string
  ticketId?: string
  createdAt: string
  paymentMethod?: string
  prUserId?: string
}

// ==================== PR USERS (login credentials) ====================
const PR_USERS: (PRUser & { password: string })[] = [
  { id: 'pr1', username: 'partner1', password: 'ftpr@001', displayName: 'Partner One' },
  { id: 'pr2', username: 'partner2', password: 'ftpr@002', displayName: 'Partner Two' },
  { id: 'pr3', username: 'partner3', password: 'ftpr@003', displayName: 'Partner Three' },
  { id: 'pr4', username: 'partner4', password: 'ftpr@004', displayName: 'Partner Four' },
  { id: 'pr5', username: 'partner5', password: 'ftpr@005', displayName: 'Partner Five' },
]

const PRICING = { female: 599, male: 699 }
const API = ''

// ==================== LOGIN PAGE ====================
function LoginPage({ onLogin }: { onLogin: (user: PRUser) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [ipLocked, setIpLocked] = useState<{ lockedIp: string } | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setIpLocked(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      })
      const data = await res.json()
      if (data.success && data.user && (data.user.role === 'pr' || data.user.role === 'seller')) {
        const safeUser: PRUser = { id: data.user.userId, username: data.user.userId, displayName: data.user.displayName || data.user.userId }
        sessionStorage.setItem('pr_user', JSON.stringify(safeUser))
        sessionStorage.setItem('littx_token', data.token)
        onLogin(safeUser)
      } else if (data.ipLocked) {
        setIpLocked({ lockedIp: data.lockedIp || 'another device' })
      } else {
        setError(data.message || 'Invalid credentials')
      }
    } catch (err: any) {
      setError(err.message || 'Server connection error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-canvas" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '32px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 900, letterSpacing: '2px' }}>
            LITTX <span style={{ color: 'var(--accent)' }}>●</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--ink-faint)', marginTop: '8px' }}>Partner Portal</div>
        </div>

        {/* IP-lock error — device locked to another IP */}
        {ipLocked && (
          <div style={{
            background: 'rgba(168,85,247,0.1)',
            border: '1px solid rgba(168,85,247,0.35)',
            color: '#c4b5fd',
            padding: '12px 14px',
            borderRadius: '8px',
            fontSize: '0.78rem',
            fontWeight: 600,
            marginBottom: '16px',
            textAlign: 'center',
            lineHeight: 1.6
          }}>
            🔒 Account locked to another device<br />
            <span style={{ fontWeight: 400, color: '#a78bfa' }}>IP: {ipLocked.lockedIp}</span><br />
            Contact LITTX admin to unlock.
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '8px', color: 'var(--ink-soft)' }}>USERNAME</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="partner1"
              required
              style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--line)', padding: '12px', borderRadius: '8px', color: 'var(--ink)', fontSize: '0.9rem' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '8px', color: 'var(--ink-soft)' }}>PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--line)', padding: '12px', borderRadius: '8px', color: 'var(--ink)', fontSize: '0.9rem' }}
            />
          </div>
          {error && <div style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', padding: '10px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, textAlign: 'center' }}>{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: '12px', marginTop: '8px' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ==================== SELL TICKET MODAL ====================
function SellTicketModal({
  prUser,
  onClose,
  onSuccess,
}: {
  prUser: PRUser
  onClose: () => void
  onSuccess: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'pending' | 'done'>('form')
  const [message, setMessage] = useState('')

  const amount = PRICING[gender]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !email || !phone) return
    setLoading(true)

    try {
      // All sales are manual/cash — submit for admin approval
      const res = await fetch(`${API}/api/pr/cash-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, gender, quantity: 1, prUserId: prUser.id, prName: prUser.displayName }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || 'Failed')
      setMessage('⏳ Cash sale submitted for admin approval. Ticket will be sent once approved.')
      setStep('pending')
      onSuccess()
      setLoading(false)
    } catch (err: any) {
      setMessage(`❌ ${err.message}`)
      setStep('done')
      setLoading(false)
    }
  }

  if (step === 'done' || step === 'pending') {
    return (
      <div className="pr-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
        <div className="card" onClick={e => e.stopPropagation()} style={{ width: '400px', textAlign: 'center', padding: '32px' }}>
          <p style={{ fontSize: '1.1rem', fontWeight: 700 }}>{message}</p>
          <button className="btn btn-primary" style={{ marginTop: 24, width: '100%' }} onClick={onClose}>Done</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '500px', padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--line)', background: 'var(--panel-2)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Sell Ticket</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '8px', color: 'var(--ink-soft)' }}>ATTENDEE NAME</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Riya Sharma" required style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--line)', padding: '10px 14px', borderRadius: '8px', color: 'var(--ink)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '8px', color: 'var(--ink-soft)' }}>EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="riya@example.com" required style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--line)', padding: '10px 14px', borderRadius: '8px', color: 'var(--ink)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '8px', color: 'var(--ink-soft)' }}>PHONE</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" required style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--line)', padding: '10px 14px', borderRadius: '8px', color: 'var(--ink)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '8px', color: 'var(--ink-soft)' }}>PASS TYPE</label>
              <select value={gender} onChange={e => setGender(e.target.value as any)} style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--line)', padding: '10px 14px', borderRadius: '8px', color: 'var(--ink)' }}>
                <option value="male">Male Pass (₹{PRICING.male})</option>
                <option value="female">Female Pass (₹{PRICING.female})</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '8px', color: 'var(--ink-soft)' }}>PAYMENT</label>
              <div style={{ width: '100%', background: 'var(--volt-dim)', border: '1px solid rgba(216,255,63,0.25)', padding: '10px 14px', borderRadius: '8px', color: 'var(--volt)', fontWeight: 700, fontSize: '13px' }}>💵 Cash</div>
            </div>
          </div>

          <div style={{ background: 'var(--panel-3)', padding: '16px', borderRadius: '12px', border: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--ink-soft)' }}>Total to collect</span>
            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent)' }}>₹{amount}</span>
          </div>

          <div style={{ background: 'rgba(216,255,63,0.08)', border: '1px solid rgba(216,255,63,0.2)', color: 'var(--volt)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600 }}>
            💵 All sales are manual cash payments. Admin will approve and send the ticket.
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: '14px', marginTop: '8px', fontSize: '1rem' }}>
            {loading ? 'Submitting…' : `Submit Cash Sale — ₹${amount}`}
          </button>
        </form>
      </div>
    </div>
  )
}

// ==================== PR DASHBOARD ====================
function PRDashboard({ prUser, onLogout, dark, setDark }: { prUser: PRUser; onLogout: () => void, dark: boolean, setDark: any }) {
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showSell, setShowSell] = useState(false)
  const [viewSale, setViewSale] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'pending' | 'confirmed'>('all')

  const fetchSales = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/pr/sales?prUserId=${prUser.id}`)
      const data = await res.json()
      if (data.success) setSales(data.sales || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [prUser.id])

  useEffect(() => {
    fetchSales()
    const interval = setInterval(fetchSales, 15000)
    return () => clearInterval(interval)
  }, [fetchSales])

  const totalSold = sales.length
  const totalRevenue = sales
    .filter(s => ['paid', 'ticket_generated', 'emailed', 'scanned'].includes(s.status))
    .reduce((sum, s) => sum + (s.amount || 0), 0)
  const pending = sales.filter(s => s.status === 'pr_cash_pending').length
  const confirmed = sales.filter(s => ['ticket_generated', 'emailed', 'scanned', 'paid'].includes(s.status)).length

  function statusBadge(status: string) {
    if (['ticket_generated', 'emailed', 'scanned'].includes(status))
      return <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>✓ Sent</span>
    if (status === 'pr_cash_pending')
      return <span style={{ background: 'rgba(245,197,66,0.15)', color: '#F5C542', border: '1px solid rgba(245,197,66,0.25)', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>⏳ Pending</span>
    if (status === 'paid')
      return <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>✓ Paid</span>
    if (status === 'created')
      return <span style={{ background: 'rgba(124,92,250,0.15)', color: '#7C5CFA', border: '1px solid rgba(124,92,250,0.25)', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Payment</span>
    return <span style={{ background: 'var(--panel-3)', color: 'var(--ink-faint)', border: '1px solid var(--line)', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{status}</span>
  }

  return (
    <div className={`app-canvas pr-portal ${dark ? '' : 'theme-light'}`} style={{ '--rail-w': '0px' } as React.CSSProperties}>
      {/* Header Topbar */}
      <header className="topbar">
        <div className="tb-profile">
          <div className="tb-avatar-sm" style={{ background: 'var(--accent)', color: '#fff' }}>
            {prUser.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="who">
            <div className="name">
              {prUser.displayName} <span className="badge-pro">PR</span>
            </div>
            <div className="handle">Partner Dashboard</div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <div className="topbar-actions">
          <button
            onClick={() => setDark(!dark)}
            className="tb-icon-btn"
            title="Toggle Light/Dark Theme"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              {dark ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
          <div className="badge badge-green" style={{ padding: '6px 12px', fontSize: '11px' }}>
            <span className="badge-dot" />
            LIVE MODE
          </div>
          <button className="tb-icon-btn" onClick={onLogout} title="Sign Out" style={{ transition: 'all .2s' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>logout</span>
          </button>
          <button className="btn btn-primary" onClick={() => setShowSell(true)}>+ Sell Ticket</button>
        </div>
      </header>

      {/* Main scrollable content */}
      <div className="content">
        {/* KPI tiles */}
        <div className="kpi-row">
          <div className="tile tile-violet">
            <div className="tile-label">TICKETS SOLD</div>
            <div className="tile-value">{totalSold}</div>
            <div className="tile-sub">Total pass orders generated</div>
            <div className="tile-delta"><span>↑</span> {totalSold} total</div>
          </div>
          <div className="tile tile-teal">
            <div className="tile-label">REVENUE COLLECTED</div>
            <div className="tile-value">₹{totalRevenue.toLocaleString()}</div>
            <div className="tile-sub">Across all confirmed sales</div>
            <div className="tile-delta"><span>✓</span> Verified sales</div>
          </div>
          <div className="tile tile-orange">
            <div className="tile-label">PENDING APPROVAL</div>
            <div className="tile-value">{pending}</div>
            <div className="tile-sub">Cash sales awaiting admin action</div>
            <div className="tile-delta"><span>⏳</span> Live status</div>
          </div>
          <div className="tile tile-gold">
            <div className="tile-label">CONFIRMED TICKETS</div>
            <div className="tile-value">{confirmed}</div>
            <div className="tile-sub">Tickets sent to attendees</div>
            <div className="tile-delta"><span>✓</span> Successful deliveries</div>
          </div>
        </div>

        {/* Sales table */}
        <div className="card table-card">
          <div className="pr-filter-bar">
            <span className="pr-filter-title">Your Ticket Sales</span>
            <div className="pr-filter-actions">
              <div className="pr-search-wrap">
                <span className="material-symbols-outlined search-icon">search</span>
                <input
                  type="text"
                  placeholder="Search name or email…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="pr-filter-controls">
                <select
                  value={paymentFilter}
                  onChange={e => setPaymentFilter(e.target.value as any)}
                >
                  <option value="all">All Sales</option>
                  <option value="pending">Pending Approval</option>
                  <option value="confirmed">Confirmed</option>
                </select>
                <button className="tb-icon-btn refresh-btn" onClick={fetchSales} title="Refresh">
                  <span className="material-symbols-outlined">refresh</span>
                </button>
              </div>
            </div>
          </div>
          
          {(() => {
            if (loading) return (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-faint)' }}>Loading…</div>
            );
            if (sales.length === 0) return (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-faint)' }}>
                No tickets sold yet. Click <strong>+ Sell Ticket</strong> to start!
              </div>
            );
            const q = searchQuery.toLowerCase();
            const filtered = sales.filter(s => {
              const matchSearch = !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
              const matchPayment =
                paymentFilter === 'all' ||
                (paymentFilter === 'pending' && s.status === 'pr_cash_pending') ||
                (paymentFilter === 'confirmed' && ['ticket_generated','emailed','scanned','paid'].includes(s.status));
              return matchSearch && matchPayment;
            });
            if (filtered.length === 0) return (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-faint)' }}>
                No results match your filters.
              </div>
            );
            return (
              <>
                {/* Desktop table – hidden on mobile via CSS */}
                <div className="table-scroll scroll pr-table-desktop">
                  <table className="table">
                    <thead><tr>
                      <th>Date</th><th>Attendee</th><th>Pass Type</th><th>Amount</th>
                      <th>Payment</th><th>Status</th><th>Ticket ID</th><th>Action</th>
                    </tr></thead>
                    <tbody>
                      {filtered.map(s => (
                        <tr key={s.orderId}>
                          <td style={{ fontSize: '0.8rem' }}>{new Date(s.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                          <td>
                            <div className="cell-main">
                              <div className="cell-thumb">{s.name.charAt(0)}</div>
                              <div>
                                <div className="cell-title">{s.name}</div>
                                <div className="cell-sub">{s.email}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ textTransform: 'capitalize', fontWeight: 600 }}>{s.gender} Pass</td>
                          <td style={{ fontWeight: 800 }}>₹{s.amount?.toLocaleString()}</td>
                          <td>
                            <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'rgba(216,255,63,0.1)', color: 'var(--volt)', border: '1px solid rgba(216,255,63,0.2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>💵 Cash</span>
                          </td>
                          <td>{statusBadge(s.status)}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', opacity: 0.7 }}>{s.ticketId || '—'}</td>
                          <td><button className="btn btn-ghost btn-sm" onClick={() => setViewSale(s)}>View</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards – shown only on mobile via CSS */}
                <div className="pr-cards-mobile">
                  {filtered.map(s => (
                    <div key={s.orderId} className="pr-sale-card">
                      <div className="pr-sale-card-header">
                        <div className="pr-sale-card-avatar">{s.name.charAt(0)}</div>
                        <div className="pr-sale-card-info">
                          <div className="pr-sale-card-name">{s.name}</div>
                          <div className="pr-sale-card-email">{s.email}</div>
                        </div>
                        <div style={{ marginLeft: 'auto' }}>{statusBadge(s.status)}</div>
                      </div>
                      <div className="pr-sale-card-meta">
                        <div className="pr-sale-card-chip">
                          <div className="pr-sale-card-chip-label">Pass</div>
                          <div className="pr-sale-card-chip-value" style={{ textTransform: 'capitalize' }}>{s.gender}</div>
                        </div>
                        <div className="pr-sale-card-chip">
                          <div className="pr-sale-card-chip-label">Amount</div>
                          <div className="pr-sale-card-chip-value">₹{s.amount?.toLocaleString()}</div>
                        </div>
                        <div className="pr-sale-card-chip">
                          <div className="pr-sale-card-chip-label">Payment</div>
                          <div className="pr-sale-card-chip-value">Cash</div>
                        </div>
                      </div>
                      <div className="pr-sale-card-footer">
                        <button className="btn btn-ghost btn-sm" onClick={() => setViewSale(s)}>View</button>
                        <div className="pr-sale-card-id">{s.ticketId || '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}

        </div>
      </div>


      {showSell && (
        <SellTicketModal
          prUser={prUser}
          onClose={() => setShowSell(false)}
          onSuccess={() => { setShowSell(false); fetchSales() }}
        />
      )}

      {viewSale && (
        <div className="pr-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setViewSale(null)}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '500px', padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--line)', background: 'var(--panel-2)' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Ticket Details</h3>
              <button onClick={() => setViewSale(null)} style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>Buyer Information</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', background: 'var(--panel-3)', color: 'var(--ink)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.2rem', border: '1px solid var(--line)' }}>
                    {viewSale.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{viewSale.name}</div>
                    <div style={{ color: 'var(--ink-soft)', fontSize: '0.85rem' }}>{viewSale.email} • {viewSale.phone}</div>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>Ticket Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ background: 'var(--panel-2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--ink-soft)', fontWeight: 700 }}>EVENT</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>{viewSale.event || 'FRESHERS TAKEOVER'}</div>
                  </div>
                  <div style={{ background: 'var(--panel-2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--ink-soft)', fontWeight: 700 }}>TICKET TYPE</div>
                    <div style={{ fontWeight: 600, marginTop: '2px', textTransform: 'capitalize' }}>{viewSale.gender} Pass</div>
                  </div>
                  <div style={{ background: 'var(--panel-2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--ink-soft)', fontWeight: 700 }}>QUANTITY</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>{viewSale.quantity || 1} pass(es)</div>
                  </div>
                  <div style={{ background: 'var(--panel-2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--ink-soft)', fontWeight: 700 }}>STATUS</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>{statusBadge(viewSale.status)}</div>
                  </div>
                </div>
              </div>

              {viewSale.ticketId && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <a href={`/api/ticket/${viewSale.ticketId}/download`} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ flex: 1, textDecoration: 'none', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    Download PDF
                  </a>
                  <button className="btn btn-ghost" style={{ flex: 1, border: '1px solid var(--line)' }} onClick={async (e) => {
                    const btn = e.currentTarget
                    const orig = btn.innerText
                    btn.innerText = 'Sending...'
                    try {
                      await fetch(`${API}/api/ticket/${viewSale.ticketId}/resend`, { method: 'POST' })
                      btn.innerText = 'Sent!'
                    } catch {
                      btn.innerText = 'Error'
                    }
                    setTimeout(() => btn.innerText = orig, 2000)
                  }}>
                    Resend Email
                  </button>
                </div>
              )}

              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>Payment Breakdown</div>
                <div style={{ background: 'var(--panel-2)', borderRadius: '12px', padding: '16px', border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--ink-soft)' }}>Gateway</span>
                    <span style={{ fontWeight: 600 }}>Manual / Cash ({viewSale.paymentId || '—'})</span>
                  </div>
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.1rem' }}>
                    <span>Total Paid</span>
                    <span style={{ color: 'var(--accent)' }}>₹{viewSale.amount?.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== ROOT ====================
export default function PRApp() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved ? saved === 'dark' : true
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  const [prUser, setPrUser] = useState<PRUser | null>(() => {
    try {
      const saved = sessionStorage.getItem('pr_user')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })

  function handleLogout() {
    sessionStorage.removeItem('pr_user')
    setPrUser(null)
  }

  if (!prUser) return <LoginPage onLogin={setPrUser} />
  return <PRDashboard prUser={prUser} onLogout={handleLogout} dark={dark} setDark={setDark} />
}
