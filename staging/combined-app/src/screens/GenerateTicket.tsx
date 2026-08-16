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

function Field({
  label,
  placeholder,
  dark,
  value,
  onChange,
  type = 'text',
  delay = 0,
}: {
  label: string
  placeholder: string
  dark: boolean
  value: string
  onChange: (v: string) => void
  type?: string
  delay?: number
}) {
  const [focused, setFocused] = useState(false)
  const bg = dark
    ? 'bg-[#1A1A1A] border-[#2A2A2A] text-white placeholder-[#555]'
    : 'bg-white border-[#E4E4E7] text-[#111] placeholder-[#A0A0A0]'
  return (
    <motion.div
      className="flex flex-col gap-1.5"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <label className={`text-xs font-medium tracking-wide uppercase ${dark ? 'text-[#A0A0A0]' : 'text-[#6B6B6B]'}`}>
        {label}
      </label>
      <motion.input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        animate={{
          boxShadow: focused ? '0 0 0 3px rgba(168,85,247,0.15)' : '0 0 0 0px rgba(168,85,247,0)',
        }}
        transition={{ duration: 0.25 }}
        className={`rounded-2xl px-4 py-3.5 text-sm border ${bg} outline-none focus:border-[#A855F7] transition-colors`}
        style={{ fontFamily: 'Inter, sans-serif' }}
      />
    </motion.div>
  )
}

