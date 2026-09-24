import React, { useState, useEffect } from 'react'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'

export interface PartnerOption {
  id: string
  name: string
  active: boolean
  configured: boolean
}

const DEFAULT_PARTNERS: PartnerOption[] = [
  { id: 'partner-slot-1', name: 'Partner Login 1', active: false, configured: false },
  { id: 'partner-slot-2', name: 'Partner Login 2', active: false, configured: false },
]

interface PartnerSessionData {
  id: string
  name: string
  boundIp?: string | null
  registeredDeviceId?: string | null
  webauthnCredentialId?: string | null
  sessionVersion?: number
}

interface SellerTicketRecord {
  orderId: string
  ticketId?: string
  name?: string
  email?: string
  phone?: string
  ticketType?: string
  gender?: string
  amount?: number
  quantity?: number
  status?: string
  approvalStatus?: string
  deliveryStatus?: string
  createdAt?: string
  generatedAt?: string
  deliveredAt?: string
}

function sellerTicketState(ticket: SellerTicketRecord) {
  if (ticket.approvalStatus === 'REJECTED' || ticket.deliveryStatus === 'BLOCKED') {
    return { label: 'Rejected', key: 'rejected', className: 'border-red-500/30 bg-red-500/10 text-red-300' }
  }
  if (ticket.approvalStatus === 'PENDING' || ticket.status === 'pending_approval' || ticket.deliveryStatus === 'PENDING_APPROVAL') {
    return { label: 'Pending approval', key: 'pending', className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' }
  }
  if (ticket.approvalStatus === 'APPROVED' || ticket.approvalStatus === 'NOT_REQUIRED' || ticket.deliveryStatus === 'DELIVERED' || ticket.status === 'emailed') {
    return { label: ticket.approvalStatus === 'APPROVED' ? 'Approved & sent' : 'Sent', key: 'approved', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' }
  }
  return { label: 'Processing', key: 'pending', className: 'border-slate-700 bg-slate-800/60 text-slate-300' }
}

export default function SellerPortalApp() {
  const [partners, setPartners] = useState<PartnerOption[]>(DEFAULT_PARTNERS)
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('partner-slot-1')
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
  const [successTicket, setSuccessTicket] = useState<{ id: string; attendee: string; price: string; approvalRequired?: boolean } | null>(null)
  const [sellerTickets, setSellerTickets] = useState<SellerTicketRecord[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [ticketsError, setTicketsError] = useState<string | null>(null)

  const currentPartner = partners.find((p) => p.id === selectedPartnerId) || partners[0]
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
  const ticketStats = sellerTickets.reduce(
    (acc, ticket) => {
      const state = sellerTicketState(ticket).key
      acc.total += 1
      if (state === 'approved') acc.approved += 1
      else if (state === 'rejected') acc.rejected += 1
      else acc.pending += 1
      return acc
    },
    { total: 0, approved: 0, pending: 0, rejected: 0 }
  )

  const loadSellerTickets = async () => {
    const activeToken = localStorage.getItem('littx_seller_token') || token || ''
    if (!activeToken) return
    setTicketsLoading(true)
    setTicketsError(null)
    try {
      const response = await fetch('/api/seller/sales', {
        headers: { 'x-seller-token': activeToken },
        cache: 'no-store'
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        setTicketsError(data.message || 'Unable to load punched tickets.')
        return
      }
      setSellerTickets(Array.isArray(data.sales) ? data.sales : [])
    } catch {
      setTicketsError('Unable to load punched tickets.')
    } finally {
      setTicketsLoading(false)
    }
  }

  useEffect(() => {
    const loadPartners = async () => {
      try {
        const response = await fetch('/api/seller/partners', { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok || !data.success || !Array.isArray(data.partners)) return
        setPartners(data.partners)
        setSelectedPartnerId(current => data.partners.some((partner: PartnerOption) => partner.id === current && partner.active)
          ? current
          : data.partners.find((partner: PartnerOption) => partner.active)?.id || data.partners[0]?.id || current)
      } catch {
        // Keep the two neutral slot labels if the public configuration is temporarily unavailable.
      }
    }
    loadPartners()
  }, [])

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

  useEffect(() => {
    if (!authenticatedPartner) return
    loadSellerTickets()
    const interval = window.setInterval(loadSellerTickets, 12000)
    return () => window.clearInterval(interval)
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
        } else if (res.status === 401 || res.status === 403) {
          // Only an explicit authorization denial means the Master Admin
          // revoked or blocked this seller. Transient server errors retain login.
          console.warn('[Seller] Session revoked by server:', data.message)
          localStorage.removeItem('littx_seller_token')
          localStorage.removeItem('littx_seller_partner')
          setAuthenticatedPartner(null)
          setToken(null)
        } else {
          console.warn('[Seller] Session check temporarily unavailable; keeping saved login.')
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
        setSuccessTicket({ id: data.ticket.id, attendee: name, price: data.ticket.price, approvalRequired: Boolean(data.approvalRequired) })
        loadSellerTickets()
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
                {partners.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!p.active}
                    onClick={() => {
                      setSelectedPartnerId(p.id)
                      setLoginError(null)
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
                      selectedPartnerId === p.id
                        ? 'border-violet-500 bg-violet-500/10 text-white ring-1 ring-violet-500'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span>{p.name}</span>
                    {p.active ? selectedPartnerId === p.id && <span className="text-violet-400 text-xs font-bold">● Selected</span> : <span className="text-slate-600 text-xs font-bold">Unavailable</span>}
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

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
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

        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-block bg-violet-500/10 text-violet-300 text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-md mb-2">
                My tickets
              </div>
              <h2 className="text-lg font-black text-white">Punched Ticket Status</h2>
              <p className="text-xs text-slate-400">Approval and delivery status for tickets punched by {authenticatedPartner.name}.</p>
            </div>
            <button
              type="button"
              onClick={loadSellerTickets}
              disabled={ticketsLoading}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300 transition hover:border-violet-500 hover:text-violet-300 disabled:opacity-50"
            >
              {ticketsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total punched</div>
              <div className="mt-1 text-2xl font-black text-white">{ticketStats.total}</div>
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/80">Approved / sent</div>
              <div className="mt-1 text-2xl font-black text-emerald-300">{ticketStats.approved}</div>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300/80">Pending</div>
              <div className="mt-1 text-2xl font-black text-amber-300">{ticketStats.pending}</div>
            </div>
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-red-300/80">Rejected</div>
              <div className="mt-1 text-2xl font-black text-red-300">{ticketStats.rejected}</div>
            </div>
          </div>

          {ticketsError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-300">
              {ticketsError}
            </div>
          )}

          <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
            {sellerTickets.length === 0 && !ticketsLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-5 text-center text-sm text-slate-500">
                No tickets punched yet.
              </div>
            ) : (
              sellerTickets.map((ticket) => {
                const state = sellerTicketState(ticket)
                const timestamp = ticket.generatedAt || ticket.createdAt
                return (
                  <div key={ticket.orderId} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold text-white">{ticket.name || 'Guest'}</div>
                        <div className="truncate text-xs text-slate-500">{ticket.email || ticket.phone || 'No contact'}</div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${state.className}`}>
                        {state.label}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Ticket ID</div>
                        <div className="mt-0.5 font-mono text-slate-300">{ticket.ticketId || 'Pending'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Pass</div>
                        <div className="mt-0.5 text-slate-300">{ticket.ticketType || ticket.gender || 'Pass'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Amount</div>
                        <div className="mt-0.5 text-slate-300">{formatCurrency(Number(ticket.amount || 0))}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Punched</div>
                        <div className="mt-0.5 text-slate-300">{timestamp ? new Date(timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}</div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>
      </main>
      {successTicket && (
        <div role="dialog" aria-modal="true" aria-labelledby="ticket-success-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-[fadeInUp_.28s_ease-out] rounded-3xl border border-emerald-400/25 bg-slate-900 p-7 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400 text-3xl font-black text-slate-950 shadow-lg shadow-emerald-500/20">✓</div>
            <h2 id="ticket-success-title" className="mt-5 text-xl font-black text-white">
              {successTicket.approvalRequired ? 'Ticket Sent to Dashboard for Approval' : 'Ticket Sent Successfully'}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Ticket <span className="font-mono font-bold text-violet-300">#{successTicket.id}</span> has been {successTicket.approvalRequired ? 'sent to the dashboard for approval and will be delivered after approval' : 'issued'} for {successTicket.attendee}.
            </p>
            <button type="button" autoFocus onClick={() => setSuccessTicket(null)} className="mt-6 w-full rounded-xl bg-white py-3 text-sm font-extrabold text-slate-950">Done</button>
          </div>
        </div>
      )}
    </div>
  )
}
