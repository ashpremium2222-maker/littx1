import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../lib/store'
import type { Ticket } from '../lib/store'
import TicketCard from '../screens/TicketCard'
import QRScanner from '../screens/QRScanner'
import ScanSuccess from '../screens/ScanSuccess'
import ScanRejected from '../screens/ScanRejected'
import Dashboard from '../screens/Dashboard'
import GenerateTicket from '../screens/GenerateTicket'
import PageTransition from '../components/PageTransition'

type Screen =
  | { name: 'dashboard' }
  | { name: 'generate' }
  | { name: 'ticket'; id: string }
  | { name: 'scanner' }
  | { name: 'scan-success'; ticket: Ticket }
  | { name: 'scan-rejected'; ticket: Ticket | null; rawCode?: string }

type ScannerFeedback = {
  status: 'success' | 'rejected' | 'invalid'
  title: string
  message: string
  code?: string
  entry?: ScannerHistoryEntry
}

export interface RejectedScan {
  ticket: Ticket | null
  rawCode?: string
  timestamp: string
  reason: 'duplicate' | 'cancelled' | 'invalid'
  attemptNumber: number
}

const DEPTH: Record<Screen['name'], number> = {
  dashboard: 0,
  generate: 1,
  ticket: 1,
  scanner: 1,
  'scan-success': 2,
  'scan-rejected': 2,
}

const SELLER_IDS = ['littlane', '7th-heaven', 'nitro'] as const

type DirectScannerTab = 'scanner' | 'history' | 'profile'
type HistoryTab = 'approved' | 'rejected'
type ScannerHistoryStatus = 'approved' | 'duplicate' | 'cancelled' | 'invalid'

type ScannerHistoryEntry = {
  id: string
  ticketId: string
  status: ScannerHistoryStatus
  attendee: string
  event: string
  ticketType: string
  generatedAt: string
  scannedAt: string
  originalScanAt?: string
  scannedBy: string
  rawCode?: string
  attemptNumber: number
  message: string
}

const SCANNER_HISTORY_KEY = 'littix-direct-scanner-history-v1'

function formatScanTime(date = new Date()) {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const rawH = ist.getUTCHours()
  const ampm = rawH >= 12 ? 'PM' : 'AM'
  const h12 = rawH % 12 === 0 ? 12 : rawH % 12
  const mm = ist.getUTCMinutes().toString().padStart(2, '0')
  return `${months[ist.getUTCMonth()]} ${ist.getUTCDate()}, ${h12}:${mm} ${ampm}`
}

