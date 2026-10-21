import React, { useEffect, useState } from 'react'
import EventTeamManager from './EventTeamManager'

function currencyTotals(total: number | null | undefined, currency: string | null | undefined, byCurrency?: Record<string, number>) {
  if (total !== null && total !== undefined) return `${currency || 'INR'} ${Number(total).toLocaleString()}`
  return Object.entries(byCurrency || {}).map(([code, amount]) => `${code} ${Number(amount).toLocaleString()}`).join(' · ') || '—'
}

type OrganizerCategory = {
  id: string
  name: string
  description?: string
  price: number
  currency?: string
  totalInventory: number | null
  remainingInventory: number | null
  groupSize: number
  status: string
  maxPerCustomer?: number
  salesStartAt?: string | null
  salesEndAt?: string | null
  inclusions?: string[]
}

type OrganizerEvent = {
  eventId: string
  name: string
  images?: string[]
  status: string
  city: string
  venue: string
  description: string
  startsAt: string | null
  endsAt?: string | null
  ticketCategories: OrganizerCategory[]
  sales: { orders: number; confirmedOrders: number; ticketsIssued: number; admissions: number; online: any; offline: any; verifiedRevenue: number | null; verifiedRevenueCurrency?: string | null; verifiedRevenueByCurrency?: Record<string, number>; pending: number; pendingAmount: number | null; pendingAmountCurrency?: string | null; pendingAmountByCurrency?: Record<string, number>; cancelled: number; expired: number; unverified: number; unverifiedAmount: number | null; unverifiedAmountCurrency?: string | null; unverifiedAmountByCurrency?: Record<string, number>; refundRequests: number; refundApprovals: number; refundRejections: number }
  scans: { accepted: number; duplicate: number; admissions: number; recent: any[] }
  refundRequests: any[]
  activity: any[]
  orders: any[]
}

