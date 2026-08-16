import { motion } from 'framer-motion'
import LittixLogo from '../components/LittixLogo'
import type { Ticket } from '../lib/store'

interface Props {
  dark: boolean
  ticket: Ticket | null
  notFoundId?: string
  onBack: () => void
  onScanNext: () => void
}

export default function ScanRejected({ dark, ticket, notFoundId, onBack, onScanNext }: Props) {
  const bg = dark ? 'bg-[#0D0D0D]' : 'bg-[#F9F9FB]'
  const cardBg = dark ? 'bg-[#1A1A1A] border-[#2A2A2A]' : 'bg-white border-[#EBEBEB]'
  const text = dark ? 'text-white' : 'text-[#111]'
  const subText = dark ? 'text-[#A0A0A0]' : 'text-[#6B6B6B]'
  const navBg = dark ? 'bg-[#0D0D0D] border-[#1E1E1E]' : 'bg-[#F9F9FB] border-[#EBEBEB]'

  const isNotFound = !ticket

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
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.05 }}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border ${dark ? 'bg-[#1A1A1A] border-[#2A2A2A]' : 'bg-white shadow-sm border-zinc-200'}`}
        >
          <svg width="8" height="14" viewBox="0 0 7 12" fill="none">
            <path d="M6 1L1 6l5 5" stroke="#A855F7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.button>
        <LittixLogo dark={dark} size="sm" />
        <div className="w-10" />
      </motion.div>

      <div className="flex flex-col items-center pt-10 pb-6 px-5">
        <motion.div
          className="w-24 h-24 rounded-full flex items-center justify-center mb-5 animate-shake-x"
          style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}
          initial={{ scale: 0, boxShadow: '0 0 0 0px rgba(239,68,68,0)' }}
          animate={{ scale: 1, boxShadow: '0 0 0 12px rgba(239,68,68,0.06)' }}
          transition={{ type: 'spring', stiffness: 260, damping: 15 }}
        >
          <motion.div
            className="w-20 h-20 rounded-full bg-[#EF4444] flex items-center justify-center"
            style={{ boxShadow: '0 4px 24px rgba(239,68,68,0.4)' }}
            initial={{ scale: 0.6, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 12 }}
          >
            <motion.svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <motion.path
                d="M18 10v10"
                stroke="white" strokeWidth="3" strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.35, duration: 0.3 }}
              />
              <motion.circle
                cx="18" cy="26.5" r="1.6" fill="white"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6, duration: 0.2 }}
              />
            </motion.svg>
          </motion.div>
        </motion.div>

        <motion.h1
          className={`text-2xl font-black ${text} mb-1`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          {isNotFound ? 'Ticket Not Found' : (ticket!.status === 'cancelled' ? 'Ticket Cancelled' : 'Already Scanned')}
        </motion.h1>
        <motion.span
          className="bg-[#EF4444]/15 text-[#EF4444] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.35 }}
        >
          {isNotFound ? 'Invalid Ticket' : (ticket!.status === 'cancelled' ? 'Cancelled' : 'Duplicate Entry')}
        </motion.span>
      </div>

      <motion.div
        className={`mx-4 rounded-3xl border ${cardBg} overflow-hidden`}
        style={{ boxShadow: dark ? 'none' : '0 2px 16px rgba(0,0,0,0.06)' }}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="px-5 py-4">
          <h3 className={`text-xs font-bold uppercase tracking-widest mb-4 ${subText}`}>Scan Record</h3>

          {isNotFound ? (
            <div className="flex items-start justify-between py-2.5">
              <span className={`text-xs ${subText}`}>Scanned Code</span>
              <span className={`text-xs font-semibold text-right font-mono ${text}`}>{notFoundId}</span>
            </div>
          ) : (
            [
              { label: 'Ticket ID', value: `#${ticket!.id}`, mono: true },
              { label: 'Attendee Name', value: ticket!.attendee },
              { label: 'Email', value: ticket!.email },
              { label: 'Phone', value: ticket!.phone || 'N/A' },
              { label: 'Gender / Pass', value: ticket!.ticketType.replace(' Pass', '') + ' Pass' },
              { label: 'Event', value: ticket!.event },
              { label: 'Venue', value: ticket!.venue || 'Flo The Brewery, Pune' },
              { label: 'Event Date', value: ticket!.dateLabel || 'TBA' },
              { label: 'Quantity', value: String(ticket!.qty) },
              { label: 'Price Paid', value: ticket!.price },
              { label: 'Purchased At', value: ticket!.generatedAt },
            ].map(({ label, value, mono }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.55 + i * 0.06, duration: 0.35 }}
                className="flex items-start justify-between py-2.5 border-b last:border-b-0"
                style={{ borderColor: dark ? '#2A2A2A' : '#EBEBEB' }}
              >
                <span className={`text-xs ${subText}`}>{label}</span>
                <span className={`text-xs font-semibold text-right ${mono ? 'font-mono' : ''} ${text}`}>{value}</span>
              </motion.div>
            ))
          )}
        </div>

        <motion.div
          className="bg-[#EF4444]/[0.08] border-t px-5 py-4"
          style={{ borderColor: dark ? '#2A2A2A' : '#EBEBEB' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.4 }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 text-[#EF4444]">
            {isNotFound ? 'Reason' : 'Original Scan'}
          </p>
          {isNotFound ? (
            <p className={`text-xs ${subText}`}>No ticket matches this code. Check the ID and try again.</p>
          ) : (
            <>
              <p className={`text-xs ${subText}`}>
                {ticket!.status === 'cancelled' ? (
                  <span>Status set by <span className={`font-semibold ${text}`}>Admin</span></span>
                ) : (
                  <span>First scanned by <span className={`font-semibold ${text}`}>{ticket!.scannedBy}</span> at <span className={`font-semibold ${text}`}>{ticket!.scannedAt}</span></span>
                )}
              </p>
              <p className={`text-xs mt-1 ${subText}`}>
                {ticket!.status === 'cancelled' ? 'This ticket has been cancelled by an administrator and is void.' : 'This ticket has already been used for entry.'}
              </p>
            </>
          )}
        </motion.div>

        <div className="bg-[#EF4444]/[0.08] border-t px-5 py-3 flex items-center justify-between" style={{ borderColor: dark ? '#2A2A2A' : '#EBEBEB' }}>
          <span className={`text-xs font-medium ${subText}`}>Status</span>
          <span className="bg-[#EF4444] text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            {isNotFound ? 'Invalid' : ticket!.status === 'cancelled' ? 'Cancelled' : 'Rejected'}
          </span>
        </div>
      </motion.div>

      <div className="flex-1" />

      <motion.div
        className="px-5 pb-10 pt-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.4 }}
      >
        <motion.button
          onClick={onScanNext}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="w-full font-bold text-sm py-4 rounded-2xl"
          style={{ backgroundColor: dark ? '#1A1A1A' : '#E4E4E7', color: dark ? '#fff' : '#111' }}
        >
          Scan Next Ticket
        </motion.button>
      </motion.div>
    </div>
  )
}