function loadScannerHistory(): ScannerHistoryEntry[] {
  try {
    const raw = localStorage.getItem(SCANNER_HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function DirectScannerExperience({
  sellerId,
  rejectedScans,
  scannerFeedback,
  scannerHistory,
  scannerCycle,
  onScan,
  onScanNext,
}: {
  sellerId: string
  rejectedScans: RejectedScan[]
  scannerFeedback: ScannerFeedback | null
  scannerHistory: ScannerHistoryEntry[]
  scannerCycle: number
  onScan: (raw: string) => Promise<void>
  onScanNext: () => void
}) {
  const [tab, setTab] = useState<DirectScannerTab>('scanner')
  const [historyTab, setHistoryTab] = useState<HistoryTab>('approved')

  const approvedHistory = scannerHistory.filter((entry) => entry.status === 'approved')
  const rejectedHistory = scannerHistory.filter((entry) => entry.status !== 'approved')

  function selectTab(next: DirectScannerTab) {
    setTab(next)
    if (next === 'scanner') onScanNext()
  }

  const glass = {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
    backdropFilter: 'blur(28px)',
    WebkitBackdropFilter: 'blur(28px)',
    boxShadow: '0 18px 70px rgba(0,0,0,0.38), inset 0 1px 1px rgba(255,255,255,0.14)',
  } as const

  const navItems: Array<{ id: DirectScannerTab; label: string; icon: string }> = [
    { id: 'scanner', label: 'Scanner', icon: 'qr_code_scanner' },
    { id: 'history', label: 'Scanner History', icon: 'confirmation_number' },
    { id: 'profile', label: 'Profile', icon: 'person' },
  ]

  const shellBg = 'radial-gradient(760px 440px at 50% -12%, rgba(0,122,255,0.22), transparent 66%), radial-gradient(560px 360px at 100% 92%, rgba(0,180,255,0.12), transparent 68%), linear-gradient(180deg, #07111b 0%, #05090d 48%, #020405 100%)'

  return (
    <div className="min-h-screen w-full text-white relative overflow-hidden" style={{ background: shellBg, fontFamily: '"Hanken Grotesk", Inter, sans-serif' }}>
      <AnimatePresence mode="wait" initial={false}>
        {tab === 'scanner' && (
          <motion.div
            key="direct-scanner"
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.22 }}
          >
            <QRScanner
              key={`direct-scanner-${scannerCycle}`}
              onBack={() => {}}
              onScan={onScan}
              showBack={false}
              premium={true}
              scanFeedback={scannerFeedback}
              onScanNext={onScanNext}
              rejectedScans={rejectedScans}
            />
          </motion.div>
        )}

        {tab === 'history' && (
          <motion.div
            key="direct-history"
            className="min-h-screen px-5 pt-8 pb-36 max-w-[520px] mx-auto"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            <div className="flex items-center justify-between mb-16">
              <div className="w-12 h-12" />
              <img src="/logo.png" alt="LITTX" className="h-8 w-auto" />
              <button className="w-12 h-12 rounded-full border border-white/10 bg-white/5 backdrop-blur-2xl flex items-center justify-center text-white/70 active:scale-95 transition-transform" aria-label="Search history">
                <span className="material-symbols-outlined">search</span>
              </button>
            </div>

            <h1 className="text-[42px] leading-none font-black tracking-tight mb-3">Scan History</h1>
            <p className="text-white/55 text-sm mb-6">Review real ticket processing logs.</p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {(['approved', 'rejected'] as const).map((kind) => {
                const active = historyTab === kind
                return (
                  <motion.button
                    key={kind}
                    onClick={() => setHistoryTab(kind)}
                    whileTap={{ scale: 0.96 }}
                    className={`rounded-2xl py-3 px-4 border flex items-center justify-center gap-2 uppercase tracking-[0.18em] text-[12px] font-bold ${active ? 'text-[#61A8FF] border-[#007AFF]/45' : 'text-white/45 border-white/10'}`}
                    style={glass}
                  >
                    <span className="material-symbols-outlined text-[20px]">{kind === 'approved' ? 'check_circle' : 'cancel'}</span>
                    {kind}
                  </motion.button>
                )
              })}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={historyTab}
                className="relative flex flex-col gap-3"
                initial={{ opacity: 0, x: historyTab === 'approved' ? -8 : 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: historyTab === 'approved' ? 8 : -8 }}
                transition={{ duration: 0.18 }}
              >
                <div className="absolute -top-2 left-5 right-5 h-10 rounded-t-3xl border border-white/10 opacity-40" style={glass} />
                <div className="absolute -top-4 left-10 right-10 h-10 rounded-t-3xl border border-white/10 opacity-20" style={glass} />

                {historyTab === 'approved' && approvedHistory.length === 0 && (
                  <div className="relative rounded-3xl border border-white/10 p-6 text-center text-white/55" style={glass}>
                    No approved tickets yet
                  </div>
                )}

                {historyTab === 'approved' && approvedHistory.map((entry, index) => (
                  <motion.article
                    key={entry.id}
                    className="relative rounded-3xl border border-white/10 p-4 flex items-center gap-4 overflow-hidden"
                    style={glass}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.035, duration: 0.2 }}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(34,197,94,0.1),transparent_55%)]" />
                    <div className="relative w-10 h-10 rounded-full bg-[#22C55E]/12 text-[#22C55E] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[20px]">check</span>
                    </div>
                    <div className="relative min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-[16px] font-bold truncate">{entry.ticketType}</h2>
                        <span className="font-mono text-[11px] text-[#22C55E]/80 shrink-0">#{entry.ticketId}</span>
                      </div>
                      <p className="text-white/50 text-[12px] truncate mt-1">{entry.attendee} · {entry.event}</p>
                      <p className="text-white/40 text-[11px] truncate mt-1">Generated: {entry.generatedAt}</p>
                      <p className="text-white/40 text-[11px] truncate mt-1">Scanned: {entry.scannedAt}</p>
                    </div>
                  </motion.article>
                ))}

                {historyTab === 'rejected' && rejectedHistory.length === 0 && (
                  <div className="relative rounded-3xl border border-white/10 p-6 text-center text-white/55" style={glass}>
                    No rejected tickets yet
                  </div>
                )}

                {historyTab === 'rejected' && rejectedHistory.map((entry, index) => (
                  <motion.article
                    key={entry.id}
                    className="relative rounded-3xl border border-white/10 p-4 flex items-center gap-4 overflow-hidden"
                    style={glass}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.035, duration: 0.2 }}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(239,68,68,0.12),transparent_55%)]" />
                    <div className="relative w-10 h-10 rounded-full bg-[#EF4444]/12 text-[#EF4444] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[20px]">close</span>
                    </div>
                    <div className="relative min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-[16px] font-bold truncate">{entry.ticketType}</h2>
                        <span className="font-mono text-[11px] text-[#EF4444]/80 shrink-0">#{entry.ticketId}</span>
                      </div>
                      <p className="text-white/50 text-[12px] truncate mt-1">{entry.attendee} · {entry.status}</p>
                      <p className="text-white/40 text-[11px] truncate mt-1">Generated: {entry.generatedAt}</p>
                      <p className="text-white/40 text-[11px] truncate mt-1">Scan attempt: {entry.scannedAt}</p>
                      {entry.originalScanAt && (
                        <p className="text-white/40 text-[11px] truncate mt-1">First scanned: {entry.originalScanAt}</p>
                      )}
                    </div>
                  </motion.article>
                ))}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}

        {tab === 'profile' && (
          <motion.div
            key="direct-profile"
            className="min-h-screen px-5 pt-8 pb-36 max-w-[520px] mx-auto"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            <div className="flex items-center justify-center mb-16">
              <img src="/logo.png" alt="LITTX" className="h-8 w-auto" />
            </div>
            <h1 className="text-[42px] leading-none font-black tracking-tight mb-8">Profile</h1>
            <div className="rounded-3xl border border-white/10 p-6" style={glass}>
              <div className="w-16 h-16 rounded-full bg-white text-[#06111a] flex items-center justify-center mb-5 shadow-[0_0_28px_rgba(255,255,255,0.22)]">
                <span className="material-symbols-outlined text-[30px]">person</span>
              </div>
              <p className="text-white/45 text-xs uppercase tracking-[0.18em] font-bold mb-2">Scanner Operator</p>
              <h2 className="text-2xl font-black mb-5">{sellerId}</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <p className="text-2xl font-black text-[#22C55E]">{approvedHistory.length}</p>
                  <p className="text-white/45 text-xs mt-1">Approved</p>
                </div>
                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <p className="text-2xl font-black text-[#EF4444]">{rejectedHistory.length}</p>
                  <p className="text-white/45 text-xs mt-1">Rejected</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-7 pt-12 bg-gradient-to-t from-[#020405] via-[#020405]/92 to-transparent">
        <div className="mx-auto max-w-[520px] rounded-full border border-white/10 px-2 py-2 flex items-center justify-around" style={glass}>
          {navItems.map((item) => {
            const active = tab === item.id
            return (
              <motion.button
                key={item.id}
                onClick={() => selectTab(item.id)}
                whileTap={{ scale: 0.92 }}
                className={`min-w-0 flex flex-col items-center justify-center rounded-full px-4 py-2 transition-colors ${active ? 'bg-white text-[#06111a]' : 'text-white/55'}`}
                style={active ? { boxShadow: '0 0 26px rgba(255,255,255,0.24)' } : undefined}
                aria-label={item.label}
              >
                <span className="material-symbols-outlined text-[23px]">{item.icon}</span>
                <span className="text-[10px] font-bold mt-1 truncate max-w-[92px]">{item.label}</span>
              </motion.button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

// ==================== SELLER LOGIN SCREEN ====================
function SellerLoginScreen({ onLogin }: { onLogin: (sellerId: string, token: string) => void }) {
  const [selected, setSelected] = useState<string>('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) { setError('Please select a Seller ID'); return }
    if (!password.trim()) { setError('Password is required'); return }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/seller/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId: selected, password: password.trim() })
      })
      const data = await res.json()
      if (data.success) {
        sessionStorage.setItem('littx_seller_token', data.token)
        sessionStorage.setItem('littx_seller_id', data.sellerId)
        onLogin(data.sellerId, data.token)
      } else {
        setError(data.message || 'Login failed')
      }
    } catch {
      setError('Connection error. Make sure the server is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0D0D0D 0%, #1a0a2e 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, sans-serif',
      padding: '20px',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background: 'rgba(26,26,26,0.9)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(168,85,247,0.2)',
          borderRadius: 24,
          padding: '40px 32px',
          width: '100%',
          maxWidth: 380,
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(168,85,247,0.1)',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <motion.img
            src="/logo.png"
            alt="LITTX"
            style={{ height: 44, width: 'auto', margin: '0 auto', display: 'block' }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
          />
          <div style={{
            marginTop: 12,
            fontSize: 11,
            color: '#9a9a9a',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}>Gate Staff Login</div>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Seller ID selector */}
          <div>
            <label style={{ fontSize: 11, color: '#9a9a9a', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: 8 }}>
              Seller ID
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {SELLER_IDS.map(id => (
                <motion.button
                  key={id}
                  type="button"
                  onClick={() => { setSelected(id); setError('') }}
                  whileTap={{ scale: 0.93 }}
                  style={{
                    flex: 1,
                    padding: '12px 8px',
                    borderRadius: 14,
                    border: selected === id ? '2px solid #A855F7' : '1px solid #2A2A2A',
                    background: selected === id ? 'rgba(168,85,247,0.15)' : '#111',
                    color: selected === id ? '#A855F7' : '#888',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: selected === id ? '0 0 20px rgba(168,85,247,0.2)' : 'none',
                  }}
                >
                  {id.charAt(0).toUpperCase() + id.slice(1)}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ fontSize: 11, color: '#9a9a9a', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: 8 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder="Enter access code"
              style={{
                width: '100%',
                background: '#0D0D0D',
                border: '1px solid #2A2A2A',
                borderRadius: 14,
                color: '#fff',
                padding: '14px 16px',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'Inter, sans-serif',
              }}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ color: '#EF4444', fontSize: 12, fontWeight: 600, textAlign: 'center' }}
            >
              {error}
            </motion.div>
          )}

          <motion.button
            type="submit"
            disabled={loading}
            whileTap={{ scale: 0.97 }}
            style={{
              width: '100%',
              background: loading ? '#6B21A8' : 'linear-gradient(135deg, #A855F7, #7C3AED)',
              color: '#fff',
              border: 'none',
              borderRadius: 14,
              padding: '15px',
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 24px rgba(168,85,247,0.35)',
              letterSpacing: '0.5px',
            }}
          >
            {loading ? 'Verifying...' : 'Access Portal →'}
          </motion.button>
        </form>
      </motion.div>

      {/* Footer */}
      <div style={{ marginTop: 20, color: '#444', fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase' }}>
        LITTX · Gate Staff System
      </div>
    </div>
  )
}

// ==================== MAIN APP SHELL ====================
function AppShell({ sellerId, sellerToken, onLogout, forceScanner }: { sellerId: string; sellerToken: string; onLogout: () => void, forceScanner?: boolean }) {
  const { dark, toggleTheme, tickets, findTicket, scanTicket } = useStore()
  const [screen, setScreen] = useState<Screen>({ name: forceScanner ? 'scanner' : 'dashboard' })
  const [prevDepth, setPrevDepth] = useState(0)
  const [rejectedScans, setRejectedScans] = useState<RejectedScan[]>([])
  const [scannerFeedback, setScannerFeedback] = useState<ScannerFeedback | null>(null)
  const [scannerCycle, setScannerCycle] = useState(0)
  const [scannedTickets, setScannedTickets] = useState<Ticket[]>([])
  const [scannerHistory, setScannerHistory] = useState<ScannerHistoryEntry[]>(loadScannerHistory)

  useEffect(() => {
    localStorage.setItem(SCANNER_HISTORY_KEY, JSON.stringify(scannerHistory.slice(0, 100)))
  }, [scannerHistory])

  function recordScannerHistory(entry: ScannerHistoryEntry) {
    setScannerHistory((prev) => [entry, ...prev].slice(0, 100))
  }

  useEffect(() => {
    window.history.replaceState({ name: forceScanner ? 'scanner' : 'dashboard' }, '')

    const handlePop = (e: PopStateEvent) => {
      if (forceScanner) {
        setPrevDepth(DEPTH.scanner)
        setScreen({ name: 'scanner' })
        setScannerFeedback(null)
        return
      }

      if (e.state && e.state.name) {
        setPrevDepth(DEPTH[screen.name])
        setScreen(e.state as Screen)
      } else {
        setScreen({ name: 'dashboard' })
      }
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [screen, forceScanner])

  function go(next: Screen) {
    setPrevDepth(DEPTH[screen.name])
    setScreen(next)
    window.history.pushState(next, '')
  }

  async function handleScan(raw: string) {
    const cleaned = raw.replace(/^LITTIX:/i, '').replace(/^#/, '')
    const outcome = await scanTicket(cleaned, sellerId)

    const timestamp = formatScanTime()

    const buildHistoryEntry = (
      status: ScannerHistoryStatus,
      ticket: Ticket | null,
      message: string,
      attemptNumber: number,
      originalScanAt?: string
    ): ScannerHistoryEntry => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ticketId: ticket?.id || cleaned || 'UNKNOWN',
      status,
      attendee: ticket?.attendee || 'Unknown',
      event: ticket?.event || 'Unknown Ticket',
      ticketType: ticket?.ticketType || 'Unknown Ticket',
      generatedAt: ticket?.generatedAt || 'Not available',
      scannedAt: timestamp,
      originalScanAt,
      scannedBy: sellerId,
      rawCode: cleaned,
      attemptNumber,
      message,
    })

    if (outcome.result === 'success' && outcome.ticket) {
      setScannedTickets(prev => [outcome.ticket!, ...prev])
      const entry = buildHistoryEntry(
        'approved',
        outcome.ticket,
        `${outcome.ticket.attendee} checked in successfully.`,
        1
      )
      recordScannerHistory(entry)
      if (forceScanner) {
        setScannerFeedback({
          status: 'success',
          title: 'Ticket Valid',
          message: `${outcome.ticket.attendee} checked in at ${timestamp}`,
          code: outcome.ticket.id,
          entry
        })
        return
      }
      go({ name: 'scan-success', ticket: outcome.ticket })
    } else if (outcome.result === 'rejected' && outcome.ticket) {
      const isCancel = (outcome.ticket.status as string) === 'cancelled' || (outcome.ticket.scannedAt === 'Cancelled by Admin')
      const reason: RejectedScan['reason'] = isCancel ? 'cancelled' : 'duplicate'
      const prevCount = rejectedScans.filter(r => (r.ticket?.id === outcome.ticket!.id || r.rawCode === cleaned)).length
      const attemptNumber = prevCount + 1
      setRejectedScans(prev => [{
        ticket: outcome.ticket!,
        rawCode: cleaned,
        timestamp,
        reason,
        attemptNumber
      }, ...prev])
      const entry = buildHistoryEntry(
        reason,
        outcome.ticket,
        isCancel ? 'This ticket is cancelled and cannot be used.' : `${outcome.ticket.attendee} was already checked in.`,
        attemptNumber,
        isCancel ? undefined : outcome.ticket.scannedAt
      )
      recordScannerHistory(entry)
      if (forceScanner) {
        setScannerFeedback({
          status: 'rejected',
          title: isCancel ? 'Ticket Cancelled' : 'Already Scanned',
          message: isCancel ? 'This ticket is void and cannot be used.' : `${outcome.ticket.attendee} has already checked in.`,
          code: outcome.ticket.id,
          entry
        })
        return
      }
      go({ name: 'scan-rejected', ticket: outcome.ticket })
    } else {
      const prevCount = rejectedScans.filter(r => r.rawCode === cleaned).length
      const attemptNumber = prevCount + 1
      setRejectedScans(prev => [{
        ticket: null,
        rawCode: cleaned,
        timestamp,
        reason: 'invalid',
        attemptNumber
      }, ...prev])
      const entry = buildHistoryEntry(
        'invalid',
        null,
        'No ticket matches this code.',
        attemptNumber
      )
      recordScannerHistory(entry)
      if (forceScanner) {
        setScannerFeedback({
          status: 'invalid',
          title: 'Ticket Not Found',
          message: 'No ticket matches this code. Check the ID and try again.',
          code: cleaned,
          entry
        })
        return
      }
      go({ name: 'scan-rejected', ticket: null, rawCode: cleaned })
    }
  }

  function resetDirectScanner() {
    setScannerFeedback(null)
    setScreen({ name: 'scanner' })
    setPrevDepth(DEPTH.scanner)
    setScannerCycle((cycle) => cycle + 1)
    window.history.replaceState({ name: 'scanner' }, '')
  }

  if (forceScanner) {
    return (
      <DirectScannerExperience
        sellerId={sellerId}
        rejectedScans={rejectedScans}
        scannerFeedback={scannerFeedback}
        scannerHistory={scannerHistory}
        scannerCycle={scannerCycle}
        onScan={handleScan}
        onScanNext={resetDirectScanner}
      />
    )
  }

  const bg = dark ? 'bg-[#0D0D0D]' : 'bg-[#F9F9FB]'
  const direction: 'forward' | 'back' = DEPTH[screen.name] >= prevDepth ? 'forward' : 'back'

  let content
  let key: string = screen.name

  if (screen.name === 'dashboard') {
    content = (
      <Dashboard
        dark={dark}
        onOpenTicket={(id) => go({ name: 'ticket', id })}
        onScan={() => go({ name: 'scanner' })}
        onToggleTheme={toggleTheme}
        rejectedScans={rejectedScans}
        onGenerateTicket={forceScanner ? undefined : () => go({ name: 'generate' })}
        sellerId={sellerId}
        onLogout={async () => {
          const token = sessionStorage.getItem('littx_seller_token')
          if (token) {
            await fetch('/api/seller/logout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token })
            }).catch(() => {})
          }
          sessionStorage.removeItem('littx_seller_token')
          sessionStorage.removeItem('littx_seller_id')
          onLogout()
        }}
      />
    )
  } else if (screen.name === 'generate') {
    content = (
      <GenerateTicket
        dark={dark}
        onBack={() => go({ name: 'dashboard' })}
        onGenerated={(id) => go({ name: 'ticket', id })}
        sellerId={sellerId}
        sellerToken={sellerToken}
      />
    )
  } else if (screen.name === 'ticket') {
    const ticket = findTicket(screen.id) ?? tickets[0]
    key = `ticket-${ticket?.id}`
    content = <TicketCard dark={dark} ticket={ticket} onBack={() => go({ name: 'dashboard' })} />
  } else if (screen.name === 'scanner') {
    content = (
      <QRScanner
        key={forceScanner ? `direct-scanner-${scannerCycle}` : 'scanner'}
        onBack={() => go({ name: 'dashboard' })}
        onScan={handleScan}
        showBack={!forceScanner}
        scanFeedback={forceScanner ? scannerFeedback : null}
        onScanNext={resetDirectScanner}
        rejectedScans={rejectedScans}
        scannedTickets={scannedTickets}
        sellerId={sellerId}
      />
    )
  } else if (screen.name === 'scan-success') {
    key = `scan-success-${screen.ticket.id}`
    content = (
      <ScanSuccess
        dark={dark}
        ticket={screen.ticket}
        onBack={() => go({ name: 'dashboard' })}
        onScanNext={() => go({ name: 'scanner' })}
      />
    )
  } else if (screen.name === 'scan-rejected') {
    key = `scan-rejected-${screen.ticket?.id ?? screen.rawCode}`
    content = (
      <ScanRejected
        dark={dark}
        ticket={screen.ticket}
        notFoundId={screen.rawCode}
        onBack={() => go({ name: 'dashboard' })}
        onScanNext={() => go({ name: 'scanner' })}
      />
    )
  }

  return (
    <div
      className={`min-h-screen w-full ${bg}`}
      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', userSelect: 'none' }}
    >
      <div className="w-full max-w-[520px] mx-auto min-h-screen relative overflow-hidden">
        <AnimatePresence mode="sync" initial={false}>
          <motion.div key={key} className="w-full absolute inset-x-0 top-0">
            <PageTransition variant={screen.name === 'scanner' ? 'fade' : direction}>{content}</PageTransition>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

// ==================== ROOT: handles seller auth ====================
export default function App({ forceScanner }: { forceScanner?: boolean }) {
  const [sellerId, setSellerId] = useState<string | null>(() => sessionStorage.getItem('littx_seller_id'))
  const [sellerToken, setSellerToken] = useState<string | null>(() => sessionStorage.getItem('littx_seller_token'))
  const [verified, setVerified] = useState(false)
  const [checking, setChecking] = useState(!forceScanner)

  if (forceScanner) {
    return (
      <AppShell
        sellerId="Gate Scanner"
        sellerToken="direct"
        forceScanner={true}
        onLogout={() => {}}
      />
    )
  }

  // Verify token on mount
  useEffect(() => {
    const token = sessionStorage.getItem('littx_seller_token')
    if (!token) {
      setChecking(false)
      return
    }
    fetch('/api/seller/verify', {
      headers: { 'x-seller-token': token }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setSellerId(data.sellerId)
          setSellerToken(token)
          setVerified(true)
        } else {
          sessionStorage.removeItem('littx_seller_token')
          sessionStorage.removeItem('littx_seller_id')
          setSellerId(null)
          setSellerToken(null)
        }
      })
      .catch(() => {
        // Server might be down — allow cached session to proceed
        const cachedId = sessionStorage.getItem('littx_seller_id')
        if (cachedId && token) {
          setSellerId(cachedId)
          setSellerToken(token)
          setVerified(true)
        }
      })
      .finally(() => setChecking(false))
  }, [])

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', background: '#0D0D0D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          style={{ width: 28, height: 28, border: '3px solid #2A2A2A', borderTopColor: '#A855F7', borderRadius: '50%' }}
        />
      </div>
    )
  }

  if (!sellerId || !sellerToken) {
    return (
      <SellerLoginScreen
        onLogin={(id, token) => {
          setSellerId(id)
          setSellerToken(token)
          setVerified(true)
        }}
      />
    )
  }

  return (
    <AppShell
      sellerId={sellerId}
      sellerToken={sellerToken}
      onLogout={() => {
        setSellerId(null)
        setSellerToken(null)
        setVerified(false)
      }}
    />
  )
}
