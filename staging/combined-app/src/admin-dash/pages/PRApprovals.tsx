import { useState, useMemo } from 'react'

interface PRApprovalsProps {
  adminKey: string
  isPresentation?: boolean
  sales: any[]
}

export default function PRApprovals({ adminKey, isPresentation = false, sales = [] }: PRApprovalsProps) {
  const [actionId, setActionId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [tab, setTab] = useState<'pending' | 'history'>('pending')

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // Filter sales for PR Cash transactions
  const pending = useMemo(() => {
    return sales.filter((s: any) => s.paymentMethod === 'cash' && s.status === 'pr_cash_pending')
  }, [sales])

  const history = useMemo(() => {
    return sales
      .filter((s: any) => s.paymentMethod === 'cash' && s.status !== 'pr_cash_pending' && s.status !== 'created')
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
  }, [sales])

  async function handleApprove(orderId: string) {
    if (isPresentation) return
    setActionId(orderId)
    try {
      const res = await fetch('/api/admin/pr-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ orderId }),
      })
      const data = await res.json()
      if (data.success) {
        showToast(data.message || 'Ticket approved and emailed!', 'success')
      } else {
        showToast(data.message || 'Error approving', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    } finally {
      setActionId(null)
    }
  }

  async function handleReject(orderId: string) {
    if (isPresentation) return
    if (!window.confirm('Reject this cash sale?')) return
    setActionId(orderId)
    try {
      const res = await fetch('/api/admin/pr-reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ orderId }),
      })
      const data = await res.json()
      if (data.success) {
        showToast('Sale rejected.', 'success')
      } else {
        showToast(data.message || 'Error rejecting', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    } finally {
      setActionId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gutter)' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
          color: toast.type === 'success' ? '#4ade80' : '#fca5a5',
          padding: '12px 20px', borderRadius: 12, fontWeight: 700, fontSize: '0.85rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header tile */}
      <div className="kpi-row">
        <div className="tile tile-orange">
          <div className="tile-label">PENDING APPROVALS</div>
          <div className="tile-value">{pending.length}</div>
          <div className="tile-sub">Partner cash sales awaiting approval</div>
          <div className="tile-delta">
            <span>{pending.length > 0 ? '⚠️' : '✓'}</span>{' '}
            {pending.length > 0 ? 'Needs your action' : 'All clear'}
          </div>
        </div>
        <div className="tile tile-teal">
          <div className="tile-label">APPROVED TICKETS</div>
          <div className="tile-value">{history.filter(h => h.status !== 'pr_cash_rejected').length}</div>
          <div className="tile-sub">Cash received and tickets sent</div>
          <div className="tile-delta">
            <span>✓</span> Historical data
          </div>
        </div>
      </div>

      {/* Tables */}
      <div className="card table-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span
              onClick={() => setTab('pending')}
              style={{
                fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                color: tab === 'pending' ? 'var(--ink)' : 'var(--ink-faint)',
                borderBottom: tab === 'pending' ? '2px solid var(--ink)' : '2px solid transparent',
                paddingBottom: '4px'
              }}
            >
              Pending ({pending.length})
            </span>
            <span
              onClick={() => setTab('history')}
              style={{
                fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                color: tab === 'history' ? 'var(--ink)' : 'var(--ink-faint)',
                borderBottom: tab === 'history' ? '2px solid var(--ink)' : '2px solid transparent',
                paddingBottom: '4px'
              }}
            >
              History ({history.length})
            </span>
          </div>
        </div>

        <div className="table-scroll scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Partner</th>
                <th>Attendee</th>
                <th>Pass</th>
                <th>Amount</th>
                <th>{tab === 'pending' ? 'Submitted' : 'Processed'}</th>
                <th>{tab === 'pending' ? 'Action' : 'Final Status'}</th>
              </tr>
            </thead>
            <tbody>
              {tab === 'pending' && (
                pending.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--ink-faint)' }}>
                      ✅ No pending approvals right now.
                    </td>
                  </tr>
                ) : (
                  pending.map(s => (
                    <tr key={s.orderId}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{s.prName || s.prUserId}</div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.5 }}>{s.prUserId}</div>
                      </td>
                      <td>
                        <div className="cell-main">
                          <div className="cell-thumb" style={{ background: 'var(--grad-orange)' }}>💵</div>
                          <div>
                            <div className="cell-title">{s.name}</div>
                            <div className="cell-sub">{s.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{s.gender} Pass</td>
                      <td style={{ fontWeight: 800, color: 'var(--accent)' }}>₹{s.amount?.toLocaleString()}</td>
                      <td style={{ fontSize: '0.78rem', opacity: 0.6 }}>
                        {new Date(s.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        {isPresentation ? (
                          <span style={{ opacity: 0.4, fontSize: '0.78rem' }}>Admin only</span>
                        ) : (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => handleApprove(s.orderId)}
                              disabled={actionId === s.orderId}
                              style={{
                                background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)',
                                color: '#4ade80', borderRadius: 8, padding: '6px 14px',
                                fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                                opacity: actionId === s.orderId ? 0.5 : 1,
                              }}
                            >
                              {actionId === s.orderId ? '…' : '✓ Approve'}
                            </button>
                            <button
                              onClick={() => handleReject(s.orderId)}
                              disabled={actionId === s.orderId}
                              style={{
                                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                                color: '#fca5a5', borderRadius: 8, padding: '6px 14px',
                                fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                                opacity: actionId === s.orderId ? 0.5 : 1,
                              }}
                            >
                              ✕ Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )
              )}

              {tab === 'history' && (
                history.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--ink-faint)' }}>
                      No history yet.
                    </td>
                  </tr>
                ) : (
                  history.map(s => (
                    <tr key={s.orderId}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{s.prName || s.prUserId}</div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.5 }}>{s.prUserId}</div>
                      </td>
                      <td>
                        <div className="cell-main">
                          <div className="cell-thumb" style={{ background: 'var(--panel-3)' }}>{s.name.charAt(0)}</div>
                          <div>
                            <div className="cell-title">{s.name}</div>
                            <div className="cell-sub">{s.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{s.gender} Pass</td>
                      <td style={{ fontWeight: 800, color: 'var(--ink)' }}>₹{s.amount?.toLocaleString()}</td>
                      <td style={{ fontSize: '0.78rem', opacity: 0.6 }}>
                        {new Date(s.updatedAt || s.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        {s.status === 'pr_cash_rejected' ? (
                          <span style={{ fontSize: '10px', fontWeight: 800, padding: '4px 8px', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Rejected
                          </span>
                        ) : (
                          <span style={{ fontSize: '10px', fontWeight: 800, padding: '4px 8px', borderRadius: '4px', background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Approved
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
