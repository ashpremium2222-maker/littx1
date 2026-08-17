import React, { useState, useEffect, useCallback } from 'react'

interface CustomerUser {
  email: string
  name: string
  phone?: string
  role: string
}

interface TicketType {
  name: string
  price: number
  gender: string
}

interface Event {
  _id: string
  name: string
  companyId: string
  date?: string
  time?: string
  venue?: string
  stage?: string
  description?: string
  ticketTypes: TicketType[]
}

interface Booking {
  orderId: string
  ticketId?: string
  event: string
  name: string
  email: string
  gender: string
  quantity: number
  amount: number
  status: string
  generatedAt?: string
  createdAt?: string
  scannedAt?: string
  scannedBy?: string
  qrDataUrl?: string
}

interface CustomerDashboardProps {
  user: CustomerUser
  onLogout: () => void
}

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  emailed:          { bg: 'rgba(61,220,132,0.15)', color: '#3DDC84', label: '✓ Delivered' },
  ticket_generated: { bg: 'rgba(216,255,63,0.12)', color: '#D8FF3F', label: '🎟 Ready' },
  paid:             { bg: 'rgba(61,220,132,0.12)', color: '#3DDC84', label: '✓ Confirmed' },
  scanned:          { bg: 'rgba(100,60,240,0.15)', color: '#A78BFA', label: '✓ Scanned In' },
  email_failed:     { bg: 'rgba(245,185,66,0.15)', color: '#F5B942', label: '⚠ Check Email' },
  cancelled:        { bg: 'rgba(255,107,107,0.12)', color: '#FF6B6B', label: '✕ Cancelled' },
}

function statusBadge(status: string) {
  return STATUS_BADGE[status] || { bg: 'rgba(255,255,255,0.06)', color: '#9896A8', label: status }
}

// Format date nicely
function fmtDate(d?: string) {
  if (!d) return 'TBD'
  try {
    const date = new Date(d)
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return d }
}

// Ticket type icon
function ticketIcon(gender: string) {
  if (gender === 'female') return '👩'
  if (gender === 'male') return '👨'
  return '🎫'
}

