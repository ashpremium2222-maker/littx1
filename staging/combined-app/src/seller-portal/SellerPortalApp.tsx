import React, { useState, useEffect } from 'react'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'

export interface PartnerOption {
  id: string
  name: string
  defaultPass: string
}

export const PARTNERS: PartnerOption[] = [
  { id: 'littlane', name: 'Littlane Entertainment', defaultPass: 'littlane-pass-2026' },
  { id: 'nitro', name: 'Nitro Events', defaultPass: 'nitro-pass-2026' },
  { id: '7th-heaven', name: '7th Heaven', defaultPass: 'heaven-pass-2026' },
]

interface PartnerSessionData {
  id: string
  name: string
  boundIp?: string | null
  registeredDeviceId?: string | null
  webauthnCredentialId?: string | null
  sessionVersion?: number
}

export default function SellerPortalApp() {
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('littlane')
  const [passwordInput, setPasswordInput] = useState<string>('')
  
  const [authenticatedPartner, setAuthenticatedPartner] = useState<PartnerSessionData | null>(() => {
    try {
      const saved = localStorage.getItem('littx_seller_partner')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  const [token, setToken] = useState<string | null>(() => localStorage.getItem('littx_seller_token'))
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState<boolean>(false)
  const [webauthnStatus, setWebauthnStatus] = useState<string | null>(null)

  // Dynamic events & tiers
  const [eventsList, setEventsList]     = useState<any[]>([])
  const [selectedEventObj, setSelectedEventObj] = useState<any>(null)
  const [selectedTierObj, setSelectedTierObj]   = useState<any>(null)

  // Ticket generation form state
  const [event, setEvent]       = useState('FRESHERS TAKEOVER')
  const [ticketType, setTicketType] = useState('Male Pass')
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [phone, setPhone]       = useState('')
  const [gender, setGender]     = useState('male')
  const [quantity, setQuantity] = useState('1')
  const [amount, setAmount]     = useState('699')

  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback]     = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  const currentPartner = PARTNERS.find((p) => p.id === selectedPartnerId) || PARTNERS[0]

  // Android PWA install listener
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstallApp = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
    }
  }

  // Fetch dynamic events on mount and poll every 5s so /admin edits sync everywhere in real time
  useEffect(() => {
    const loadEvents = () => {
      fetch('/api/events')
        .then(r => r.json())
        .then(d => {
          if (d.success && Array.isArray(d.events) && d.events.length > 0) {
            setEventsList(d.events)
            // If current selected event no longer exists, select first event
            setEvent((prevEvent) => {
              const exists = d.events.some((e: any) => e.name === prevEvent)
              if (!exists) {
                const first = d.events[0]
                setSelectedEventObj(first)
                if (first.tiers?.length > 0) {
                  setSelectedTierObj(first.tiers[0])
                  setTicketType(first.tiers[0].name)
                  setAmount(String(first.tiers[0].price * (parseInt(quantity, 10) || 1)))
                }
                return first.name
              }
              return prevEvent
            })
          }
        })
        .catch(() => {})
    }

    loadEvents()
    const timer = setInterval(loadEvents, 4000)
    return () => clearInterval(timer)
  }, [quantity])

  const handleEventChange = (evtName: string) => {
    setEvent(evtName)
    const evt = eventsList.find((e: any) => e.name === evtName)
    if (evt) {
      setSelectedEventObj(evt)
      if (evt.tiers?.length > 0) {
        const t = evt.tiers[0]
        setSelectedTierObj(t); setTicketType(t.name)
        setAmount(String(t.price * (parseInt(quantity, 10) || 1)))
      }
    }
  }
  const handleTierChange = (tierName: string) => {
    setTicketType(tierName)
    const t = selectedEventObj?.tiers?.find((t: any) => t.name === tierName)
    if (t) { setSelectedTierObj(t); setAmount(String(t.price * (parseInt(quantity, 10) || 1))) }
  }
  const handleQuantityChange = (val: string) => {
    setQuantity(val)
    if (selectedTierObj) setAmount(String(selectedTierObj.price * (parseInt(val, 10) || 1)))
  }

  // Silent session re-validation on app load / refresh
  // STRICT LIFETIME PERSISTENCE: Sellers stay logged in across refreshes & cold starts.
  // ONLY log out if explicitly kicked by admin (kickedByAdmin / adminReset).
  useEffect(() => {
    const existingToken = localStorage.getItem('littx_seller_token')
    const cachedPartnerStr = localStorage.getItem('littx_seller_partner')
    if (!cachedPartnerStr) return

    let cachedPartner: any = null
    try {
      cachedPartner = JSON.parse(cachedPartnerStr)
    } catch {
      return
    }

    const verifySession = async () => {
      try {
        const res = await fetch('/api/seller/verify-session', {
          headers: {
            'x-seller-token': existingToken || '',
            'x-partner-id': cachedPartner.id || ''
          }
        })
        const data = await res.json()

        if (data.kickedByAdmin || data.adminReset) {
          // Explicit admin kick: purge local session and logout
          console.warn('[Seller] Kicked by admin, logging out...', data.message)
          localStorage.removeItem('littx_seller_token')
          localStorage.removeItem('littx_seller_partner')
          setAuthenticatedPartner(null)
          setToken(null)
        } else if (data.success && data.partner) {
          setAuthenticatedPartner(data.partner)
          localStorage.setItem('littx_seller_partner', JSON.stringify(data.partner))
          if (data.token) {
            setToken(data.token)
            localStorage.setItem('littx_seller_token', data.token)
          }
        }
        // ANY OTHER RESPONSE OR ERROR: DO NOT LOG OUT!
      } catch (err) {
        console.warn('[Seller] Session check pending connection...', err)
      }
    }

    verifySession()
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    setWebauthnStatus(null)
    setLoginLoading(true)

    try {
      // Step 1: Validate Password & Get WebAuthn Options
      const step1Res = await fetch('/api/seller/login-step1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: selectedPartnerId, password: passwordInput })
      })

      const step1Data = await step1Res.json()

      if (!step1Res.ok || !step1Data.success) {
        setLoginError(step1Data.message || 'Password authentication failed.')
        setLoginLoading(false)
        return
      }

      let webauthnResponse: any = null

      if (step1Data.isRegistration) {
        // FIRST LOGIN: Bind device WebAuthn Passkey
        setWebauthnStatus('🔑 Registering Hardware Device Passkey... Touch TouchID / FaceID / YubiKey')
        try {
          webauthnResponse = await startRegistration({ optionsJSON: step1Data.options })
        } catch (err: any) {
          console.error('WebAuthn Registration Error:', err)
          setLoginError(`Device Binding Failed: ${err.message || 'User cancelled or device unsupported'}`)
          setLoginLoading(false)
          setWebauthnStatus(null)
          return
        }
      } else {
        // RECURRING LOGIN: Verify WebAuthn Hardware Passkey Signature
        setWebauthnStatus('🔒 Verifying Hardware Passkey Device Signature...')
        try {
          webauthnResponse = await startAuthentication({ optionsJSON: step1Data.options })
        } catch (err: any) {
          console.error('WebAuthn Authentication Error:', err)
          setLoginError('ACCESS DENIED: WebAuthn Device Credential Mismatch. This device is not the registered passkey hardware.')
          setLoginLoading(false)
          setWebauthnStatus(null)
          return
        }
      }

      // Step 2: Send WebAuthn Response to Server for Cryptographic Signature Verification
      setWebauthnStatus('🛡️ Verifying Cryptographic Proof on Server...')
      const step2Res = await fetch('/api/seller/login-step2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: selectedPartnerId, response: webauthnResponse })
      })

      const step2Data = await step2Res.json()

      if (step2Res.ok && step2Data.success) {
        setAuthenticatedPartner(step2Data.partner)
        setToken(step2Data.token)
        localStorage.setItem('littx_seller_token', step2Data.token)
        localStorage.setItem('littx_seller_partner', JSON.stringify(step2Data.partner))
        setPasswordInput('')
      } else {
        setLoginError(step2Data.message || 'ACCESS DENIED: WebAuthn device verification failed.')
      }
    } catch (err) {
      setLoginError('Network error connecting to authentication server.')
    } finally {
      setLoginLoading(false)
      setWebauthnStatus(null)
    }
  }



  const handleGenerateTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email) {
      setFeedback({ type: 'error', msg: 'Name and Email are required.' })
      return
    }

    setSubmitting(true)
    setFeedback(null)

    try {
      const activeToken = localStorage.getItem('littx_seller_token') || token || ''
      const res = await fetch('/api/admin/generate-ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-seller-token': activeToken,
          'x-admin-key': 'dash-2026'
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          gender,
          quantity: parseInt(quantity, 10) || 1,
          amount: parseFloat(amount) || 0,
          event,
          generatedBy: authenticatedPartner?.name,
          partnerId: authenticatedPartner?.id
        })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          msg: `🎉 Ticket successfully generated for ${name}! Sent to ${email}.`
        })
        // Reset form
        setName('')
        setEmail('')
        setPhone('')
      } else {
        setFeedback({ type: 'error', msg: data.message || 'Failed to generate ticket.' })
      }
    } catch (err) {
      setFeedback({ type: 'error', msg: 'Network error generating ticket.' })
    } finally {
      setSubmitting(false)
    }
  }

  // LOGIN SCREEN
  if (!authenticatedPartner) {
    return (
      <div className="container-fluid min-vh-100 bg-dark text-white d-flex flex-column align-items-center justify-content-center p-3 p-sm-4">
        <div className="card bg-slate-900 border-secondary rounded-4 p-4 p-sm-5 shadow-lg w-100" style={{ maxWidth: '440px' }}>
          <div className="d-flex align-items-center justify-content-center gap-2 mb-4">
            <img src="/logo.png" alt="LITTX Logo" className="img-fluid" style={{ height: '32px' }} />
            <span className="h5 mb-0 fw-extrabold text-violet-400 tracking-wider">SELLER PORTAL</span>
          </div>

          <div className="badge bg-purple-900 text-purple-300 border border-purple-700 text-uppercase tracking-widest py-2 px-3 rounded-3 mb-3 w-100 text-wrap text-center" style={{ fontSize: '10px' }}>
            🔐 WEBAUTHN HARDWARE DEVICE LOCK ACTIVE
          </div>

          <h2 className="h5 font-bold text-center mb-1">Partner Authentication</h2>
          <p className="small text-secondary text-center mb-4">Select organization, enter password & verify registered Passkey</p>

          {loginError && (
            <div className="alert alert-danger border-2 text-center p-3 rounded-3 mb-4 small">
              <strong className="d-block text-danger mb-1">⛔ ACCESS DENIED</strong>
              {loginError}
            </div>
          )}

          {webauthnStatus && (
            <div className="alert alert-info border-info text-center p-3 rounded-3 mb-4 small animate-pulse">
              {webauthnStatus}
            </div>
          )}

          <form onSubmit={handleLogin} className="row g-3">
            <div className="col-12">
              <label className="form-label text-uppercase small text-secondary fw-semibold">Select Partner</label>
              <div className="d-grid gap-2">
                {PARTNERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPartnerId(p.id)
                      setLoginError(null)
                    }}
                    className={`btn d-flex align-items-center justify-between p-3 text-start rounded-3 transition-all ${
                      selectedPartnerId === p.id
                        ? 'btn-outline-primary bg-primary-subtle text-white border-primary'
                        : 'btn-outline-secondary text-secondary'
                    }`}
                  >
                    <span>{p.name}</span>
                    {selectedPartnerId === p.id && <span className="badge bg-primary text-white ms-auto">Selected</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="col-12">
              <label className="form-label text-uppercase small text-secondary fw-semibold">
                {currentPartner.name} Password
              </label>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder={`Enter password for ${currentPartner.name}`}
                className="form-control form-control-lg bg-dark text-white border-secondary rounded-3 text-sm"
              />
            </div>

            <div className="col-12">
              <button
                type="submit"
                disabled={loginLoading}
                className="btn btn-primary btn-lg w-100 fw-bold py-3 text-sm shadow-sm"
              >
                {loginLoading ? 'Verifying Passkey Device...' : '🔐 Log In & Verify Hardware Passkey'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // AUTHENTICATED SELLER PORTAL — NO LOGOUT BUTTON ANYWHERE (PER SPEC)
  return (
    <div className="min-vh-100 bg-dark text-white d-flex flex-column">
      {/* Header */}
      <header className="border-bottom border-secondary bg-dark-subtle px-3 px-sm-4 py-3 d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-2">
          <img src="/logo.png" alt="LITTX Logo" className="img-fluid" style={{ height: '24px' }} />
          <span className="fw-black small tracking-wider text-violet-400">SELLER PORTAL</span>
        </div>

        <div className="d-flex align-items-center gap-2">
          {deferredPrompt && (
            <button
              onClick={handleInstallApp}
              className="btn btn-sm btn-outline-success rounded-pill fw-bold text-xs"
            >
              📱 Install App
            </button>
          )}

          <div className="badge bg-primary-subtle text-primary border border-primary px-3 py-2 rounded-pill fw-semibold">
            <span className="spinner-grow spinner-grow-sm text-success me-1" style={{ width: '8px', height: '8px' }}></span>
            {authenticatedPartner.name}
          </div>

          {authenticatedPartner.webauthnCredentialId && (
            <div className="d-none d-md-flex text-muted small bg-dark border border-secondary px-3 py-1.5 rounded-3 align-items-center gap-2">
              <span>🔐 WebAuthn Bound</span>
              <span>•</span>
              <span className="font-monospace text-info">{authenticatedPartner.registeredDeviceId || 'Passkey Device'}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content — Ticket Generator Only */}
      <main className="flex-grow-1 container py-4 px-3 d-flex flex-column justify-content-center" style={{ maxWidth: '600px' }}>
        <div className="card bg-slate-900 border-secondary rounded-4 p-4 p-sm-5 shadow-lg">
          <div>
            <div className="badge bg-info-subtle text-info border border-info uppercase text-xs mb-2">
              HARDWARE WEBAUTHN BOUND PORTAL
            </div>
            <h1 className="text-2xl font-black text-white">Generate Partner Ticket</h1>
            <p className="text-xs text-slate-400">
              Issuing on behalf of <strong className="text-violet-400">{authenticatedPartner.name}</strong>
            </p>
          </div>

          {feedback && (
            <div
              className={`p-4 rounded-xl text-xs font-semibold ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                  : 'bg-red-500/10 border border-red-500/30 text-red-400'
              }`}
            >
              {feedback.msg}
            </div>
          )}

          <form onSubmit={handleGenerateTicket} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">Select Event</label>
              <select
                value={event}
                onChange={(e) => handleEventChange(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500"
              >
                {eventsList.length > 0 ? (
                  eventsList.map((e: any) => <option key={e.id || e.name} value={e.name}>{e.name}</option>)
                ) : (
                  <>
                    <option value="FRESHERS TAKEOVER">FRESHERS TAKEOVER</option>
                    <option value="AURA GENESIS">AURA GENESIS</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">Attendee Full Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Rahul Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">Attendee Email *</label>
                <input
                  type="email"
                  required
                  placeholder="rahul@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">Attendee Phone</label>
                <input
                  type="tel"
                  placeholder="9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">Pass Category / Tier</label>
                <select
                  value={ticketType}
                  onChange={(e) => handleTierChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  {selectedEventObj?.tiers?.length > 0 ? (
                    selectedEventObj.tiers.map((t: any, i: number) => (
                      <option key={i} value={t.name}>{t.name} {t.price > 0 ? `(₹${t.price})` : '(FREE)'}</option>
                    ))
                  ) : (
                    <>
                      <option value="Male Pass">Male Pass (₹699)</option>
                      <option value="Female Pass">Female Pass (₹599)</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">Quantity</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={quantity}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Total Payable Amount</span>
              <span className="text-lg font-black text-emerald-400">₹{amount}</span>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold py-3.5 px-4 rounded-xl text-sm transition-all shadow-lg shadow-violet-600/30 flex items-center justify-center gap-2"
            >
              {submitting ? (
                'Generating Ticket...'
              ) : (
                <>
                  <span>✨ Generate & Issue Pass</span>
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
