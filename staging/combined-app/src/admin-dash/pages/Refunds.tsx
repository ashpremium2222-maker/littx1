import { useState } from 'react'

interface Sale {
  orderId: string
  name: string
  email: string
  event: string
  amount: number
  status: string
  createdAt: string
  ticketId?: string
}

interface Props {
  sales: Sale[]
  adminKey?: string
  onResend?: (ticketId: string) => void
}

export default function Refunds({ sales = [] }: Props) {
  const [filter, setFilter] = useState<'all' | 'paid' | 'failed' | 'pending'>('all')
  const [search, setSearch] = useState('')

  const problemOrders = sales.filter(
    (s) => s.status === 'failed' || s.status === 'cancelled' || s.status === 'pending'
  )
  const paidOrders = sales.filter((s) =>
    ['paid', 'ticket_generated', 'emailed', 'scanned'].includes(s.status)
  )

  const totalProblemAmount = problemOrders.reduce((a, r) => a + (r.amount || 0), 0)
  const totalPaidAmount = paidOrders.reduce((a, r) => a + (r.amount || 0), 0)
  const failedCount = sales.filter((r) => r.status === 'failed').length
  const pendingCount = sales.filter((r) => r.status === 'pending').length

  const filteredSales = sales.filter((s) => {
    if (filter === 'paid' && !['paid', 'ticket_generated', 'emailed', 'scanned'].includes(s.status))
      return false
    if (filter === 'failed' && s.status !== 'failed') return false
    if (filter === 'pending' && s.status !== 'pending') return false

    if (search) {
      const q = search.toLowerCase()
      return (
        s.orderId.toLowerCase().includes(q) ||
        (s.name || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gutter)' }}>
      {/* Reference KPI Stat Tiles */}
      <div className="kpi-row">
        <div className="tile tile-gold">
          <div className="tile-label">PROCESSED VOLUME</div>
          <div className="tile-value">₹{totalPaidAmount.toLocaleString()}</div>
          <div className="tile-sub">{paidOrders.length} successful payouts</div>
          <div className="tile-delta">
            <span>↑</span> Verified sales
          </div>
        </div>

        <div className="tile tile-teal">
          <div className="tile-label">SUCCESSFUL RATE</div>
          <div className="tile-value">
            {sales.length > 0
              ? `${Math.round((paidOrders.length / sales.length) * 100)}%`
              : '100%'}
          </div>
          <div className="tile-sub">Razorpay & Manual gateway</div>
          <div className="tile-delta">
            <span>✓</span> Healthy
          </div>
        </div>

        <div className="tile tile-orange">
          <div className="tile-label">AT-RISK / FAILED</div>
          <div className="tile-value">₹{totalProblemAmount.toLocaleString()}</div>
          <div className="tile-sub">{failedCount} failed · {pendingCount} pending</div>
          <div className={`tile-delta ${failedCount > 0 ? 'down' : 'up'}`}>
            <span>{failedCount > 0 ? '⚠' : '✓'}</span>{' '}
            {failedCount > 0 ? 'Requires attention' : 'All clear'}
          </div>
        </div>

        <div className="tile tile-dark">
          <div className="tile-label">TOTAL TRANSACTIONS</div>
          <div className="tile-value">{sales.length}</div>
          <div className="tile-sub">Across all payment logs</div>
          <div className="tile-delta up">
            <span>💳</span> Gateway active
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
            placeholder="Search payments by order ID, buyer name..."
          />
        </div>

        <select value={filter} onChange={(e) => setFilter(e.target.value as any)}>
          <option value="all">All transactions</option>
          <option value="paid">Paid (Settled)</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Payments & Refunds Table Card */}
      <div className="card table-card">
        <div className="table-scroll scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Buyer</th>
                <th>Event</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-faint)' }}>
                    No payment transactions matching criteria.
                  </td>
                </tr>
              ) : (
                filteredSales.map((r) => {
                  const isPaid = ['paid', 'ticket_generated', 'emailed', 'scanned'].includes(r.status)
                  return (
                    <tr key={r.orderId}>
                      <td>
                        <div className="cell-main">
                          <div
                            className="cell-thumb"
                            style={{
                              background: isPaid ? 'var(--grad-violet)' : 'var(--grad-orange)',
                            }}
                          >
                            💳
                          </div>
                          <div className="cell-title">#{r.orderId.substring(0, 10)}</div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.name}</div>
                        <div style={{ fontSize: '10.5px', color: 'var(--ink-faint)' }}>{r.email}</div>
                      </td>
                      <td>{r.event || 'DHOLIDA GARBA ROYALE'}</td>
                      <td
                        style={{
                          fontWeight: 700,
                          color: r.status === 'failed' ? 'var(--red)' : 'var(--ink)',
                        }}
                      >
                        ₹{(r.amount || 0).toLocaleString()}
                      </td>
                      <td>
                        {isPaid ? (
                          <span className="badge badge-green">
                            <span className="badge-dot" />
                            Settled
                          </span>
                        ) : r.status === 'failed' ? (
                          <span className="badge badge-red">
                            <span className="badge-dot" />
                            Failed
                          </span>
                        ) : (
                          <span className="badge badge-amber">
                            <span className="badge-dot" />
                            Pending
                          </span>
                        )}
                      </td>
                      <td>{r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN') : '—'}</td>
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
