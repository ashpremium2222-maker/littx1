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
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [search, setSearch] = useState('')

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const authHeaders = { 'Content-Type': 'application/json', 'x-admin-key': adminKey, 'x-auth-token': adminKey }

  const companyId = (sale: any) => {
    const raw = String(sale?.companyId || sale?.sellerId || sale?.generatedBy || sale?.prUserId || '').trim().toLowerCase()
    const aliases: Record<string, string> = {
      'seller-a': 'littlane', littlane: 'littlane',
      'seller-b': 'nitro', nitro: 'nitro',
      'seller-c': '7th-heaven', '7th-heaven': '7th-heaven',
    }
    return aliases[raw] || raw || 'unassigned'
  }

  const companyName = (sale: any) => {
    const id = companyId(sale)
    const names: Record<string, string> = {
      littlane: 'Littlane Ent',
      nitro: 'Nitro Events',
      '7th-heaven': '7th Heaven',
      wolfera: 'Wolfera',
      'astex-testing': 'ASTEX Testing',
    }
    return names[id] || id.split(/[-_]/).filter(Boolean).map((part: string) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
  }

  const finalStatusKey = (sale: any): 'approved' | 'rejected' | 'pending' => {
    const action = actionStates[sale?.orderId]
    if (action?.status === 'approved') return 'approved'
    if (action?.status === 'rejected') return 'rejected'
    if (isPendingApproval(sale)) return 'pending'
    if (sale?.status === 'pr_cash_rejected' || sale?.approvalStatus === 'REJECTED') return 'rejected'
    if (sale?.approvalStatus === 'APPROVED' || sale?.deliveryStatus === 'DELIVERED' || sale?.status === 'emailed') return 'approved'
    return 'pending'
  }

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

  const approvalSales = useMemo(() => {
    const rowsById = new Map<string, any>()
    sales.filter((sale: any) =>
      isPendingApproval(sale) ||
      ['APPROVED', 'REJECTED'].includes(String(sale.approvalStatus || '').toUpperCase()) ||
      (sale.paymentMethod === 'cash' && sale.status !== 'created')
    ).forEach((sale: any) => rowsById.set(sale.orderId || sale.ticketId, sale))
    Object.values(actionStates).forEach(state => {
      if (['approved', 'rejected'].includes(state.status)) rowsById.set(state.sale.orderId || state.sale.ticketId, state.sale)
    })
    return [...rowsById.values()].filter(Boolean)
  }, [sales, actionStates])

  const companyCards = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; pending: number; approved: number; rejected: number }>()
    approvalSales.forEach((sale: any) => {
      const id = companyId(sale)
      if (!groups.has(id)) groups.set(id, { id, name: companyName(sale), pending: 0, approved: 0, rejected: 0 })
      groups.get(id)![finalStatusKey(sale)]++
    })
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [approvalSales, actionStates])

  const counts = useMemo(() => ({
    all: approvalSales.length,
    pending: approvalSales.filter(sale => finalStatusKey(sale) === 'pending').length,
    approved: approvalSales.filter(sale => finalStatusKey(sale) === 'approved').length,
    rejected: approvalSales.filter(sale => finalStatusKey(sale) === 'rejected').length,
  }), [approvalSales, actionStates])

  const filteredRows = useMemo(() => approvalSales
    .filter((sale: any) => statusFilter === 'all' || finalStatusKey(sale) === statusFilter)
    .filter((sale: any) => companyFilter === 'all' || companyId(sale) === companyFilter)
    .filter((sale: any) => {
      const term = search.trim().toLowerCase()
      return !term || [sale.name, sale.email, sale.ticketId, sale.orderId, sale.ticketType, companyName(sale)]
        .some(value => String(value || '').toLowerCase().includes(term))
    })
    .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()),
  [approvalSales, statusFilter, companyFilter, search, actionStates])

  const filterButton = (key: typeof statusFilter, label: string, count: number, color: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setStatusFilter(key)}
      aria-pressed={statusFilter === key}
      style={{
        border: `1px solid ${statusFilter === key ? color : 'var(--border)'}`,
        background: statusFilter === key ? (key === 'all' ? 'rgba(255,255,255,.08)' : `${color}18`) : 'transparent',
        color: statusFilter === key ? color : 'var(--ink-faint)',
        borderRadius: 8,
        padding: '8px 12px',
        fontWeight: 700,
        fontSize: 13,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >{label} <span style={{ opacity: 0.8 }}>{count}</span></button>
  )

  async function handleApprove(orderId: string) {
    if (isPresentation) return
    const sale = sales.find((s: any) => s.orderId === orderId) || approvalSales.find((s: any) => s.orderId === orderId)
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
    const sale = sales.find((s: any) => s.orderId === orderId) || approvalSales.find((s: any) => s.orderId === orderId)
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

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Ticket approvals</h1>
          <div style={{ color: 'var(--ink-faint)', marginTop: 5, fontSize: 13 }}>Review requests by event company and status.</div>
        </div>
        <div style={{ color: 'var(--ink-faint)', fontSize: 13 }}>{counts.pending} waiting for review</div>
      </header>

      <section aria-label="Approvals by company" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 12 }}>
        {companyCards.map(company => (
          <article key={company.id} className="card" style={{ padding: 16, border: `1px solid ${companyFilter === company.id ? 'var(--accent)' : 'var(--border)'}` }}>
            <button type="button" onClick={() => setCompanyFilter(companyFilter === company.id ? 'all' : company.id)} style={{ display: 'block', border: 0, padding: 0, background: 'none', color: 'var(--ink)', fontWeight: 750, fontSize: 16, textAlign: 'left', cursor: 'pointer', width: '100%' }}>
              {company.name}
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              {(['pending', 'approved', 'rejected'] as const).map((status, index) => {
                const color = ['#fbbf24', '#4ade80', '#f87171'][index]
                const label = ['Pending', 'Accepted', 'Rejected'][index]
                return <button key={status} type="button" onClick={() => { setCompanyFilter(company.id); setStatusFilter(status) }} aria-label={`${company.name}: ${company[status]} ${label.toLowerCase()}`} style={{ border: 0, borderRight: index < 2 ? '1px solid var(--border)' : 0, background: 'transparent', color, textAlign: 'left', cursor: 'pointer', padding: '2px 8px 2px 0' }}>
                  <span style={{ display: 'block', fontSize: 20, fontWeight: 750 }}>{company[status]}</span>
                  <span style={{ display: 'block', color: 'var(--ink-faint)', fontSize: 11, marginTop: 2 }}>{label}</span>
                </button>
              })}
            </div>
          </article>
        ))}
      </section>

      <section className="card table-card" aria-label="Approval tickets">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {filterButton('all', 'All', counts.all, 'var(--ink)')}
            {filterButton('pending', 'Pending', counts.pending, '#fbbf24')}
            {filterButton('approved', 'Accepted', counts.approved, '#4ade80')}
            {filterButton('rejected', 'Rejected', counts.rejected, '#f87171')}
          </div>
          <div style={{ display: 'flex', gap: 8, flex: '1 1 360px', justifyContent: 'end', flexWrap: 'wrap' }}>
            <select aria-label="Filter by event company" value={companyFilter} onChange={event => setCompanyFilter(event.target.value)} style={{ minWidth: 160, border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', background: 'var(--panel)', color: 'var(--ink)' }}>
              <option value="all">All companies</option>
              {companyCards.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
            <input type="search" aria-label="Search approvals" placeholder="Search attendee or ticket" value={search} onChange={event => setSearch(event.target.value)} style={{ flex: '1 1 190px', maxWidth: 280, border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', background: 'var(--panel)', color: 'var(--ink)' }} />
            {(companyFilter !== 'all' || statusFilter !== 'all' || search) && <button type="button" onClick={() => { setCompanyFilter('all'); setStatusFilter('all'); setSearch('') }} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', background: 'transparent', color: 'var(--ink-faint)', cursor: 'pointer' }}>Clear</button>}
          </div>
        </div>

        <div style={{ padding: '12px 18px', color: 'var(--ink-faint)', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
          {filteredRows.length} {filteredRows.length === 1 ? 'ticket' : 'tickets'}{companyFilter !== 'all' ? ` · ${companyCards.find(company => company.id === companyFilter)?.name || 'Company'}` : ''}{statusFilter !== 'all' ? ` · ${statusFilter === 'approved' ? 'Accepted' : statusFilter[0].toUpperCase() + statusFilter.slice(1)}` : ''}
        </div>
        <div className="table-scroll scroll">
          <table className="table">
            <thead><tr><th>Company / attendee</th><th>Pass</th><th>Amount</th><th>Submitted</th><th>Status / action</th></tr></thead>
            <tbody>
              {filteredRows.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 36, color: 'var(--ink-faint)' }}>No tickets match these filters.</td></tr> : filteredRows.map(sale => {
                const id = sale.orderId || sale.ticketId
                const rowAction = actionStates[id]
                const status = finalStatusKey(sale)
                const busy = rowAction?.status === 'approving' || rowAction?.status === 'rejecting'
                return <tr key={id} className={rowAction?.status === 'approved' ? 'approval-done' : ''} style={{ opacity: busy ? 0.72 : 1 }}>
                  <td><div style={{ fontWeight: 700 }}>{companyName(sale)}</div><div style={{ marginTop: 4 }}>{sale.name || 'Unknown attendee'}</div><div className="cell-sub">{sale.email || 'No email'} · {sale.ticketId || sale.orderId}</div></td>
                  <td>{sale.ticketType || `${sale.gender || 'General'} Pass`}</td>
                  <td style={{ fontWeight: 750 }}>₹{Number(sale.amount || 0).toLocaleString('en-IN')}</td>
                  <td style={{ color: 'var(--ink-faint)', fontSize: 13 }}>{sale.createdAt ? new Date(sale.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>{status === 'pending' && !isPresentation ? <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => handleApprove(id)} disabled={Boolean(actionId)} style={{ background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.34)', color: '#4ade80', borderRadius: 7, padding: '7px 10px', fontWeight: 700, cursor: actionId ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{rowAction?.status === 'approving' ? <><span className="approval-spinner" /> Sending</> : 'Approve'}</button>
                    <button type="button" onClick={() => handleReject(id)} disabled={Boolean(actionId)} style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.28)', color: '#fca5a5', borderRadius: 7, padding: '7px 10px', fontWeight: 700, cursor: actionId ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{rowAction?.status === 'rejecting' ? <><span className="approval-spinner" /> Rejecting</> : 'Reject'}</button>
                  </div> : <span style={{ color: status === 'approved' ? '#4ade80' : status === 'rejected' ? '#f87171' : 'var(--ink-faint)', fontWeight: 700 }}>{busy ? (rowAction?.status === 'approving' ? 'Sending...' : 'Rejecting...') : status === 'approved' ? (sale.deliveryStatus === 'DELIVERED' || sale.status === 'emailed' ? 'Sent' : 'Accepted') : status === 'rejected' ? 'Rejected' : 'Admin only'}</span>}</td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
