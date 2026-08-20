import { useState, useEffect } from 'react'

interface ShadowSale {
  orderId: string
  ticketId?: string
  name: string
  email: string
  phone?: string
  event: string
  gender?: string
  ticketType?: string
  quantity: number
  amount: number
  status: string
  createdAt: string
  generatedBy?: string
  source?: string
  isShadow?: boolean
}

export default function ShadowSalesPage({ adminKey }: { adminKey: string }) {
  const [sales, setSales] = useState<ShadowSale[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [eventFilter, setEventFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const fetchShadowSales = async () => {
    setLoading(true)
    try {
      const token = sessionStorage.getItem('littx_token') || adminKey || ''
      const res = await fetch('/api/admin/shadow-sales', {
        headers: { 'x-auth-token': token, 'x-admin-key': adminKey }
      })
      const data = await res.json()
      if (data.success) {
        setSales(data.sales || [])
      }
    } catch (err) {
      console.error('Failed to load shadow sales:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchShadowSales()
  }, [])

  const filteredSales = sales.filter((s) => {
    const matchesSearch =
      !search ||
      s.orderId?.toLowerCase().includes(search.toLowerCase()) ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase()) ||
      s.phone?.toLowerCase().includes(search.toLowerCase()) ||
      s.ticketId?.toLowerCase().includes(search.toLowerCase())

    const matchesEvent = eventFilter === 'all' || s.event === eventFilter
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter

    return matchesSearch && matchesEvent && matchesStatus
  })

  const totalShadowRevenue = filteredSales.reduce((sum, s) => sum + (s.amount || 0), 0)
  const totalShadowTickets = filteredSales.reduce((sum, s) => sum + (s.quantity || 1), 0)
  const totalShadowOrders = filteredSales.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* KPI Header Tiles */}
      <div className="kpi-row">
        <div className="tile tile-violet">
          <div className="tile-label">SHADOW SALES REVENUE</div>
          <div className="tile-value">₹{totalShadowRevenue.toLocaleString()}</div>
          <div className="tile-sub">Total revenue from private shadow sales</div>
          <div className="tile-delta">
            <span>👻</span> Shadow Financials
          </div>
        </div>

        <div className="tile tile-teal">
          <div className="tile-label">SHADOW TICKETS ISSUED</div>
          <div className="tile-value">{totalShadowTickets}</div>
          <div className="tile-sub">Genuine passes issued via /shadowbyash</div>
          <div className="tile-delta">
            <span>🎟️</span> Shadow Capacity
          </div>
        </div>

        <div className="tile tile-orange">
          <div className="tile-label">TOTAL SHADOW ORDERS</div>
          <div className="tile-value">{totalShadowOrders}</div>
          <div className="tile-sub">Excluded from public dashboard</div>
          <div className="tile-delta">
            <span>🔒</span> Isolated Records
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <input
              type="text"
              placeholder="Search Order ID, Name, Email, Phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--ink)',
                fontSize: '13px'
              }}
            />
          </div>

          <div>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--ink)',
                fontSize: '13px'
              }}
            >
              <option value="all">All Events</option>
              <option value="FRESHERS TAKEOVER">FRESHERS TAKEOVER</option>
              <option value="AURA GENESIS">AURA GENESIS</option>
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--ink)',
                fontSize: '13px'
              }}
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="ticket_generated">Ticket Generated</option>
              <option value="emailed">Emailed</option>
              <option value="scanned">Scanned at Gate</option>
            </select>
          </div>

          <button className="btn-secondary" onClick={fetchShadowSales} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Table Card */}
      <div className="card table-card">
        <div className="card-head" style={{ padding: '18px 18px 0' }}>
          <h3>Shadow Sales Records (/shadowbyash)</h3>
          <div className="muted-sm">Private sales records — visible strictly inside /admin</div>
        </div>

        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Order & Ticket ID</th>
                <th>Customer</th>
                <th>Event</th>
                <th>Pass Type</th>
                <th>Qty</th>
                <th>Total Amount</th>
                <th>Date / Time</th>
                <th>Status</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--ink-faint)' }}>
                    {loading ? 'Loading shadow sales records...' : 'No shadow sales found matching filter criteria.'}
                  </td>
                </tr>
              ) : (
                filteredSales.map((s) => (
                  <tr key={s.orderId}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{s.orderId}</div>
                      <div style={{ fontSize: '11px', color: 'var(--ink-faint)', fontFamily: 'monospace' }}>
                        {s.ticketId || 'N/A'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{s.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>{s.email}</div>
                      {s.phone && <div style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>{s.phone}</div>}
                    </td>
                    <td style={{ fontWeight: 600 }}>{s.event || 'FRESHERS TAKEOVER'}</td>
                    <td>{s.gender === 'female' ? 'Female Pass' : 'Male Pass'}</td>
                    <td style={{ fontWeight: 700 }}>{s.quantity || 1}</td>
                    <td style={{ fontWeight: 800, color: 'var(--teal)' }}>₹{(s.amount || 0).toLocaleString()}</td>
                    <td style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>
                      {s.createdAt ? new Date(s.createdAt).toLocaleString() : 'N/A'}
                    </td>
                    <td>
                      <span className="badge badge-teal">
                        <span className="badge-dot" />
                        {s.status}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '10px',
                          fontWeight: 800,
                          backgroundColor: 'rgba(168, 85, 247, 0.15)',
                          color: '#c084fc',
                          border: '1px solid rgba(168, 85, 247, 0.3)'
                        }}
                      >
                        👻 Shadow Sale
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
