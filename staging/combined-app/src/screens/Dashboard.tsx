import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import LittixLogo from '../components/LittixLogo'
import AnimatedCounter from '../components/AnimatedCounter'
import { useStore } from '../lib/store'
import type { RejectedScan } from '../littix/App'

interface Props {
  dark: boolean
  onOpenTicket: (id: string) => void
  onScan: () => void
  onToggleTheme: () => void
  rejectedScans: RejectedScan[]
  onGenerateTicket?: () => void
  sellerId?: string
  onLogout?: () => void
}

export default function Dashboard({ dark, onOpenTicket, onScan, onToggleTheme, rejectedScans, onGenerateTicket, sellerId, onLogout }: Props) {
  const { tickets } = useStore()
  const [activeTab, setActiveTab] = useState<'scanned' | 'failed'>('scanned')
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [databaseStats, setDatabaseStats] = useState({ accepted: 0, failed: 0 })

  // These are persistent, all-scanner totals. Refresh after every scan through
  // polling so the panel stays current even when another device is scanning.
  useEffect(() => {
    let active = true
    const loadStats = async () => {
      try {
        const res = await fetch('/api/scan-stats')
        const data = await res.json()
        if (active && res.ok && data.success) {
          setDatabaseStats({ accepted: data.accepted || 0, failed: data.failed || 0 })
        }
      } catch {
        // Keep the last known totals while a scanner is temporarily offline.
      }
    }

    loadStats()
    const interval = window.setInterval(loadStats, 3000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  const bg = dark ? 'bg-[#0D0D0D]' : 'bg-[#F9F9FB]'
  const navBg = dark ? 'bg-[#0D0D0D] border-[#1E1E1E]' : 'bg-[#F9F9FB] border-[#EBEBEB]'
  const cardBg = dark ? 'bg-[#1A1A1A] border-[#2A2A2A]' : 'bg-white border-[#EBEBEB]'
  const text = dark ? 'text-white' : 'text-[#111]'
  const subText = dark ? 'text-[#A0A0A0]' : 'text-[#6B6B6B]'
  const searchBg = dark ? 'bg-[#1A1A1A] border-[#2A2A2A] text-white placeholder-[#555]' : 'bg-white border-[#E4E4E7] text-[#111] placeholder-[#A0A0A0]'

  // Get only successfully scanned tickets
  const scannedTickets = useMemo(() => {
    return tickets.filter((t) => t.status === 'scanned')
  }, [tickets])

  // Filter successfully scanned list
  const filteredScanned = useMemo(() => {
    let list = scannedTickets
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((t) => t.attendee.toLowerCase().includes(q) || t.id.toLowerCase().includes(q))
    }
    return list
  }, [scannedTickets, search])

  // Filter session failed scans list
  const filteredFailed = useMemo(() => {
    let list = rejectedScans
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((fs) => {
        const idMatch = (fs.rawCode || '').toLowerCase().includes(q)
        const nameMatch = fs.ticket ? fs.ticket.attendee.toLowerCase().includes(q) : false
        return idMatch || nameMatch
      })
    }
    return list
  }, [rejectedScans, search])

  return (
    <div className={`${bg} flex flex-col w-full h-[100dvh] overflow-hidden`} style={{ fontFamily: 'Inter, sans-serif' }}>

      <div className={`flex items-center justify-between px-4 py-4 border-b ${navBg} sticky top-0 z-10 backdrop-blur-md`}>
        <LittixLogo dark={dark} size="sm" />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span className={`text-base font-bold ${text}`}>Scanner Panel</span>
          {sellerId && (
            <span style={{ fontSize: 9, color: '#A855F7', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 1 }}>
              {sellerId}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <motion.button
            onClick={onToggleTheme}
            whileTap={{ scale: 0.85 }}
            className={`w-10 h-10 flex items-center justify-center rounded-full ${dark ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm'}`}
            style={{ willChange: 'transform' }}
          >
            {dark ? (
              <svg width="18" height="18" viewBox="0 0 15 15" fill="none">
                <path d="M13 8.5A5.5 5.5 0 116.5 2a4.5 4.5 0 006.5 6.5z" stroke="#A0A0A0" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 15 15" fill="none">
                <circle cx="7.5" cy="7.5" r="3" stroke="#6B6B6B" strokeWidth="1.3" />
                <path d="M7.5 0.5v2M7.5 12v2M14.5 7.5h-2M2.5 7.5h-2M12.5 2.5l-1.4 1.4M3.9 11.1l-1.4 1.4M12.5 12.5l-1.4-1.4M3.9 3.9L2.5 2.5" stroke="#6B6B6B" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            )}
          </motion.button>
          {onLogout && (
            <motion.button
              onClick={onLogout}
              whileTap={{ scale: 0.85 }}
              title="Log out"
              className={`w-10 h-10 flex items-center justify-center rounded-full ${dark ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm'}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </motion.button>
          )}
        </div>
      </div>

      {/* Stats row specific to Scan Panel */}
      <div className="flex gap-3 px-4 pt-4 pb-2">
        <div
          className={`flex-1 rounded-2xl border px-4 py-3.5 ${cardBg}`}
          style={{ boxShadow: dark ? 'none' : '0 1px 8px rgba(0,0,0,0.04)' }}
        >
          <p className="text-2xl font-black text-[#22C55E]">
            <AnimatedCounter value={databaseStats.accepted} />
          </p>
          <p className={`text-[11px] font-semibold mt-0.5 ${subText}`}>Total Scanned</p>
        </div>
        <div
          className={`flex-1 rounded-2xl border px-4 py-3.5 ${cardBg}`}
          style={{ boxShadow: dark ? 'none' : '0 1px 8px rgba(0,0,0,0.04)' }}
        >
          <p className="text-2xl font-black text-[#EF4444]">
            <AnimatedCounter value={databaseStats.failed} />
          </p>
          <p className={`text-[11px] font-semibold mt-0.5 ${subText}`}>Failed Scans</p>
        </div>
      </div>

      {/* Search box */}
      <div className="px-4 pb-2">
        <motion.div
          className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 border ${searchBg}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{
            opacity: 1,
            y: 0,
            borderColor: searchFocused ? '#A855F7' : undefined,
            boxShadow: searchFocused ? '0 0 0 3px rgba(168,85,247,0.15)' : '0 0 0 0px rgba(168,85,247,0)',
          }}
          transition={{ duration: 0.3 }}
        >
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
            <circle cx="6" cy="6" r="4.5" stroke={dark ? '#555' : '#A0A0A0'} strokeWidth="1.2" />
            <path d="M10 10l2.5 2.5" stroke={dark ? '#555' : '#A0A0A0'} strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search scans…"
            className={`text-base bg-transparent outline-none w-full ${dark ? 'text-white placeholder-[#555]' : 'text-[#111] placeholder-[#A0A0A0]'}`}
          />
        </motion.div>
      </div>

      {/* Tab Selectors */}
      <div className="flex gap-2.5 px-4 pb-3">
        {(['scanned', 'failed'] as const).map((tab) => (
          <motion.button
            key={tab}
            onClick={() => setActiveTab(tab)}
            whileTap={{ scale: 0.94 }}
            className={`relative flex-1 py-3 rounded-2xl text-sm font-bold border overflow-hidden ${
              activeTab === tab
                ? 'text-white border-[#A855F7]'
                : dark
                ? 'bg-[#1A1A1A] text-[#A0A0A0] border-[#2A2A2A]'
                : 'bg-white text-[#6B6B6B] border-[#E4E4E7]'
            }`}
          >
            {activeTab === tab && (
              <motion.span
                layoutId="filter-pill-bg"
                className="absolute inset-0 bg-[#A855F7]"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative">
              {tab === 'scanned' ? 'Scanned' : 'Failed & Duplicates'}
            </span>
          </motion.button>
        ))}
      </div>

      <div className={`flex items-center px-4 py-3 border-b text-[10px] font-bold uppercase tracking-widest ${subText}`} style={{ borderColor: dark ? '#1E1E1E' : '#EBEBEB' }}>
        <span style={{ width: 85, flexShrink: 0 }}>Ticket ID</span>
        <span className="flex-1">Attendee / Details</span>
        <span style={{ width: 75 }} className="text-right">Outcome</span>
      </div>

      {/* Scans lists — Scrollable with Touch Optimization */}
      <div
        className="flex-1 overflow-y-auto min-h-0"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        {activeTab === 'scanned' ? (
          filteredScanned.length === 0 ? (
            <p className={`text-sm text-center py-12 ${subText}`}>No scanned tickets yet.</p>
          ) : (
            filteredScanned.map((ticket) => (
              <div
                key={ticket.id}
                className="px-4 py-4 border-b flex items-center text-left w-full min-h-[64px]"
                style={{ borderColor: dark ? '#1A1A1A' : '#F2F2F2' }}
              >
                <span className={`text-xs font-mono font-bold ${subText}`} style={{ width: 85, flexShrink: 0 }}>
                  #{ticket.id.length > 8 ? ticket.id.slice(-8).toUpperCase() : ticket.id.toUpperCase()}
                </span>
                <div className="flex-1 min-w-0 pr-2">
                  <span className={`text-sm font-bold block truncate ${text}`}>{ticket.attendee}</span>
                  <p className={`text-[10px] ${subText} mt-0.5 truncate`}>
                    {ticket.ticketType} · {ticket.scannedAt}
                  </p>
                </div>
                <span className="bg-[#22C55E]/15 text-[#22C55E] text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider flex-shrink-0">
                  Success
                </span>
              </div>
            ))
          )
        ) : (
          filteredFailed.length === 0 ? (
            <p className={`text-sm text-center py-12 ${subText}`}>No failed scans in this session.</p>
          ) : (
            filteredFailed.map((item, i) => {
              const canClick = !!item.ticket
              const badgeStyle =
                item.reason === 'cancelled'
                  ? 'bg-[#F59E0B]/15 text-[#F59E0B]'
                  : item.reason === 'invalid'
                  ? 'bg-[#6B7280]/15 text-[#9CA3AF]'
                  : 'bg-[#EF4444]/15 text-[#EF4444]'
              const badgeLabel =
                item.reason === 'cancelled' ? 'Cancelled' : item.reason === 'invalid' ? 'Invalid' : 'Duplicate'
              const ordinal = (n: number) => {
                const s = n + 1
                const sfx = s === 1 ? 'st' : s === 2 ? 'nd' : s === 3 ? 'rd' : 'th'
                return `${s}${sfx} scan`
              }
              const shortId = item.rawCode
                ? (item.rawCode.length > 8 ? item.rawCode.slice(-8).toUpperCase() : item.rawCode.toUpperCase())
                : 'UNKNOWN'

              return canClick ? (
                <div
                  key={i}
                  className="px-4 py-4 border-b flex items-center text-left w-full min-h-[70px]"
                  style={{ borderColor: dark ? '#1A1A1A' : '#F2F2F2' }}
                >
                  <span className={`text-xs font-mono font-bold ${subText}`} style={{ width: 85, flexShrink: 0 }}>
                    #{shortId}
                  </span>
                  <div className="flex-1 min-w-0 pr-2">
                    <span className={`text-sm font-bold block truncate ${text}`}>{item.ticket!.attendee}</span>
                    <p className={`text-[10px] ${subText} mt-0.5 truncate`}>
                      {item.ticket!.ticketType} · {ordinal(item.attemptNumber)}
                    </p>
                    {item.reason === 'duplicate' && item.ticket!.scannedAt && (
                      <p className={`text-[10px] text-[#EF4444]/75 mt-0.5 truncate`}>
                        1st scan: {item.ticket!.scannedAt}
                      </p>
                    )}
                  </div>
                  <span className={`${badgeStyle} text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider flex-shrink-0`}>
                    {badgeLabel}
                  </span>
                </div>
              ) : (
                <div
                  key={i}
                  className="px-4 py-4 border-b flex items-center text-left w-full min-h-[64px]"
                  style={{ borderColor: dark ? '#1A1A1A' : '#F2F2F2' }}
                >
                  <span className={`text-xs font-mono font-bold ${subText}`} style={{ width: 85, flexShrink: 0 }}>
                    #{shortId}
                  </span>
                  <div className="flex-1 min-w-0 pr-2">
                    <span className={`text-sm font-bold block ${text}`}>Unknown Ticket</span>
                    <p className={`text-[10px] ${subText} mt-0.5`}>
                      {ordinal(item.attemptNumber)} · Not found
                    </p>
                  </div>
                  <span className="bg-[#6B7280]/15 text-[#9CA3AF] text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider flex-shrink-0">
                    Invalid
                  </span>
                </div>
              )
            })
          )
        )}
      </div>

      {/* Floating/Sticky Action Buttons */}
      <div className={`px-4 py-4 border-t ${navBg} safe-bottom`}>
        {onGenerateTicket && (
          <motion.button
            onClick={onGenerateTicket}
            whileTap={{ scale: 0.96 }}
            className="w-full text-white text-sm font-black py-3.5 rounded-2xl flex items-center justify-center gap-2 mb-3"
            style={{
              background: 'linear-gradient(135deg, #6366F1, #4338CA)',
              boxShadow: '0 4px 18px rgba(99,102,241,0.35)',
              willChange: 'transform',
              height: '50px'
            }}
          >
            🎟️ GENERATE TICKET
          </motion.button>
        )}
        <motion.button
          onClick={onScan}
          whileTap={{ scale: 0.96 }}
          className="w-full bg-[#A855F7] text-white text-base font-black py-4.5 rounded-2xl flex items-center justify-center gap-2"
          style={{ 
            boxShadow: '0 6px 24px rgba(168,85,247,0.35)', 
            willChange: 'transform',
            height: '56px'
          }}
        >
          📷 SCAN TICKET
        </motion.button>
      </div>
    </div>
  )
}
