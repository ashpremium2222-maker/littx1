import { useState, useMemo } from 'react'

interface PRApprovalsProps {
  adminKey: string
  isPresentation?: boolean
  sales: any[]
}

export default function PRApprovals({ adminKey, isPresentation = false, sales = [] }: PRApprovalsProps) {
  const [actionId, setActionId] = useState<string | null>(null)
  const [actionStates, setActionStates] = useState<Record<string, { status: 'approving' | 'rejecting' | 'approved' | 'rejected' | 'error'; sale: any; message?: string }>>({})
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [tab, setTab] = useState<'pending' | 'history'>('pending')

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const authHeaders = { 'Content-Type': 'application/json', 'x-admin-key': adminKey, 'x-auth-token': adminKey }

  const isPendingApproval = (s: any) =>
    (s.paymentMethod === 'cash' && s.status === 'pr_cash_pending') ||
    s.approvalStatus === 'PENDING' ||
    s.status === 'pending_approval' ||
    s.deliveryStatus === 'PENDING_APPROVAL'

  const clearCompletedState = (orderId: string) => {
    window.setTimeout(() => {
      setActionStates((prev) => {
        const next = { ...prev }
        delete next[orderId]
        return next
      })
    }, 3600)
  }

  // Filter sales for PR cash transactions and seller tickets awaiting approval.
  const pending = useMemo(() => {
    const basePending = sales.filter(isPendingApproval)
    const existing = new Set(basePending.map((s: any) => s.orderId))
    const stickyCompleted = Object.entries(actionStates)
      .filter(([, state]) => ['approved', 'rejected'].includes(state.status) && !existing.has(state.sale.orderId))
      .map(([, state]) => state.sale)
    return [...basePending, ...stickyCompleted]
  }, [sales, actionStates])

  const activePendingCount = pending.filter((s: any) => !['approved', 'rejected'].includes(actionStates[s.orderId]?.status)).length

  const history = useMemo(() => {
    return sales
      .filter((s: any) =>
        (s.paymentMethod === 'cash' && s.status !== 'pr_cash_pending' && s.status !== 'created') ||
        ['APPROVED', 'REJECTED'].includes(s.approvalStatus) ||
        (s.approvalRequired && s.approvalStatus !== 'PENDING')
      )
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
  }, [sales])

  async function handleApprove(orderId: string) {
    if (isPresentation) return
    const sale = sales.find((s: any) => s.orderId === orderId) || pending.find((s: any) => s.orderId === orderId)
    setActionId(orderId)
    setActionStates((prev) => ({ ...prev, [orderId]: { status: 'approving', sale } }))
    try {
      const sellerApproval = sale?.approvalStatus === 'PENDING'
      const res = await fetch(sellerApproval ? `/api/admin/ticket-approvals/${encodeURIComponent(orderId)}/approve` : '/api/admin/pr-approve', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ orderId }),
      })
      const data = await res.json()
      if (data.success) {
        setActionStates((prev) => ({
          ...prev,
          [orderId]: { status: 'approved', sale: data.sale || sale, message: data.message || 'Sent' }
        }))
        showToast(data.message || 'Ticket sent.', 'success')
        clearCompletedState(orderId)
      } else {
        setActionStates((prev) => ({ ...prev, [orderId]: { status: 'error', sale, message: data.message || 'Error approving' } }))
        showToast(data.message || 'Error approving', 'error')
      }
    } catch {
      setActionStates((prev) => ({ ...prev, [orderId]: { status: 'error', sale, message: 'Network error' } }))
      showToast('Network error', 'error')
    } finally {
      setActionId(null)
    }
  }

  async function handleReject(orderId: string) {
    if (isPresentation) return
    if (!window.confirm('Reject this approval request?')) return
    const sale = sales.find((s: any) => s.orderId === orderId) || pending.find((s: any) => s.orderId === orderId)
    setActionId(orderId)
    setActionStates((prev) => ({ ...prev, [orderId]: { status: 'rejecting', sale } }))
    try {
      const sellerApproval = sale?.approvalStatus === 'PENDING'
      const res = await fetch(sellerApproval ? `/api/admin/ticket-approvals/${encodeURIComponent(orderId)}/reject` : '/api/admin/pr-reject', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ orderId }),
      })
      const data = await res.json()
      if (data.success) {
        setActionStates((prev) => ({
          ...prev,
          [orderId]: { status: 'rejected', sale: data.sale || sale, message: 'Rejected' }
        }))
        showToast('Approval rejected.', 'success')
        clearCompletedState(orderId)
      } else {
        setActionStates((prev) => ({ ...prev, [orderId]: { status: 'error', sale, message: data.message || 'Error rejecting' } }))
        showToast(data.message || 'Error rejecting', 'error')
      }
    } catch {
      setActionStates((prev) => ({ ...prev, [orderId]: { status: 'error', sale, message: 'Network error' } }))
      showToast('Network error', 'error')
    } finally {
      setActionId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gutter)' }}>
      <style>{`
        @keyframes approval-spin { to { transform: rotate(360deg); } }
        @keyframes approval-pop { 0% { transform: scale(.76); opacity: .3; } 65% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes approval-row-glow { 0% { box-shadow: inset 0 0 0 rgba(74,222,128,0); } 50% { box-shadow: inset 0 0 32px rgba(74,222,128,.12); } 100% { box-shadow: inset 0 0 0 rgba(74,222,128,0); } }
        .approval-spinner { width: 13px; height: 13px; border-radius: 999px; border: 2px solid rgba(255,255,255,.18); border-top-color: currentColor; animation: approval-spin .7s linear infinite; }
        .approval-done { animation: approval-pop .42s cubic-bezier(.2,1.4,.35,1), approval-row-glow 1.4s ease-out; }
      `}</style>
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
          <div className="tile-value">{activePendingCount}</div>
          <div className="tile-sub">Seller tickets and partner cash sales awaiting approval</div>
          <div className="tile-delta">
            <span>{activePendingCount > 0 ? '⚠️' : '✓'}</span>{' '}
            {activePendingCount > 0 ? 'Needs your action' : 'All clear'}
          </div>
        </div>
        <div className="tile tile-teal">
          <div className="tile-label">APPROVED TICKETS</div>
          <div className="tile-value">{history.filter(h => h.status !== 'pr_cash_rejected' && h.approvalStatus !== 'REJECTED').length}</div>
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
              Pending ({activePendingCount})
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
                  pending.map(s => {
                    const rowAction = actionStates[s.orderId]
                    const rowDone = rowAction?.status === 'approved' || rowAction?.status === 'rejected'
                    return (
                    <tr key={s.orderId} className={rowAction?.status === 'approved' ? 'approval-done' : ''} style={{ opacity: rowAction?.status === 'rejecting' ? 0.72 : 1 }}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{s.sellerId || s.generatedBy || s.prName || s.prUserId}</div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.5 }}>{s.ticketId || s.prUserId}</div>
                        {rowAction?.status === 'approved' ? (
                          <div style={{ marginTop: 4, fontSize: '10px', fontWeight: 800, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Sent
                          </div>
                        ) : rowAction?.status === 'rejected' ? (
                          <div style={{ marginTop: 4, fontSize: '10px', fontWeight: 800, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Rejected
                          </div>
                        ) : s.approvalStatus === 'PENDING' && (
                          <div style={{ marginTop: 4, fontSize: '10px', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Pending approval
                          </div>
                        )}
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
                      <td style={{ textTransform: 'capitalize' }}>{s.ticketType || `${s.gender} Pass`}</td>
                      <td style={{ fontWeight: 800, color: 'var(--accent)' }}>₹{s.amount?.toLocaleString()}</td>
                      <td style={{ fontSize: '0.78rem', opacity: 0.6 }}>
                        {new Date(s.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        {rowDone ? (
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '7px 12px',
                            borderRadius: 10,
                            color: rowAction?.status === 'approved' ? '#4ade80' : '#fca5a5',
                            background: rowAction?.status === 'approved' ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
                            border: rowAction?.status === 'approved' ? '1px solid rgba(34,197,94,0.34)' : '1px solid rgba(239,68,68,0.34)',
                            fontWeight: 800,
                            fontSize: '0.78rem'
                          }}>
                            <span style={{ display: 'inline-flex', width: 18, height: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.08)' }}>
                              {rowAction?.status === 'approved' ? '✓' : '✕'}
                            </span>
                            {rowAction?.status === 'approved' ? 'Sent' : 'Rejected'}
                          </div>
                        ) : isPresentation ? (
                          <span style={{ opacity: 0.4, fontSize: '0.78rem' }}>Admin only</span>
                        ) : (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => handleApprove(s.orderId)}
                              disabled={Boolean(actionId)}
                              style={{
                                background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)',
                                color: '#4ade80', borderRadius: 8, padding: '6px 14px',
                                fontWeight: 700, fontSize: '0.78rem', cursor: actionId ? 'wait' : 'pointer',
                                opacity: actionId === s.orderId ? 0.5 : 1,
                                display: 'inline-flex', alignItems: 'center', gap: 7,
                              }}
                            >
                              {rowAction?.status === 'approving' ? <><span className="approval-spinner" /> Sending...</> : '✓ Approve'}
                            </button>
                            <button
                              onClick={() => handleReject(s.orderId)}
                              disabled={Boolean(actionId)}
                              style={{
                                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                                color: '#fca5a5', borderRadius: 8, padding: '6px 14px',
                                fontWeight: 700, fontSize: '0.78rem', cursor: actionId ? 'wait' : 'pointer',
                                opacity: actionId === s.orderId ? 0.5 : 1,
                                display: 'inline-flex', alignItems: 'center', gap: 7,
                              }}
                            >
                              {rowAction?.status === 'rejecting' ? <><span className="approval-spinner" /> Rejecting...</> : '✕ Reject'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    )
                  })
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
                        <div style={{ fontWeight: 700 }}>{s.sellerId || s.generatedBy || s.prName || s.prUserId}</div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.5 }}>{s.ticketId || s.prUserId}</div>
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
                      <td style={{ textTransform: 'capitalize' }}>{s.ticketType || `${s.gender} Pass`}</td>
                      <td style={{ fontWeight: 800, color: 'var(--ink)' }}>₹{s.amount?.toLocaleString()}</td>
                      <td style={{ fontSize: '0.78rem', opacity: 0.6 }}>
                        {new Date(s.updatedAt || s.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        {s.status === 'pr_cash_rejected' || s.approvalStatus === 'REJECTED' ? (
                          <span style={{ fontSize: '10px', fontWeight: 800, padding: '4px 8px', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Rejected
                          </span>
                        ) : (
                          <span style={{ fontSize: '10px', fontWeight: 800, padding: '4px 8px', borderRadius: '4px', background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {s.deliveryStatus === 'DELIVERED' || s.status === 'emailed' ? 'Delivered' : 'Approved'}
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