export default function GenerateTicket({ dark, onBack, onGenerated, sellerId, sellerToken }: Props) {
  const { refreshTickets } = useStore()
  const [event, setEvent] = useState('')
  const [attendee, setAttendee] = useState('')
  const [email, setEmail] = useState('')
  const [datetime, setDatetime] = useState('')
  const [ticketType, setTicketType] = useState<TicketType>('Male Pass')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')

  function handleTicketTypeChange(t: TicketType) {
    setTicketType(t)
    if (t === 'Aura Genesis' && !datetime) {
      setDatetime('2026-08-14T16:00')
    }
  }

  // Load real event config from server
  useEffect(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (sellerToken) headers['x-seller-token'] = sellerToken
    const adminKey = localStorage.getItem('ft_admin_key') || sessionStorage.getItem('ft_admin_key') || 'change-me-admin-key'
    fetch('/api/admin/config?key=' + adminKey)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.event) {
          setEvent(data.event)
        }
      })
      .catch(() => {})
  }, [])

  const bg = dark ? 'bg-[#0D0D0D]' : 'bg-[#F9F9FB]'
  const navBg = dark ? 'bg-[#0D0D0D] border-[#1E1E1E]' : 'bg-[#F9F9FB] border-[#EBEBEB]'
  const text = dark ? 'text-white' : 'text-[#111]'
  const subText = dark ? 'text-[#A0A0A0]' : 'text-[#6B6B6B]'

  function formatDateLabel(v: string) {
    if (!v) return 'TBA'
    const d = new Date(v)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const hh = d.getHours().toString().padStart(2, '0')
    const mm = d.getMinutes().toString().padStart(2, '0')
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${hh}:${mm}`
  }

  async function handleGenerate() {
    if (!attendee.trim() || !email.trim()) {
      setError('Attendee name and email are required')
      return
    }
    if (!event.trim()) {
      setError('Event name is required')
      return
    }
    setError('')
    setStatus('loading')
    try {
      const resolvedEvent = ticketType === 'Aura Genesis' ? 'AURA GENESIS' : event.trim()
      const resolvedDate = ticketType === 'Aura Genesis'
        ? 'Aug 14, 2026 · 04:00 PM'
        : formatDateLabel(datetime)

      // Build headers — use seller token if available, otherwise admin key
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (sellerToken) {
        headers['x-seller-token'] = sellerToken
      } else {
        const adminKey = localStorage.getItem('ft_admin_key') || sessionStorage.getItem('ft_admin_key') || 'change-me-admin-key'
        headers['x-admin-key'] = adminKey
      }

      const res = await fetch('/api/admin/generate-ticket', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: attendee.trim(),
          email: email.trim(),
          event: resolvedEvent,
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
      window.setTimeout(() => onGenerated(data.ticket.id), 550)
    } catch (err: any) {
      setError(err.message || 'Failed to generate ticket')
      setStatus('idle')
    }
  }

  return (
    <div className={`${bg} flex flex-col w-full min-h-screen`} style={{ fontFamily: 'Inter, sans-serif' }}>

      <motion.div
        className={`flex items-center justify-between px-4 py-3 border-b ${navBg}`}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <motion.button
          onClick={onBack}
          whileTap={{ scale: 0.85 }}
          whileHover={{ scale: 1.08 }}
          className={`w-8 h-8 flex items-center justify-center rounded-full ${dark ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm'}`}
        >
          <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
            <path d="M6 1L1 6l5 5" stroke={dark ? '#fff' : '#111'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.button>
        <LittixLogo dark={dark} size="sm" />
        <div className="w-8" />
      </motion.div>

      <motion.div
        className="flex flex-col gap-1.5 px-5 pt-5 pb-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        <h1 className={`text-xl font-bold ${text}`}>Generate Ticket</h1>
        <p className={`text-sm ${subText}`}>Fill in details to create your QR ticket</p>
      </motion.div>

      <div className="flex flex-col gap-4 px-5 pt-4">
        <Field label="Event Name" placeholder="Event name" dark={dark} value={event} onChange={setEvent} delay={0.08} />
        <Field label="Attendee Name" placeholder="Full name" dark={dark} value={attendee} onChange={setAttendee} delay={0.13} />
        <Field label="Attendee Email" placeholder="email@example.com" dark={dark} value={email} onChange={setEmail} type="email" delay={0.18} />

        <motion.div
          className="flex flex-col gap-1.5"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.23, ease: [0.16, 1, 0.3, 1] }}
        >
          <label className={`text-xs font-medium tracking-wide uppercase ${dark ? 'text-[#A0A0A0]' : 'text-[#6B6B6B]'}`}>
            Date & Time
          </label>
          <div
            className={`flex items-center rounded-2xl px-4 py-3.5 border ${dark ? 'bg-[#1A1A1A] border-[#2A2A2A]' : 'bg-white border-[#E4E4E7]'} gap-3 relative`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
              <rect x="1" y="2.5" width="14" height="12.5" rx="2" stroke={dark ? '#555' : '#999'} strokeWidth="1.2" />
              <path d="M5 1v3M11 1v3M1 6.5h14" stroke={dark ? '#555' : '#999'} strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <input
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              className={`text-sm bg-transparent outline-none w-full ${dark ? 'text-white' : 'text-[#111]'}`}
              style={{ colorScheme: dark ? 'dark' : 'light' }}
            />
          </div>
        </motion.div>

        <motion.div
          className="flex flex-col gap-1.5"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          <label className={`text-xs font-medium tracking-wide uppercase ${dark ? 'text-[#A0A0A0]' : 'text-[#6B6B6B]'}`}>
            Ticket Type
          </label>
          <div className="flex gap-2 flex-wrap">
            {(['Male Pass', 'Female Pass', 'Aura Genesis'] as TicketType[]).map((t) => (
              <motion.button
                key={t}
                onClick={() => handleTicketTypeChange(t)}
                whileTap={{ scale: 0.94 }}
                className={`relative px-3 py-2 rounded-xl text-xs font-semibold border overflow-hidden ${
                  ticketType === t
                    ? 'text-white border-[#A855F7]'
                    : dark
                    ? 'bg-[#1A1A1A] text-[#A0A0A0] border-[#2A2A2A]'
                    : 'bg-white text-[#6B6B6B] border-[#E4E4E7]'
                }`}
              >
                {ticketType === t && (
                  <motion.span
                    layoutId="ticket-type-bg"
                    className="absolute inset-0 bg-[#A855F7]"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative">{t}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-[#EF4444] text-xs font-medium overflow-hidden"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1" />

      <div className="px-5 pb-10 pt-4">
        <motion.button
          onClick={handleGenerate}
          disabled={status !== 'idle'}
          whileHover={status === 'idle' ? { scale: 1.02, boxShadow: '0 8px 32px rgba(168,85,247,0.5)' } : {}}
          whileTap={status === 'idle' ? { scale: 0.97 } : {}}
          animate={status === 'success' ? { backgroundColor: '#22C55E' } : { backgroundColor: '#A855F7' }}
          className="w-full text-white font-bold text-base py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg"
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
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="1" y="1" width="16" height="16" rx="3" stroke="white" strokeWidth="1.5" />
                  <path d="M6 9l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Generate Ticket
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
                Creating…
              </motion.span>
            )}
            {status === 'success' && (
              <motion.span
                key="success"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2"
              >
                <motion.svg
                  width="18" height="18" viewBox="0 0 18 18" fill="none"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                >
                  <motion.path
                    d="M3 9l4 4 8-8"
                    stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                  />
                </motion.svg>
                Ticket Created!
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  )
}
