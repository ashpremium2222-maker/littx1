import { useCallback, useEffect, useMemo, useState } from 'react'
import './solver.css'

type Stats = { total: number; active: number; used: number; disabled: number; cancelled: number; upgraded: number }
type Ticket = {
  ticketId: string; event: string; attendee: string; phone: string; email: string; tier: string; quantity: number; price: number; amount: number
  createdAt: string | null; status: string; generatedBy: string | null; sellerId: string | null; company: string | null; source: string | null
  devicePortal: string | null; scannedAt: string | null; scannedBy: string | null; disabledAt: string | null; originalTier: string | null
  upgradedAt: string | null; upgradedBy: string | null; solverCanReactivate: boolean; solverCanDisable: boolean; solverCanUpgrade: boolean
}
type Upgrade = { tier: string; difference: number; currentPrice: number; newPrice: number }
type Detail = { success: boolean; ticket: Ticket; upgrades: Upgrade[]; history: any[] }
type PageData = { tickets: Ticket[]; total: number; pages: number; stats: Stats }

const emptyStats: Stats = { total: 0, active: 0, used: 0, disabled: 0, cancelled: 0, upgraded: 0 }
const statusLabels: Record<string, string> = { active: 'Active', used: 'Used', disabled: 'Disabled', cancelled: 'Cancelled' }
const money = (amount: number) => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(amount || 0)}`
const dateLabel = (date?: string | null) => date ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '—'

function authHeaders(revealToken?: string, json = false): HeadersInit {
  let token = sessionStorage.getItem('littx_token') || localStorage.getItem('littx_token') || ''
  if (!token) { try { token = JSON.parse(sessionStorage.getItem('littx_user') || localStorage.getItem('littx_user') || '{}').token || '' } catch { /* invalid cached session */ } }
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), 'X-Auth-Token': token, ...(revealToken ? { 'X-Solver-Reveal-Token': revealToken } : {}) }
}

export default function SolverByDevashtu() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [stats, setStats] = useState(emptyStats)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ event: '', status: '', tier: '', source: '', from: '', to: '' })
  const [events, setEvents] = useState<string[]>([])
  const [tiers, setTiers] = useState<string[]>([])
  const [selected, setSelected] = useState<Ticket | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [revealToken, setRevealToken] = useState('')
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [dialog, setDialog] = useState<'disable' | 'reactivate' | 'upgrade' | null>(null)
  const [reason, setReason] = useState('')
  const [upgradeTier, setUpgradeTier] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const fetchTickets = useCallback(async (targetPage = page, query = search, activeFilters = filters) => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ page: String(targetPage), limit: '50', q: query })
      Object.entries(activeFilters).forEach(([key, value]) => { if (value) params.set(key, value) })
      const response = await fetch(`/api/solver/tickets?${params}`, { headers: authHeaders(revealToken) })
      const data = await response.json()
      if (response.status === 401 || response.status === 403) throw new Error('Your administrator session has expired. Sign in again.')
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not load tickets.')
      const payload = data as PageData
      setTickets(payload.tickets || []); setStats(payload.stats || emptyStats); setTotal(payload.total || 0); setPages(Math.max(1, payload.pages || 1)); setPage(targetPage)
    } catch (err) { setError(err instanceof Error ? err.message : 'Network error. Please try again.') }
    finally { setLoading(false) }
  }, [page, search, filters, revealToken])

  useEffect(() => {
    fetch('/api/solver/meta', { headers: authHeaders() }).then(r => r.json()).then(data => { if (data.success) { setEvents(data.events || []); setTiers(data.tiers || []) } }).catch(() => {})
    fetchTickets(1)
  }, []) // first page only; later requests are explicit or debounced below

  useEffect(() => {
    const timer = window.setTimeout(() => fetchTickets(1, search, filters), 300)
    return () => window.clearTimeout(timer)
  }, [search, filters, revealToken])

  const openTicket = async (ticket: Ticket) => {
    setSelected(ticket); setDetail(null)
    try {
      const r = await fetch(`/api/solver/tickets/${encodeURIComponent(ticket.ticketId)}`, { headers: authHeaders(revealToken) })
      const data = await r.json(); if (!r.ok || !data.success) throw new Error(data.message || 'Could not load ticket.')
      setDetail(data)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load ticket details.') }
  }

  const reveal = async (event: React.FormEvent) => {
    event.preventDefault(); setPasswordError(''); setBusy(true)
    try {
      const r = await fetch('/api/solver/reveal-generator', { method: 'POST', headers: authHeaders(undefined, true), body: JSON.stringify({ password }) })
      const data = await r.json(); if (!r.ok || !data.success) throw new Error(data.message || 'Could not verify password.')
      setRevealToken(data.revealToken); setPassword(''); setPasswordOpen(false); setNotice('Generator details revealed for this administrator session.')
      window.setTimeout(() => { setRevealToken(''); setSelected(null); setDetail(null) }, Number(data.expiresIn || 600) * 1000)
    } catch (err) { setPasswordError(err instanceof Error ? err.message : 'Network error.') }
    finally { setBusy(false) }
  }

  const selectedUpgrade = useMemo(() => detail?.upgrades.find(upgrade => upgrade.tier === upgradeTier), [detail, upgradeTier])

  const performAction = async () => {
    if (!detail || !dialog) return
    setBusy(true); setError('')
    try {
      const body = dialog === 'disable' ? { reason } : dialog === 'upgrade' ? { tier: upgradeTier } : {}
      const r = await fetch(`/api/solver/tickets/${encodeURIComponent(detail.ticket.ticketId)}/${dialog}`, { method: 'POST', headers: authHeaders(undefined, true), body: JSON.stringify(body) })
      const data = await r.json(); if (!r.ok || !data.success) throw new Error(data.message || 'Could not update ticket.')
      setDialog(null); setReason(''); setUpgradeTier(''); setNotice(data.message || 'Ticket updated successfully.'); await fetchTickets(page); await openTicket(detail.ticket)
    } catch (err) { setError(err instanceof Error ? err.message : 'Network error.') }
    finally { setBusy(false) }
  }

  const statsList = [
    { key: 'total', label: 'Total Tickets', color: '#e9e8ef' }, { key: 'active', label: 'Active', color: '#4de0ae' },
    { key: 'used', label: 'Used', color: '#9b8cff' }, { key: 'disabled', label: 'Disabled', color: '#ff8a86' },
    { key: 'cancelled', label: 'Cancelled', color: '#f1bd5c' }, { key: 'upgraded', label: 'Upgraded', color: '#75baff' }
  ] as const

  return <main className="solver-page">
    <header className="solver-header">
      <div><div className="solver-brand">LITTX <span>MASTER CONTROL</span></div><p className="solver-eyebrow">Solver by Devashtu</p><h1>Central Ticket Control</h1><p className="solver-subtitle">Manage and control tickets generated across the entire LITTX system.</p></div>
      <div className="solver-header-actions"><button className="solver-button quiet" onClick={() => fetchTickets(page)}>↻ <span>Refresh</span></button><button className="solver-button primary" onClick={() => setPasswordOpen(true)}>⌑ <span>{revealToken ? 'Generator Revealed' : 'Reveal Ticket Generator'}</span></button></div>
    </header>

    {notice && <div className="solver-notice" role="status">✓ {notice}<button onClick={() => setNotice('')}>Dismiss</button></div>}
    {error && <div className="solver-error" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}

    <section className="solver-stats" aria-label="Ticket statistics">{statsList.map(item => <article className="solver-stat" key={item.key}><span>{item.label}</span><strong style={{ color: item.color }}>{stats[item.key].toLocaleString('en-IN')}</strong><i style={{ backgroundColor: item.color }} /></article>)}</section>

    <section className="solver-list-panel">
      <div className="solver-list-heading"><div><div className="solver-section-kicker">LIVE PRODUCTION DATA</div><h2>All Tickets <span>{total.toLocaleString('en-IN')}</span></h2></div><span className="solver-page-size">50 per page</span></div>
      <div className="solver-search-row"><label className="solver-search"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search ticket ID, name, phone, email, seller…" /></label><button className="solver-button quiet solver-refresh-mobile" onClick={() => fetchTickets(page)}>↻ Refresh</button></div>
      <div className="solver-filters">
        <select aria-label="Filter event" value={filters.event} onChange={e => { setFilters({ ...filters, event: e.target.value }); setPage(1) }}><option value="">All Events</option>{events.map(event => <option key={event}>{event}</option>)}</select>
        <select aria-label="Filter status" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="">All Statuses</option>{['active', 'used', 'disabled', 'cancelled'].map(s => <option value={s} key={s}>{statusLabels[s]}</option>)}</select>
        <select aria-label="Filter tier" value={filters.tier} onChange={e => setFilters({ ...filters, tier: e.target.value })}><option value="">All Tiers</option>{tiers.map(tier => <option key={tier}>{tier}</option>)}</select>
        <select aria-label="Filter source" value={filters.source} onChange={e => setFilters({ ...filters, source: e.target.value })}><option value="">All Sources</option>{['Admin', 'Seller', 'Shadow', 'PR', 'Offline', 'Manual'].map(source => <option key={source}>{source}</option>)}</select>
        <label className="solver-date">From<input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></label><label className="solver-date">To<input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></label>
      </div>
      <div className="solver-table-scroll"><table className="solver-table"><thead><tr><th>Ticket ID</th><th>Attendee</th><th>Event</th><th>Tier</th><th>Status</th><th>Generated By</th><th>Source</th><th>Created</th><th></th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={9} className="solver-empty"><span className="solver-spinner" /> Loading tickets…</td></tr> : tickets.length === 0 ? <tr><td colSpan={9} className="solver-empty">No tickets match these filters.</td></tr> : tickets.map(ticket => <tr key={`${ticket.ticketId}-${ticket.createdAt}`} onClick={() => openTicket(ticket)}>
          <td><span className="solver-id">{ticket.ticketId}</span></td><td><strong>{ticket.attendee}</strong><small>{ticket.email || ticket.phone || '—'}</small></td><td className="solver-event-cell">{ticket.event}</td><td>{ticket.tier}</td><td><span className={`solver-badge ${ticket.status}`}>{ticket.status}</span></td><td>{revealToken ? ticket.generatedBy || 'Unknown' : <span className="solver-protected">🔒 Protected</span>}</td><td>{revealToken ? <span className={`solver-source ${(ticket.source || 'unknown').toLowerCase()}`}>{ticket.source || 'Unknown'}</span> : <span className="solver-protected">🔒 Protected</span>}</td><td>{dateLabel(ticket.createdAt)}</td><td><button className="solver-manage" onClick={event => { event.stopPropagation(); openTicket(ticket) }}>Manage <span>→</span></button></td>
        </tr>)}</tbody></table></div>
      <div className="solver-pagination"><span>Showing {total === 0 ? 0 : (page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total.toLocaleString('en-IN')}</span><div><button disabled={page <= 1 || loading} onClick={() => fetchTickets(page - 1)}>← Previous</button><span>Page <b>{page}</b> of {pages}</span><button disabled={page >= pages || loading} onClick={() => fetchTickets(page + 1)}>Next →</button></div></div>
    </section>

    {selected && <div className="solver-scrim" onMouseDown={e => { if (e.target === e.currentTarget) { setSelected(null); setDetail(null) } }}><aside className="solver-drawer" aria-label="Ticket details">
      <div className="solver-drawer-top"><div><div className="solver-section-kicker">TICKET CONTROL</div><h2>Ticket details</h2></div><button className="solver-icon-button" onClick={() => { setSelected(null); setDetail(null) }} aria-label="Close details">×</button></div>
      {!detail ? <div className="solver-detail-loading"><span className="solver-spinner" /> Loading ticket…</div> : <>
        <div className="solver-ticket-hero"><span className="solver-id">{detail.ticket.ticketId}</span><span className={`solver-badge ${detail.ticket.status}`}>{detail.ticket.status}</span><h3>{detail.ticket.attendee}</h3><p>{detail.ticket.event}</p></div>
        <div className="solver-detail-scroll">
          <DetailGroup title="Ticket"><DetailRow label="Tier" value={detail.ticket.tier} /><DetailRow label="Group size / quantity" value={String(detail.ticket.quantity)} /><DetailRow label="Ticket price" value={money(detail.ticket.price * detail.ticket.quantity)} /><DetailRow label="Created at" value={dateLabel(detail.ticket.createdAt)} /><DetailRow label="Status" value={statusLabels[detail.ticket.status] || detail.ticket.status} /></DetailGroup>
          <DetailGroup title="Attendee"><DetailRow label="Name" value={detail.ticket.attendee} /><DetailRow label="Phone" value={detail.ticket.phone || '—'} /><DetailRow label="Email" value={detail.ticket.email || '—'} /></DetailGroup>
          <DetailGroup title="Scan information"><DetailRow label="Entry" value={detail.ticket.status === 'used' ? 'Used' : 'Not used'} /><DetailRow label="Used at" value={dateLabel(detail.ticket.scannedAt)} /><DetailRow label="Scanner" value={detail.ticket.scannedBy || '—'} /></DetailGroup>
          <DetailGroup title="Generator details">{revealToken ? <><DetailRow label="Generated by" value={detail.ticket.generatedBy || 'Unknown'} /><DetailRow label="Seller ID" value={detail.ticket.sellerId || '—'} /><DetailRow label="Company" value={detail.ticket.company || '—'} /><DetailRow label="Source" value={detail.ticket.source || 'Unknown'} /><DetailRow label="Device / Portal" value={detail.ticket.devicePortal || 'Unknown'} /></> : <div className="solver-protected-box"><span>🔒</span><div><b>Protected</b><p>Verify to reveal generator information.</p></div><button onClick={() => setPasswordOpen(true)}>Reveal</button></div>}</DetailGroup>
          {detail.ticket.originalTier && <DetailGroup title="Upgrade information"><DetailRow label="Original tier" value={detail.ticket.originalTier} /><DetailRow label="Current tier" value={detail.ticket.tier} /><DetailRow label="Upgraded at" value={dateLabel(detail.ticket.upgradedAt)} /><DetailRow label="Upgraded by" value={detail.ticket.upgradedBy || '—'} /></DetailGroup>}
          <DetailGroup title="History">{detail.history.length ? <div className="solver-history">{detail.history.map((item, index) => { const action = item.action || (item.kind === 'scan' ? (item.result === 'accepted' ? 'Ticket Used' : `Scan ${item.result || 'recorded'}`) : item.newValue === 'disabled' ? 'Ticket Disabled' : item.newValue === 'active' ? 'Ticket Reactivated' : item.category === 'TICKET_CONTROL' ? 'Ticket Upgraded' : String(item.newValue || item.category || 'Ticket updated')); return <div className="solver-history-item" key={item.logId || `${item.timestamp}-${index}`}><i /><div><b>{action}</b><span>{dateLabel(item.timestamp)}</span><small>{item.scannedBy ? `Scanner: ${item.scannedBy}` : item.adminUser ? `By: ${item.adminUser}` : item.reason || ''}</small></div></div> })}</div> : <p className="solver-muted">No scan or Solver history recorded.</p>}</DetailGroup>
        </div>
        <div className="solver-drawer-actions">{detail.ticket.solverCanDisable && <button className="solver-button danger-outline" onClick={() => setDialog('disable')}>Disable Ticket</button>}{detail.ticket.solverCanReactivate && <button className="solver-button safe" onClick={() => setDialog('reactivate')}>Reactivate Ticket</button>}{detail.ticket.solverCanUpgrade && <button className="solver-button primary" onClick={() => setDialog('upgrade')}>Upgrade Ticket</button>}</div>
      </>}
    </aside></div>}

    {passwordOpen && <div className="solver-modal-scrim"><form className="solver-modal" onSubmit={reveal}><button type="button" className="solver-modal-close" onClick={() => { setPasswordOpen(false); setPassword(''); setPasswordError('') }}>×</button><div className="solver-modal-icon">⌑</div><div className="solver-section-kicker">RESTRICTED INFORMATION</div><h2>Reveal ticket generator</h2><p>Enter the secure reveal password to view who generated each ticket.</p><label className="solver-input-label">Password<input autoFocus type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" /></label>{passwordError && <div className="solver-inline-error">{passwordError}</div>}<div className="solver-modal-actions"><button type="button" className="solver-button quiet" onClick={() => setPasswordOpen(false)}>Cancel</button><button className="solver-button primary" disabled={busy || !password}>{busy ? 'Verifying…' : 'Verify & Reveal'}</button></div></form></div>}

    {dialog && detail && <div className="solver-modal-scrim"><div className="solver-modal"><button className="solver-modal-close" onClick={() => setDialog(null)}>×</button><div className={`solver-modal-icon ${dialog}`}>{dialog === 'disable' ? '⊘' : dialog === 'reactivate' ? '↻' : '↗'}</div><div className="solver-section-kicker">{detail.ticket.ticketId}</div><h2>{dialog === 'disable' ? 'Disable this ticket?' : dialog === 'reactivate' ? 'Reactivate this ticket?' : 'Upgrade ticket'}</h2>
      {dialog === 'disable' ? <><p>This ticket will no longer be accepted for entry.</p><div className="solver-confirm-tier"><b>{detail.ticket.tier}</b><span>{detail.ticket.attendee}</span></div><label className="solver-input-label">Reason<input value={reason} onChange={e => setReason(e.target.value)} placeholder="Enter a reason for disabling" required /></label></> : dialog === 'reactivate' ? <><p>The ticket will become valid for entry again. Previous scans remain in its history.</p>{detail.ticket.scannedAt && <div className="solver-confirm-tier"><b>Previous scan</b><span>{dateLabel(detail.ticket.scannedAt)} · {detail.ticket.scannedBy || 'Scanner'}</span></div>}</> : <>{detail.ticket.status === 'used' ? <div className="solver-inline-error">This ticket has already been used. Reactivate it first if you want the upgraded ticket to be usable again.</div> : <><div className="solver-upgrade-compare"><div><span>Current tier</span><b>{detail.ticket.tier}</b><strong>{money(selectedUpgrade?.currentPrice || 0)}</strong></div><i>↓</i><div><span>New tier</span><select value={upgradeTier} onChange={e => setUpgradeTier(e.target.value)}><option value="">Choose eligible tier</option>{detail.upgrades.map(option => <option key={option.tier} value={option.tier}>{option.tier}</option>)}</select><strong>{money(selectedUpgrade?.newPrice || 0)}</strong></div></div>{selectedUpgrade && <div className="solver-upgrade-diff"><span>Upgrade difference</span><b>{money(selectedUpgrade.difference)}</b></div>}<p className="solver-muted">Ticket ID stays the same. Difference is calculated from the current server pricing.</p></>}</>}
      <div className="solver-modal-actions"><button className="solver-button quiet" onClick={() => setDialog(null)}>Cancel</button>{dialog === 'upgrade' && detail.ticket.status === 'used' ? <button className="solver-button safe" onClick={() => setDialog('reactivate')}>Reactivate first</button> : <button className={`solver-button ${dialog === 'disable' ? 'danger' : dialog === 'reactivate' ? 'safe' : 'primary'}`} disabled={busy || (dialog === 'disable' && !reason.trim()) || (dialog === 'upgrade' && !upgradeTier)} onClick={performAction}>{busy ? 'Saving…' : dialog === 'disable' ? 'Disable Ticket' : dialog === 'reactivate' ? 'Reactivate' : 'Confirm Upgrade'}</button>}</div>
    </div></div>}
  </main>
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) { return <section className="solver-detail-group"><h3>{title}</h3>{children}</section> }
function DetailRow({ label, value }: { label: string; value: string }) { return <div className="solver-detail-row"><span>{label}</span><b>{value || '—'}</b></div> }
