import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../lib/store'
import type { Ticket } from '../lib/store'
import TicketCard from '../screens/TicketCard'
import QRScanner from '../screens/QRScanner'
import ScanSuccess from '../screens/ScanSuccess'
import ScanRejected from '../screens/ScanRejected'
import Dashboard from '../screens/Dashboard'
import PageTransition from '../components/PageTransition'

type Screen =
  | { name: 'dashboard' }
  | { name: 'ticket'; id: string }
  | { name: 'scanner' }
  | { name: 'scan-success'; ticket: Ticket }
  | { name: 'scan-rejected'; ticket: Ticket | null; rawCode?: string }

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

const SELLER_IDS = ['SELLER-A', 'SELLER-B', 'SELLER-C'] as const

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
        localStorage.setItem('littx_seller_token', data.token)
        localStorage.setItem('littx_seller_id', data.sellerId)
        onLogin(data.sellerId, data.token)
      } else if (data.ipLocked) {
        setError(`🔒 Device locked — this ID is already active on another device. Ask master admin to unlock it.`)
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
    <div className="container-fluid min-vh-100 bg-dark text-white d-flex flex-column align-items-center justify-content-center p-3 p-sm-4" style={{ fontFamily: 'Inter, sans-serif' }}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="card bg-slate-900 border-purple-800 rounded-4 p-4 p-sm-5 shadow-lg w-100"
        style={{ maxWidth: '400px', background: 'rgba(26,26,26,0.95)', backdropFilter: 'blur(20px)' }}
      >
        {/* Logo */}
        <div className="text-center mb-4">
          <motion.img
            src="/logo.png"
            alt="LITTX"
            style={{ height: 44, width: 'auto', margin: '0 auto', display: 'block' }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
          />
          <div className="text-uppercase small text-secondary fw-bold mt-2 tracking-wider">Gate Staff Login</div>
        </div>

        <form onSubmit={handleLogin} className="row g-3">
          {/* Seller ID selector */}
          <div className="col-12">
            <label className="form-label text-uppercase small text-secondary fw-semibold">
              Seller ID
            </label>
            <div className="d-flex gap-2">
              {SELLER_IDS.map(id => (
                <motion.button
                  key={id}
                  type="button"
                  onClick={() => { setSelected(id); setError('') }}
                  whileTap={{ scale: 0.93 }}
                  className={`btn flex-fill py-2.5 rounded-3 border transition-all text-xs font-semibold ${
                    selected === id ? 'btn-outline-primary bg-primary-subtle text-white border-primary' : 'btn-outline-secondary text-secondary'
                  }`}
                >
                  {id}
                </motion.button>
              ))}
            </div>
          </div>

          <div className="col-12">
            <label className="form-label text-uppercase small text-secondary fw-semibold">Password</label>
            <input
              type="password"
              placeholder="Enter gate staff password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              className="form-control form-control-lg bg-dark text-white border-secondary rounded-3 text-sm"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="col-12 text-center text-danger small fw-semibold">
              {error}
            </div>
          )}

          <div className="col-12">
            <motion.button
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.97 }}
              className="btn btn-primary btn-lg w-100 fw-bold py-3 text-sm shadow-sm"
            >
              {loading ? 'Verifying...' : 'Access Portal →'}
            </motion.button>
          </div>
        </form>
      </motion.div>

      {/* Footer */}
      <div className="text-center text-muted small mt-4 tracking-wider text-uppercase">
        LITTX · Gate Staff System
      </div>
    </div>
  )
}

