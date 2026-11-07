import { useEffect, useMemo, useRef, useState } from 'react'
import './EventMarketplace.css'

type TicketCategory = {
  id: string
  name: string
  description?: string
  price: number
  currency: string
  remainingAvailability: number | null
  maxPerCustomer: number
  status: string
  groupSize: number
  inclusions: string[]
  salesStartAt?: string | null
  salesEndAt?: string | null
}

type EventRecord = {
  id: string
  slug: string
  name: string
  description: string
  category: string
  organizerName?: string
  lineup?: string
  ageRestriction?: string
  terms?: string
  images: string[]
  city: string
  venue: string
  address: string
  date?: string | null
  time?: string | null
  startsAt?: string | null
  endsAt?: string | null
  timezone: string
  ticketCategories: TicketCategory[]
}

type BookingConfirmation = { ticketId?: string; event: string; downloadUrl?: string; qrDataUrl?: string }
type DateFilter = 'all' | 'today' | 'weekend'
const RECENT_KEY = 'stageway-recent-events-v1'

declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void } }
}

function dateLabel(event: EventRecord, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) {
  const value = event.startsAt || event.date
  if (!value) return 'Date to be announced'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(undefined, { ...options, timeZone: event.timezone || undefined }).format(date)
}

function ticketPrice(event: EventRecord) {
  const now = Date.now()
  const available = (event.ticketCategories || []).filter(item => item.status === 'active' && item.price >= 0 && (item.remainingAvailability === null || item.remainingAvailability > 0) && (!item.salesStartAt || new Date(item.salesStartAt).getTime() <= now) && (!item.salesEndAt || new Date(item.salesEndAt).getTime() > now))
  if (!available.length) return null
  return available.reduce((lowest, item) => Math.min(lowest, item.price), Number.POSITIVE_INFINITY)
}

function eventPriceLabel(event: EventRecord) {
  if (!event.ticketCategories?.length) return 'Ticket details soon'
  if (event.ticketCategories.every(item => item.status === 'sold_out' || item.remainingAvailability === 0)) return 'Sold out'
  if (event.ticketCategories.every(item => item.salesStartAt && new Date(item.salesStartAt).getTime() > Date.now())) return 'Sales open soon'
  return 'Check ticket options'
}

function money(value: number, currency = 'INR') {
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value) }
  catch { return `${currency} ${value.toLocaleString()}` }
}

function eventCurrency(event: EventRecord) { return event.ticketCategories?.find(item => item.status === 'active')?.currency || 'INR' }

function dateWindow(event: EventRecord) {
  const value = event.startsAt || event.date
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isToday(event: EventRecord) {
  const date = dateWindow(event)
  if (!date) return false
  const today = new Date()
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate()
}

function isThisWeekend(event: EventRecord) {
  const date = dateWindow(event)
  if (!date) return false
  const now = new Date()
  const daysToSaturday = now.getDay() === 0 ? -1 : (6 - now.getDay() + 7) % 7
  const saturday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToSaturday)
  const sunday = new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate() + 1, 23, 59, 59, 999)
  return date >= new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate()) && date <= sunday
}

let razorpayLoading: Promise<boolean> | null = null
async function loadRazorpay() {
  if (window.Razorpay) return true
  if (!razorpayLoading) razorpayLoading = new Promise<boolean>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout]')
    if (!script) {
      script = document.createElement('script')
      script.dataset.razorpayCheckout = 'true'
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      document.body.appendChild(script)
    }
    const finish = () => window.Razorpay ? resolve(true) : reject(new Error('Payment form could not be loaded.'))
    if (window.Razorpay) finish()
    else { script.addEventListener('load', finish, { once: true }); script.addEventListener('error', () => reject(new Error('Payment form could not be loaded.')), { once: true }) }
  }).catch(reason => { razorpayLoading = null; throw reason })
  return razorpayLoading
}

function loadRecentIds(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string').slice(0, 12) : []
  } catch { return [] }
}