// ==================== BOOKING MODAL ====================
function BookModal({
  event,
  user,
  onClose,
  onBooked,
}: {
  event: Event
  user: CustomerUser
  onClose: () => void
  onBooked: (booking: Booking) => void
}) {
  const [selectedType, setSelectedType] = useState<TicketType | null>(event.ticketTypes[0] || null)
  const [qty, setQty] = useState(1)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<any>(null)
  const [error, setError] = useState('')

  const total = selectedType ? selectedType.price * qty : 0

  const handleBook = async () => {
    if (!selectedType) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/customer/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          name: user.name,
          phone: user.phone || '',
          eventId: event._id,
          ticketTypeName: selectedType.name,
          quantity: qty,
        })
      })
      const data = await res.json()
      if (data.success) {
        setSuccess(data.ticket)
        onBooked({
          orderId: data.ticket.orderId,
          ticketId: data.ticket.id,
          event: data.ticket.event,
          name: data.ticket.attendee,
          email: data.ticket.email,
          gender: selectedType.gender,
          quantity: data.ticket.qty,
          amount: parseFloat(data.ticket.price),
          status: 'ticket_generated',
          generatedAt: data.ticket.generatedAt,
          createdAt: data.ticket.generatedAt,
          qrDataUrl: data.ticket.qrDataUrl,
        })
      } else {
        setError(data.message || 'Booking failed. Please try again.')
      }
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(12px)',
        zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(160deg, #0F0D1A 0%, #13101f 100%)',
          border: '1px solid rgba(216,255,63,0.2)',
          borderRadius: 24,
          width: '100%',
          maxWidth: 480,
          overflow: 'hidden',
          boxShadow: '0 40px 100px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(216,255,63,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#D8FF3F', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 4 }}>Book Pass</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#F0EEF8' }}>{event.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5C5A6A', cursor: 'pointer', fontSize: 22, padding: 0, lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {success ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#D8FF3F', marginBottom: 8 }}>Booking Confirmed!</div>
              <div style={{ color: '#9896A8', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
                Your ticket <strong style={{ color: '#F0EEF8' }}>#{success.id}</strong> has been generated.<br />
                Check your email for the ticket PDF.
              </div>
              {/* QR preview */}
              {success.qrDataUrl && (
                <div style={{ display: 'inline-block', background: '#fff', padding: 12, borderRadius: 14, marginBottom: 20 }}>
                  <img src={success.qrDataUrl} alt="QR Code" style={{ width: 140, height: 140, display: 'block' }} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <a
                  href={success.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    background: 'linear-gradient(135deg, #D8FF3F 0%, #9AE600 100%)',
                    color: '#0A0912',
                    padding: '12px 24px',
                    borderRadius: 12,
                    fontWeight: 800,
                    fontSize: 13,
                    textDecoration: 'none',
                    letterSpacing: '0.03em',
                  }}
                >
                  ⬇ Download PDF
                </a>
                <button
                  onClick={onClose}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#9896A8',
                    padding: '12px 24px',
                    borderRadius: 12,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Event meta */}
              <div style={{
                background: 'rgba(216,255,63,0.04)',
                border: '1px solid rgba(216,255,63,0.08)',
                borderRadius: 14,
                padding: '14px 16px',
                marginBottom: 22,
                display: 'flex', gap: 20, flexWrap: 'wrap',
              }}>
                {event.date && <MetaItem icon="📅" value={fmtDate(event.date)} />}
                {event.time && <MetaItem icon="⏰" value={event.time} />}
                {event.venue && <MetaItem icon="📍" value={event.venue} />}
                {event.stage && <MetaItem icon="🎭" value={event.stage} />}
              </div>

              {/* Ticket type selection */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#D8FF3F', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>Select Pass Type</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {event.ticketTypes.map(tt => (
                    <button
                      key={tt.name}
                      onClick={() => setSelectedType(tt)}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 14,
                        border: `1px solid ${selectedType?.name === tt.name ? 'rgba(216,255,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
                        background: selectedType?.name === tt.name ? 'rgba(216,255,63,0.08)' : 'rgba(255,255,255,0.03)',
                        color: '#F0EEF8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 20 }}>{ticketIcon(tt.gender)}</span>
                        <span>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{tt.name}</div>
                          <div style={{ fontSize: 11, color: '#9896A8', marginTop: 2, textTransform: 'capitalize' }}>{tt.gender} pass</div>
                        </span>
                      </span>
                      <span style={{
                        fontWeight: 900, fontSize: 18,
                        color: selectedType?.name === tt.name ? '#D8FF3F' : '#F0EEF8',
                      }}>₹{tt.price.toLocaleString('en-IN')}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#D8FF3F', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>Quantity</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={() => setQty(q => Math.max(1, q - 1))}
                    style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#F0EEF8', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >−</button>
                  <span style={{ fontWeight: 800, fontSize: 20, color: '#F0EEF8', minWidth: 28, textAlign: 'center' }}>{qty}</span>
                  <button
                    onClick={() => setQty(q => Math.min(10, q + 1))}
                    style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#F0EEF8', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >+</button>
                  <span style={{ color: '#5C5A6A', fontSize: 12, marginLeft: 4 }}>max 10</span>
                </div>
              </div>

              {error && (
                <div style={{ background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#FF6B6B', fontSize: 13, fontWeight: 600 }}>
                  ⚠️ {error}
                </div>
              )}

              {/* Total + CTA */}
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.06)',
                paddingTop: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: '#5C5A6A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Total Amount</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#D8FF3F' }}>₹{total.toLocaleString('en-IN')}</div>
                </div>
                <button
                  id="customer-book-confirm"
                  onClick={handleBook}
                  disabled={loading || !selectedType}
                  style={{
                    background: loading ? 'rgba(216,255,63,0.3)' : 'linear-gradient(135deg, #D8FF3F 0%, #9AE600 100%)',
                    color: '#0A0912',
                    border: 'none',
                    borderRadius: 14,
                    padding: '14px 28px',
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    transition: 'all 0.2s',
                    boxShadow: loading ? 'none' : '0 8px 24px rgba(216,255,63,0.3)',
                  }}
                >
                  {loading ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #0A0912', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                      Booking…
                    </span>
                  ) : 'Book Now →'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function MetaItem({ icon, value }: { icon: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span style={{ fontSize: 13, color: '#9896A8', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

// ==================== EVENT CARD ====================
function EventCard({ event, onBook }: { event: Event; onBook: () => void }) {
  const minPrice = event.ticketTypes.length > 0 ? Math.min(...event.ticketTypes.map(t => t.price)) : 0
  const maxPrice = event.ticketTypes.length > 0 ? Math.max(...event.ticketTypes.map(t => t.price)) : 0

  return (
    <div style={{
      background: 'linear-gradient(160deg, rgba(21,18,31,0.9) 0%, rgba(15,13,26,0.95) 100%)',
      border: '1px solid rgba(216,255,63,0.1)',
      borderRadius: 20,
      overflow: 'hidden',
      transition: 'all 0.25s ease',
      cursor: 'pointer',
      position: 'relative',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(216,255,63,0.3)'
        ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 16px 48px rgba(0,0,0,0.4)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(216,255,63,0.1)'
        ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
      }}
    >
      {/* Accent top bar */}
      <div style={{ height: 3, background: 'linear-gradient(90deg, #D8FF3F, #9AE600, transparent)' }} />

      <div style={{ padding: '20px 22px' }}>
        {/* Company badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#D8FF3F',
            background: 'rgba(216,255,63,0.1)',
            border: '1px solid rgba(216,255,63,0.2)',
            padding: '3px 10px', borderRadius: 20, letterSpacing: '1px', textTransform: 'uppercase',
          }}>{event.companyId}</span>
          {event.date && (
            <span style={{ fontSize: 11, color: '#9896A8', fontWeight: 600 }}>📅 {fmtDate(event.date)}</span>
          )}
        </div>

        {/* Event name */}
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 900, color: '#F0EEF8', lineHeight: 1.3 }}>{event.name}</h3>

        {/* Venue + time */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
          {event.venue && <span style={{ fontSize: 12, color: '#9896A8' }}>📍 {event.venue}</span>}
          {event.time && <span style={{ fontSize: 12, color: '#9896A8' }}>⏰ {event.time}</span>}
          {event.stage && <span style={{ fontSize: 12, color: '#9896A8' }}>🎭 {event.stage}</span>}
        </div>

        {/* Description */}
        {event.description && (
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#5C5A6A', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
            {event.description}
          </p>
        )}

        {/* Ticket types mini pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
          {event.ticketTypes.map(tt => (
            <span key={tt.name} style={{
              fontSize: 11, fontWeight: 700,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#9896A8',
              padding: '4px 10px', borderRadius: 20,
            }}>
              {ticketIcon(tt.gender)} {tt.name} — ₹{tt.price.toLocaleString('en-IN')}
            </span>
          ))}
        </div>

        {/* Footer: price range + book button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, color: '#5C5A6A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 2 }}>Starting from</div>
            <div style={{ fontWeight: 900, fontSize: 22, color: '#D8FF3F' }}>
              ₹{minPrice.toLocaleString('en-IN')}
              {minPrice !== maxPrice && <span style={{ fontSize: 13, color: '#5C5A6A', fontWeight: 600 }}> – ₹{maxPrice.toLocaleString('en-IN')}</span>}
            </div>
          </div>
          <button
            onClick={onBook}
            style={{
              background: 'linear-gradient(135deg, #D8FF3F 0%, #9AE600 100%)',
              color: '#0A0912',
              border: 'none',
              borderRadius: 12,
              padding: '12px 22px',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              transition: 'all 0.2s',
              boxShadow: '0 6px 20px rgba(216,255,63,0.25)',
            }}
          >
            Book Now
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== BOOKING ROW ====================
function BookingRow({ booking }: { booking: Booking }) {
  const badge = statusBadge(booking.status)
  return (
    <div style={{
      background: 'rgba(21,18,31,0.6)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      padding: '18px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      flexWrap: 'wrap',
      transition: 'border-color 0.2s',
    }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(216,255,63,0.15)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.06)'}
    >
      {/* QR thumbnail */}
      <div style={{
        width: 56, height: 56, flexShrink: 0,
        background: booking.qrDataUrl ? '#fff' : 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {booking.qrDataUrl
          ? <img src={booking.qrDataUrl} alt="QR" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 22 }}>🎟</span>
        }
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: '#F0EEF8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {booking.event}
        </div>
        <div style={{ fontSize: 12, color: '#9896A8', marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>{ticketIcon(booking.gender)} {booking.gender} × {booking.quantity}</span>
          {booking.ticketId && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>#{booking.ticketId}</span>}
          {(booking.generatedAt || booking.createdAt) && (
            <span>📅 {fmtDate(booking.generatedAt || booking.createdAt)}</span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div style={{ fontWeight: 900, fontSize: 18, color: '#D8FF3F', flexShrink: 0 }}>
        ₹{booking.amount.toLocaleString('en-IN')}
      </div>

      {/* Status badge */}
      <div style={{
        background: badge.bg,
        color: badge.color,
        border: `1px solid ${badge.color}30`,
        borderRadius: 20,
        padding: '4px 12px',
        fontSize: 11,
        fontWeight: 700,
        flexShrink: 0,
      }}>
        {badge.label}
      </div>

      {/* Download */}
      {booking.ticketId && (
        <a
          href={`/api/ticket/${booking.ticketId}/download`}
          target="_blank"
          rel="noopener noreferrer"
          title="Download Ticket PDF"
          style={{
            width: 36, height: 36,
            borderRadius: 10,
            background: 'rgba(216,255,63,0.08)',
            border: '1px solid rgba(216,255,63,0.2)',
            color: '#D8FF3F',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none',
            fontSize: 16,
            flexShrink: 0,
            transition: 'background 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(216,255,63,0.16)'}
          onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(216,255,63,0.08)'}
        >
          ⬇
        </a>
      )}
    </div>
  )
}

// ==================== MAIN DASHBOARD ====================
export default function CustomerDashboard({ user, onLogout }: CustomerDashboardProps) {
  const [tab, setTab] = useState<'events' | 'bookings'>('events')
  const [events, setEvents] = useState<Event[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [loadingBookings, setLoadingBookings] = useState(false)
  const [bookModal, setBookModal] = useState<Event | null>(null)
  const [eventsError, setEventsError] = useState('')
  const [bookingsError, setBookingsError] = useState('')
  const [newBookingIds, setNewBookingIds] = useState<Set<string>>(new Set())

  const fetchEvents = useCallback(async () => {
    setLoadingEvents(true)
    setEventsError('')
    try {
      const res = await fetch('/api/customer/events')
      const data = await res.json()
      if (data.success) setEvents(data.events)
      else setEventsError(data.message || 'Failed to load events.')
    } catch {
      setEventsError('Connection error. Could not load events.')
    } finally {
      setLoadingEvents(false)
    }
  }, [])

  const fetchBookings = useCallback(async () => {
    setLoadingBookings(true)
    setBookingsError('')
    try {
      const res = await fetch(`/api/customer/bookings?email=${encodeURIComponent(user.email)}`)
      const data = await res.json()
      if (data.success) setBookings(data.bookings)
      else setBookingsError(data.message || 'Failed to load bookings.')
    } catch {
      setBookingsError('Connection error. Could not load bookings.')
    } finally {
      setLoadingBookings(false)
    }
  }, [user.email])

  useEffect(() => { fetchEvents() }, [fetchEvents])
  useEffect(() => { if (tab === 'bookings') fetchBookings() }, [tab, fetchBookings])

  const handleBooked = (booking: Booking) => {
    setBookings(prev => [booking, ...prev])
    setNewBookingIds(prev => new Set(prev).add(booking.orderId))
    setBookModal(null)
    setTab('bookings')
    // Re-fetch after short delay to get server-confirmed status
    setTimeout(fetchBookings, 1500)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse 100% 60% at 50% -5%, rgba(216,255,63,0.06) 0%, transparent 60%), #0A0912',
      fontFamily: 'Inter, sans-serif',
      color: '#F0EEF8',
    }}>
      {/* Top Navigation */}
      <header style={{
        height: 68,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(216,255,63,0.07)',
        background: 'rgba(10,9,18,0.85)',
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo.png" alt="LITTX" style={{ height: 28, width: 'auto' }} />
          <span style={{ fontWeight: 900, fontSize: '1.15rem', letterSpacing: '0.05em', color: '#F0EEF8' }}>LITTX</span>
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#D8FF3F',
            background: 'rgba(216,255,63,0.1)',
            border: '1px solid rgba(216,255,63,0.2)',
            padding: '2px 8px', borderRadius: 20,
            letterSpacing: '1.5px', textTransform: 'uppercase',
          }}>Customer</span>
        </div>

        {/* User info + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'right', display: 'none' as any }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F0EEF8' }}>{user.name}</div>
            <div style={{ fontSize: 11, color: '#5C5A6A' }}>{user.email}</div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '8px 14px',
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'linear-gradient(135deg, #D8FF3F, #9AE600)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 900, color: '#0A0912', flexShrink: 0,
            }}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#F0EEF8' }}>{user.name}</div>
              <div style={{ fontSize: 10, color: '#5C5A6A' }}>{user.email}</div>
            </div>
          </div>
          <button
            id="customer-logout"
            onClick={onLogout}
            style={{
              background: 'rgba(255,107,107,0.08)',
              border: '1px solid rgba(255,107,107,0.2)',
              color: '#FF6B6B',
              borderRadius: 10,
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Hero section */}
      <div style={{ padding: '40px 24px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{
          margin: '0 0 6px',
          fontSize: '2.2rem',
          fontWeight: 900,
          background: 'linear-gradient(135deg, #F0EEF8 0%, #D8FF3F 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '-0.03em',
        }}>
          Hey, {user.name.split(' ')[0]} 👋
        </h1>
        <p style={{ margin: '0 0 32px', fontSize: 15, color: '#9896A8' }}>
          Explore upcoming events and manage your tickets.
        </p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
          {([
            { key: 'events', label: '🎉 Browse Events', count: events.length },
            { key: 'bookings', label: '🎟 My Bookings', count: bookings.length },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '10px 20px',
                borderRadius: 12,
                border: `1px solid ${tab === t.key ? 'rgba(216,255,63,0.4)' : 'rgba(255,255,255,0.08)'}`,
                background: tab === t.key ? 'rgba(216,255,63,0.1)' : 'rgba(255,255,255,0.03)',
                color: tab === t.key ? '#D8FF3F' : '#9896A8',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{
                  background: tab === t.key ? 'rgba(216,255,63,0.2)' : 'rgba(255,255,255,0.06)',
                  color: tab === t.key ? '#D8FF3F' : '#5C5A6A',
                  borderRadius: 20,
                  padding: '1px 8px',
                  fontSize: 11,
                  fontWeight: 800,
                }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* EVENTS TAB */}
        {tab === 'events' && (
          <div>
            {loadingEvents ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#5C5A6A' }}>
                <div style={{ fontSize: 32, marginBottom: 16, animation: 'pulse 1.5s ease-in-out infinite' }}>🎉</div>
                <div>Loading events…</div>
              </div>
            ) : eventsError ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
                <div style={{ color: '#FF6B6B', marginBottom: 16 }}>{eventsError}</div>
                <button onClick={fetchEvents} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#9896A8', borderRadius: 10, padding: '10px 20px', cursor: 'pointer' }}>
                  Try again
                </button>
              </div>
            ) : events.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 0', color: '#5C5A6A' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#9896A8', marginBottom: 8 }}>No events yet</div>
                <div style={{ fontSize: 13 }}>Check back soon for upcoming events!</div>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: 20,
              }}>
                {events.map(event => (
                  <EventCard
                    key={event._id}
                    event={event}
                    onBook={() => setBookModal(event)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* BOOKINGS TAB */}
        {tab === 'bookings' && (
          <div>
            {loadingBookings ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#5C5A6A' }}>
                <div style={{ fontSize: 32, marginBottom: 16, animation: 'pulse 1.5s ease-in-out infinite' }}>🎟</div>
                <div>Loading your bookings…</div>
              </div>
            ) : bookingsError ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
                <div style={{ color: '#FF6B6B', marginBottom: 16 }}>{bookingsError}</div>
                <button onClick={fetchBookings} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#9896A8', borderRadius: 10, padding: '10px 20px', cursor: 'pointer' }}>
                  Try again
                </button>
              </div>
            ) : bookings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎫</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#9896A8', marginBottom: 8 }}>No bookings yet</div>
                <div style={{ fontSize: 13, color: '#5C5A6A', marginBottom: 24 }}>Find an event and book your first pass!</div>
                <button
                  onClick={() => setTab('events')}
                  style={{
                    background: 'linear-gradient(135deg, #D8FF3F 0%, #9AE600 100%)',
                    color: '#0A0912',
                    border: 'none',
                    borderRadius: 12,
                    padding: '12px 24px',
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Browse Events →
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {bookings.map(b => (
                  <BookingRow key={b.orderId} booking={b} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Book modal */}
      {bookModal && (
        <BookModal
          event={bookModal}
          user={user}
          onClose={() => setBookModal(null)}
          onBooked={handleBooked}
        />
      )}

      <style>{`
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.15);opacity:1} }
        @keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}
