import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

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

declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void } }
}

function dateLabel(event: EventRecord) {
  const value = event.startsAt || event.date
  if (!value) return 'Date to be announced'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: event.timezone || undefined }).format(date)
}

async function loadRazorpay() {
  if (window.Razorpay) return true
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Payment form could not be loaded.'))
    document.body.appendChild(script)
  })
  return Boolean(window.Razorpay)
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
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' })
  const [quantity, setQuantity] = useState(1)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [confirmation, setConfirmation] = useState<{ ticketId?: string; event: string; downloadUrl?: string } | null>(null)
  const checkoutKeyRef = useRef<{ payload: string; key: string } | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    const url = requested ? `/api/events/${encodeURIComponent(requested)}` : '/api/events'
    fetch(url).then(async response => {
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Events could not be loaded.')
      if (!alive) return
      if (requested) {
        setSelected(data.event)
        setSelectedCategoryId(data.event.ticketCategories?.[0]?.id || '')
      } else setEvents(data.events || [])
    }).catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : 'Events could not be loaded.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [requested])

  const cities = useMemo(() => [...new Set(events.map(event => event.city).filter(Boolean))].sort(), [events])
  const categories = useMemo(() => [...new Set(events.map(event => event.category).filter(Boolean))].sort(), [events])
  const filtered = events.filter(event => {
    const query = search.trim().toLowerCase()
    const eventDate = new Date(event.startsAt || event.date || '').getTime()
    return (!query || `${event.name} ${event.description} ${event.venue}`.toLowerCase().includes(query)) &&
      (!city || event.city === city) && (!category || event.category === category) &&
      (!fromDate || (Number.isFinite(eventDate) && eventDate >= new Date(`${fromDate}T00:00:00`).getTime())) &&
      (!toDate || (Number.isFinite(eventDate) && eventDate <= new Date(`${toDate}T23:59:59`).getTime()))
  })
  const ticket = selected?.ticketCategories.find(item => item.id === selectedCategoryId) || selected?.ticketCategories[0]
  const ticketMaxQuantity = ticket ? Math.min(ticket.maxPerCustomer || 20, ticket.remainingAvailability === null ? (ticket.maxPerCustomer || 20) : Math.floor(ticket.remainingAvailability / Math.max(1, ticket.groupSize || 1))) : 0
  const ticketUnavailableReason = (item: TicketCategory) => {
    if (item.status !== 'active') return 'Unavailable'
    if (item.remainingAvailability !== null && item.remainingAvailability <= 0) return 'Sold out'
    const now = Date.now()
    if (item.salesStartAt && new Date(item.salesStartAt).getTime() > now) return `Sales open ${new Date(item.salesStartAt).toLocaleString()}`
    if (item.salesEndAt && new Date(item.salesEndAt).getTime() <= now) return 'Sales closed'
    return null
  }

  async function beginCheckout(event: EventRecord, selectedTicket: TicketCategory) {
    if (!buyer.name.trim() || !buyer.email.trim() || !buyer.phone.trim()) {
      setError('Enter your name, email and phone to continue.')
      return
    }
    setCheckoutBusy(true)
    setError('')
    const checkoutPayload = JSON.stringify({ event: event.id, category: selectedTicket.id, quantity, name: buyer.name.trim(), email: buyer.email.trim().toLowerCase(), phone: buyer.phone.trim() })
    if (!checkoutKeyRef.current || checkoutKeyRef.current.payload !== checkoutPayload) {
      checkoutKeyRef.current = { payload: checkoutPayload, key: crypto.randomUUID() }
    }
    let checkoutOpened = false
    try {
      const orderResponse = await fetch('/api/create-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': checkoutKeyRef.current.key },
        body: JSON.stringify({ name: buyer.name.trim(), email: buyer.email.trim(), phone: buyer.phone.trim(), eventId: event.id, ticketCategoryId: selectedTicket.id, quantity })
      })
      const order = await orderResponse.json()
      if (!orderResponse.ok || !order.success) throw new Error(order.message || 'Checkout could not be started.')

      if (order.testMode) {
        const verifyResponse = await fetch('/api/verify-payment', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.orderId })
        })
        const verified = await verifyResponse.json()
        if (!verifyResponse.ok || !verified.success) throw new Error(verified.message || 'Test checkout failed.')
        checkoutKeyRef.current = null
        setConfirmation({ ticketId: verified.ticketId, event: event.name, downloadUrl: verified.downloadUrl })
        return
      }

      if (!await loadRazorpay() || !window.Razorpay) throw new Error('Payment form could not be loaded.')
      const checkout = new window.Razorpay({
        key: order.keyId, order_id: order.orderId, amount: order.amountMinor, currency: order.currency,
        name: 'LITTX', description: `${event.name} · ${selectedTicket.name}`,
        prefill: buyer,
        handler: async (payment: Record<string, string>) => {
          try {
            const response = await fetch('/api/verify-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.orderId, ...payment }) })
            const result = await response.json()
            if (!response.ok || !result.success) throw new Error(result.message || 'Payment verification failed.')
            checkoutKeyRef.current = null
            setConfirmation({ ticketId: result.ticketId, event: event.name, downloadUrl: result.downloadUrl })
          } catch (reason) { setError(reason instanceof Error ? reason.message : 'Payment verification failed.') }
          finally { setCheckoutBusy(false) }
        },
        modal: { ondismiss: () => setCheckoutBusy(false) }
      })
      checkout.open()
      checkoutOpened = true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Checkout could not be started.')
      if (String(reason).toLowerCase().includes('expired')) checkoutKeyRef.current = null
    } finally {
      if (!checkoutOpened) setCheckoutBusy(false)
    }
  }

  const page: CSSProperties = { minHeight: '100vh', background: '#090811', color: '#f5f3fa', padding: 'clamp(20px, 5vw, 64px)', fontFamily: 'Inter, system-ui, sans-serif' }
  const panel: CSSProperties = { background: '#14121f', border: '1px solid #2a2737', borderRadius: 18, padding: 22 }
  const input: CSSProperties = { width: '100%', padding: '12px 14px', background: '#0c0b13', color: 'inherit', border: '1px solid #393548', borderRadius: 10, boxSizing: 'border-box' }

  return <main style={page}>
    <nav style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><a href="/" style={{ color: '#d8ff3f', textDecoration: 'none', fontWeight: 700 }}>← Stageway</a><a href="/bookings" style={{ color: '#d8ff3f', textDecoration: 'none', fontWeight: 700 }}>My bookings</a></nav>
    <div style={{ maxWidth: 1100, margin: '28px auto' }}>
      {loading ? <p role="status">Loading event information…</p> : error && requested && !selected ? <p role="alert" style={{ ...panel, color: '#ff7777' }}>{error}</p> : confirmation ? <section style={{ ...panel, textAlign: 'center', padding: 36 }}>
        <h1>Booking confirmed</h1><p>{confirmation.event}</p>
        {confirmation.ticketId && <p>Ticket reference: <strong>{confirmation.ticketId}</strong></p>}
        {confirmation.ticketId && <a href="/bookings" style={{ color: '#d8ff3f' }}>Recover your ticket securely</a>}
        <p><a href="/events" style={{ color: '#d8ff3f' }}>Browse more events</a></p>
      </section> : selected ? <>
        <button onClick={() => { window.location.href = '/events' }} style={{ ...input, width: 'auto', cursor: 'pointer', marginBottom: 18 }}>← All events</button>
        <section style={{ ...panel, marginBottom: 20 }}>
          {selected.images?.[0] && <img src={selected.images[0]} alt="" style={{ width: '100%', maxHeight: 360, objectFit: 'cover', borderRadius: 12, marginBottom: 18 }} />}
          <div style={{ color: '#d8ff3f', fontSize: 13 }}>{[selected.category, selected.city].filter(Boolean).join(' · ')}</div>
          <h1 style={{ fontSize: 'clamp(30px, 5vw, 50px)', margin: '8px 0' }}>{selected.name}</h1>
          <p>{dateLabel(selected)}{selected.time ? ` · ${selected.time}` : ''}{selected.venue ? ` · ${selected.venue}` : ''}</p>
          {selected.address && <p>{selected.address}</p>}
          <p style={{ color: '#c0bdcd', lineHeight: 1.6 }}>{selected.description}</p>
        </section>
        <section style={panel}>
          <h2>Choose tickets</h2>
          {!selected.ticketCategories?.length && <p>Ticket sales are not open for this event yet.</p>}
          {selected.ticketCategories?.map(item => <label key={item.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14, border: `1px solid ${selectedCategoryId === item.id ? '#d8ff3f' : '#393548'}`, borderRadius: 12, margin: '10px 0', cursor: 'pointer' }}>
            <input type="radio" name="ticketCategory" checked={selectedCategoryId === item.id} onChange={() => { setSelectedCategoryId(item.id); setQuantity(1) }} />
            <span style={{ flex: 1 }}><strong>{item.name}</strong><br /><small style={{ color: '#aaa6b8' }}>{item.description || (item.groupSize > 1 ? `Group ticket for ${item.groupSize} admissions` : '')}{item.remainingAvailability !== null ? ` · ${item.remainingAvailability} remaining` : ''}{ticketUnavailableReason(item) ? ` · ${ticketUnavailableReason(item)}` : item.remainingAvailability === null ? ' · Inventory availability checked at checkout' : ' · Available'}</small></span>
            <strong>{item.currency} {item.price.toLocaleString()}</strong>
          </label>)}
          {ticket && <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', marginTop: 18 }}>
            <input style={input} aria-label="Full name" placeholder="Full name" value={buyer.name} onChange={event => setBuyer({ ...buyer, name: event.target.value })} />
            <input style={input} aria-label="Email" type="email" placeholder="Email" value={buyer.email} onChange={event => setBuyer({ ...buyer, email: event.target.value })} />
            <input style={input} aria-label="Phone" type="tel" placeholder="Phone" value={buyer.phone} onChange={event => setBuyer({ ...buyer, phone: event.target.value })} />
            <input style={input} aria-label="Quantity" type="number" min={1} max={ticketMaxQuantity} value={quantity} onChange={event => setQuantity(Math.max(1, Math.min(ticketMaxQuantity || 1, Number(event.target.value) || 1)))} />
          </div>}
          {error && <p role="alert" style={{ color: '#ff7777' }}>{error}</p>}
          {ticket && <button disabled={checkoutBusy || Boolean(ticketUnavailableReason(ticket)) || quantity > ticketMaxQuantity || quantity < 1} onClick={() => beginCheckout(selected, ticket)} style={{ marginTop: 16, border: 0, borderRadius: 10, padding: '14px 22px', background: '#d8ff3f', color: '#111', fontWeight: 800, cursor: 'pointer' }}>{checkoutBusy ? 'Payment in progress…' : `Continue · ${ticket.currency} ${(ticket.price * quantity).toLocaleString()}`}</button>}
        </section>
      </> : <>
        <h1 style={{ fontSize: 'clamp(34px, 6vw, 56px)', marginBottom: 8 }}>Find your next event</h1>
        <p style={{ color: '#bcb8c9', marginTop: 0 }}>Browse current public listings and tickets configured by each organizer.</p>
        <section style={{ ...panel, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', margin: '22px 0' }}>
          <input style={input} aria-label="Search events" placeholder="Search events" value={search} onChange={event => setSearch(event.target.value)} />
          <select style={input} aria-label="Filter by city" value={city} onChange={event => setCity(event.target.value)}><option value="">All cities</option>{cities.map(value => <option key={value}>{value}</option>)}</select>
          <select style={input} aria-label="Filter by category" value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}</select>
          <input style={input} aria-label="Events from date" type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} />
          <input style={input} aria-label="Events to date" type="date" value={toDate} onChange={event => setToDate(event.target.value)} />
        </section>
        {loading ? <p>Loading events…</p> : error ? <p role="alert" style={{ color: '#ff7777' }}>{error}</p> : filtered.length === 0 ? <p style={panel}>No published events match these filters.</p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 18 }}>
          {filtered.map(event => <article key={event.id} style={{ ...panel, padding: 0, overflow: 'hidden' }}>
            {event.images?.[0] && <img src={event.images[0]} alt="" style={{ width: '100%', height: 190, objectFit: 'cover' }} />}
            <div style={{ padding: 20 }}><small style={{ color: '#d8ff3f' }}>{[event.category, event.city].filter(Boolean).join(' · ')}</small><h2>{event.name}</h2><p style={{ color: '#bcb8c9' }}>{dateLabel(event)}{event.venue ? ` · ${event.venue}` : ''}</p><p>{event.description}</p><a href={`/events?event=${encodeURIComponent(event.slug || event.id)}`} style={{ display: 'inline-block', marginTop: 8, color: '#d8ff3f', fontWeight: 800 }}>View tickets →</a></div>
          </article>)}
        </div>}
      </>}
    </div>
  </main>
}
