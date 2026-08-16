import { useState } from 'react'

interface EmailDeliveryProps {
  sales: any[]
  onResend: (ticketId: string) => Promise<void>
}

export default function EmailDelivery({ sales = [], onResend }: EmailDeliveryProps) {
  const [filterStatus, setFilterStatus] = useState<'all' | 'sent' | 'failed' | 'pending'>('all')
  const [search, setSearch] = useState('')

  const emailRecords = sales.filter((s) => s.emailStatus)

  const logs = emailRecords.map((s: any) => {
    return {
      id: s.ticketId || s.orderId,
      time: s.createdAt ? new Date(s.createdAt).toLocaleString('en-IN') : '—',
      recipient: s.email,
      name: s.name || 'Attendee',
      subject: `Your ${s.event || 'FRESHERS TAKEOVER'} Pass`,
      status: s.emailStatus, // sent, failed, pending
      error: s.emailError || '—',
      retryCount: s.errorLog ? s.errorLog.filter((log: any) => log.stage === 'email').length : 0,
    }
  })

  const sentCount = logs.filter((l) => l.status === 'sent').length
  const failedCount = logs.filter((l) => l.status === 'failed').length
  const pendingCount = logs.filter((l) => l.status === 'pending').length
  const totalCount = logs.length

  const deliveredPct = totalCount > 0 ? Math.round((sentCount / totalCount) * 100) : 100

  const filteredLogs = logs.filter((l) => {
    if (filterStatus !== 'all' && l.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        l.recipient.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        l.subject.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gutter)' }}>
      {/* Reference KPI Stat Tiles */}
      <div className="kpi-row">
        <div className="tile tile-gold">
          <div className="tile-label">DELIVERED RATE</div>
          <div className="tile-value">{deliveredPct}%</div>
          <div className="tile-sub">{sentCount} of {totalCount} delivered</div>
          <div className="tile-delta">
            <span>✓</span> High deliverability
          </div>
        </div>

        <div className="tile tile-teal">
          <div className="tile-label">SENT SUCCESSFULLY</div>
          <div className="tile-value">{sentCount}</div>
          <div className="tile-sub">Gmail SMTP dispatched</div>
          <div className="tile-delta">
            <span>↑</span> {sentCount} sent
          </div>
        </div>

        <div className="tile tile-orange">
          <div className="tile-label">DELIVERY FAILURES</div>
          <div className="tile-value">{failedCount}</div>
          <div className="tile-sub">SMTP or timeout errors</div>
          <div className={`tile-delta ${failedCount > 0 ? 'down' : 'up'}`}>
            <span>{failedCount > 0 ? '⚠' : '✓'}</span>{' '}
            {failedCount > 0 ? `${failedCount} retries pending` : 'Zero errors'}
          </div>
        </div>

        <div className="tile tile-dark">
          <div className="tile-label">IN QUEUE</div>
          <div className="tile-value">{pendingCount}</div>
          <div className="tile-sub">Awaiting SMTP trigger</div>
          <div className="tile-delta">
            <span>⏳</span> Queue clear
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
            placeholder="Search email logs by recipient, name..."
          />
        </div>

        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
          <option value="all">All statuses</option>
          <option value="sent">Delivered (Sent)</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Email Delivery Table Card */}
      <div className="card table-card">
        <div className="table-scroll scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Subject</th>
                <th>Trigger Time</th>
                <th>Status</th>
                <th>Retries</th>
                <th>Diagnostic Error</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-faint)' }}>
                    No email logs matching criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div className="cell-main">
                        <div
                          className="cell-thumb"
                          style={{
                            background:
                              l.status === 'sent'
                                ? 'var(--grad-teal)'
                                : l.status === 'failed'
                                ? 'var(--grad-orange)'
                                : 'var(--grad-gold)',
                          }}
                        >
                          ✉
                        </div>
                        <div>
                          <div className="cell-title">{l.recipient}</div>
                          <div className="cell-sub">{l.name}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{l.subject}</td>
                    <td>{l.time}</td>
                    <td>
                      {l.status === 'sent' ? (
                        <span className="badge badge-green">
                          <span className="badge-dot" />
                          Delivered
                        </span>
                      ) : l.status === 'failed' ? (
                        <span className="badge badge-red">
                          <span className="badge-dot" />
                          Failed
                        </span>
                      ) : (
                        <span className="badge badge-amber">
                          <span className="badge-dot" />
                          Queued
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 700 }}>{l.retryCount}</td>
                    <td style={{ color: 'var(--red)', fontSize: '11px', fontFamily: 'monospace' }} title={l.error}>
                      {l.error}
                    </td>
                    <td>
                      {l.status === 'failed' && (
                        <button
                          className="btn-primary"
                          onClick={() => onResend(l.id)}
                          style={{ height: '28px', padding: '0 10px', fontSize: '11px' }}
                        >
                          Retry Resend
                        </button>
                      )}
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
