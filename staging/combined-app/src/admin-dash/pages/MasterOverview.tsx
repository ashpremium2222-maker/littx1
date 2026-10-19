import React, { useState, useEffect } from 'react'
import { customerTotal, isConfirmedSale } from '../reporting'

interface CompanySummary {
  companyId: string
  name: string
  status: string
  stats?: {
    totalOrders: number
    ticketCount: number
    grossRevenue: number
    platformFee: number
    revenueAfterCommission?: number
    netCompanyRevenue: number
  }
}

interface SellerPartner {
  id: string
  name: string
  active: boolean
  configured: boolean
}

function normalizePartnerKey(value: string) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function currencyTotals(total: number | null | undefined, currency: string | null | undefined, byCurrency?: Record<string, number>) {
  if (total !== null && total !== undefined) return `${currency || 'INR'} ${Number(total).toLocaleString()}`
  return Object.entries(byCurrency || {}).map(([code, amount]) => `${code} ${Number(amount).toLocaleString()}`).join(' · ') || '—'
}

export default function MasterOverview() {
  const [companies, setCompanies] = useState<CompanySummary[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [sellerPartners, setSellerPartners] = useState<SellerPartner[]>([])
  const [overview, setOverview] = useState<any>(null)
  const [reconciliation, setReconciliation] = useState<any>(null)
  const [overviewError, setOverviewError] = useState('')
  const [eventSearch, setEventSearch] = useState('')
  const [eventPage, setEventPage] = useState(1)
  const [accountBusyId, setAccountBusyId] = useState<string | null>(null)
  const [accountError, setAccountError] = useState('')
  const [organizerForm, setOrganizerForm] = useState({ userId: '', displayName: '', companyId: '', password: '' })
  const [organizerBusy, setOrganizerBusy] = useState(false)
  const [assignmentEventId, setAssignmentEventId] = useState('')
  const [assignedOrganizerIds, setAssignedOrganizerIds] = useState<string[]>([])
  const [assignmentBusy, setAssignmentBusy] = useState(false)
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null)
  const [openingPartnerId, setOpeningPartnerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const headers = { 'x-auth-token': token }
      const [compRes, salesRes, partnersRes, overviewRes, reconciliationRes] = await Promise.all([
        fetch('/api/master/companies', { headers, cache: 'no-store' }),
        fetch('/api/admin/sales', { headers, cache: 'no-store' }),
        fetch('/api/seller/partners', { headers, cache: 'no-store' }),
        fetch('/api/master/overview', { headers, cache: 'no-store' }),
        fetch('/api/admin/reconciliation', { headers, cache: 'no-store' })
      ])

      const compData = await compRes.json()
      const salesData = await salesRes.json()
      const partnersData = await partnersRes.json()
      const overviewData = await overviewRes.json()
      const reconciliationData = await reconciliationRes.json()

      if (compData.success) setCompanies(compData.companies || [])
      if (salesData.success) setSales(salesData.sales || [])
      if (partnersData.success) setSellerPartners(partnersData.partners || [])
      if (overviewRes.ok && overviewData.success) setOverview(overviewData)
      else setOverviewError(overviewData.message || 'Platform overview is unavailable.')
      if (reconciliationRes.ok && reconciliationData.success) setReconciliation(reconciliationData)
    } catch (err) {
      console.error('Failed to load master overview data:', err)
      setOverviewError('Platform overview could not be loaded. Refresh to retry.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const visibleSellerPartners = sellerPartners.filter(partner => partner.active)
  const matchingEvents = (overview?.byEvent || []).filter((event: any) =>
    `${event.name} ${event.companyId || ''} ${event.status}`.toLowerCase().includes(eventSearch.trim().toLowerCase())
  )
  const eventPageSize = 8
  const eventPageCount = Math.max(1, Math.ceil(matchingEvents.length / eventPageSize))
  const pageEvents = matchingEvents.slice((eventPage - 1) * eventPageSize, eventPage * eventPageSize)

  const changeAccountStatus = async (account: any) => {
    const active = !account.active
    const verb = active ? 'activate' : 'suspend'
    const completedVerb = active ? 'activated' : 'suspended'
    if (!window.confirm(`${verb[0].toUpperCase()}${verb.slice(1)} ${account.role} account ${account.displayName}?`)) return
    setAccountBusyId(account.userId)
    setAccountError('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const response = await fetch(`/api/master/accounts/${encodeURIComponent(account.userId)}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-auth-token': token }, body: JSON.stringify({ active })
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || `Account could not be ${completedVerb}.`)
      setOverview((current: any) => {
        if (!current) return current
        const users = current.accounts.users.map((item: any) => item.userId === account.userId ? { ...item, active, blocked: !active } : item)
        const countRole = (role: string) => {
          const records = users.filter((item: any) => item.role === role)
          return { total: records.length, active: records.filter((item: any) => item.active).length, suspended: records.filter((item: any) => !item.active).length }
        }
        return { ...current, accounts: { ...current.accounts, organizers: countRole('organizer'), sellers: countRole('seller'), pr: countRole('pr'), users } }
      })
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : `Account could not be ${completedVerb}.`)
    } finally {
      setAccountBusyId(null)
    }
  }

  const createOrganizerAccount = async (event: React.FormEvent) => {
    event.preventDefault()
    setOrganizerBusy(true)
    setAccountError('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const response = await fetch('/api/master/organizers', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': token }, body: JSON.stringify(organizerForm)
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Organizer account could not be created.')
      setOrganizerForm(current => ({ ...current, userId: '', displayName: '', password: '' }))
      await fetchData()
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Organizer account could not be created.')
    } finally {
      setOrganizerBusy(false)
    }
  }

  const saveOrganizerAssignments = async () => {
    if (!assignmentEventId) return
    setAssignmentBusy(true)
    setAccountError('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const response = await fetch(`/api/master/events/${encodeURIComponent(assignmentEventId)}/organizers`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-auth-token': token }, body: JSON.stringify({ organizerUserIds: assignedOrganizerIds })
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Event assignments could not be saved.')
      setOverview((current: any) => current ? ({ ...current, byEvent: current.byEvent.map((item: any) => item.eventId === assignmentEventId ? { ...item, organizerUserIds: data.organizerUserIds } : item) }) : current)
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Event assignments could not be saved.')
    } finally {
      setAssignmentBusy(false)
    }
  }

  const sellerStats = (partner: SellerPartner) => {
    const partnerKeys = new Set([
      normalizePartnerKey(partner.id),
      normalizePartnerKey(partner.name),
    ])
    const partnerSales = sales.filter(sale => {
      const saleKeys = [
        sale.sellerId,
        sale.generatedBy,
        sale.prUserId,
      ].map(value => normalizePartnerKey(String(value || '')))
      return saleKeys.some(key => partnerKeys.has(key))
    }).filter(isConfirmedSale)
    return {
      orders: partnerSales.length,
      tickets: partnerSales.reduce((sum, sale) => sum + (Number(sale.admissionCount) || Number(sale.quantity) || 1), 0),
      revenue: partnerSales.reduce((sum, sale) => sum + customerTotal(sale), 0),
    }
  }

  const openSellerPanel = async (partner: SellerPartner) => {
    const token = sessionStorage.getItem('littx_token') || ''
    if (!token) {
      alert('Master admin session expired. Please login again.')
      return
    }

    setOpeningPartnerId(partner.id)
    try {
      const response = await fetch(`/api/master/seller-access/${encodeURIComponent(partner.id)}`, {
        method: 'POST',
        headers: { 'x-auth-token': token }
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        alert(data.message || 'Unable to open seller panel.')
        return
      }
      sessionStorage.setItem('littx_seller_token', data.token)
      sessionStorage.setItem('littx_seller_partner', JSON.stringify(data.partner))
      window.open('/seller', '_blank')
    } catch {
      alert('Unable to open seller panel.')
    } finally {
      setOpeningPartnerId(null)
    }
  }

  if (loading) {
    return <div style={{ padding: '40px', color: 'var(--ink-faint)', textAlign: 'center' }}>Loading Master Platform Overview…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {overviewError && <div role="alert" className="card" style={{ color: 'var(--red)' }}>{overviewError} <button className="btn-secondary" onClick={fetchData}>Retry</button></div>}

      {/* Verified platform overview */}
      <div className="kpi-row">
        <div className="tile tile-violet">
          <div className="tile-label">EVENTS</div>
          <div className="tile-value">{overview?.events?.total ?? '—'}</div>
          <div className="tile-sub">{overview?.events?.active ?? 0} active · {overview?.events?.draft ?? 0} draft · {overview?.events?.completed ?? 0} completed</div>
          <div className="tile-delta"><span>🏛️</span> {overview?.events?.pendingReview ?? 0} awaiting review</div>
        </div>

        <div className="tile tile-teal">
          <div className="tile-label">ORGANIZER COMPANIES</div>
          <div className="tile-value">{overview?.accounts?.organizerCompanies ?? '—'}</div>
          <div className="tile-sub">{overview?.accounts?.organizers?.active ?? 0} active organizer accounts</div>
          <div className="tile-delta"><span>👥</span> {overview?.accounts?.sellers?.active ?? 0} active sellers · {overview?.accounts?.pr?.active ?? 0} active PRs</div>
        </div>

        <div className="tile tile-orange">
          <div className="tile-label">ORDERS · QR CODES · ADMISSIONS</div>
          <div className="tile-value">{overview?.sales?.totalOrders ?? '—'} · {overview?.sales?.ticketsIssued ?? '—'} · {overview?.sales?.admissions ?? '—'}</div>
          <div className="tile-sub">{overview?.sales?.confirmedOrders ?? 0} confirmed orders; pending orders excluded from revenue</div>
          <div className="tile-delta"><span>🎟️</span> Whole-group admission quantities</div>
        </div>

        <div className="tile tile-gold">
          <div className="tile-label">GROSS CONFIRMED CUSTOMER TOTAL</div>
          <div className="tile-value">{currencyTotals(overview?.sales?.verifiedRevenue, overview?.sales?.verifiedRevenueCurrency, overview?.sales?.verifiedRevenueByCurrency)}</div>
          <div className="tile-sub">Customer total (legacy amount fallback); pending and unverified excluded. Internal refund approval does not confirm money returned.</div>
          <div className="tile-delta"><span>⏳</span> Pending {currencyTotals(overview?.sales?.pendingAmount, overview?.sales?.pendingAmountCurrency, overview?.sales?.pendingAmountByCurrency)} · unverified {currencyTotals(overview?.sales?.unverifiedAmount, overview?.sales?.unverifiedAmountCurrency, overview?.sales?.unverifiedAmountByCurrency)}</div>
          <div className="muted-sm">Refund requests: {overview?.sales?.refundRequests ?? 0} · approved internally: {overview?.sales?.refundApprovals ?? 0} · rejected: {overview?.sales?.refundRejections ?? 0}</div>
        </div>

        <div className="tile tile-gold">
          <div className="tile-label">ONLINE / OFFLINE ADMISSIONS</div>
          <div className="tile-value">{overview?.sales?.online?.admissions ?? '—'} / {overview?.sales?.offline?.admissions ?? '—'}</div>
          <div className="tile-sub">QRs: {overview?.sales?.online?.qrCodes ?? 0} online · {overview?.sales?.offline?.qrCodes ?? 0} offline</div>
          <div className="tile-delta"><span>📊</span> Confirmed sales only</div>
        </div>
      </div>

      <div className="card">
        <h3>Read-only reconciliation</h3>
        <div className="muted-sm">{reconciliation?.summary?.findings ?? '—'} findings · {reconciliation?.scope?.eventCount ?? '—'} events. Review findings before making any record changes; this report does not repair data.</div>
        {reconciliation?.findings?.length ? <div className="table-scroll"><table className="table"><thead><tr><th>Finding</th><th>Order references</th><th>Event</th><th>Details</th></tr></thead><tbody>
          {reconciliation.findings.slice(0, 100).map((finding: any, index: number) => <tr key={`${finding.code}-${index}`}><td>{finding.code}</td><td>{finding.orderIds.join(', ') || '—'}</td><td>{finding.eventId || '—'}</td><td>{finding.detail}</td></tr>)}
        </tbody></table></div> : <p className="muted-sm">{reconciliation ? 'No findings in the current event scope.' : 'Reconciliation report unavailable.'}</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 20 }}>
        <div className="card table-card">
          <div className="card-head" style={{ padding: '18px 18px 0', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div><h3>Event activity</h3><div className="muted-sm">Order, QR and admission counts by event</div></div>
            <input aria-label="Search events" placeholder="Search event or organizer" value={eventSearch} onChange={event => { setEventSearch(event.target.value); setEventPage(1) }} />
          </div>
          <div className="table-scroll"><table className="table">
            <thead><tr><th>Event</th><th>Status</th><th>Orders</th><th>QRs</th><th>Admissions</th><th>Online / Offline</th><th>Pending</th></tr></thead>
            <tbody>
              {pageEvents.map((event: any) => <tr key={event.eventId || event.name}>
                <td><strong>{event.name}</strong><div className="muted-sm">{event.companyId || 'Organizer not set'}</div></td>
                <td>{event.status}</td><td>{event.orders}</td><td>{event.ticketsIssued}</td><td>{event.admissions}</td>
                <td>{event.online.admissions} / {event.offline.admissions}</td><td>{event.pendingOrders}</td>
              </tr>)}
              {!pageEvents.length && <tr><td colSpan={7} className="muted-sm">{overview ? 'No events match this search.' : 'Event metrics unavailable.'}</td></tr>}
            </tbody>
          </table></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, padding: 14 }}>
            <span className="muted-sm">{matchingEvents.length} events · page {eventPage} of {eventPageCount}</span>
            <button className="btn-secondary" disabled={eventPage <= 1} onClick={() => setEventPage(page => Math.max(1, page - 1))}>Previous</button>
            <button className="btn-secondary" disabled={eventPage >= eventPageCount} onClick={() => setEventPage(page => Math.min(eventPageCount, page + 1))}>Next</button>
          </div>
        </div>

        <div className="card">
          <h3>Action queue</h3>
          {overview?.alerts?.length ? overview.alerts.map((alert: any) => <div key={alert.type} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}><strong>{alert.count}</strong> {alert.label}</div>) : <p className="muted-sm">No pending admin actions.</p>}
          <h3 style={{ marginTop: 22 }}>Recent platform activity</h3>
          {overview?.recentActivity?.length ? overview.recentActivity.slice(0, 8).map((item: any, index: number) => <div key={`${item.timestamp}-${index}`} style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}><strong>{item.action}</strong><div className="muted-sm">{item.actor} · {item.entity || 'Platform'} · {item.timestamp ? new Date(item.timestamp).toLocaleString() : 'time unavailable'}</div></div>) : <p className="muted-sm">No recorded administrative activity.</p>}
        </div>
      </div>

      <div className="card table-card">
        <div className="card-head" style={{ padding: '18px 18px 0' }}><h3>Organizer, seller and PR accounts</h3><div className="muted-sm">Suspension revokes access and preserves sales and ticket history.</div></div>
        {accountError && <div role="alert" style={{ padding: 12, color: 'var(--red)' }}>{accountError}</div>}
        <form onSubmit={createOrganizerAccount} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, padding: 16, borderBottom: '1px solid var(--line)' }}>
          <input aria-label="Organizer account ID" placeholder="Account ID" autoComplete="off" value={organizerForm.userId} onChange={event => setOrganizerForm(current => ({ ...current, userId: event.target.value }))} required />
          <input aria-label="Organizer display name" placeholder="Display name" value={organizerForm.displayName} onChange={event => setOrganizerForm(current => ({ ...current, displayName: event.target.value }))} required />
          <select aria-label="Organizer company" value={organizerForm.companyId} onChange={event => setOrganizerForm(current => ({ ...current, companyId: event.target.value }))} required>
            <option value="">Choose company</option>{companies.map(company => <option key={company.companyId} value={company.companyId}>{company.name}</option>)}
          </select>
          <input aria-label="Temporary organizer password" type="password" minLength={12} autoComplete="new-password" placeholder="Password (12+ chars)" value={organizerForm.password} onChange={event => setOrganizerForm(current => ({ ...current, password: event.target.value }))} required />
          <button className="btn-primary" disabled={organizerBusy}>{organizerBusy ? 'Creating…' : 'Create organizer'}</button>
        </form>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, padding: 16, borderBottom: '1px solid var(--line)' }}>
          <select aria-label="Event for organizer assignment" value={assignmentEventId} onChange={event => {
            const id = event.target.value
            setAssignmentEventId(id)
            const selected = (overview?.byEvent || []).find((item: any) => item.eventId === id)
            setAssignedOrganizerIds(selected?.organizerUserIds || [])
          }}>
            <option value="">Choose event to assign</option>{(overview?.byEvent || []).map((event: any) => <option key={event.eventId} value={event.eventId}>{event.name}</option>)}
          </select>
          <select aria-label="Assigned organizer accounts" multiple value={assignedOrganizerIds} onChange={event => setAssignedOrganizerIds(Array.from(event.target.selectedOptions, option => option.value))} style={{ minHeight: 80 }}>
            {(overview?.accounts?.users || []).filter((account: any) => account.role === 'organizer' && (!assignmentEventId || account.companyId === (overview?.byEvent || []).find((item: any) => item.eventId === assignmentEventId)?.companyId)).map((account: any) => <option key={account.userId} value={account.userId}>{account.displayName} · {account.userId}{account.active ? '' : ' (suspended)'}</option>)}
          </select>
          <button className="btn-secondary" disabled={!assignmentEventId || assignmentBusy} onClick={saveOrganizerAssignments}>{assignmentBusy ? 'Saving…' : 'Save event assignments'}</button>
        </div>
        <div className="table-scroll"><table className="table">
          <thead><tr><th>Account</th><th>Role</th><th>Organizer company</th><th>Status</th><th>Access</th></tr></thead>
          <tbody>
            {(overview?.accounts?.users || []).map((account: any) => <tr key={account.userId}>
              <td><strong>{account.displayName}</strong><div className="muted-sm">{account.userId}{account.sellerSlot ? ` · ${account.sellerSlot}` : ''}</div></td>
              <td>{account.role}</td><td>{account.companyId || '—'}</td><td>{account.active ? 'Active' : 'Suspended'}</td>
              <td><button className="btn-secondary" disabled={accountBusyId === account.userId} onClick={() => changeAccountStatus(account)}>{accountBusyId === account.userId ? 'Saving…' : account.active ? 'Suspend' : 'Activate'}</button></td>
            </tr>)}
            {overview && !overview.accounts?.users?.length && <tr><td colSpan={5} className="muted-sm">No managed organizer, seller or PR accounts.</td></tr>}
          </tbody>
        </table></div>
      </div>

      {/* Companies Leaderboard */}
      <div className="card table-card">
        <div className="card-head" style={{ padding: '18px 18px 0' }}>
          <h3>Event Companies Performance & Commercial Split</h3>
          <div className="muted-sm">Confirmed revenue and admission totals by organizer company</div>
        </div>

        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Status</th>
                <th>Orders</th>
                <th>Admissions</th>
                <th>Gross Revenue</th>
                <th>Revenue After Commission</th>
                <th>Seller Commission</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <React.Fragment key={c.companyId}>
                  <tr
                    onClick={() => setExpandedCompanyId(expandedCompanyId === c.companyId ? null : c.companyId)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontWeight: 700, color: 'var(--ink)' }}>
                      <div>{c.name}</div>
                      <div style={{ fontSize: '10px', color: 'var(--ink-faint)', fontFamily: 'monospace' }}>ID: {c.companyId}</div>
                    </td>
                    <td>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '9.5px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          background: c.status === 'ACTIVE' ? 'rgba(61,220,132,0.12)' : 'rgba(255,107,107,0.12)',
                          color: c.status === 'ACTIVE' ? 'var(--green)' : 'var(--red)',
                          border: `1px solid ${c.status === 'ACTIVE' ? 'rgba(61,220,132,0.25)' : 'rgba(255,107,107,0.25)'}`
                        }}
                      >
                        ● {c.status}
                      </span>
                    </td>
                    <td>{c.stats?.totalOrders || 0}</td>
                    <td style={{ fontWeight: 700 }}>{c.stats?.ticketCount || 0}</td>
                    <td style={{ fontWeight: 800, color: 'var(--ink)' }}>₹{(c.stats?.grossRevenue || 0).toLocaleString()}</td>
                    <td style={{ fontWeight: 800, color: 'var(--volt)' }}>₹{(c.stats?.revenueAfterCommission ?? c.stats?.platformFee ?? 0).toLocaleString()}</td>
                    <td style={{ fontWeight: 700, color: 'var(--green)' }}>₹{(c.stats?.netCompanyRevenue || 0).toLocaleString()}</td>
                  </tr>
                  {expandedCompanyId === c.companyId && (
                    <tr>
                      <td colSpan={7} style={{ padding: '0 16px 18px', background: 'rgba(255,255,255,0.015)' }}>
                        <div style={{ border: '1px solid var(--line)', borderRadius: '14px', padding: '14px', marginTop: '10px', background: 'var(--panel-2)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>/seller company access</div>
                              <div className="muted-sm">Master admin can open a partner panel and punch tickets under that company only.</div>
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--ink-faint)', fontFamily: 'monospace' }}>{visibleSellerPartners.length} active</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {visibleSellerPartners.map(partner => {
                              const stats = sellerStats(partner)
                              return (
                                <div
                                  key={partner.id}
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(150px, 1.2fr) 80px 100px 120px 150px',
                                    gap: '12px',
                                    alignItems: 'center',
                                    padding: '10px 12px',
                                    border: '1px solid var(--line)',
                                    borderRadius: '12px',
                                    background: 'var(--panel)'
                                  }}
                                >
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink)' }}>{partner.name}</div>
                                    <div style={{ fontSize: '10px', color: 'var(--ink-faint)', fontFamily: 'monospace' }}>{partner.id}</div>
                                  </div>
                                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>{stats.orders} orders</div>
                                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>{stats.tickets} admissions</div>
                                  <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink)' }}>₹{stats.revenue.toLocaleString()}</div>
                                  <button
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      openSellerPanel(partner)
                                    }}
                                    disabled={openingPartnerId === partner.id}
                                    className="btn-secondary"
                                    style={{ height: '34px', fontSize: '11px', padding: '0 12px' }}
                                  >
                                    {openingPartnerId === partner.id ? 'Opening…' : '🔎 Open panel'}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
