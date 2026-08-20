import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import LittixLogo from '../components/LittixLogo'
import { useStore, type TicketType } from '../lib/store'

interface Props {
  dark: boolean
  onBack: () => void
  onGenerated: (id: string) => void
  sellerId?: string
  sellerToken?: string
}

interface ActiveEvent {
  id: number
  name: string
  date: string
  active: boolean
}

export default function GenerateTicket({ dark, onBack, onGenerated, sellerId, sellerToken }: Props) {
  const { refreshTickets } = useStore()

  const [events, setEvents] = useState<ActiveEvent[]>([])
  const [selectedEvent, setSelectedEvent] = useState<ActiveEvent | null>(null)
  const [attendee, setAttendee] = useState('')
  const [email, setEmail] = useState('')
  const [ticketType, setTicketType] = useState<TicketType>('Male Pass')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')

  const bg = dark ? 'bg-[#0D0D0D]' : 'bg-[#F9F9FB]'
  const navBg = dark ? 'bg-[#0D0D0D] border-[#1E1E1E]' : 'bg-[#F9F9FB] border-[#EBEBEB]'
  const cardBg = dark ? 'bg-[#1A1A1A] border-[#2A2A2A]' : 'bg-white border-[#E4E4E7]'
  const text = dark ? 'text-white' : 'text-[#111]'
  const subText = dark ? 'text-[#A0A0A0]' : 'text-[#6B6B6B]'
  const inputBg = dark
    ? 'bg-[#1A1A1A] border-[#2A2A2A] text-white placeholder-[#555]'
    : 'bg-white border-[#E4E4E7] text-[#111] placeholder-[#A0A0A0]'

  // Load active events from server
  useEffect(() => {
    if (!sellerToken) return
    fetch('/api/active-events', {
      headers: { 'x-seller-token': sellerToken }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.events?.length) {
          setEvents(data.events)
          setSelectedEvent(data.events[0])
        }
      })
      .catch(() => {
        // Fallback — no events loaded
      })
  }, [sellerToken])

  async function handlePunch() {
    if (!attendee.trim()) { setError('Attendee name is required'); return }
    if (!email.trim()) { setError('Email is required'); return }
    if (!selectedEvent) { setError('No active event — ask master admin to add one'); return }
    setError('')
    setStatus('loading')
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (sellerToken) headers['x-seller-token'] = sellerToken

      const res = await fetch('/api/admin/generate-ticket', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: attendee.trim(),
          email: email.trim(),
          event: selectedEvent.name,
          ticketType,
          quantity: 1,
          amount: 0,
          generatedBy: sellerId || 'Staff',
        })
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.message || 'Server error')

      await refreshTickets()
      setStatus('success')

      // Reset form after success
      setTimeout(() => {
        setAttendee('')
        setEmail('')
        setStatus('idle')
        onGenerated(data.ticket.id)
      }, 900)
    } catch (err: any) {
      setError(err.message || 'Failed to punch ticket')
      setStatus('idle')
    }
  }

  const ticketTypes: TicketType[] = ['Male Pass', 'Female Pass', 'Aura Genesis']

  return (
    <div className={`${bg} flex flex-col w-full min-h-screen`} style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* Nav */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${navBg} sticky top-0 z-10`}>
        <motion.button
          onClick={onBack}
          whileTap={{ scale: 0.85 }}
          whileHover={{ scale: 1.08 }}
          className={`w-9 h-9 flex items-center justify-center rounded-full ${dark ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm'}`}
        >
          <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
            <path d="M6 1L1 6l5 5" stroke={dark ? '#fff' : '#111'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.button>
        <div className="flex flex-col items-center">
          <LittixLogo dark={dark} size="sm" />
        </div>
        <div className="w-9" />
      </div>

      {/* Header */}
      <motion.div
        className="px-5 pt-5 pb-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h1 className={`text-2xl font-black ${text}`}>Punch Ticket</h1>
        <p className={`text-sm mt-0.5 ${subText}`}>
          {sellerId ? `Logged in as ${sellerId.replace('SELLER-', 'S-')}` : 'Gate Staff'}
        </p>
      </motion.div>

      <div className="flex flex-col gap-4 px-5 pb-8">

        {/* Event selector */}
        <motion.div
          className="flex flex-col gap-1.5"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
        >
          <label className={`text-xs font-bold tracking-widest uppercase ${subText}`}>Event</label>
          {events.length === 0 ? (
            <div className={`rounded-2xl px-4 py-3.5 border ${cardBg} text-sm ${subText}`}>
              No active events — contact master admin
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {events.map(ev => (
                <motion.button
                  key={ev.id}
                  onClick={() => setSelectedEvent(ev)}
                  whileTap={{ scale: 0.97 }}
                  className={`relative w-full text-left px-4 py-3.5 rounded-2xl border overflow-hidden ${
                    selectedEvent?.id === ev.id
                      ? 'border-[#A855F7] text-white'
                      : `${cardBg} ${text}`
                  }`}
                >
                  {selectedEvent?.id === ev.id && (
                    <motion.span
                      layoutId="ev-bg"
                      className="absolute inset-0 bg-[#A855F7]"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <span className="relative flex items-center gap-2">
                    <span className="text-sm font-bold">{ev.name}</span>
                    {ev.date && (
                      <span className={`text-[11px] ${selectedEvent?.id === ev.id ? 'text-white/70' : subText}`}>{ev.date}</span>
                    )}
                  </span>
                </motion.button>
              ))}
            </div>
          )}
        </motion.div>

        {/* Attendee Name */}
        <motion.div
          className="flex flex-col gap-1.5"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          <label className={`text-xs font-bold tracking-widest uppercase ${subText}`}>Attendee Name</label>
          <input
            type="text"
            value={attendee}
            onChange={e => setAttendee(e.target.value)}
            placeholder="Full name"
            className={`rounded-2xl px-4 py-3.5 text-sm border ${inputBg} outline-none focus:border-[#A855F7] transition-colors`}
          />
        </motion.div>

        {/* Email */}
        <motion.div
          className="flex flex-col gap-1.5"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15 }}
        >
          <label className={`text-xs font-bold tracking-widest uppercase ${subText}`}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email@example.com"
            className={`rounded-2xl px-4 py-3.5 text-sm border ${inputBg} outline-none focus:border-[#A855F7] transition-colors`}
          />
        </motion.div>

        {/* Ticket Type */}
        <motion.div
          className="flex flex-col gap-1.5"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
        >
          <label className={`text-xs font-bold tracking-widest uppercase ${subText}`}>Ticket Type</label>
          <div className="flex gap-2 flex-wrap">
            {ticketTypes.map(t => (
              <motion.button
                key={t}
                onClick={() => setTicketType(t)}
                whileTap={{ scale: 0.94 }}
                className={`relative px-4 py-2.5 rounded-xl text-xs font-semibold border overflow-hidden ${
                  ticketType === t
                    ? 'text-white border-[#A855F7]'
                    : dark
                    ? 'bg-[#1A1A1A] text-[#A0A0A0] border-[#2A2A2A]'
                    : 'bg-white text-[#6B6B6B] border-[#E4E4E7]'
                }`}
              >
                {ticketType === t && (
                  <motion.span
                    layoutId="tt-bg"
                    className="absolute inset-0 bg-[#A855F7]"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative">{t}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-[#EF4444] text-xs font-semibold overflow-hidden"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Punch Button */}
        <motion.button
          onClick={handlePunch}
          disabled={status !== 'idle'}
          whileHover={status === 'idle' ? { scale: 1.02, boxShadow: '0 8px 32px rgba(168,85,247,0.55)' } : {}}
          whileTap={status === 'idle' ? { scale: 0.97 } : {}}
          animate={status === 'success' ? { backgroundColor: '#22C55E' } : { backgroundColor: '#A855F7' }}
          className="w-full text-white font-black text-base py-5 rounded-2xl flex items-center justify-center gap-2 mt-2"
          style={{ boxShadow: '0 4px 24px rgba(168,85,247,0.35)' }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {status === 'idle' && (
              <motion.span
                key="idle"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex items-center gap-2"
              >
                🎟️ PUNCH TICKET
              </motion.span>
            )}
            {status === 'loading' && (
              <motion.span
                key="loading"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex items-center gap-2"
              >
                <motion.span
                  className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white inline-block"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                />
                Punching…
              </motion.span>
            )}
            {status === 'success' && (
              <motion.span
                key="success"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2"
              >
                ✅ TICKET PUNCHED!
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

      </div>
    </div>
  )
}
