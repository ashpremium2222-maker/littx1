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
        onGenerateTicket={() => go({ name: 'generate' })}
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
  const [sellerId, setSellerId] = useState<string | null>(() => sessionStorage.getItem('littx_seller_id'))
  const [sellerToken, setSellerToken] = useState<string | null>(() => sessionStorage.getItem('littx_seller_token'))
  const [verified, setVerified] = useState(false)
  const [checking, setChecking] = useState(true)

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
