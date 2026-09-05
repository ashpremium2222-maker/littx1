// PublicTicketView v1.1 — animated iOS-style ticket page linked from emails
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import QRCode from '../components/QRCode'

interface TicketData {
  id: string
  event: string
  attendee: string
  email: string
  phone?: string
  dateLabel: string
  venue: string
  ticketType: string
  price: string
  qty: number
  status: string
  scannedAt?: string
}

interface PublicTicketViewProps {
  ticketId: string
}

export default function PublicTicketView({ ticketId }: PublicTicketViewProps) {
  const [ticket, setTicket] = useState<TicketData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'ticket' | 'details'>('ticket')
  const [dir, setDir] = useState(0) // slider direction
  const [ticketEntranceDone, setTicketEntranceDone] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTicketEntranceDone(true)
    }
  }, [])

  useEffect(() => {
    async function fetchTicket() {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 12000)
      try {
        const res = await fetch(`/api/ticket/${ticketId}`, { signal: controller.signal })
        if (!res.ok) throw new Error(`Ticket request failed (${res.status})`)
        const data = await res.json()
        if (data.success && data.ticket) {
          // Normalize ticket properties
          const t = data.ticket
          setTicket({
            id: t.ticketId || t.id,
            event: t.event || 'FRESHERS TAKEOVER',
            attendee: t.name || t.attendee,
            email: t.email,
            phone: t.phone,
            dateLabel: t.dateLabel || '17th October, Sat · 4:00 PM',
            venue: t.venue || 'Pethkar Ground, Kothrud, Pune',
            ticketType: t.ticketType || (t.gender === 'female' ? 'VIP Single' : 'GA Single'),
            price: t.amount ? `₹${t.amount}` : '₹699',
            qty: t.quantity || 1,
            status: t.status || 'paid',
            scannedAt: t.scannedAt
          })
        } else {
          setError(data.message || 'Ticket not found')
        }
      } catch (err) {
        setError(err instanceof DOMException && err.name === 'AbortError'
          ? 'This ticket is taking too long to load. Please try again.'
          : 'Failed to load ticket')
      } finally {
        window.clearTimeout(timeout)
        setLoading(false)
      }
    }
    fetchTicket()
  }, [ticketId])

  const handleGoToDetails = () => {
    setDir(-1)
    setView('details')
  }

  const handleGoToTicket = () => {
    setDir(1)
    setView('ticket')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 rounded-full border-4 border-white/10 border-t-purple-500 animate-spin mb-4" />
        <p className="text-sm font-medium text-gray-400">Loading your ticket...</p>
      </div>
    )
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center text-white p-6">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4 border border-red-500/20">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2">Error Loading Ticket</h2>
        <p className="text-sm text-gray-400 text-center max-w-xs mb-6">{error || 'Something went wrong.'}</p>
        <a href="/" className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-full font-semibold transition text-sm">
          Go to Homepage
        </a>
      </div>
    )
  }

  // Determine design color palette based on event
  const isAura = ticket.event.toUpperCase().includes('AURA')
  const eventTheme = isAura 
    ? {
        gradient: 'radial-gradient(circle at top, rgba(80,40,40,0.4) 0%, #111111 60%)',
        accentColor: '#EF4444',
        btnBg: 'bg-red-600 hover:bg-red-700',
        badgeBg: 'bg-red-500/20 text-red-400 border-red-500/30',
        bannerUrl: '/aura-ticket-banner.jpg',
        host: 'Aura Events Team',
        desc: 'Experience the dawn of a new sound. An exclusive gathering featuring premium visual production, deep immersive beats, and high energy connection in Pune\'s finest venue.',
        tags: ['Aura', 'Music Festival', 'Night Out', 'Immersive'],
        gallery: [
          'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=300&q=80',
          'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=300&q=80',
          'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=300&q=80'
        ]
      }
    : {
        gradient: 'radial-gradient(circle at top, rgba(80,40,120,0.3) 0%, #111111 60%)',
        accentColor: '#A855F7',
        btnBg: 'bg-purple-600 hover:bg-purple-700',
        badgeBg: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        bannerUrl: '/images/freshers-takeover-banner.png',
        host: 'Team LITTX',
        desc: 'The ultimate welcome party for Pune\'s elite student community. Featuring top DJs, massive soundscapes, custom student pricing, and memories that will last a lifetime.',
        tags: ['Freshers', 'College Fest', 'Student Night', 'DJs'],
        gallery: [
          'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=300&q=80',
          'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=300&q=80',
          'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=300&q=80'
        ]
      }

  const isScanned = ticket.status === 'scanned'

  return (
    <div className="ticket-page-shell min-h-screen flex items-center justify-center font-sans antialiased text-white p-0 sm:p-6 overflow-x-hidden">
      {/* Mobile Device Mockup Wrapper */}
      <div 
        className="ticket-phone-frame w-full sm:w-[393px] h-screen sm:h-[852px] overflow-hidden relative sm:rounded-[40px] flex flex-col"
        style={{ background: eventTheme.gradient }}
      >
        <AnimatePresence initial={false} custom={dir}>
          {view === 'ticket' ? (
            <motion.div
              key="ticket"
              custom={dir}
              initial={{ x: dir > 0 ? 393 : -393, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: dir < 0 ? 393 : -393, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="absolute inset-0 flex flex-col p-5 pt-[max(2.25rem,env(safe-area-inset-top))] pb-28 sm:p-6 sm:pt-12 overflow-y-auto"
            >
              {/* Header */}
              <header className="flex items-center justify-between mb-6 z-10">
                <button 
                  onClick={handleGoToDetails}
                  aria-label="View event details"
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition border border-white/10 active:scale-95"
                >
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h1 className="text-white text-[13px] font-extrabold tracking-[0.14em] uppercase">Entry pass</h1>
                <a 
                  href={`/api/ticket/${ticket.id}/download`} 
                  target="_blank" 
                  rel="noreferrer"
                  aria-label="Download ticket PDF"
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition border border-white/10 active:scale-95"
                >
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
              </header>

              {/* Ticket Card Container */}
              <div className="thermal-ticket-stage relative w-full mb-6">
                {!ticketEntranceDone && (
                  <>
                    <div className="thermal-printer" aria-hidden="true">
                      <div className="thermal-printer__handle" />
                      <div className="thermal-printer__brand">LITTX <span>PRINT LAB</span></div>
                      <div className="thermal-printer__display"><b>PASS</b><span>READY</span></div>
                      <div className="thermal-printer__lid"><i /><i /><i /></div>
                      <div className="thermal-printer__indicator" />
                      <div className="thermal-printer__indicator thermal-printer__indicator--violet" />
                      <div className="thermal-printer__slot">
                        <div className="thermal-printer__slot-inner" />
                      </div>
                    </div>
                  </>
                )}
                <div
                  className={`thermal-ticket-paper rounded-[32px] w-full flex flex-col shadow-2xl relative ${!ticketEntranceDone ? 'thermal-ticket-print' : ''}`}
                  onAnimationEnd={(event) => {
                    if (event.currentTarget === event.target) {
                      setTicketEntranceDone(true)
                    }
                  }}
                >
                {/* Top Section */}
                <div className="ticket-paper__top px-5 sm:px-6 pt-7 pb-6 flex flex-col items-center">
                  <div className="ticket-paper__aurora" aria-hidden="true" />
                  <div className="ticket-paper__eyebrow">LITTX · ADMIT ONE</div>
                  <h2 className="text-white text-[clamp(1.35rem,6vw,1.65rem)] font-black text-center leading-[1.08] mb-2 tracking-[-0.045em]">
                    {ticket.event}
                  </h2>
                  <p className="text-white/52 text-xs text-center mb-1">
                    Show this QR code at the event entrance
                  </p>
                  <p className="ticket-paper__id text-xs font-bold text-center mb-5 font-mono">
                    PASS · {ticket.id}
                  </p>

                  {/* QR Code */}
                  <div className="ticket-qr p-3 bg-white rounded-[26px] flex items-center justify-center mb-4 transition duration-300 hover:scale-[1.02]">
                    <QRCode value={`LITTIX:${ticket.id}`} size={190} />
                  </div>

                  {/* Scan Badge */}
                  <span className={`ticket-status text-[10px] font-extrabold px-3 py-1.5 rounded-full uppercase tracking-[0.12em] ${isScanned ? 'ticket-status--used' : 'ticket-status--valid'}`}>
                    <span aria-hidden="true" />
                    {isScanned ? `Scanned at ${ticket.scannedAt || 'TBA'}` : 'Active / Valid'}
                  </span>
                </div>

                {/* Ticket Cutouts & Divider */}
                <div className="relative w-full h-8 flex items-center">
                  <div className="ticket-notch absolute left-[-16px] w-8 h-8 rounded-full z-10" />
                  <div className="ticket-notch ticket-notch--right absolute right-[-16px] w-8 h-8 rounded-full z-10" />
                  <div className="ticket-perforation w-full mx-6" />
                </div>

                {/* Bottom Section */}
                <div className="px-5 sm:px-6 pb-6 pt-2">
                  <div className="ticket-details p-4 rounded-2xl flex flex-col gap-3.5 relative overflow-hidden">
                    {/* Attendee */}
                    <div className="flex items-center gap-3">
                      <div className="ticket-detail-icon" aria-hidden="true">A</div>
                      <div className="flex flex-col">
                        <span className="text-gray-400 text-[10px] uppercase tracking-wider font-semibold">Attendee</span>
                        <span className="text-white text-sm font-bold leading-tight">{ticket.attendee}</span>
                      </div>
                    </div>

                    {/* Venue */}
                    <div className="flex items-center gap-3">
                      <div className="ticket-detail-icon" aria-hidden="true">⌖</div>
                      <div className="flex flex-col">
                        <span className="text-gray-400 text-[10px] uppercase tracking-wider font-semibold">Venue</span>
                        <span className="text-white text-sm font-medium leading-tight">{ticket.venue}</span>
                      </div>
                    </div>

                    {/* Date */}
                    <div className="flex items-center gap-3">
                      <div className="ticket-detail-icon" aria-hidden="true">◷</div>
                      <div className="flex flex-col">
                        <span className="text-gray-400 text-[10px] uppercase tracking-wider font-semibold">Date & Time</span>
                        <span className="text-white text-sm font-medium leading-tight">{ticket.dateLabel}</span>
                      </div>
                    </div>

                    {/* Ticket Type & Qty */}
                    <div className="flex items-center justify-between border-t border-white/10 pt-3 mt-1">
                      <div className="flex flex-col">
                        <span className="text-gray-400 text-[10px] uppercase tracking-wider font-semibold">Pass Type</span>
                        <span className="text-white text-xs font-bold">{ticket.ticketType} x {ticket.qty}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-gray-400 text-[10px] uppercase tracking-wider font-semibold">Paid Amount</span>
                        <span className="text-emerald-400 text-sm font-black">{ticket.price}</span>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="absolute bottom-0 left-0 right-0 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/90 to-transparent pt-12">
                <a 
                  href={`/api/ticket/${ticket.id}/download`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="ticket-download w-full bg-white text-black font-extrabold rounded-full py-4 text-sm flex items-center justify-center gap-2 hover:bg-gray-100 transition active:scale-[0.98]"
                >
                  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download PDF Ticket
                </a>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="details"
              custom={dir}
              initial={{ x: dir > 0 ? 393 : -393, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: dir < 0 ? 393 : -393, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="absolute inset-0 flex flex-col overflow-y-auto"
            >
              {/* Event Hero Cover */}
              <div className="relative w-full h-[280px] shrink-0">
                <img 
                  src={eventTheme.bannerUrl} 
                  alt="Event Banner" 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-[#0a0a0a]" />

                {/* Back Button */}
                <button 
                  onClick={handleGoToTicket} 
                  className="absolute top-12 left-6 w-10 h-10 flex items-center justify-center rounded-full bg-black/45 hover:bg-black/60 backdrop-blur-md transition border border-white/10 active:scale-95 z-20"
                >
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              </div>

              {/* Event Info Details */}
              <div className="px-6 pb-28 -mt-6 relative z-10 flex-1">
                <h1 className="text-3xl font-extrabold mb-4 tracking-tight drop-shadow-md">
                  {ticket.event}
                </h1>

                {/* Info Badges */}
                <div className="flex flex-col gap-2.5 mb-6 text-sm font-semibold opacity-90">
                  <div className="flex items-center gap-2">
                    <span className="text-purple-400">📅</span>
                    <span>{ticket.dateLabel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-purple-400">📍</span>
                    <span>{ticket.venue}</span>
                  </div>
                </div>

                {/* Host Card */}
                <div className="flex items-center gap-3.5 bg-white/5 border border-white/10 rounded-2xl p-4 mb-6">
                  <div className="w-11 h-11 rounded-full bg-purple-600/30 flex items-center justify-center font-bold text-lg text-purple-300">
                    {eventTheme.host[0]}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Organized By</span>
                    <span className="text-white text-sm font-bold leading-tight">{eventTheme.host}</span>
                  </div>
                </div>

                {/* Description */}
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-2">About The Event</h3>
                <p className="text-sm text-gray-400 leading-relaxed mb-6">
                  {eventTheme.desc}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-8">
                  {eventTheme.tags.map((tag) => (
                    <span 
                      key={tag} 
                      className="px-3.5 py-1.5 rounded-full bg-white/5 text-xs font-semibold text-gray-300 border border-white/5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Gallery */}
                <div className="w-full">
                  <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">Gallery</h3>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                    {eventTheme.gallery.map((imgUrl, i) => (
                      <img 
                        key={i} 
                        src={imgUrl} 
                        alt={`Gallery ${i}`} 
                        className="w-32 h-24 rounded-2xl object-cover shrink-0 opacity-80 hover:opacity-100 transition duration-300"
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Sticky bottom CTA */}
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/90 to-transparent pt-12 z-20">
                <button 
                  onClick={handleGoToTicket} 
                  className={`w-full ${eventTheme.btnBg} text-white font-extrabold rounded-full py-4 text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-lg`}
                >
                  🎟️ View Ticket Card
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