export default function OrganizerPortal({ onLogout }: { onLogout: () => void }) {
  const [events, setEvents] = useState<OrganizerEvent[]>([])
  const [displayName, setDisplayName] = useState('Organizer')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingEvent, setEditingEvent] = useState<OrganizerEvent | null>(null)
  const [editForm, setEditForm] = useState({ name: '', venue: '', city: '', description: '', posterUrl: '', startsAt: '', endsAt: '' })
  const [categories, setCategories] = useState<OrganizerCategory[]>([])
  const [saving, setSaving] = useState(false)
  const [draftForm, setDraftForm] = useState({ name: '', category: '', venue: '', city: '', description: '', posterUrl: '', startsAt: '', endsAt: '' })
  const [creatingDraft, setCreatingDraft] = useState(false)
  const [profile, setProfile] = useState<{ displayName: string; organizationName: string; verifiedEmail: string | null; emailVerified: boolean; companyId: string }>({ displayName: '', organizationName: '', verifiedEmail: null, emailVerified: false, companyId: '' })
  const [profileSaving, setProfileSaving] = useState(false)

  const localDatetime = (value?: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return ''
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }

  const load = async () => {
    setError('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const response = await fetch('/api/organizer/overview', { headers: { 'x-auth-token': token }, cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Organizer data could not be loaded.')
      setEvents(data.events || [])
      setDisplayName(data.organizer?.displayName || 'Organizer')
      const profileResponse = await fetch('/api/organizer/profile', { headers: { 'x-auth-token': token }, cache: 'no-store' })
      const profileData = await profileResponse.json()
      if (profileResponse.ok && profileData.success) setProfile(profileData.profile)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Organizer data could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const beginEdit = (event: OrganizerEvent) => {
    setEditingEvent(event)
    setEditForm({ name: event.name, venue: event.venue || '', city: event.city || '', description: event.description || '', posterUrl: event.images?.[0] || '', startsAt: localDatetime(event.startsAt), endsAt: localDatetime(event.endsAt) })
    setCategories(event.ticketCategories.map(category => ({ ...category })))
  }

  const saveEvent = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editingEvent) return
    const priceChanges = categories.filter(category => {
      const previous = editingEvent.ticketCategories.find(item => item.id === category.id)
      return !previous || previous.price !== category.price
    })
    if (priceChanges.length && !window.confirm(`Save ticket price changes for ${priceChanges.map(category => category.name).join(', ')}? This changes the configured price used for future sales; existing orders remain unchanged.`)) return
    setSaving(true)
    setError('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const response = await fetch(`/api/admin/events/${encodeURIComponent(editingEvent.eventId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ name: editForm.name, venue: editForm.venue, city: editForm.city, description: editForm.description, images: editForm.posterUrl.trim() ? [editForm.posterUrl.trim()] : [], startsAt: editForm.startsAt ? new Date(editForm.startsAt).toISOString() : null, endsAt: editForm.endsAt ? new Date(editForm.endsAt).toISOString() : null, ticketCategories: categories })
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Event changes could not be saved.')
      setEditingEvent(null)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Event changes could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const createDraft = async (event: React.FormEvent) => {
    event.preventDefault(); setCreatingDraft(true); setError('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const response = await fetch('/api/admin/events', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': token }, body: JSON.stringify({ ...draftForm, images: draftForm.posterUrl.trim() ? [draftForm.posterUrl.trim()] : [], startsAt: draftForm.startsAt ? new Date(draftForm.startsAt).toISOString() : null, endsAt: draftForm.endsAt ? new Date(draftForm.endsAt).toISOString() : null, ticketCategories: [] }) })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Draft could not be created.')
      setDraftForm({ name: '', category: '', venue: '', city: '', description: '', posterUrl: '', startsAt: '', endsAt: '' }); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Draft could not be created.') } finally { setCreatingDraft(false) }
  }

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault(); setProfileSaving(true); setError('')
    try {
      const response = await fetch('/api/organizer/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-auth-token': sessionStorage.getItem('littx_token') || '' }, body: JSON.stringify({ displayName: profile.displayName, organizationName: profile.organizationName }) })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Profile could not be updated.')
      setProfile(data.profile); setDisplayName(data.profile.displayName)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Profile could not be updated.') } finally { setProfileSaving(false) }
  }

  const submitForReview = async (event: OrganizerEvent) => {
    if (!window.confirm(`Submit ${event.name} for platform publication review? It will not be publicly listed until a master administrator publishes it.`)) return
    setError('')
    try {
      const response = await fetch(`/api/admin/events/${encodeURIComponent(event.eventId)}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': sessionStorage.getItem('littx_token') || '' }, body: JSON.stringify({ status: 'pending_review' }) })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Event could not be submitted for review.')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Event could not be submitted for review.') }
  }

  const logout = async () => {
    const token = sessionStorage.getItem('littx_token') || ''
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'x-auth-token': token } }).catch(() => {})
    onLogout()
  }

  if (loading) return <main className="app-canvas theme-dark" style={{ minHeight: '100vh', padding: 32, color: 'var(--ink)' }}>Loading organizer events…</main>

  return <main className="app-canvas theme-dark" style={{ minHeight: '100vh', padding: '24px clamp(16px, 4vw, 48px)', color: 'var(--ink)' }}>
    <div style={{ maxWidth: 1440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div><div className="muted-sm">STAGEWAY · ORGANIZER</div><h1 style={{ margin: '6px 0' }}>Welcome, {displayName}</h1><div className="muted-sm">Only events explicitly assigned to your account appear here.</div></div>
        <button className="btn-secondary" onClick={logout}>Sign out</button>
      </header>
      {error && <div role="alert" className="card" style={{ color: 'var(--red)' }}>{error} <button className="btn-secondary" onClick={() => { setLoading(true); void load() }}>Retry</button></div>}
      <form className="card" onSubmit={saveProfile} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <h2 style={{ gridColumn: '1 / -1', margin: 0 }}>Organization profile</h2>
        <input aria-label="Organizer contact name" value={profile.displayName} onChange={event => setProfile(current => ({ ...current, displayName: event.target.value }))} minLength={2} maxLength={120} required />
        <input aria-label="Organization name" value={profile.organizationName} onChange={event => setProfile(current => ({ ...current, organizationName: event.target.value }))} minLength={2} maxLength={160} required />
        <div className="muted-sm">Verified email: {profile.verifiedEmail || 'Not set'} · email changes require a separate verification workflow.</div>
        <button className="btn-secondary" disabled={profileSaving}>{profileSaving ? 'Saving…' : 'Save profile'}</button>
      </form>
      <form className="card" onSubmit={createDraft} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
        <h2 style={{ gridColumn: '1 / -1', margin: 0 }}>Create event draft</h2>
        <input aria-label="New event name" placeholder="Event name" value={draftForm.name} onChange={event => setDraftForm(current => ({ ...current, name: event.target.value }))} maxLength={160} required />
        <input aria-label="New event category" placeholder="Category" value={draftForm.category} onChange={event => setDraftForm(current => ({ ...current, category: event.target.value }))} />
        <input aria-label="New event venue" placeholder="Venue" value={draftForm.venue} onChange={event => setDraftForm(current => ({ ...current, venue: event.target.value }))} />
        <input aria-label="New event city" placeholder="City" value={draftForm.city} onChange={event => setDraftForm(current => ({ ...current, city: event.target.value }))} />
        <input aria-label="Poster image URL" type="url" placeholder="Poster image URL (optional)" value={draftForm.posterUrl} onChange={event => setDraftForm(current => ({ ...current, posterUrl: event.target.value }))} />
        <label className="muted-sm">Event date and time<input aria-label="New event date" type="datetime-local" value={draftForm.startsAt} onChange={event => setDraftForm(current => ({ ...current, startsAt: event.target.value }))} /></label>
        <label className="muted-sm">Event end<input aria-label="New event end" type="datetime-local" value={draftForm.endsAt} onChange={event => setDraftForm(current => ({ ...current, endsAt: event.target.value }))} /></label>
        <textarea aria-label="New event description" placeholder="Description" value={draftForm.description} onChange={event => setDraftForm(current => ({ ...current, description: event.target.value }))} rows={2} />
        <button className="btn-primary" disabled={creatingDraft}>{creatingDraft ? 'Creating…' : 'Save draft'}</button>
        <div className="muted-sm" style={{ gridColumn: '1 / -1' }}>New drafts are owned by your approved organization and assigned to your account. They are not public until platform review and publication.</div>
      </form>
      {!events.length && <div className="card"><h2>No events yet</h2><p className="muted-sm">Create a draft above. Only events explicitly assigned to your organizer account appear here.</p></div>}
      {events.map(event => <section className="card" key={event.eventId} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div><div className="muted-sm">{event.status.toUpperCase()} · {event.city}{event.venue ? ` · ${event.venue}` : ''}</div><h2 style={{ margin: '6px 0' }}>{event.name}</h2><div className="muted-sm">{event.startsAt ? new Date(event.startsAt).toLocaleString() : 'Date not set'}</div></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn-secondary" onClick={() => beginEdit(event)}>Edit event and ticket categories</button>{event.status === 'draft' && <button className="btn-primary" onClick={() => void submitForReview(event)}>Submit for publication review</button>}</div>
        </div>
        <div className="kpi-row">
          <div className="tile tile-violet"><div className="tile-label">ORDERS / CONFIRMED</div><div className="tile-value">{event.sales.orders} / {event.sales.confirmedOrders}</div><div className="tile-sub">{event.sales.pending} pending · {event.sales.cancelled} cancelled · {event.sales.unverified} unverified</div></div>
          <div className="tile tile-teal"><div className="tile-label">QR CODES / ADMISSIONS</div><div className="tile-value">{event.sales.ticketsIssued} / {event.sales.admissions}</div><div className="tile-sub">{event.scans.admissions} admissions scanned · {event.scans.duplicate} duplicate scans</div></div>
          <div className="tile tile-gold"><div className="tile-label">ONLINE / OFFLINE ADMISSIONS</div><div className="tile-value">{event.sales.online.admissions} / {event.sales.offline.admissions}</div><div className="tile-sub">From confirmed sales only</div></div>
          <div className="tile tile-orange"><div className="tile-label">GROSS CONFIRMED CUSTOMER TOTAL</div><div className="tile-value">{currencyTotals(event.sales.verifiedRevenue, event.sales.verifiedRevenueCurrency, event.sales.verifiedRevenueByCurrency)}</div><div className="tile-sub">Customer total, before internal refund decisions</div><div className="muted-sm">Pending {currencyTotals(event.sales.pendingAmount, event.sales.pendingAmountCurrency, event.sales.pendingAmountByCurrency)} · unverified {currencyTotals(event.sales.unverifiedAmount, event.sales.unverifiedAmountCurrency, event.sales.unverifiedAmountByCurrency)}</div></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16 }}>
          <div><h3>Ticket categories and inventory</h3><div className="table-scroll"><table className="table"><thead><tr><th>Category</th><th>Price</th><th>Remaining</th><th>Admissions / QR</th></tr></thead><tbody>{event.ticketCategories.map(category => <tr key={category.id}><td>{category.name} · group of {category.groupSize}</td><td>{category.currency || 'INR'} {category.price.toLocaleString()}</td><td>{category.remainingInventory ?? 'Unlimited'}</td><td>{category.groupSize} / 1</td></tr>)}{!event.ticketCategories.length && <tr><td colSpan={4}>No ticket categories configured.</td></tr>}</tbody></table></div></div>
          <div><h3>Internal refund decisions</h3><div className="muted-sm">{event.sales.refundRequests} requested · {event.sales.refundApprovals} approved internally · {event.sales.refundRejections} rejected</div><div className="muted-sm">Approval does not confirm that money was returned.</div>{event.refundRequests.length ? event.refundRequests.map((refund: any) => <div key={refund.orderId} style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}><strong>{refund.orderId}</strong><div className="muted-sm">{refund.reason || 'No reason supplied'} · {refund.requestedAt ? new Date(refund.requestedAt).toLocaleString() : 'time unavailable'}</div><div className="muted-sm">View only · approval remains with an authorized admin</div></div>) : <p className="muted-sm">No pending refund requests.</p>}</div>
        </div>
        <div><h3>Recent orders · latest 100</h3><div className="table-scroll"><table className="table"><thead><tr><th>Order / QR</th><th>Category</th><th>State</th><th>Channel / seller</th><th>Admissions</th><th>Scan</th></tr></thead><tbody>{event.orders.map((order: any) => <tr key={order.orderId}><td>{order.orderId}<div className="muted-sm">{order.ticketId || 'QR not issued'}</div></td><td>{order.ticketType}</td><td>{order.status}{order.paymentStatus ? ` · ${order.paymentStatus}` : ''}{order.approvalStatus ? ` · ${order.approvalStatus}` : ''}</td><td>{order.channel}{order.sellerId ? ` · ${order.sellerName || order.sellerId}` : ''}</td><td>{order.admissions} · {order.amount === null ? 'unverified' : `${order.currency || 'INR'} ${Number(order.amount).toLocaleString()}`}</td><td>{order.scannedAdmissions} at {order.scannedAt ? new Date(order.scannedAt).toLocaleString() : 'not scanned'}</td></tr>)}{!event.orders.length && <tr><td colSpan={6}>No orders for this event.</td></tr>}</tbody></table></div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
          <div><h3>Recent scan history</h3>{event.scans.recent.slice(0, 8).map((scan: any, index: number) => <div key={`${scan.ticketId}-${index}`} className="muted-sm" style={{ padding: '5px 0' }}>{scan.result} · {scan.admissionCount} admissions · {scan.ticketId} · {new Date(scan.timestamp).toLocaleString()}</div>)}</div>
          <div><h3>Event activity</h3>{event.activity.length ? event.activity.map((activity: any, index: number) => <div key={`${activity.timestamp}-${index}`} className="muted-sm" style={{ padding: '5px 0' }}>{activity.action} · {activity.fieldChanged} · {activity.actor} · {activity.timestamp ? new Date(activity.timestamp).toLocaleString() : 'time unavailable'}</div>) : <div className="muted-sm">No event activity recorded.</div>}</div>
        </div>
        <EventTeamManager eventId={event.eventId} />
      </section>)}
    </div>

    {editingEvent && <div role="dialog" aria-modal="true" aria-label="Edit organizer event" style={{ position: 'fixed', inset: 0, zIndex: 100, overflowY: 'auto', background: 'rgba(0,0,0,.76)', padding: 20 }}>
      <form className="card" onSubmit={saveEvent} style={{ maxWidth: 900, margin: '20px auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2>Edit {editingEvent.name}</h2><button type="button" className="btn-secondary" onClick={() => setEditingEvent(null)}>Close</button></div>
        <input aria-label="Event name" value={editForm.name} onChange={event => setEditForm(current => ({ ...current, name: event.target.value }))} required />
        <input aria-label="Event venue" placeholder="Venue" value={editForm.venue} onChange={event => setEditForm(current => ({ ...current, venue: event.target.value }))} />
        <input aria-label="Event city" placeholder="City" value={editForm.city} onChange={event => setEditForm(current => ({ ...current, city: event.target.value }))} />
        <input aria-label="Poster image URL" type="url" placeholder="Poster image URL" value={editForm.posterUrl} onChange={event => setEditForm(current => ({ ...current, posterUrl: event.target.value }))} />
        <label>Start date<input aria-label="Event start date" type="datetime-local" value={editForm.startsAt} onChange={event => setEditForm(current => ({ ...current, startsAt: event.target.value }))} /></label>
        <label>End date<input aria-label="Event end date" type="datetime-local" value={editForm.endsAt} onChange={event => setEditForm(current => ({ ...current, endsAt: event.target.value }))} /></label>
        <textarea aria-label="Event description" placeholder="Description" value={editForm.description} onChange={event => setEditForm(current => ({ ...current, description: event.target.value }))} rows={4} />
        <h3>Ticket categories</h3>
        <button type="button" className="btn-secondary" onClick={() => setCategories(current => [...current, { id: `organizer-category-${Date.now()}`, name: '', price: 0, currency: 'INR', totalInventory: null, remainingInventory: null, groupSize: 1, status: 'active', maxPerCustomer: 20, inclusions: [] }])}>Add ticket category</button>
        <div className="table-scroll"><table className="table"><thead><tr><th>Name</th><th>Price</th><th>Total inventory</th><th>Remaining</th><th>Group size</th><th>Status</th><th></th></tr></thead><tbody>{categories.map((category, index) => <tr key={category.id}><td><input aria-label={`Category ${index + 1} name`} value={category.name} onChange={event => setCategories(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></td><td><input aria-label={`Category ${index + 1} price`} type="number" min="0" step="0.01" value={category.price} onChange={event => setCategories(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, price: Number(event.target.value) } : item))} /></td><td><input aria-label={`Category ${index + 1} total inventory`} type="number" min="0" value={category.totalInventory ?? ''} onChange={event => setCategories(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, totalInventory: event.target.value === '' ? null : Number(event.target.value) } : item))} /></td><td>{category.remainingInventory ?? 'Unlimited'}</td><td><input aria-label={`Category ${index + 1} group size`} type="number" min="1" max="100" value={category.groupSize} onChange={event => setCategories(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, groupSize: Number(event.target.value) } : item))} /></td><td><select aria-label={`Category ${index + 1} status`} value={category.status} onChange={event => setCategories(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, status: event.target.value } : item))}><option value="active">Active</option><option value="paused">Paused</option><option value="sold_out">Sold out</option></select></td><td><button type="button" className="btn-secondary" onClick={() => { if (window.confirm(`Remove category ${category.name || 'without a name'}? The server will reject removal if orders already use it.`)) setCategories(current => current.filter((_, itemIndex) => itemIndex !== index)) }}>Remove</button></td></tr>)}</tbody></table></div>
        <div className="muted-sm">Inventory capacity changes are rejected by the server after orders exist. Lifecycle publication and internal refund decisions remain with authorized administrators.</div>
        <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save event changes'}</button>
      </form>
    </div>}
  </main>
}
