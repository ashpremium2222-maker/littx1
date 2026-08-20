import React, { useState } from 'react'

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

export default function SellerPortalApp() {
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('littlane')
  const [passwordInput, setPasswordInput] = useState<string>('')
  const [authenticatedPartner, setAuthenticatedPartner] = useState<PartnerOption | null>(() => {
    const saved = localStorage.getItem('littx_seller_partner')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        return null
      }
    }
    return null
  })
  const [loginError, setLoginError] = useState<string>('')
  const [loginLoading, setLoginLoading] = useState<boolean>(false)

  // Ticket generation form state
  const [event, setEvent] = useState('FRESHERS TAKEOVER')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [gender, setGender] = useState('male')
  const [quantity, setQuantity] = useState('1')
  const [amount, setAmount] = useState('699')

  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const currentPartner = PARTNERS.find((p) => p.id === selectedPartnerId) || PARTNERS[0]

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)

    setTimeout(() => {
      if (passwordInput === currentPartner.defaultPass || passwordInput === 'dash-2026' || passwordInput === 'littx-master-2026') {
        setAuthenticatedPartner(currentPartner)
        localStorage.setItem('littx_seller_partner', JSON.stringify(currentPartner))
        setPasswordInput('')
      } else {
        setLoginError(`Invalid password for ${currentPartner.name}`)
      }
      setLoginLoading(false)
    }, 400)
  }

  const handleLogout = () => {
    setAuthenticatedPartner(null)
    localStorage.removeItem('littx_seller_partner')
  }

  const handleGenderChange = (newGender: string) => {
    setGender(newGender)
    if (event === 'FRESHERS TAKEOVER') {
      setAmount(newGender === 'male' ? '699' : '599')
    } else {
      setAmount('350')
    }
  }

  const handleEventChange = (newEvent: string) => {
    setEvent(newEvent)
    if (newEvent === 'AURA GENESIS') {
      setAmount('350')
    } else {
      setAmount(gender === 'male' ? '699' : '599')
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
      const res = await fetch('/api/admin/generate-ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center justify-center gap-3 mb-6">
            <img src="/logo.png" alt="LITTX Logo" className="h-8 w-auto brightness-200" />
            <span className="text-xl font-extrabold tracking-wider text-violet-400">SELLER PORTAL</span>
          </div>

          <h2 className="text-lg font-bold text-center mb-1">Partner Authentication</h2>
          <p className="text-xs text-slate-400 text-center mb-6">Select your event partner organization & enter password</p>

          {loginError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-lg mb-4 text-center">
              {loginError}
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
                    onClick={() => setSelectedPartnerId(p.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-sm font-medium transition-all ${
                      selectedPartnerId === p.id
                        ? 'border-violet-500 bg-violet-500/10 text-white ring-1 ring-violet-500'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span>{p.name}</span>
                    {selectedPartnerId === p.id && <span className="text-violet-400 text-xs">● Selected</span>}
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
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-lg shadow-violet-600/25"
            >
              {loginLoading ? 'Authenticating...' : `Log In as ${currentPartner.name}`}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // AUTHENTICATED SELLER PORTAL — GENERATE TICKET ONLY
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
          <button
            onClick={handleLogout}
            className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            Log Out
          </button>
        </div>
      </header>

      {/* Main Content — Ticket Generator Only */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-center">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div>
            <div className="inline-block bg-indigo-500/10 text-indigo-400 text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-md mb-2">
              EXCLUSIVE ISSUANCE PORTAL
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
                <option value="FRESHERS TAKEOVER">FRESHERS TAKEOVER</option>
                <option value="AURA GENESIS">AURA GENESIS</option>
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
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">Pass Category</label>
                <select
                  value={gender}
                  onChange={(e) => handleGenderChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="male">Male Pass</option>
                  <option value="female">Female Pass</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">Quantity</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
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