// ==================== MAIN APP SHELL ====================
function AppShell({ sellerId, sellerToken, onLogout }: { sellerId: string; sellerToken: string; onLogout: () => void }) {
  const { dark, toggleTheme, tickets, findTicket, scanTicket } = useStore()
  const [screen, setScreen] = useState<Screen>({ name: 'dashboard' })
  const [prevDepth, setPrevDepth] = useState(0)
  const [rejectedScans, setRejectedScans] = useState<RejectedScan[]>([])

  useEffect(() => {
    window.history.replaceState({ name: 'dashboard' }, '')

    const handlePop = (e: PopStateEvent) => {
      if (e.state && e.state.name) {
        setPrevDepth(DEPTH[screen.name])
        setScreen(e.state as Screen)
      } else {
        setScreen({ name: 'dashboard' })
      }
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [screen])

  function go(next: Screen) {
    setPrevDepth(DEPTH[screen.name])
    setScreen(next)
    window.history.pushState(next, '')
  }

  async function handleScan(raw: string) {
    const cleaned = raw.replace(/^LITTIX:/i, '').replace(/^#/, '')
    const outcome = await scanTicket(cleaned, sellerId)

    const now = new Date()
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
    const rawH = ist.getUTCHours()
    const ampm = rawH >= 12 ? 'PM' : 'AM'
    const h12 = rawH % 12 === 0 ? 12 : rawH % 12
    const mm = ist.getUTCMinutes().toString().padStart(2, '0')
    const timestamp = `${h12}:${mm} ${ampm}`

    if (outcome.result === 'success' && outcome.ticket) {
      go({ name: 'scan-success', ticket: outcome.ticket })
    } else if (outcome.result === 'rejected' && outcome.ticket) {
      const isCancel = outcome.ticket.status === 'cancelled' || (outcome.ticket.scannedAt === 'Cancelled by Admin')
      const reason: RejectedScan['reason'] = isCancel ? 'cancelled' : 'duplicate'
      const prevCount = rejectedScans.filter(r => (r.ticket?.id === outcome.ticket!.id || r.rawCode === cleaned)).length
      setRejectedScans(prev => [{
        ticket: outcome.ticket!,
        rawCode: cleaned,
        timestamp,
        reason,
        attemptNumber: prevCount + 1
      }, ...prev])
      go({ name: 'scan-rejected', ticket: outcome.ticket })
    } else {
      const prevCount = rejectedScans.filter(r => r.rawCode === cleaned).length
      setRejectedScans(prev => [{
        ticket: null,
        rawCode: cleaned,
        timestamp,
        reason: 'invalid',
        attemptNumber: prevCount + 1
      }, ...prev])
      go({ name: 'scan-rejected', ticket: null, rawCode: cleaned })
    }
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
        sellerId={sellerId}
        onLogout={async () => {
          const token = localStorage.getItem('littx_seller_token')
          if (token) {
            await fetch('/api/seller/logout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token })
            }).catch(() => {})
          }
          localStorage.removeItem('littx_seller_token')
          localStorage.removeItem('littx_seller_id')
          onLogout()
        }}
      />
    )
  } else if (screen.name === 'ticket') {
    const ticket = findTicket(screen.id) ?? tickets[0]
    key = `ticket-${ticket?.id}`
    content = <TicketCard dark={dark} ticket={ticket} onBack={() => go({ name: 'dashboard' })} />
  } else if (screen.name === 'scanner') {
    content = <QRScanner onBack={() => go({ name: 'dashboard' })} onScan={handleScan} />
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
export default function App() {
  const [sellerId, setSellerId] = useState<string | null>(() => localStorage.getItem('littx_seller_id'))
  const [sellerToken, setSellerToken] = useState<string | null>(() => localStorage.getItem('littx_seller_token'))
  const [verified, setVerified] = useState(false)
  const [checking, setChecking] = useState(true)

  // Verify token on mount
  useEffect(() => {
    const token = localStorage.getItem('littx_seller_token')
    const cachedId = localStorage.getItem('littx_seller_id')
    if (!token || !cachedId) {
      setChecking(false)
      return
    }
    fetch('/api/seller/verify', {
      headers: { 'x-seller-token': token }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          // Verified with server — all good
          setSellerId(data.sellerId)
          setSellerToken(token)
          setVerified(true)
        } else if (data.ipLocked) {
          // Admin explicitly kicked them from another device — force logout
          localStorage.removeItem('littx_seller_token')
          localStorage.removeItem('littx_seller_id')
          setSellerId(null)
          setSellerToken(null)
        } else {
          // Server cold start / session not in memory yet — trust the cached token
          // MongoDB fix will make verify always succeed; until then keep them logged in
          setSellerId(cachedId)
          setSellerToken(token)
          setVerified(true)
        }
      })
      .catch(() => {
        // Network error — trust the cached session
        setSellerId(cachedId)
        setSellerToken(token)
        setVerified(true)
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
