import React, { useState, useEffect } from 'react'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'

export interface PartnerOption {
  id: string
  name: string
}

export const PARTNERS: PartnerOption[] = [
  { id: 'littlane', name: 'Littlane Entertainment' },
  { id: 'nitro', name: 'Nitro Events' },
  { id: '7th-heaven', name: '7th Heaven' },
  { id: 'partner-slot-1', name: 'Partner Login' },
  { id: 'partner-slot-2', name: 'Partner Login' },
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

  // Ticket generation form state
  const [event, setEvent] = useState('DHOLIDA GARBA ROYALE')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [ticketType, setTicketType] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [passes, setPasses] = useState<Array<{ id: string; name: string; price: number }>>([])
  const [pricingLoading, setPricingLoading] = useState(false)
  const [commissionChoice, setCommissionChoice] = useState('0')
  const [customCommission, setCustomCommission] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [activationNotice, setActivationNotice] = useState(false)
  const [successTicket, setSuccessTicket] = useState<{ id: string; attendee: string; price: string } | null>(null)

  const currentPartner = PARTNERS.find((p) => p.id === selectedPartnerId) || PARTNERS[0]
  const selectedPass = passes.find((pass) => pass.name === ticketType)
  const ticketQuantity = Math.max(1, Math.min(20, Number.parseInt(quantity, 10) || 1))
  const customerTotal = (selectedPass?.price || 0) * ticketQuantity
  const customCommissionValue = Number(customCommission)
  const hasValidCustomCommissionAmount = customCommission.trim() !== '' && Number.isFinite(customCommissionValue)
  const customCommissionAmount = hasValidCustomCommissionAmount ? Math.round(customCommissionValue * 100) / 100 : 0
  const commissionAmount = commissionChoice === 'custom'
    ? customCommissionAmount
    : Math.round(customerTotal * Number(commissionChoice)) / 100
  const commissionPercentage = commissionChoice === 'custom'
    ? (customerTotal > 0 ? (commissionAmount / customerTotal) * 100 : 0)
    : Number(commissionChoice)
  const commissionInvalid = commissionChoice === 'custom'
    ? !hasValidCustomCommissionAmount || customCommissionAmount < 0 || commissionPercentage > 20
    : !Number.isFinite(commissionPercentage) || commissionPercentage < 0 || commissionPercentage > 20
  const rateAfterCommission = customerTotal - commissionAmount
  const displayedCommissionPercentage = Number.isFinite(commissionPercentage)
    ? commissionPercentage.toFixed(2).replace(/\.00$/, '')
    : '0'
  const formatCurrency = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value)

  useEffect(() => {
    if (!authenticatedPartner) return
    const loadPricing = async () => {
      setPricingLoading(true)
      try {
        const activeToken = localStorage.getItem('littx_seller_token') || token || ''
        const response = await fetch(`/api/seller/pricing?event=${encodeURIComponent(event)}`, { headers: { 'x-seller-token': activeToken } })
        const data = await response.json()
        if (response.ok && data.success) {
          setEvent(data.event)
          setPasses(data.passes)
          setTicketType(current => data.passes.some((pass: any) => pass.name === current) ? current : data.passes[0]?.name || '')
        } else {
          setFeedback({ type: 'error', msg: data.message || 'Current pricing is unavailable.' })
        }
      } catch {
        setFeedback({ type: 'error', msg: 'Unable to load current pricing.' })
      } finally {
        setPricingLoading(false)
      }
    }
    loadPricing()
  }, [authenticatedPartner, token])

  // Silent session re-validation on app load / refresh
  // RULE: Log out if session is invalid (401), but keep cached session on network errors.
  useEffect(() => {
    const existingToken = localStorage.getItem('littx_seller_token')
    const cachedPartner = localStorage.getItem('littx_seller_partner')
    if (!existingToken || !cachedPartner) return

    const verifySession = async () => {
      try {
        const res = await fetch('/api/seller/verify-session', {
          headers: { 'x-seller-token': existingToken }
        })
        const data = await res.json()

        if (res.ok && data.success) {
          // Normal: server confirmed session
          setAuthenticatedPartner(data.partner)
          localStorage.setItem('littx_seller_partner', JSON.stringify(data.partner))
        } else {
          // Any failure response (e.g. 401, session invalid, or kicked by admin)
          // Clean state and force logout
          console.warn('[Seller] Session invalid, logging out...', data.message)
          localStorage.removeItem('littx_seller_token')
          localStorage.removeItem('littx_seller_partner')
          setAuthenticatedPartner(null)
          setToken(null)
        }
      } catch (err) {
        // Network/connection error: keep cached session alive, do NOT log out
        console.warn('[Seller] Background session check pending network connection...', err)
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
        if (step1Res.status === 403 && selectedPartnerId.startsWith('partner-slot-')) setActivationNotice(true)
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
        body: JSON.stringify({ partnerId: selectedPartnerId, loginId: step1Data.loginId, response: webauthnResponse })
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

  const handleTicketTypeChange = (newType: string) => {
    setTicketType(newType)
  }

  const handleEventChange = (newEvent: string) => {
    setEvent(newEvent)
  }

  const handleGenerateTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email) {
      setFeedback({ type: 'error', msg: 'Name and Email are required.' })
      return
    }
    if (commissionInvalid) {
      setFeedback({ type: 'error', msg: 'Enter a valid commission amount that is no more than 20% of the official total.' })
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
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          gender: ticketType,
          ticketType,
          quantity: parseInt(quantity, 10) || 1,
          commissionPercentage,
          commissionAmount: commissionChoice === 'custom' ? commissionAmount : undefined,
          event,
          generatedBy: authenticatedPartner?.name,
          partnerId: authenticatedPartner?.id
        })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setSuccessTicket({ id: data.ticket.id, attendee: name, price: data.ticket.price })
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
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        {activationNotice && (
          <div role="dialog" aria-modal="true" aria-labelledby="partner-activation-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-violet-400/30 bg-slate-900 p-6 text-center shadow-2xl">
              <h2 id="partner-activation-title" className="text-lg font-bold">Partner account required</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">This login slot must be created and activated by the Master Admin before it can be used.</p>
              <button type="button" onClick={() => setActivationNotice(false)} className="mt-5 w-full rounded-xl bg-violet-600 py-3 text-sm font-bold text-white">Done</button>
            </div>
          </div>
        )}
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center justify-center gap-3 mb-6">
            <img src="/logo.png" alt="LITTX Logo" className="h-8 w-auto brightness-200" />
            <span className="text-xl font-extrabold tracking-wider text-violet-400">SELLER PORTAL</span>
          </div>

          <div className="inline-block bg-violet-500/10 border border-violet-500/30 text-violet-300 text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-md mb-3 text-center w-full">
            🔐 WEBAUTHN HARDWARE DEVICE LOCK ACTIVE
          </div>

          <h2 className="text-lg font-bold text-center mb-1">Partner Authentication</h2>
          <p className="text-xs text-slate-400 text-center mb-6">Select organization, enter password & verify registered Passkey</p>

          {loginError && (
            <div className="bg-red-500/15 border-2 border-red-500/40 text-red-300 text-xs p-4 rounded-xl mb-6 text-center font-medium leading-relaxed shadow-lg">
              <div className="text-sm font-bold text-red-400 mb-1 flex items-center justify-center gap-1.5">
                <span>⛔</span> ACCESS DENIED
              </div>
              {loginError}
            </div>
          )}

          {webauthnStatus && (
            <div className="bg-indigo-500/15 border border-indigo-500/40 text-indigo-300 text-xs p-3 rounded-xl mb-6 text-center font-medium animate-pulse">
              {webauthnStatus}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">Select Partner</label>
              <div className="grid grid-cols-1 gap-2">
                {PARTNERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPartnerId(p.id)
                      setLoginError(null)
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border text-sm font-medium transition-all ${
                      selectedPartnerId === p.id
                        ? 'border-violet-500 bg-violet-500/10 text-white ring-1 ring-violet-500'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span>{p.name}</span>
                    {selectedPartnerId === p.id && <span className="text-violet-400 text-xs font-bold">● Selected</span>}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
                {currentPartner.name} Password
              </label>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder={`Enter password for ${currentPartner.name}`}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-lg shadow-violet-600/25 flex items-center justify-center gap-2"
            >
              {loginLoading ? (
                'Verifying Passkey Device...'
              ) : (
                <>
                  <span>🔐 Log In & Verify Hardware Passkey</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // AUTHENTICATED SELLER PORTAL — NO LOGOUT BUTTON ANYWHERE (PER SPEC)
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="LITTX Logo" className="h-6 w-auto brightness-200" />
          <span className="font-black text-sm tracking-wider text-violet-400">SELLER PORTAL</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-violet-500/10 border border-violet-500/30 text-violet-300 text-xs px-3 py-1.5 rounded-full font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            {authenticatedPartner.name}
          </div>

          {/* Read-only Device & Passkey Lock Indicator */}
          {authenticatedPartner.webauthnCredentialId && (
            <div className="hidden sm:flex text-[11px] text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg items-center gap-1.5">
              <span>🔐 WebAuthn Bound</span>
              <span className="text-slate-500">•</span>
              <span className="font-mono text-violet-400">{authenticatedPartner.registeredDeviceId || 'Passkey Device'}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content — Ticket Generator Only */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-center">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div>
            <div className="inline-block bg-indigo-500/10 text-indigo-400 text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-md mb-2">
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
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">Event</label>
              <div className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-semibold">
                DHOLIDA GARBA ROYALE — 17 Oct 2026 · Pethkar Ground, Kothrud, Pune
              </div>
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

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">Pass Type</label>
              <div className="grid grid-cols-2 gap-2">
                {passes.map((pass) => (
                  <button
                    key={pass.id}
                    type="button"
                    onClick={() => handleTicketTypeChange(pass.name)}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                      ticketType === pass.name
                        ? 'border-violet-500 bg-violet-500/15 text-violet-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {pass.name}
                    <div className={`text-[10px] mt-0.5 ${
                      ticketType === pass.name ? 'text-violet-400' : 'text-slate-600'
                    }`}>
                      ₹{pass.price}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">Quantity</label>
                <input type="number" min="1" max="20" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">Commission</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: '0', label: '0%' },
                    { value: '5', label: '5%' },
                    { value: '10', label: '10%' },
                    { value: '15', label: '15%' },
                    { value: '20', label: '20%' },
                    { value: 'custom', label: 'Custom' }
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCommissionChoice(option.value)}
                      aria-pressed={commissionChoice === option.value}
                      className={`rounded-lg border py-2 text-[11px] font-bold ${commissionChoice === option.value ? 'border-violet-500 bg-violet-500/15 text-violet-300' : 'border-slate-800 bg-slate-950 text-slate-400'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {commissionChoice === 'custom' && (
                  <div className="mt-3">
                    <label className="mb-1.5 block text-[11px] font-bold text-slate-400">Custom commission amount (₹)</label>
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      step="0.01"
                      value={customCommission}
                      onChange={(event) => setCustomCommission(event.target.value)}
                      placeholder="Enter amount"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500"
                    />
                    {commissionInvalid && <p className="mt-1.5 text-xs font-semibold text-red-400">Enter a valid amount up to 20% of the official total.</p>}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl space-y-2 text-sm">
              <div className="flex items-center justify-between text-slate-400"><span>Official Ticket Rate</span><span>{pricingLoading ? 'Loading...' : formatCurrency(customerTotal)}</span></div>
              <div className="flex items-center justify-between text-slate-400"><span>Commission</span><span>{commissionInvalid ? 'Invalid' : `${displayedCommissionPercentage}%`}</span></div>
              <div className="flex items-center justify-between text-slate-400"><span>Commission Amount</span><span className="text-amber-300">-{formatCurrency(commissionAmount)}</span></div>
              <div className="flex items-center justify-between border-t border-slate-800 pt-2 font-bold text-white"><span>Rate After Commission</span><span className="text-lg text-emerald-400">{formatCurrency(rateAfterCommission)}</span></div>
            </div>

            <button
              type="submit"
              disabled={submitting || pricingLoading || !ticketType || commissionInvalid}
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
      {successTicket && (
        <div role="dialog" aria-modal="true" aria-labelledby="ticket-success-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-[fadeInUp_.28s_ease-out] rounded-3xl border border-emerald-400/25 bg-slate-900 p-7 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400 text-3xl font-black text-slate-950 shadow-lg shadow-emerald-500/20">✓</div>
            <h2 id="ticket-success-title" className="mt-5 text-xl font-black text-white">Ticket Sent Successfully</h2>
            <p className="mt-2 text-sm text-slate-400">Ticket <span className="font-mono font-bold text-violet-300">#{successTicket.id}</span> has been issued for {successTicket.attendee}.</p>
            <button type="button" autoFocus onClick={() => setSuccessTicket(null)} className="mt-6 w-full rounded-xl bg-white py-3 text-sm font-extrabold text-slate-950">Done</button>
          </div>
        </div>
      )}
    </div>
  )
}
