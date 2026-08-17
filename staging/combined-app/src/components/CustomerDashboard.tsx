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
  emailed:          { bg: 'rgba(61,220,132,0.15)', color: '#3DDC84', label: '\u2713 Delivered' },
  ticket_generated: { bg: 'rgba(216,255,63,0.12)', color: '#D8FF3F', label: '\uD83C\uDFAB Ready' },
  paid:             { bg: 'rgba(61,220,132,0.12)', color: '#3DDC84', label: '\u2713 Confirmed' },
  scanned:          { bg: 'rgba(100,60,240,0.15)', color: '#A78BFA', label: '\u2713 Scanned In' },
  email_failed:     { bg: 'rgba(245,185,66,0.15)', color: '#F5B942', label: '\u26A0\uFE0F Check Email' },
  cancelled:        { bg: 'rgba(255,107,107,0.12)', color: '#FF6B6B', label: '\u2715 Cancelled' },
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
  if (gender === 'female') return '\uD83D\uDC69'
  if (gender === 'male') return '\uD83D\uDC68'
  return '\uD83C\uDFAB'
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card animate-scaleUp" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-tag">Secure Checkout</div>
            <div className="modal-title">{event.name}</div>
          </div>
          <button onClick={onClose} className="modal-close-btn">\u2715</button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {success ? (
            <div className="success-container animate-fadeIn">
              <div className="success-icon">\uD83C\uDF89</div>
              <div className="success-title">Pass Secured!</div>
              <div className="success-desc">
                Your ticket <strong style={{ color: '#F0EEF8' }}>#{success.id}</strong> has been generated.<br />
                A confirmation with your PDF ticket has been sent to your email.
              </div>
              {/* QR preview */}
              {success.qrDataUrl && (
                <div className="qr-wrapper">
                  <img src={success.qrDataUrl} alt="QR Code" className="qr-img" />
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <a
                  href={success.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-download"
                >
                  Download PDF Pass
                </a>
                <button onClick={onClose} className="btn-secondary">
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Event details block */}
              <div className="modal-meta-grid">
                {event.date && <MetaItem icon="\uD83D\uDCC5" value={fmtDate(event.date)} />}
                {event.time && <MetaItem icon="\u23F0" value={event.time} />}
                {event.venue && <MetaItem icon="\uD83D\uDCCD" value={event.venue} />}
                {event.stage && <MetaItem icon="\uD83C\uDFAD" value={event.stage} />}
              </div>

              {/* Ticket type selection */}
              <div style={{ marginBottom: 20 }}>
                <div className="section-label">Select Pass Type</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {event.ticketTypes.map(tt => (
                    <button
                      key={tt.name}
                      onClick={() => setSelectedType(tt)}
                      className={`ticket-option-btn ${selectedType?.name === tt.name ? 'active' : ''}`}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className="ticket-option-emoji">{ticketIcon(tt.gender)}</span>
                        <span>
                          <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{tt.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#8F8C9F', marginTop: 2, textTransform: 'capitalize' }}>{tt.gender} pass</div>
                        </span>
                      </span>
                      <span className="ticket-option-price">\u20B9{tt.price.toLocaleString('en-IN')}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity selector */}
              <div style={{ marginBottom: 24 }}>
                <div className="section-label">Quantity</div>
                <div className="qty-selector">
                  <button
                    onClick={() => setQty(q => Math.max(1, q - 1))}
                    className="qty-btn"
                  >\u2212</button>
                  <span className="qty-val">{qty}</span>
                  <button
                    onClick={() => setQty(q => Math.min(10, q + 1))}
                    className="qty-btn"
                  >+</button>
                  <span className="qty-limit">Maximum 10 tickets per booking</span>
                </div>
              </div>

              {error && (
                <div className="error-alert">
                  \u26A0\uFE0F {error}
                </div>
              )}

              {/* Total + CTA */}
              <div className="modal-footer">
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#8F8C9F', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 2 }}>Total Price</div>
                  <div className="total-price-text">\u20B9{total.toLocaleString('en-IN')}</div>
                </div>
                <button
                  id="customer-book-confirm"
                  onClick={handleBook}
                  disabled={loading || !selectedType}
                  className="btn-confirm-booking"
                >
                  {loading ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="loading-spinner" />
                      Securing Pass\u2026
                    </span>
                  ) : 'Confirm Booking'}
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
    <div className="meta-badge">
      <span className="meta-badge-icon">{icon}</span>
      <span className="meta-badge-text">{value}</span>
    </div>
  )
}

// ==================== EVENT CARD ====================
function EventCard({ event, onBook }: { event: Event; onBook: () => void }) {
  const minPrice = event.ticketTypes.length > 0 ? Math.min(...event.ticketTypes.map(t => t.price)) : 0
  const maxPrice = event.ticketTypes.length > 0 ? Math.max(...event.ticketTypes.map(t => t.price)) : 0

  // Event category color generator
  const getBrandColors = (companyId: string) => {
    if (companyId === 'littlane') return { glow: 'rgba(216,255,63,0.3)', line: '#D8FF3F' }
    if (companyId === 'nexora') return { glow: 'rgba(167,139,250,0.3)', line: '#A78BFA' }
    return { glow: 'rgba(236,72,153,0.3)', line: '#EC4899' }
  }

  const brands = getBrandColors(event.companyId)

  return (
    <div className="event-premium-card" style={{ '--brand-glow': brands.glow, '--brand-line': brands.line } as any}>
      {/* Dynamic graphic header with abstract neon elements */}
      <div className="card-graphic-header">
        <span className="company-badge-pill">{event.companyId}</span>
        {event.date && (
          <span className="event-date-pill">\uD83D\uDCC5 {fmtDate(event.date)}</span>
        )}
      </div>

      <div className="card-main-content">
        <h3 className="event-card-title">{event.name}</h3>

        {/* Info badges list */}
        <div className="meta-row">
          {event.venue && <span className="meta-pill">\uD83D\uDCCD {event.venue}</span>}
          {event.time && <span className="meta-pill">\u23F0 {event.time}</span>}
          {event.stage && <span className="meta-pill">\uD83C\uDFAD {event.stage}</span>}
        </div>

        {/* Event description */}
        {event.description && (
          <p className="event-card-desc">
            {event.description}
          </p>
        )}

        {/* Pass badges preview */}
        <div className="passes-preview-container">
          {event.ticketTypes.map(tt => (
            <span key={tt.name} className="pass-preview-badge">
              {ticketIcon(tt.gender)} {tt.name} \u2022 <span style={{ color: '#D8FF3F' }}>\u20B9{tt.price.toLocaleString('en-IN')}</span>
            </span>
          ))}
        </div>

        {/* Card Footer */}
        <div className="card-footer-layout">
          <div>
            <div style={{ fontSize: '0.7rem', color: '#8F8C9F', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 2 }}>Passes From</div>
            <div className="price-tag-big">
              \u20B9{minPrice.toLocaleString('en-IN')}
              {minPrice !== maxPrice && <span className="price-tag-range"> \u2013 \u20B9{maxPrice.toLocaleString('en-IN')}</span>}
            </div>
          </div>
          <button onClick={onBook} className="btn-card-book">
            Get Passes
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
    <div className="ticket-stub animate-fadeIn">
      {/* Decorative left ticket notch */}
      <div className="ticket-notch left"></div>
      
      {/* QR Code thumbnail with glow styling */}
      <div className="ticket-qr-container">
        {booking.qrDataUrl ? (
          <img src={booking.qrDataUrl} alt="QR Code" className="ticket-qr-img" />
        ) : (
          <span style={{ fontSize: '1.4rem' }}>\uD83C\uDFAB</span>
        )}
      </div>

      {/* Ticket Details */}
      <div className="ticket-info">
        <div className="ticket-event-name">{booking.event}</div>
        <div className="ticket-meta-row">
          <span className="ticket-meta-item">
            {ticketIcon(booking.gender)} {booking.gender} \u00D7 {booking.quantity}
          </span>
          {booking.ticketId && (
            <span className="ticket-id-badge">
              ID: {booking.ticketId}
            </span>
          )}
          {(booking.generatedAt || booking.createdAt) && (
            <span className="ticket-meta-item">
              \uD83D\uDCC5 {fmtDate(booking.generatedAt || booking.createdAt)}
            </span>
          )}
        </div>
      </div>

      {/* Right side division / dashed line */}
      <div className="ticket-dashed-divider"></div>

      {/* Price + Status Section */}
      <div className="ticket-action-box">
        <div className="ticket-price">\u20B9{booking.amount.toLocaleString('en-IN')}</div>
        <div className="status-badge-container" style={{ background: badge.bg, color: badge.color, borderColor: `${badge.color}35` }}>
          {badge.label}
        </div>
      </div>

      {/* Download Button */}
      {booking.ticketId && (
        <a
          href={`/api/ticket/${booking.ticketId}/download`}
          target="_blank"
          rel="noopener noreferrer"
          title="Download ticket PDF file"
          className="ticket-download-link-btn"
        >
          \u2B07\uFE0F
        </a>
      )}

      {/* Decorative right ticket notch */}
      <div className="ticket-notch right"></div>
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

  // Find next event date from user bookings
  const nextEventDate = bookings.length > 0 && bookings[0].createdAt ? fmtDate(bookings[0].createdAt) : 'None Scheduled'

  return (
    <div className="dash-root">
      {/* Background Neon Glow Circles */}
      <div className="bg-glow-spot spot-1"></div>
      <div className="bg-glow-spot spot-2"></div>

      {/* Top Header */}
      <header className="dash-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo.png" alt="LITTX Logo" style={{ height: 32, width: 'auto' }} />
          <span className="logo-text">LITTX</span>
          <span className="logo-badge-pill">Customer</span>
        </div>

        {/* User profile & controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="user-profile-badge">
            <div className="user-profile-avatar">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="user-profile-info">
              <div className="user-profile-name">{user.name}</div>
              <div className="user-profile-email">{user.email}</div>
            </div>
          </div>
          <button
            id="customer-logout"
            onClick={onLogout}
            className="btn-logout"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="dash-container">
        {/* VIP Pass Welcome Banner */}
        <div className="vip-welcome-banner animate-slideUp">
          <div className="banner-grid-overlay"></div>
          <div className="banner-glow-element"></div>
          
          <div className="banner-content">
            <h1 className="banner-title">Welcome Back, {user.name.split(' ')[0]}! \uD83D\uDC4B</h1>
            <p className="banner-subtitle">
              Your digital hub for bookings and passes to the hottest freshers takeovers and premium events.
            </p>
            
            {/* Quick Metrics */}
            <div className="banner-metrics-row">
              <div className="metric-box">
                <div className="metric-val">{bookings.length}</div>
                <div className="metric-lbl">Total Passes</div>
              </div>
              <div className="metric-divider"></div>
              <div className="metric-box">
                <div className="metric-val">{events.length}</div>
                <div className="metric-lbl">Active Events</div>
              </div>
              <div className="metric-divider"></div>
              <div className="metric-box">
                <div className="metric-val" style={{ color: '#D8FF3F', fontSize: '1rem', fontWeight: 800, marginTop: 4 }}>
                  {nextEventDate}
                </div>
                <div className="metric-lbl">Next booking</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="tab-bar animate-slideUp">
          {([
            { key: 'events', label: '\uD83C\uDF89 Browse Parties', count: events.length },
            { key: 'bookings', label: '\uD83C\uDFAB My Tickets', count: bookings.length },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            >
              <span>{t.label}</span>
              {t.count > 0 && (
                <span className="tab-badge">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* EVENTS TAB CONTENT */}
        {tab === 'events' && (
          <div className="tab-pane-container">
            {loadingEvents ? (
              <div className="dashboard-loading-spinner animate-pulse">
                <div className="spinner-emoji">\uD83C\uDF89</div>
                <div className="spinner-text">Finding premium parties for you\u2026</div>
              </div>
            ) : eventsError ? (
              <div className="dashboard-error-pane">
                <div className="error-emoji">\u26A0\uFE0F</div>
                <div className="error-msg">{eventsError}</div>
                <button onClick={fetchEvents} className="btn-secondary">
                  Reload Events
                </button>
              </div>
            ) : events.length === 0 ? (
              <div className="dashboard-empty-pane">
                <div className="empty-emoji">\uD83D\uDCEE</div>
                <div className="empty-title">No events online</div>
                <div className="empty-desc">Check back soon for upcoming takeovers.</div>
              </div>
            ) : (
              <div className="events-grid">
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

        {/* BOOKINGS TAB CONTENT */}
        {tab === 'bookings' && (
          <div className="tab-pane-container">
            {loadingBookings ? (
              <div className="dashboard-loading-spinner animate-pulse">
                <div className="spinner-emoji">\uD83C\uDFAB</div>
                <div className="spinner-text">Retrieving your ticket wallet\u2026</div>
              </div>
            ) : bookingsError ? (
              <div className="dashboard-error-pane">
                <div className="error-emoji">\u26A0\uFE0F</div>
                <div className="error-msg">{bookingsError}</div>
                <button onClick={fetchBookings} className="btn-secondary">
                  Try Again
                </button>
              </div>
            ) : bookings.length === 0 ? (
              <div className="dashboard-empty-pane">
                <div className="empty-emoji">\uD83C\uDFAB</div>
                <div className="empty-title">Your ticket list is empty</div>
                <div className="empty-desc" style={{ marginBottom: 20 }}>Book a pass to any party and it will appear here.</div>
                <button onClick={() => setTab('events')} className="btn-accent-glow">
                  Secure Passes Now
                </button>
              </div>
            ) : (
              <div className="tickets-stack">
                {bookings.map(b => (
                  <BookingRow key={b.orderId} booking={b} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Booking Modal */}
      {bookModal && (
        <BookModal
          event={bookModal}
          user={user}
          onClose={() => setBookModal(null)}
          onBooked={handleBooked}
        />
      )}

      {/* Styled CSS variables & aesthetic rules */}
      <style>{`
        /* Root container settings */
        .dash-root {
          min-height: 100vh;
          background-color: #050409;
          background-image: radial-gradient(circle at 50% 0%, #15102a 0%, #050409 60%);
          font-family: 'Outfit', 'Inter', sans-serif;
          color: #F0EEF8;
          position: relative;
          overflow-x: hidden;
        }

        /* Abstract glowing spots in background */
        .bg-glow-spot {
          position: absolute;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          filter: blur(140px);
          opacity: 0.15;
          pointer-events: none;
          z-index: 1;
        }
        .bg-glow-spot.spot-1 {
          top: -100px;
          left: 10%;
          background: #D8FF3F;
        }
        .bg-glow-spot.spot-2 {
          bottom: 10%;
          right: 5%;
          background: #7C3AED;
        }

        /* Glassmorphism Header */
        .dash-header {
          height: 72px;
          padding: 0 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(8, 7, 13, 0.7);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          position: sticky;
          top: 0;
          z-index: 1000;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
        }

        .logo-text {
          font-weight: 900;
          font-size: 1.3rem;
          letter-spacing: 0.08em;
          background: linear-gradient(90deg, #F0EEF8, #D8FF3F);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .logo-badge-pill {
          font-size: 10px;
          font-weight: 800;
          color: #D8FF3F;
          background: rgba(216, 255, 63, 0.08);
          border: 1px solid rgba(216, 255, 63, 0.18);
          padding: 2px 8px;
          border-radius: 20px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }

        .user-profile-badge {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 6px 14px 6px 8px;
          transition: all 0.25s ease;
        }
        .user-profile-badge:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(216, 255, 63, 0.2);
        }

        .user-profile-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, #D8FF3F, #9AE600);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 900;
          color: #0A0912;
          box-shadow: 0 4px 10px rgba(216, 255, 63, 0.25);
        }

        .user-profile-name {
          font-size: 12px;
          font-weight: 700;
          color: #F0EEF8;
        }
        .user-profile-email {
          font-size: 10px;
          color: #8F8C9F;
        }

        .btn-logout {
          background: rgba(255, 107, 107, 0.08);
          border: 1px solid rgba(255, 107, 107, 0.2);
          color: #FF6B6B;
          border-radius: 12px;
          padding: 8px 16px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          transition: all 0.25s ease;
        }
        .btn-logout:hover {
          background: rgba(255, 107, 107, 0.16);
          border-color: #FF6B6B;
          box-shadow: 0 0 15px rgba(255, 107, 107, 0.2);
        }

        /* Container styling */
        .dash-container {
          max-width: 1040px;
          margin: 0 auto;
          padding: 40px 24px 80px;
          position: relative;
          z-index: 10;
        }

        /* VIP Pass Welcome Banner */
        .vip-welcome-banner {
          position: relative;
          border-radius: 28px;
          background: linear-gradient(135deg, #100D1F 0%, #17132F 100%);
          border: 1px solid rgba(216, 255, 63, 0.15);
          padding: 40px;
          overflow: hidden;
          margin-bottom: 40px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(216, 255, 63, 0.03) inset;
        }
        
        .banner-grid-overlay {
          position: absolute;
          inset: 0;
          background-image: linear-gradient(rgba(216, 255, 63, 0.02) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(216, 255, 63, 0.02) 1px, transparent 1px);
          background-size: 20px 20px;
          opacity: 0.8;
          pointer-events: none;
        }

        .banner-glow-element {
          position: absolute;
          top: -20%;
          right: -10%;
          width: 350px;
          height: 350px;
          background: radial-gradient(circle, rgba(216, 255, 63, 0.08) 0%, transparent 70%);
          pointer-events: none;
        }

        .banner-content {
          position: relative;
          z-index: 5;
        }

        .banner-title {
          font-size: 2.2rem;
          font-weight: 900;
          background: linear-gradient(135deg, #F0EEF8, #D8FF3F);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin: 0 0 8px;
          letter-spacing: -0.02em;
        }

        .banner-subtitle {
          font-size: 15px;
          color: #8F8C9F;
          line-height: 1.6;
          max-width: 620px;
          margin: 0 0 32px;
        }

        .banner-metrics-row {
          display: flex;
          align-items: center;
          gap: 32px;
          flex-wrap: wrap;
        }

        .metric-box {
          display: flex;
          flex-direction: column;
        }
        .metric-val {
          font-size: 1.8rem;
          font-weight: 900;
          color: #F0EEF8;
          line-height: 1.1;
        }
        .metric-lbl {
          font-size: 10px;
          font-weight: 800;
          color: #5F5C72;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-top: 4px;
        }

        .metric-divider {
          width: 1px;
          height: 36px;
          background: rgba(255, 255, 255, 0.08);
        }

        /* Tabs styling */
        .tab-bar {
          display: flex;
          gap: 8px;
          margin-bottom: 32px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 6px;
          border-radius: 16px;
          width: fit-content;
        }

        .tab-btn {
          padding: 10px 24px;
          border-radius: 12px;
          border: 1px solid transparent;
          background: transparent;
          color: #8F8C9F;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.25s ease;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .tab-btn:hover {
          color: #F0EEF8;
          background: rgba(255, 255, 255, 0.03);
        }
        .tab-btn.active {
          background: rgba(216, 255, 63, 0.08);
          border-color: rgba(216, 255, 63, 0.18);
          color: #D8FF3F;
          box-shadow: 0 4px 15px rgba(216, 255, 63, 0.05);
        }

        .tab-badge {
          background: rgba(216, 255, 63, 0.16);
          color: #D8FF3F;
          font-size: 10px;
          font-weight: 900;
          padding: 2px 8px;
          border-radius: 20px;
        }
        .tab-btn:not(.active) .tab-badge {
          background: rgba(255, 255, 255, 0.05);
          color: #5F5C72;
        }

        .tab-pane-container {
          min-height: 200px;
        }

        /* Event Premium Cards Grid */
        .events-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 24px;
        }

        .event-premium-card {
          background: linear-gradient(135deg, rgba(22, 19, 36, 0.7) 0%, rgba(13, 11, 22, 0.9) 100%);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 24px;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          position: relative;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }
        .event-premium-card:hover {
          transform: translateY(-5px);
          border-color: var(--brand-line);
          box-shadow: 0 15px 40px rgba(0, 0, 0, 0.5), 0 0 25px var(--brand-glow);
        }

        .card-graphic-header {
          height: 120px;
          background: linear-gradient(135deg, #1b1633 0%, #0d0a18 100%);
          position: relative;
          padding: 16px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.01) 0px, rgba(255,255,255,0.01) 2px,transparent 2px,transparent 10px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .card-graphic-header::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(0deg, #0d0a18 0%, transparent 80%);
          pointer-events: none;
        }

        .company-badge-pill {
          font-size: 10px;
          font-weight: 800;
          color: #D8FF3F;
          background: rgba(216, 255, 63, 0.1);
          border: 1px solid rgba(216, 255, 63, 0.2);
          padding: 4px 10px;
          border-radius: 12px;
          letter-spacing: 1px;
          text-transform: uppercase;
          z-index: 5;
        }

        .event-date-pill {
          font-size: 10px;
          font-weight: 700;
          color: #F0EEF8;
          background: rgba(0, 0, 0, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.15);
          padding: 4px 10px;
          border-radius: 12px;
          z-index: 5;
        }

        .card-main-content {
          padding: 24px;
          position: relative;
          margin-top: -30px;
          z-index: 10;
        }

        .event-card-title {
          font-size: 1.35rem;
          font-weight: 900;
          color: #F0EEF8;
          margin: 0 0 12px;
          line-height: 1.3;
        }

        .meta-row {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .meta-pill {
          font-size: 11px;
          color: #8F8C9F;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 2px 8px;
          border-radius: 8px;
          font-weight: 500;
        }

        .event-card-desc {
          margin: 0 0 20px;
          font-size: 13px;
          color: #8F8C9F;
          line-height: 1.5;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .passes-preview-container {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 24px;
        }
        .pass-preview-badge {
          font-size: 10px;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: #8F8C9F;
          padding: 4px 10px;
          border-radius: 12px;
        }

        .card-footer-layout {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 18px;
        }

        .price-tag-big {
          font-weight: 900;
          font-size: 1.35rem;
          color: #D8FF3F;
        }
        .price-tag-range {
          font-size: 11px;
          color: #5F5C72;
          font-weight: 700;
        }

        .btn-card-book {
          background: linear-gradient(135deg, #D8FF3F 0%, #9AE600 100%);
          color: #0A0912;
          border: none;
          border-radius: 12px;
          padding: 10px 20px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          transition: all 0.2s ease;
          box-shadow: 0 4px 15px rgba(216, 255, 63, 0.2);
        }
        .btn-card-book:hover {
          transform: translateY(-1.5px);
          box-shadow: 0 6px 20px rgba(216, 255, 63, 0.4);
        }

        /* Tickets stack layout */
        .tickets-stack {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* Ticket Stub styling for Bookings Row */
        .ticket-stub {
          background: linear-gradient(90deg, rgba(22, 19, 36, 0.8) 0%, rgba(13, 11, 22, 0.9) 100%);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 20px;
          padding: 20px 24px;
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
          position: relative;
          overflow: hidden;
          transition: all 0.25s ease;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        }
        .ticket-stub:hover {
          border-color: rgba(216, 255, 63, 0.25);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
        }

        /* Ticket notch cutouts on edges */
        .ticket-notch {
          position: absolute;
          top: 50%;
          width: 14px;
          height: 28px;
          background: #050409;
          transform: translateY(-50%);
          border: 1px solid rgba(255, 255, 255, 0.05);
          z-index: 5;
        }
        .ticket-notch.left {
          left: -1px;
          border-top-right-radius: 28px;
          border-bottom-right-radius: 28px;
          border-left: 0;
        }
        .ticket-notch.right {
          right: -1px;
          border-top-left-radius: 28px;
          border-bottom-left-radius: 28px;
          border-right: 0;
        }

        .ticket-qr-container {
          width: 64px;
          height: 64px;
          flex-shrink: 0;
          background: #fff;
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          box-shadow: 0 4px 15px rgba(255, 255, 255, 0.05);
          transition: all 0.2s ease;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .ticket-stub:hover .ticket-qr-container {
          transform: scale(1.05);
          box-shadow: 0 4px 20px rgba(216, 255, 63, 0.2);
        }
        .ticket-qr-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .ticket-info {
          flex: 1;
          min-width: 180px;
        }

        .ticket-event-name {
          font-weight: 900;
          font-size: 1.1rem;
          color: #F0EEF8;
          letter-spacing: -0.01em;
          margin-bottom: 6px;
        }

        .ticket-meta-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          font-size: 12px;
          color: #8F8C9F;
        }

        .ticket-meta-item {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .ticket-id-badge {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.05);
          padding: 2px 8px;
          border-radius: 6px;
          color: #8F8C9F;
        }

        .ticket-dashed-divider {
          width: 1px;
          align-self: stretch;
          border-left: 2px dashed rgba(255, 255, 255, 0.1);
          margin: 0 10px;
        }

        .ticket-action-box {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
          min-width: 100px;
        }

        .ticket-price {
          font-weight: 900;
          font-size: 1.25rem;
          color: #D8FF3F;
        }

        .status-badge-container {
          border-radius: 20px;
          padding: 4px 10px;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border: 1px solid transparent;
        }

        .ticket-download-link-btn {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: rgba(216, 255, 63, 0.08);
          border: 1px solid rgba(216, 255, 63, 0.2);
          color: #D8FF3F;
          display: flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          font-size: 16px;
          flex-shrink: 0;
          transition: all 0.2s ease;
        }
        .ticket-download-link-btn:hover {
          background: rgba(216, 255, 63, 0.18);
          border-color: #D8FF3F;
          transform: scale(1.05);
        }

        /* Booking checkout Modal styles */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(4, 3, 7, 0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .modal-card {
          background: linear-gradient(160deg, #110E1D 0%, #151125 100%);
          border: 1px solid rgba(216, 255, 63, 0.2);
          border-radius: 28px;
          width: 100%;
          max-width: 480px;
          overflow: hidden;
          box-shadow: 0 40px 100px rgba(0,0,0,0.8), 0 0 40px rgba(216,255,63,0.05);
        }

        .modal-header {
          padding: 24px 28px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .modal-tag {
          font-size: 10px;
          color: #D8FF3F;
          font-weight: 800;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-bottom: 4px;
        }

        .modal-title {
          font-size: 1.25rem;
          font-weight: 900;
          color: #F0EEF8;
        }

        .modal-close-btn {
          background: none;
          border: none;
          color: #8F8C9F;
          cursor: pointer;
          font-size: 20px;
          padding: 4px;
          transition: color 0.2s;
        }
        .modal-close-btn:hover {
          color: #FF6B6B;
        }

        .modal-body {
          padding: 28px;
        }

        .modal-meta-grid {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 18px;
          padding: 16px;
          margin-bottom: 24px;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .meta-badge {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .meta-badge-icon {
          font-size: 14px;
        }
        .meta-badge-text {
          font-size: 12px;
          color: #8F8C9F;
          font-weight: 500;
        }

        .section-label {
          font-size: 10px;
          font-weight: 800;
          color: #D8FF3F;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          margin-bottom: 12px;
        }

        .ticket-option-btn {
          width: 100%;
          padding: 16px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
          color: #F0EEF8;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: all 0.2s ease;
        }
        .ticket-option-btn:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.12);
        }
        .ticket-option-btn.active {
          border-color: rgba(216, 255, 63, 0.5);
          background: rgba(216, 255, 63, 0.05);
        }

        .ticket-option-emoji {
          font-size: 20px;
        }

        .ticket-option-price {
          font-weight: 900;
          font-size: 1.15rem;
          color: #F0EEF8;
        }
        .ticket-option-btn.active .ticket-option-price {
          color: #D8FF3F;
        }

        .qty-selector {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .qty-btn {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #F0EEF8;
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .qty-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.15);
        }
        .qty-val {
          font-weight: 800;
          font-size: 1.2rem;
          color: #F0EEF8;
          min-width: 20px;
          text-align: center;
        }
        .qty-limit {
          color: #5F5C72;
          font-size: 11px;
          margin-left: auto;
        }

        .error-alert {
          background: rgba(255, 107, 107, 0.08);
          border: 1px solid rgba(255, 107, 107, 0.2);
          border-radius: 12px;
          padding: 12px 16px;
          margin-bottom: 20px;
          color: #FF6B6B;
          font-size: 12px;
          font-weight: 600;
        }

        .modal-footer {
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          padding-top: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .total-price-text {
          font-size: 1.7rem;
          font-weight: 900;
          color: #D8FF3F;
        }

        .btn-confirm-booking {
          background: linear-gradient(135deg, #D8FF3F 0%, #9AE600 100%);
          color: #0A0912;
          border: none;
          border-radius: 14px;
          padding: 14px 28px;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          transition: all 0.2s;
          box-shadow: 0 8px 24px rgba(216, 255, 63, 0.3);
        }
        .btn-confirm-booking:hover:not(:disabled) {
          transform: translateY(-1.5px);
          box-shadow: 0 12px 30px rgba(216, 255, 63, 0.45);
        }
        .btn-confirm-booking:disabled {
          background: rgba(216, 255, 63, 0.2);
          color: rgba(10, 9, 18, 0.5);
          cursor: not-allowed;
          box-shadow: none;
        }

        .loading-spinner {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 2px solid #0A0912;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        /* Success screen modal */
        .success-container {
          text-align: center;
          padding: 10px 0;
        }
        .success-icon {
          font-size: 4rem;
          margin-bottom: 16px;
        }
        .success-title {
          font-size: 1.6rem;
          font-weight: 900;
          color: #D8FF3F;
          margin-bottom: 8px;
        }
        .success-desc {
          color: #8F8C9F;
          font-size: 13px;
          margin-bottom: 24px;
          line-height: 1.6;
        }

        .qr-wrapper {
          display: inline-block;
          background: #fff;
          padding: 14px;
          border-radius: 18px;
          margin-bottom: 28px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        .qr-img {
          width: 140px;
          height: 140px;
          display: block;
        }

        .btn-download {
          display: inline-block;
          background: linear-gradient(135deg, #D8FF3F 0%, #9AE600 100%);
          color: #0A0912;
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 800;
          font-size: 13px;
          text-decoration: none;
          letter-spacing: 0.03em;
          box-shadow: 0 4px 15px rgba(216, 255, 63, 0.25);
          transition: all 0.2s;
        }
        .btn-download:hover {
          transform: translateY(-1.5px);
          box-shadow: 0 6px 20px rgba(216, 255, 63, 0.4);
        }
        .btn-secondary {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #8F8C9F;
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #F0EEF8;
        }

        .btn-accent-glow {
          background: linear-gradient(135deg, #D8FF3F 0%, #9AE600 100%);
          color: #0A0912;
          border: none;
          border-radius: 12px;
          padding: 12px 28px;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          box-shadow: 0 6px 20px rgba(216, 255, 63, 0.25);
          transition: all 0.2s;
        }
        .btn-accent-glow:hover {
          transform: translateY(-1.5px);
          box-shadow: 0 8px 24px rgba(216, 255, 63, 0.45);
        }

        /* Generic loaders & panes */
        .dashboard-loading-spinner {
          text-align: center;
          padding: 80px 0;
          color: #5F5C72;
        }
        .spinner-emoji {
          font-size: 2.5rem;
          margin-bottom: 16px;
        }
        .spinner-text {
          font-size: 13px;
          font-weight: 500;
        }

        .dashboard-error-pane, .dashboard-empty-pane {
          text-align: center;
          padding: 80px 0;
        }
        .error-emoji, .empty-emoji {
          font-size: 3rem;
          margin-bottom: 16px;
        }
        .error-msg {
          color: #FF6B6B;
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 20px;
        }
        .empty-title {
          font-size: 17px;
          font-weight: 800;
          color: #F0EEF8;
          margin-bottom: 8px;
        }
        .empty-desc {
          font-size: 13px;
          color: #8F8C9F;
        }

        /* Animation utilities */
        .animate-pulse {
          animation: pulse 1.5s ease-in-out infinite;
        }
        .animate-slideUp {
          animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-scaleUp {
          animation: scaleUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fadeIn {
          animation: fadeIn 0.4s ease forwards;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: .6; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes slideUp {
          from { transform: translateY(16px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