export default function EventMarketplace() {
  const requested = new URLSearchParams(window.location.search).get('event') || ''
  const [events, setEvents] = useState<EventRecord[]>([])
  const [selected, setSelected] = useState<EventRecord | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('')
  const [category, setCategory] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' })
  const [quantity, setQuantity] = useState(1)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null)
  const [recentIds, setRecentIds] = useState<string[]>(loadRecentIds)
  const checkoutKeyRef = useRef<{ payload: string; key: string } | null>(null)

  const loadEvents = async () => {
    setLoading(true); setError('')
    try {
      const url = '/api/events'
      const response = await fetch(url, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Events could not be loaded.')
      setEvents(Array.isArray(data.events) ? data.events : [])
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Events could not be loaded.') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (!requested) { void loadEvents(); return }
    let alive = true
    setLoading(true); setError('')
    fetch(`/api/events/${encodeURIComponent(requested)}`, { cache: 'no-store' })
      .then(async response => {
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.message || 'This event is unavailable.')
        if (!alive) return
        setSelected(data.event)
        setSelectedCategoryId(data.event.ticketCategories?.find((item: TicketCategory) => item.status === 'active')?.id || data.event.ticketCategories?.[0]?.id || '')
      })
      .catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : 'Event details could not be loaded.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [requested])

  useEffect(() => {
    if (!selected?.id) return
    const next = [selected.id, ...recentIds.filter(id => id !== selected.id)].slice(0, 12)
    setRecentIds(next)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* Browsing still works when storage is unavailable. */ }
  }, [selected?.id])

  const cities = useMemo(() => [...new Set(events.map(event => event.city).filter(Boolean))].sort(), [events])
  const categories = useMemo(() => [...new Set(events.map(event => event.category).filter(Boolean))].sort(), [events])
  const sortedEvents = useMemo(() => events.filter(event => { const date = dateWindow(event); return !date || date.getTime() >= Date.now() }).sort((a, b) => (dateWindow(a)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (dateWindow(b)?.getTime() ?? Number.MAX_SAFE_INTEGER)), [events])
  const filtered = useMemo(() => sortedEvents.filter(event => {
    const query = search.trim().toLowerCase()
    const eventDate = dateWindow(event)?.getTime() ?? NaN
    return (!query || `${event.name} ${event.description} ${event.venue} ${event.city} ${event.category}`.toLowerCase().includes(query)) &&
      (!city || event.city === city) && (!category || event.category === category) &&
      (dateFilter === 'all' || (dateFilter === 'today' ? isToday(event) : isThisWeekend(event))) &&
      (!fromDate || (Number.isFinite(eventDate) && eventDate >= new Date(`${fromDate}T00:00:00`).getTime())) &&
      (!toDate || (Number.isFinite(eventDate) && eventDate <= new Date(`${toDate}T23:59:59.999`).getTime()))
  }), [sortedEvents, search, city, category, dateFilter, fromDate, toDate])
  const featured = filtered[0] || null
  const recentEvents = !search && !city && !category && dateFilter === 'all' && !fromDate && !toDate
    ? recentIds.map(id => events.find(event => event.id === id)).filter((event): event is EventRecord => Boolean(event && event.id !== featured?.id)).slice(0, 4)
    : []

  const ticket = selected?.ticketCategories.find(item => item.id === selectedCategoryId) || selected?.ticketCategories[0]
  const ticketMaxQuantity = ticket ? Math.min(ticket.maxPerCustomer || 20, ticket.remainingAvailability === null ? (ticket.maxPerCustomer || 20) : Math.floor(ticket.remainingAvailability / Math.max(1, ticket.groupSize || 1))) : 0
  const ticketUnavailableReason = (item: TicketCategory) => {
    if (item.status !== 'active') return item.status === 'sold_out' ? 'Sold out' : 'Sales paused'
    if (item.remainingAvailability !== null && item.remainingAvailability <= 0) return 'Sold out'
    const now = Date.now()
    if (item.salesStartAt && new Date(item.salesStartAt).getTime() > now) return `Sales open ${new Date(item.salesStartAt).toLocaleString()}`
    if (item.salesEndAt && new Date(item.salesEndAt).getTime() <= now) return 'Sales closed'
    return null
  }

  async function beginCheckout(event: EventRecord, selectedTicket: TicketCategory) {
    if (!buyer.name.trim() || !buyer.email.trim() || !buyer.phone.trim()) { setError('Enter your name, email and phone to continue.'); return }
    if (quantity < 1 || quantity > ticketMaxQuantity || ticketUnavailableReason(selectedTicket)) { setError('That ticket option is no longer available. Refresh event details and try again.'); return }
    setCheckoutBusy(true); setError('')
    const checkoutPayload = JSON.stringify({ event: event.id, category: selectedTicket.id, quantity, name: buyer.name.trim(), email: buyer.email.trim().toLowerCase(), phone: buyer.phone.trim() })
    if (!checkoutKeyRef.current || checkoutKeyRef.current.payload !== checkoutPayload) checkoutKeyRef.current = { payload: checkoutPayload, key: crypto.randomUUID() }
    let checkoutOpened = false
    try {
      const orderResponse = await fetch('/api/create-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': checkoutKeyRef.current.key },
        body: JSON.stringify({ name: buyer.name.trim(), email: buyer.email.trim(), phone: buyer.phone.trim(), eventId: event.id, ticketCategoryId: selectedTicket.id, quantity })
      })
      const order = await orderResponse.json()
      if (!orderResponse.ok || !order.success) throw new Error(order.message || 'Checkout could not be started.')

      if (order.testMode) {
        const verifyResponse = await fetch('/api/verify-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.orderId }) })
        const verified = await verifyResponse.json()
        if (!verifyResponse.ok || !verified.success) throw new Error(verified.message || 'Test checkout failed.')
        checkoutKeyRef.current = null
        setConfirmation({ ticketId: verified.ticketId, event: event.name, downloadUrl: verified.downloadUrl, qrDataUrl: verified.qrDataUrl })
        return
      }

      if (!await loadRazorpay() || !window.Razorpay) throw new Error('Payment form could not be loaded.')
      const checkout = new window.Razorpay({
        key: order.keyId, order_id: order.orderId, amount: order.amountMinor, currency: order.currency,
        name: 'Stageway', description: `${event.name} · ${selectedTicket.name}`,
        prefill: buyer,
        handler: async (payment: Record<string, string>) => {
          try {
            const response = await fetch('/api/verify-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.orderId, ...payment }) })
            const result = await response.json()
            if (!response.ok || !result.success) throw new Error(result.message || 'Payment verification failed.')
            checkoutKeyRef.current = null
            setConfirmation({ ticketId: result.ticketId, event: event.name, downloadUrl: result.downloadUrl, qrDataUrl: result.qrDataUrl })
          } catch (reason) { setError(reason instanceof Error ? reason.message : 'Payment verification failed.') }
          finally { setCheckoutBusy(false) }
        },
        modal: { ondismiss: () => setCheckoutBusy(false) }
      })
      checkout.open(); checkoutOpened = true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Checkout could not be started.')
      if (String(reason).toLowerCase().includes('expired')) checkoutKeyRef.current = null
    } finally { if (!checkoutOpened) setCheckoutBusy(false) }
  }

  const styles = {
    input: { width: '100%', padding: '12px 14px', background: 'rgba(10,9,18,.84)', color: 'inherit', border: '1px solid rgba(245,242,234,.14)', borderRadius: 13, boxSizing: 'border-box' as const },
    button: { border: 0, borderRadius: 14, padding: '13px 18px', background: '#d8ff3f', color: '#111', fontWeight: 800, cursor: 'pointer' as const },
  }

  return <main className="pv-market">
    <header className="pv-nav"><a href="/events" className="pv-brand"><img src="/logo.png" alt="" /><span>STAGEWAY</span><i>EVENTS</i></a><nav aria-label="Main navigation"><a className="active" href="/events">Discover</a><a href="/bookings">My tickets</a><a href="/vibora">Party Vibe AI ↗</a></nav><a className="pv-nav-cta" href="/bookings">My tickets <span>↗</span></a></header>
    <div className="pv-main">
      {loading && <div className="pv-status" role="status"><span className="pv-spinner" />{requested ? 'Loading event details…' : 'Finding events worth going out for…'}</div>}
      {!loading && error && <section className="pv-status pv-error" role="alert"><span>{error}</span>{!requested && <button className="pv-button pv-button-soft" onClick={() => void loadEvents()}>Try again</button>}</section>}

      {!loading && !error && confirmation && <section className="pv-confirm pv-glass" aria-live="polite"><div className="pv-confirm-mark">✓</div><p className="pv-eyebrow">YOU’RE ON THE LIST</p><h1>Booking confirmed.</h1><p>{confirmation.event}</p>{confirmation.ticketId && <div className="pv-ticket-proof">{confirmation.qrDataUrl && <img src={confirmation.qrDataUrl} alt={`Entry QR code for ${confirmation.ticketId}`} />}<span>Ticket reference <strong>{confirmation.ticketId}</strong></span></div>}<div className="pv-confirm-actions">{confirmation.downloadUrl && <a className="pv-button" href={confirmation.downloadUrl}>Download ticket PDF ↗</a>}<a className="pv-button pv-button-soft" href="/bookings">Manage my tickets</a><a className="pv-text-link" href="/events">Discover another event</a></div><p className="pv-quiet">Your ticket is also sent to the email and phone you entered. Booking help and secure recovery are in My tickets.</p></section>}

      {!loading && !error && !confirmation && requested && selected && <>
        <a className="pv-back" href="/events">← Back to all events</a>
        <section className="pv-detail-hero pv-glass">
          {selected.images?.[0] ? <img className="pv-detail-image" src={selected.images[0]} alt={`${selected.name} event artwork`} /> : <div className="pv-detail-art"><span>LIVE EXPERIENCE</span></div>}
          <div className="pv-detail-shade" />
          <div className="pv-detail-content"><div className="pv-tags">{selected.category && <span>{selected.category}</span>}{selected.city && <span>{selected.city}</span>}</div><h1>{selected.name}</h1><p>{dateLabel(selected, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}{selected.time ? ` · ${selected.time}` : ''}</p>{(selected.venue || selected.address) && <p>{selected.venue || selected.address}{selected.venue && selected.address ? ` · ${selected.address}` : ''}</p>}</div>
        </section>
        <div className="pv-detail-layout"><section className="pv-detail-copy pv-glass"><p className="pv-eyebrow">THE EXPERIENCE</p><h2>Make a night of it.</h2><p>{selected.description || 'The organiser has not added a description yet.'}</p><div className="pv-detail-facts"><div><small>WHEN</small><strong>{dateLabel(selected, { month: 'short', day: 'numeric' })}{selected.time ? ` · ${selected.time}` : ''}</strong></div><div><small>WHERE</small><strong>{selected.venue || selected.city || 'Venue details to come'}</strong></div>{selected.organizerName && <div><small>HOSTED BY</small><strong>{selected.organizerName}</strong></div>}{selected.ageRestriction && <div><small>AGE / ENTRY</small><strong>{selected.ageRestriction}</strong></div>}</div>{selected.lineup && <div className="pv-detail-extra"><h3>Lineup & experience</h3><p>{selected.lineup}</p></div>}{selected.terms && <details className="pv-detail-terms"><summary>Entry terms & conditions</summary><p>{selected.terms}</p></details>}</section>
          <section className="pv-buy-panel pv-glass" id="tickets"><p className="pv-eyebrow">MAKE IT YOURS</p><h2>Choose your tickets</h2><p className="pv-buy-hint">Live prices and availability from the event organiser.</p>
            {!selected.ticketCategories?.length && <div className="pv-empty">Ticket sales have not opened for this event yet. Check back soon.</div>}
            {selected.ticketCategories?.map(item => { const unavailable = ticketUnavailableReason(item); return <label key={item.id} className={`pv-tier${selectedCategoryId === item.id ? ' selected' : ''}${unavailable ? ' unavailable' : ''}`}><input type="radio" name="ticketCategory" checked={selectedCategoryId === item.id} disabled={Boolean(unavailable)} onChange={() => { setSelectedCategoryId(item.id); setQuantity(1); setError('') }} /><span className="pv-tier-copy"><strong>{item.name}</strong><small>{item.description || (item.groupSize > 1 ? `Includes ${item.groupSize} admissions` : 'One admission')}{item.inclusions?.length ? ` · ${item.inclusions.join(' · ')}` : ''}</small><em>{unavailable || (item.remainingAvailability !== null ? `${item.remainingAvailability} remaining` : 'Availability confirmed at checkout')}</em></span><b>{money(item.price, item.currency)}</b></label> })}
            {ticket && !ticketUnavailableReason(ticket) && <><div className="pv-quantity"><span><strong>Tickets</strong><small>{ticket.groupSize > 1 ? `${ticket.groupSize} admissions per pass` : 'Choose how many to book'}</small></span><div><button type="button" aria-label="Remove one ticket" disabled={quantity <= 1} onClick={() => setQuantity(value => Math.max(1, value - 1))}>−</button><b aria-live="polite">{quantity}</b><button type="button" aria-label="Add one ticket" disabled={quantity >= ticketMaxQuantity} onClick={() => setQuantity(value => Math.min(ticketMaxQuantity, value + 1))}>+</button></div></div><div className="pv-buyer-grid"><input style={styles.input} aria-label="Full name" autoComplete="name" placeholder="Full name" value={buyer.name} onChange={event => setBuyer({ ...buyer, name: event.target.value })} /><input style={styles.input} aria-label="Email" autoComplete="email" type="email" placeholder="Email for your ticket" value={buyer.email} onChange={event => setBuyer({ ...buyer, email: event.target.value })} /><input style={styles.input} aria-label="Phone" autoComplete="tel" type="tel" placeholder="Phone number" value={buyer.phone} onChange={event => setBuyer({ ...buyer, phone: event.target.value })} /></div><div className="pv-total"><span>Ticket total <small>Final amount confirmed securely at checkout</small></span><strong>{money(ticket.price * quantity, ticket.currency)}</strong></div></>}
            {error && <p className="pv-inline-error" role="alert">{error}</p>}
            {ticket && <button disabled={checkoutBusy || Boolean(ticketUnavailableReason(ticket)) || quantity > ticketMaxQuantity || quantity < 1} onClick={() => beginCheckout(selected, ticket)} className="pv-button pv-checkout">{checkoutBusy ? <><span className="pv-spinner dark" /> Opening secure checkout…</> : `Continue to secure checkout · ${money(ticket.price * quantity, ticket.currency)}`}<span>→</span></button>}
            <p className="pv-secure-note">Payments are verified by Stageway. Your ticket is issued only after payment confirmation.</p>
          </section></div>
        </>}

      {!loading && !error && !confirmation && !requested && <>
        <section className="pv-intro"><div><p className="pv-eyebrow"><i /> REAL PLANS. REAL PEOPLE. REAL EVENTS.</p><h1>Tonight has<br /><em>potential.</em></h1><p>Find the gig, party or experience you’ll still be talking about next week.</p><a className="pv-button" href="#event-list">Explore live events <span>↓</span></a></div><div className="pv-intro-aside"><span>YOUR NEXT GREAT NIGHT</span><strong>Starts here.</strong><small>Published events · Live ticket prices · Secure booking</small></div></section>
        {featured && <section className="pv-featured-wrap"><div className="pv-section-head"><div><p className="pv-eyebrow">ON THE RADAR</p><h2>One for your plans.</h2></div><span>{filtered.length} live {filtered.length === 1 ? 'event' : 'events'}</span></div><a className="pv-featured pv-glass" href={`/events?event=${encodeURIComponent(featured.slug || featured.id)}`}>
          {featured.images?.[0] ? <img src={featured.images[0]} alt={`${featured.name} event artwork`} /> : <div className="pv-featured-art" />}<div className="pv-featured-shade" /><div className="pv-featured-copy"><div className="pv-tags">{featured.category && <span>{featured.category}</span>}{featured.city && <span>{featured.city}</span>}</div><h3>{featured.name}</h3><p>{dateLabel(featured, { weekday: 'short', month: 'short', day: 'numeric' })}{featured.time ? ` · ${featured.time}` : ''}{featured.venue ? ` · ${featured.venue}` : ''}</p><div className="pv-featured-bottom"><strong>{ticketPrice(featured) === null ? eventPriceLabel(featured) : `From ${money(ticketPrice(featured)!, eventCurrency(featured))}`}</strong><span>See tickets ↗</span></div></div></a></section>}
        <section className="pv-discover" id="event-list"><div className="pv-section-head"><div><p className="pv-eyebrow">THE LINEUP</p><h2>Find your kind of night.</h2><p>Explore published events with current ticket options from organisers.</p></div><a className="pv-ai-link" href="/vibora">Ask Party Vibe AI <span>✦</span></a></div>
          <div className="pv-controls"><label className="pv-search"><span>⌕</span><input aria-label="Search events, artists and venues" placeholder="Search events, artists, venues…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}>×</button>}</label><div className="pv-selects"><select aria-label="Filter by city" value={city} onChange={event => setCity(event.target.value)}><option value="">Everywhere</option>{cities.map(value => <option key={value}>{value}</option>)}</select><select aria-label="Filter by event type" value={category} onChange={event => setCategory(event.target.value)}><option value="">All vibes</option>{categories.map(value => <option key={value}>{value}</option>)}</select></div></div>
          <div className="pv-filter-row"><div className="pv-date-pills" role="group" aria-label="Quick date filters">{([['all','All upcoming'],['today','Today'],['weekend','This weekend']] as [DateFilter,string][]).map(([value,label]) => <button key={value} type="button" className={dateFilter === value ? 'active' : ''} onClick={() => setDateFilter(value)}>{label}</button>)}</div><details className="pv-date-range"><summary>More dates +</summary><div><label>From<input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} /></label><label>To<input type="date" value={toDate} onChange={event => setToDate(event.target.value)} /></label></div></details><span className="pv-results-count">{filtered.length} {filtered.length === 1 ? 'event' : 'events'}</span></div>
          {recentEvents.length > 0 && <div className="pv-recent"><div className="pv-subhead"><h3>Pick up where you left off</h3><span>Recently viewed</span></div><div className="pv-recent-grid">{recentEvents.map(event => <a key={event.id} className="pv-recent-card" href={`/events?event=${encodeURIComponent(event.slug || event.id)}`}>{event.images?.[0] ? <img src={event.images[0]} alt="" /> : <div className="pv-recent-art" />}<span><b>{event.name}</b><small>{dateLabel(event, { month: 'short', day: 'numeric' })} · {event.city || event.venue || 'Event details'}</small></span></a>)}</div></div>}
          {!loading && filtered.length === 0 ? <div className="pv-empty pv-empty-large"><span>✦</span><h3>{events.length ? 'No matches this time.' : 'The next great night is being planned.'}</h3><p>{events.length ? 'No published events match these filters. Try a different city, category or date range.' : 'There are no public events listed right now. Come back soon or ask Party Vibe AI for ideas.'}</p>{events.length ? <button className="pv-button pv-button-soft" onClick={() => { setSearch(''); setCity(''); setCategory(''); setDateFilter('all'); setFromDate(''); setToDate('') }}>Clear filters</button> : <a className="pv-button pv-button-soft" href="/vibora">Chat with Party Vibe AI</a>}</div> : <div className="pv-event-grid">{filtered.map((event, index) => { const lowest = ticketPrice(event); return <article className="pv-event-card" key={event.id}><a href={`/events?event=${encodeURIComponent(event.slug || event.id)}`} className="pv-event-art-link">{event.images?.[0] ? <img className="pv-event-image" src={event.images[0]} alt={`${event.name} event artwork`} loading={index < 4 ? 'eager' : 'lazy'} /> : <div className={`pv-event-fallback tone-${index % 4}`}><span>{event.category || 'LIVE'}</span><b>{event.name.slice(0, 1).toUpperCase()}</b></div>}<span className="pv-event-date">{dateLabel(event, { month: 'short', day: 'numeric' })}</span></a><div className="pv-event-copy"><div className="pv-event-meta"><span>{event.category || 'Experience'}</span>{event.city && <span>{event.city}</span>}</div><h3><a href={`/events?event=${encodeURIComponent(event.slug || event.id)}`}>{event.name}</a></h3><p>{event.venue || event.address || 'Venue details to come'}{event.time ? ` · ${event.time}` : ''}</p><div className="pv-event-footer"><strong>{lowest === null ? eventPriceLabel(event) : <><small>FROM</small>{money(lowest, eventCurrency(event))}</>}</strong><a href={`/events?event=${encodeURIComponent(event.slug || event.id)}`}>Get tickets <span>↗</span></a></div></div></article> })}</div>}
        </section>
        <footer className="pv-footer"><a href="/">Stageway</a><span>Discover something worth showing up for.</span><a href="/bookings">Find my tickets →</a></footer>
      </>}
    </div>
  </main>
}
