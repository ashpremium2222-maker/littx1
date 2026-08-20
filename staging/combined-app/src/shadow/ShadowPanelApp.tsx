import React, { useState, useEffect } from 'react'

export default function ShadowPanelApp() {
  const [password, setPassword] = useState('')
  const [shadowToken, setShadowToken] = useState<string | null>(() => {
    return sessionStorage.getItem('littx_shadow_token')
  })
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)

  // Ticket creation state
  const [event, setEvent] = useState('FRESHERS TAKEOVER')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [gender, setGender] = useState('male')
  const [quantity, setQuantity] = useState('1')
  const [amount, setAmount] = useState('699')

  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    setLoginLoading(true)

    try {
      const res = await fetch('/api/shadow/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setShadowToken(data.shadowToken)
        sessionStorage.setItem('littx_shadow_token', data.shadowToken)
        setPassword('')
      } else {
        setLoginError(data.message || 'Access Denied: Invalid Shadow Password.')
      }
    } catch (err) {
      setLoginError('Network error verifying shadow credentials.')
    } finally {
      setLoginLoading(false)
    }
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
      setFeedback({ type: 'error', msg: 'Customer Name and Email are required.' })
      return
    }

    setSubmitting(true)
    setFeedback(null)

    try {
      const res = await fetch('/api/shadow/generate-ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-shadow-token': shadowToken || ''
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          gender,
          quantity: parseInt(quantity, 10) || 1,
          amount: parseFloat(amount) || 0,
          event
        })
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          msg: `🎉 Shadow Ticket generated & delivered! Order ID: ${data.orderId} | Ticket ID: ${data.ticketId}`
        })
        setName('')
        setEmail('')
        setPhone('')
      } else {
        if (res.status === 401) {
          sessionStorage.removeItem('littx_shadow_token')
          setShadowToken(null)
          setLoginError('Shadow session expired. Please re-authenticate.')
        } else {
          setFeedback({ type: 'error', msg: data.message || 'Failed to generate shadow ticket.' })
        }
      }
    } catch (err) {
      setFeedback({ type: 'error', msg: 'Network error creating shadow ticket.' })
    } finally {
      setSubmitting(false)
    }
  }

  // LOGIN SCREEN
  if (!shadowToken) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-2xl">👻</span>
            <span className="text-xl font-extrabold tracking-wider text-purple-400">SHADOW SALES PANEL</span>
          </div>

          <p className="text-xs text-slate-400 text-center mb-6">Restricted Access. Enter access password to proceed.</p>

          {loginError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3.5 rounded-xl mb-4 text-center font-medium">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">Access Password</label>
              <input
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-lg shadow-purple-600/25"
            >
              {loginLoading ? 'Authenticating...' : 'Authenticate Shadow Access'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // SHADOW TICKET CREATION INTERFACE
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">👻</span>
          <span className="font-black text-sm tracking-wider text-purple-400">SHADOW SALES PANEL</span>
        </div>

        <button
          onClick={() => {
            sessionStorage.removeItem('littx_shadow_token')
            setShadowToken(null)
          }}
          className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          Exit Panel
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-center">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div>
            <div className="inline-block bg-purple-500/10 border border-purple-500/30 text-purple-300 text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-md mb-2">
              PRIVATE ISSUANCE PORTAL
            </div>
            <h1 className="text-2xl font-black text-white">Create Shadow Ticket</h1>
            <p className="text-xs text-slate-400">
              Generates genuine tickets delivered to customer. Excluded from public dashboard metrics.
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
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500"
              >
                <option value="FRESHERS TAKEOVER">FRESHERS TAKEOVER</option>
                <option value="AURA GENESIS">AURA GENESIS</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">Customer Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Vikram Singh"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">Customer Email *</label>
                <input
                  type="email"
                  required
                  placeholder="vikram@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">Customer Phone</label>
                <input
                  type="tel"
                  placeholder="9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">Pass Category</label>
                <select
                  value={gender}
                  onChange={(e) => handleGenderChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Total Ticket Price</span>
              <span className="text-lg font-black text-purple-400">₹{amount}</span>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-3.5 px-4 rounded-xl text-sm transition-all shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2"
            >
              {submitting ? (
                'Generating Shadow Ticket...'
              ) : (
                <>
                  <span>👻 Issue Shadow Ticket & Deliver Email</span>
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
