import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import LittixLogo from '../components/LittixLogo'
import QRCode from '../components/QRCode'
import type { Ticket } from '../lib/store'

interface Props {
  dark: boolean
  ticket: Ticket
  onBack: () => void
}

export default function TicketCard({ dark, ticket, onBack }: Props) {
  const [sendState, setSendState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const bg = dark ? 'bg-[#0D0D0D]' : 'bg-[#F9F9FB]'
  const navBg = dark ? 'bg-[#0D0D0D] border-[#1E1E1E]' : 'bg-[#F9F9FB] border-[#EBEBEB]'
  const cardBg = dark ? 'bg-[#1A1A1A] border-[#2A2A2A]' : 'bg-white border-[#EBEBEB]'
  const text = dark ? 'text-white' : 'text-[#111]'
  const subText = dark ? 'text-[#A0A0A0]' : 'text-[#6B6B6B]'
  const divider = dark ? 'bg-[#2A2A2A]' : 'bg-[#EBEBEB]'

  const isScanned = ticket.status === 'scanned'

  async function handleSendEmail() {
    if (sendState !== 'idle') return
    setSendState('loading')
    try {
      const res = await fetch(`/api/ticket/${ticket.id}/resend`, { method: 'POST' })
      const data = await res.json()
      if (data.success || res.ok) {
        setSendState('sent')
      } else {
        setSendState('error')
        setTimeout(() => setSendState('idle'), 3000)
      }
    } catch {
      setSendState('error')
      setTimeout(() => setSendState('idle'), 3000)
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
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.05 }}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border ${dark ? 'bg-[#1A1A1A] border-[#2A2A2A]' : 'bg-white shadow-sm border-zinc-200'} text-[#A855F7]`}
        >
          <svg width="8" height="14" viewBox="0 0 7 12" fill="none">
            <path d="M6 1L1 6l5 5" stroke="#A855F7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.button>
        <span className={`text-sm font-bold ${text}`}>Ticket Details</span>
        <div className="w-10" />
      </motion.div>

      <div className="px-4 pt-4">
        <motion.div
          className={`${cardBg} border rounded-3xl overflow-hidden`}
          style={{ boxShadow: dark ? 'none' : '0 2px 20px rgba(0,0,0,0.08)' }}
          initial={{ opacity: 0, y: 28, scale: 0.96, rotateX: 6 }}
          animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="relative overflow-hidden">
            <motion.img
              src={ticket.event && ticket.event.toUpperCase().includes('AURA') ? "/aura-genesis-banner.jpg" : "/images/freshers-takeover-banner.png"}
              alt={ticket.event || "Banner"}
              className="w-full object-cover"
              style={{ height: 180 }}
              initial={{ scale: 1.15, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <motion.div
              className="absolute top-3 right-3"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              <span className={`text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${isScanned ? 'bg-[#6B7280]' : 'bg-[#22C55E]'}`}>
                {isScanned ? 'Used' : 'Active'}
              </span>
            </motion.div>
            <motion.div
              className="absolute top-3 left-3"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${dark ? 'bg-[#1A1A1A]/90 text-[#A0A0A0]' : 'bg-white/90 text-[#6B6B6B]'}`}>
                {isScanned ? 'Scanned' : 'Not Scanned'}
              </span>
            </motion.div>
          </div>

          <motion.div
            className="px-5 pt-4 pb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <h2 className={`text-lg font-black uppercase tracking-tight ${text}`}>{ticket.event}</h2>
            <p className="text-sm font-semibold text-[#A855F7] mt-0.5">Main Stage · {ticket.ticketType} Admission</p>

            <div className="flex gap-2 mt-3 flex-wrap">
              {(ticket.event && ticket.event.toUpperCase().includes('AURA')
                ? [
                    { icon: '📅', label: ticket.dateLabel.split('·')[0]?.trim() || ticket.dateLabel },
                  ]
                : [
                    { icon: '📅', label: ticket.dateLabel.split('·')[0]?.trim() || ticket.dateLabel },
                    { icon: '⏰', label: ticket.dateLabel.split('·')[1]?.trim() || '' },
                    { icon: '📍', label: ticket.venue },
                  ]
              ).filter((c) => c.label).map(({ icon, label }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.06 }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium ${dark ? 'bg-[#0D0D0D] border-[#2A2A2A] text-[#A0A0A0]' : 'bg-[#F9F9FB] border-[#EBEBEB] text-[#6B6B6B]'}`}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </motion.div>
              ))}
            </div>

            <div className={`h-px ${divider} my-4`} />

            <div className="flex items-center justify-between mb-4">
              <div>
                <p className={`text-[10px] uppercase tracking-wider font-medium ${subText}`}>Attendee</p>
                <p className={`text-sm font-semibold mt-0.5 ${text}`}>{ticket.attendee}</p>
              </div>
              {ticket.phone && (
                <div className="text-right">
                  <p className={`text-[10px] uppercase tracking-wider font-medium ${subText}`}>Phone</p>
                  <p className={`text-sm font-semibold mt-0.5 ${text}`}>{ticket.phone}</p>
                </div>
              )}
            </div>

            <div className={`h-px ${divider} my-4`} />

            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[10px] uppercase tracking-wider font-medium ${subText}`}>Ticket Type</p>
                <p className={`text-sm font-semibold mt-0.5 ${text}`}>{ticket.ticketType}</p>
              </div>
              <div className="text-center">
                <p className={`text-[10px] uppercase tracking-wider font-medium ${subText}`}>Qty</p>
                <p className={`text-sm font-semibold mt-0.5 ${text}`}>{ticket.qty}</p>
              </div>
              <div className="text-right">
                <p className={`text-[10px] uppercase tracking-wider font-medium ${subText}`}>Price</p>
                <p className="text-sm font-bold mt-0.5 text-[#A855F7]">{ticket.price}</p>
              </div>
            </div>

            <div
              className="my-3"
              style={{
                backgroundImage: `repeating-linear-gradient(to right, ${dark ? '#2A2A2A' : '#EBEBEB'} 0, ${dark ? '#2A2A2A' : '#EBEBEB'} 6px, transparent 6px, transparent 12px)`,
                height: 1,
              }}
            />

            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[10px] uppercase tracking-wider font-medium ${subText}`}>Ticket ID</p>
                <p className={`text-xs font-mono font-semibold mt-0.5 ${text}`}>#{ticket.id}</p>
              </div>
            </div>
            <p className={`text-[10px] mt-1 ${subText}`}>
              Generated by <span className="font-semibold">{ticket.generatedBy}</span> on {ticket.generatedAt}
            </p>
            {ticket.status === 'scanned' && (
              <p className="text-[10px] mt-0.5 text-[#22C55E]">
                Scanned by <span className="font-semibold">{ticket.scannedBy}</span> at {ticket.scannedAt}
              </p>
            )}

            <div className={`h-px ${divider} my-4`} />

            <div className="flex flex-col items-center gap-3 pb-2">
              <motion.div
                className="bg-white rounded-2xl p-4 relative"
                style={{ boxShadow: '0 2px 16px rgba(0,0,0,0.12)' }}
                initial={{ opacity: 0, scale: 0.8, rotate: -4 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ delay: 0.4, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ scale: 1.03 }}
              >
                <QRCode value={`LITTIX:${ticket.id}`} size={144} />
              </motion.div>
              <p className={`text-xs font-black tracking-wider ${dark ? 'text-white' : 'text-black'}`}>LITTX</p>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <motion.div
        className="px-5 pt-4 pb-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
      >
        <motion.button
          onClick={handleSendEmail}
          disabled={sendState !== 'idle'}
          whileHover={sendState === 'idle' ? { scale: 1.015 } : {}}
          whileTap={sendState === 'idle' ? { scale: 0.97 } : {}}
          className={`w-full py-3.5 rounded-2xl text-sm font-bold border flex items-center justify-center gap-2 ${
            dark ? 'bg-[#1A1A1A] border-[#2A2A2A] text-white' : 'bg-white border-[#E4E4E7] text-[#111] shadow-sm'
          }`}
        >
          <AnimatePresence mode="wait" initial={false}>
            {sendState === 'sent' ? (
              <motion.span
                key="sent"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className="flex items-center gap-2"
              >
                <motion.svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <motion.path d="M2 8l4 4 8-8" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4 }} />
                </motion.svg>
                Sent to {ticket.email}
              </motion.span>
            ) : sendState === 'loading' ? (
              <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                <motion.span className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current inline-block"
                  animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
                Sending…
              </motion.span>
            ) : sendState === 'error' ? (
              <motion.span key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-red-500">
                ✕ Failed — try again
              </motion.span>
            ) : (
              <motion.span
                key="send"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 8l6-6 6 6M8 2v10M4 14h8" stroke={dark ? '#A855F7' : '#7C3AED'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Send to Email
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </motion.div>
    </div>
  )
}
