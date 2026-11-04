import React, { useState, useEffect, useCallback, useRef } from 'react'
import { STAGEWAY_THEME } from '../organizer-portal/theme'

// ==================== TYPES ====================
interface PRUser {
  id: string
  username: string
  displayName: string
  companyId?: string
}

const API = ''

interface PRTicketCategory {
  id: string
  name: string
  description?: string
  price: number
  currency: string
  status: string
  remainingAvailability: number | null
}

interface PREvent {
  id: string
  name: string
  slug: string
  date?: string
  time?: string
  venue?: string
  city?: string
  description?: string
  ticketCategories: PRTicketCategory[]
}

interface PRSale {
  orderId: string
  ticketId?: string
  name: string
  email: string
  phone: string
  event: string
  eventId?: string
  gender?: string
  ticketType?: string
  quantity: number
  amount: number
  currency?: string
  status: string
  paymentMethod: string
  paymentId?: string
  createdAt: string
  source?: string
}

function getPRToken(): string {
  return sessionStorage.getItem('pr_token') || localStorage.getItem('pr_token') || ''
}

function prAuthHeaders(json = false): HeadersInit {
  const token = getPRToken()
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), 'X-Auth-Token': token }
}

// ==================== LOGIN PAGE ====================
function LoginPage({ onLogin, themeMode, toggleTheme }: { onLogin: (user: PRUser) => void; themeMode: 'dark' | 'light'; toggleTheme: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const data = await response.json()
      if (!response.ok || !data.success || data.user?.role !== 'pr' || !data.token) {
        throw new Error(data.message || 'Invalid partner credentials. Please check your username and password.')
      }
      const user: PRUser = {
        id: data.user.userId,
        username: username.trim(),
        displayName: data.user.displayName || username.trim(),
        companyId: data.user.companyId || 'stageway',
      }
      sessionStorage.setItem('pr_user', JSON.stringify(user))
      sessionStorage.setItem('pr_token', data.token)
      localStorage.setItem('pr_user', JSON.stringify(user))
      localStorage.setItem('pr_token', data.token)
      onLogin(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: STAGEWAY_THEME.canvasBg,
      padding: '24px',
      position: 'relative',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Theme toggle top-right */}
      <div style={{ position: 'absolute', top: 20, right: 20 }}>
        <button
          onClick={toggleTheme}
          style={{
            background: STAGEWAY_THEME.surface,
            border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
            color: STAGEWAY_THEME.textSecondary,
            padding: '8px 12px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          {themeMode === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>

      <div style={{
        width: '100%',
        maxWidth: 420,
        background: STAGEWAY_THEME.surface,
        border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
        borderRadius: 16,
        padding: '36px 32px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
      }}>
        {/* Brand header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '1.4rem', fontWeight: 800, letterSpacing: '0.04em', color: STAGEWAY_THEME.textPrimary }}>
            STAGEWAY <span style={{ color: '#10A579' }}>●</span>
          </div>
          <div style={{ fontSize: '0.85rem', color: STAGEWAY_THEME.textSecondary, marginTop: 6, fontWeight: 500 }}>
            PR Partner & Promoter Portal
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: 6, color: STAGEWAY_THEME.textSecondary, letterSpacing: '0.05em' }}>
              PARTNER USERNAME
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. partner1"
              required
              style={{
                width: '100%',
                background: STAGEWAY_THEME.inputBg,
                border: `1px solid ${STAGEWAY_THEME.inputBorder}`,
                padding: '12px 14px',
                borderRadius: 8,
                color: STAGEWAY_THEME.textPrimary,
                fontSize: '0.95rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: 6, color: STAGEWAY_THEME.textSecondary, letterSpacing: '0.05em' }}>
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%',
                background: STAGEWAY_THEME.inputBg,
                border: `1px solid ${STAGEWAY_THEME.inputBorder}`,
                padding: '12px 14px',
                borderRadius: 8,
                color: STAGEWAY_THEME.textPrimary,
                fontSize: '0.95rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {error && (
            <div style={{
              color: '#f87171',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: '0.85rem',
              fontWeight: 500,
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '13px',
              marginTop: 6,
              background: '#10A579',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'all 0.15s ease'
            }}
          >
            {loading ? 'Authenticating…' : 'Sign In to Portal'}
          </button>
        </form>

        <div style={{ marginTop: 24, padding: '12px 14px', background: STAGEWAY_THEME.light, borderRadius: 8, border: `1px solid ${STAGEWAY_THEME.borderLight}`, fontSize: '0.75rem', color: STAGEWAY_THEME.textMuted, textAlign: 'center' }}>
          Authorized PR & Promoter access only. Credentials are provided by the event organizer.
        </div>
      </div>
    </div>
  )
}

// ==================== SELL / GENERATE TICKET MODAL ====================
function SellTicketModal({
  prUser,
  initialEventId,
  onClose,
  onSuccess,
}: {
  prUser: PRUser
  initialEventId?: string
  onClose: () => void
  onSuccess: () => void
}) {
  void prUser
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [events, setEvents] = useState<PREvent[]>([])
  const [eventId, setEventId] = useState(initialEventId || '')
  const [ticketCategoryId, setTicketCategoryId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'direct' | 'cash' | 'razorpay'>('direct')
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(false)
  const checkoutRequest = useRef<{ fingerprint: string; key: string } | null>(null)
  const [step, setStep] = useState<'form' | 'pending' | 'done'>('form')
  const [message, setMessage] = useState('')
  const [issuedTicketId, setIssuedTicketId] = useState<string | null>(null)
  const [issuedTicketUrl, setIssuedTicketUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API}/api/pr/events`, { headers: prAuthHeaders() })
      .then(async response => {
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.message || 'Assigned events could not be loaded.')
        setEvents(data.events || [])
        const selected = initialEventId
          ? data.events?.find((e: PREvent) => e.id === initialEventId)
          : data.events?.[0]
        if (selected) {
          setEventId(selected.id)
          setTicketCategoryId(selected.ticketCategories?.[0]?.id || '')
        }
      })
      .catch(error => setMessage(error instanceof Error ? error.message : 'Assigned events could not be loaded.'))
  }, [initialEventId])

  const selectedEvent = events.find(item => item.id === eventId)
  const selectedTicket = selectedEvent?.ticketCategories.find(item => item.id === ticketCategoryId)
  const unitPrice = Number(selectedTicket?.price || 0)
  const totalAmount = unitPrice * quantity

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !email || !phone || !selectedEvent || !selectedTicket) return
    setLoading(true)

    try {
      if (paymentMethod === 'direct') {
        const res = await fetch(`${API}/api/pr/generate-ticket`, {
          method: 'POST',
          headers: prAuthHeaders(true),
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            eventId,
            ticketCategoryId,
            ticketType: selectedTicket.name,
            quantity,
            paymentMethod: 'direct_pr',
          }),
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.message || 'Failed to generate ticket.')
        setIssuedTicketId(data.ticketId)
        setIssuedTicketUrl(data.ticketUrl || `/api/pr/tickets/${data.ticketId}/download`)
        setMessage(`Pass successfully generated! Ticket ID: ${data.ticketId}`)
        setStep('done')
        onSuccess()
      } else if (paymentMethod === 'razorpay') {
        const fingerprint = JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), eventId, ticketCategoryId, quantity })
        if (!checkoutRequest.current || checkoutRequest.current.fingerprint !== fingerprint) {
          checkoutRequest.current = { fingerprint, key: crypto.randomUUID() }
        }
        const res = await fetch(`${API}/api/pr/create-order`, {
          method: 'POST',
          headers: { ...prAuthHeaders(true), 'Idempotency-Key': checkoutRequest.current.key },
          body: JSON.stringify({ name, email, phone, eventId, ticketCategoryId, ticketType: selectedTicket.name, quantity }),
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.message || 'Failed to create order')

        const rzp = new (window as any).Razorpay({
          key: data.keyId,
          amount: data.amountMinor,
          currency: data.currency,
          name: 'Stageway',
          description: `${selectedTicket.name} — ${selectedEvent.name}`,
          order_id: data.orderId,
          prefill: { name, email, contact: phone },
          theme: { color: '#10A579' },
          handler: async (response: any) => {
            const verRes = await fetch(`${API}/api/verify-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId: data.orderId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            })
            const verData = await verRes.json()
            if (verData.success) {
              setMessage('Payment successful! Verified pass has been issued.')
              setStep('done')
              onSuccess()
            } else {
              setMessage('Payment verification failed. Please contact organizer.')
              setStep('done')
            }
          },
          modal: { ondismiss: () => { setLoading(false); checkoutRequest.current = null } },
        })
        rzp.open()
        setLoading(false)
      } else {
        const res = await fetch(`${API}/api/pr/cash-request`, {
          method: 'POST',
          headers: prAuthHeaders(true),
          body: JSON.stringify({ name, email, phone, eventId, ticketCategoryId, ticketType: selectedTicket.name, quantity }),
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.message || 'Failed')
        setMessage('Cash sale submitted for organizer approval. Pass will be issued once approved.')
        setStep('pending')
        onSuccess()
        setLoading(false)
      }
    } catch (err: any) {
      setMessage(`❌ ${err.message}`)
      setStep('done')
      setLoading(false)
    }
  }

  if (step === 'done' || step === 'pending') {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
      }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{
          width: '100%', maxWidth: 440, textAlign: 'center', padding: '36px 28px',
          background: STAGEWAY_THEME.surface, border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
          borderRadius: 16, boxShadow: '0 25px 50px rgba(0,0,0,0.4)'
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', background: 'rgba(16, 165, 121, 0.15)',
            color: '#10A579', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px', fontSize: 24, fontWeight: 800
          }}>
            ✓
          </div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: STAGEWAY_THEME.textPrimary, margin: '0 0 10px' }}>
            {step === 'done' ? 'Ticket Pass Issued!' : 'Cash Request Submitted'}
          </h3>
          <p style={{ fontSize: '0.9rem', color: STAGEWAY_THEME.textSecondary, margin: '0 0 20px', lineHeight: 1.4 }}>
            {message}
          </p>

          {issuedTicketId && (
            <div style={{
              background: STAGEWAY_THEME.inputBg, border: `1px solid ${STAGEWAY_THEME.borderLight}`,
              borderRadius: 10, padding: 16, marginBottom: 20, textAlign: 'left',
              display: 'flex', flexDirection: 'column', gap: 8
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: STAGEWAY_THEME.textMuted }}>Pass ID</span>
                <span style={{ fontFamily: 'monospace', color: '#10A579', fontWeight: 700 }}>{issuedTicketId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: STAGEWAY_THEME.textMuted }}>Attendee</span>
                <span style={{ color: STAGEWAY_THEME.textPrimary, fontWeight: 600 }}>{name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: STAGEWAY_THEME.textMuted }}>Event</span>
                <span style={{ color: STAGEWAY_THEME.textPrimary, fontWeight: 600 }}>{selectedEvent?.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: STAGEWAY_THEME.textMuted }}>Quantity</span>
                <span style={{ color: STAGEWAY_THEME.textPrimary, fontWeight: 600 }}>{quantity} pass(es)</span>
              </div>
              {issuedTicketUrl && (
                <a
                  href={issuedTicketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    marginTop: 10,
                    background: 'rgba(16, 165, 121, 0.12)',
                    color: '#10A579',
                    border: '1px solid rgba(16, 165, 121, 0.3)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 13,
                    textAlign: 'center',
                    textDecoration: 'none',
                    fontWeight: 700,
                    display: 'block',
                  }}
                >
                  Download PDF Pass 📄
                </a>
              )}
            </div>
          )}

          <button
            style={{
              width: '100%',
              background: '#10A579',
              color: '#FFFFFF',
              border: 'none',
              padding: '12px',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: 'pointer'
            }}
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 540,
        background: STAGEWAY_THEME.surface,
        border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Modal Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: `1px solid ${STAGEWAY_THEME.borderLight}`,
          background: STAGEWAY_THEME.sidebarBg
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: STAGEWAY_THEME.textPrimary }}>
              Issue / Sell Ticket Pass
            </h3>
            <div style={{ fontSize: '0.8rem', color: STAGEWAY_THEME.textSecondary, marginTop: 3 }}>
              Generate an attendee ticket pass under your PR attribution
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: STAGEWAY_THEME.textMuted,
              fontSize: '1.25rem',
              cursor: 'pointer',
              padding: 4
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Attendee Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: 6, color: STAGEWAY_THEME.textSecondary, letterSpacing: '0.04em' }}>
                ATTENDEE NAME *
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Aryan Mehta"
                required
                style={{
                  width: '100%',
                  background: STAGEWAY_THEME.inputBg,
                  border: `1px solid ${STAGEWAY_THEME.inputBorder}`,
                  padding: '10px 12px',
                  borderRadius: 8,
                  color: STAGEWAY_THEME.textPrimary,
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: 6, color: STAGEWAY_THEME.textSecondary, letterSpacing: '0.04em' }}>
                PHONE NUMBER *
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                required
                style={{
                  width: '100%',
                  background: STAGEWAY_THEME.inputBg,
                  border: `1px solid ${STAGEWAY_THEME.inputBorder}`,
                  padding: '10px 12px',
                  borderRadius: 8,
                  color: STAGEWAY_THEME.textPrimary,
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: 6, color: STAGEWAY_THEME.textSecondary, letterSpacing: '0.04em' }}>
              ATTENDEE EMAIL *
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="aryan@example.com"
              required
              style={{
                width: '100%',
                background: STAGEWAY_THEME.inputBg,
                border: `1px solid ${STAGEWAY_THEME.inputBorder}`,
                padding: '10px 12px',
                borderRadius: 8,
                color: STAGEWAY_THEME.textPrimary,
                fontSize: '0.9rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Event & Tier Selection */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: 6, color: STAGEWAY_THEME.textSecondary, letterSpacing: '0.04em' }}>
                ASSIGNED EVENT *
              </label>
              <select
                value={eventId}
                onChange={e => {
                  const next = events.find(item => item.id === e.target.value)
                  setEventId(e.target.value)
                  setTicketCategoryId(next?.ticketCategories?.[0]?.id || '')
                }}
                required
                style={{
                  width: '100%',
                  background: STAGEWAY_THEME.inputBg,
                  border: `1px solid ${STAGEWAY_THEME.inputBorder}`,
                  padding: '10px 12px',
                  borderRadius: 8,
                  color: STAGEWAY_THEME.textPrimary,
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              >
                <option value="">Select Event</option>
                {events.map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: 6, color: STAGEWAY_THEME.textSecondary, letterSpacing: '0.04em' }}>
                PASS CATEGORY *
              </label>
              <select
                value={ticketCategoryId}
                onChange={e => setTicketCategoryId(e.target.value)}
                required
                disabled={!selectedEvent}
                style={{
                  width: '100%',
                  background: STAGEWAY_THEME.inputBg,
                  border: `1px solid ${STAGEWAY_THEME.inputBorder}`,
                  padding: '10px 12px',
                  borderRadius: 8,
                  color: STAGEWAY_THEME.textPrimary,
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              >
                <option value="">Select Tier</option>
                {selectedEvent?.ticketCategories.map(item => (
                  <option key={item.id} value={item.id} disabled={item.status !== 'active' || item.remainingAvailability === 0}>
                    {item.name} — {item.currency} {Number(item.price).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quantity & Issuance Method */}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: 6, color: STAGEWAY_THEME.textSecondary, letterSpacing: '0.04em' }}>
                QUANTITY
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={quantity}
                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: '100%',
                  background: STAGEWAY_THEME.inputBg,
                  border: `1px solid ${STAGEWAY_THEME.inputBorder}`,
                  padding: '10px 12px',
                  borderRadius: 8,
                  color: STAGEWAY_THEME.textPrimary,
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: 6, color: STAGEWAY_THEME.textSecondary, letterSpacing: '0.04em' }}>
                ISSUANCE METHOD
              </label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as any)}
                style={{
                  width: '100%',
                  background: STAGEWAY_THEME.inputBg,
                  border: `1px solid ${STAGEWAY_THEME.inputBorder}`,
                  padding: '10px 12px',
                  borderRadius: 8,
                  color: STAGEWAY_THEME.textPrimary,
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              >
                <option value="direct">Direct PR Pass (Instant Ticket Generation)</option>
                <option value="cash">Cash Collection (Requires Organizer Approval)</option>
                <option value="razorpay">Razorpay Checkout (Customer Online Payment)</option>
              </select>
            </div>
          </div>

          {/* Price summary pill */}
          <div style={{
            background: STAGEWAY_THEME.light,
            padding: '14px 18px',
            borderRadius: 10,
            border: `1px solid ${STAGEWAY_THEME.borderLight}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <span style={{ fontSize: '0.85rem', color: STAGEWAY_THEME.textSecondary }}>Order Total: </span>
              <span style={{ fontSize: '0.85rem', color: STAGEWAY_THEME.textMuted }}>
                ({quantity} × {selectedTicket?.currency || 'INR'} {unitPrice.toLocaleString()})
              </span>
            </div>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10A579' }}>
              {selectedTicket?.currency || 'INR'} {totalAmount.toLocaleString()}
            </span>
          </div>

          {/* Method explainer notices */}
          {paymentMethod === 'direct' && (
            <div style={{
              background: 'rgba(16, 165, 121, 0.08)',
              border: '1px solid rgba(16, 165, 121, 0.25)',
              color: '#10A579',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: '0.8rem',
              lineHeight: 1.4
            }}>
              ● Pass will be generated instantly with a valid QR code, PDF download link, and email confirmation.
            </div>
          )}

          {paymentMethod === 'cash' && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              color: '#F59E0B',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: '0.8rem',
              lineHeight: 1.4
            }}>
              ⚠️ Cash orders are queued for organizer verification before the verified pass is released.
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !selectedTicket || events.length === 0}
            style={{
              width: '100%',
              padding: '13px',
              marginTop: 4,
              fontSize: '0.95rem',
              fontWeight: 700,
              background: '#10A579',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              cursor: loading || !selectedTicket ? 'not-allowed' : 'pointer',
              opacity: loading || !selectedTicket ? 0.6 : 1,
              transition: 'all 0.15s ease'
            }}
          >
            {loading
              ? 'Processing…'
              : paymentMethod === 'direct'
              ? 'Generate Pass Now'
              : paymentMethod === 'razorpay'
              ? `Proceed to Pay ${selectedTicket?.currency || 'INR'} ${totalAmount.toLocaleString()}`
              : 'Submit Cash Order for Approval'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ==================== MAIN PR DASHBOARD ====================
function PRDashboard({
  prUser,
  onLogout,
  themeMode,
  toggleTheme
}: {
  prUser: PRUser
  onLogout: () => void
  themeMode: 'dark' | 'light'
  toggleTheme: () => void
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'events'>('overview')
  const [sales, setSales] = useState<PRSale[]>([])
  const [events, setEvents] = useState<PREvent[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [showSell, setShowSell] = useState(false)
  const [sellModalEventId, setSellModalEventId] = useState<string | undefined>()
  const [viewSale, setViewSale] = useState<PRSale | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'direct' | 'cash' | 'razorpay'>('all')

  const loadData = useCallback(async () => {
    try {
      const [salesRes, eventsRes] = await Promise.all([
        fetch(`${API}/api/pr/sales`, { headers: prAuthHeaders() }),
        fetch(`${API}/api/pr/events`, { headers: prAuthHeaders() }),
      ])

      if (salesRes.status === 401 || eventsRes.status === 401) {
        setSessionExpired(true)
        return
      }

      const salesData = await salesRes.json()
      if (salesData.success) {
        setSales(salesData.sales || [])
      }

      const eventsData = await eventsRes.json()
      if (eventsData.success) {
        setEvents(eventsData.events || [])
      }
    } catch {
      // offline / transient network
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 20000)
    return () => clearInterval(interval)
  }, [loadData])

  // KPIs
  const totalSold = sales.reduce((sum, s) => sum + (s.quantity || 1), 0)
  const totalRevenue = sales
    .filter(s => ['paid', 'ticket_generated', 'emailed', 'scanned'].includes(s.status))
    .reduce((sum, s) => sum + (s.amount || 0), 0)
  const pendingCash = sales.filter(s => s.status === 'pr_cash_pending').length
  const confirmedCount = sales.filter(s => ['ticket_generated', 'emailed', 'scanned', 'paid'].includes(s.status)).length

  function statusBadge(status: string) {
    if (['ticket_generated', 'emailed', 'scanned'].includes(status)) {
      return (
        <span style={{
          background: 'rgba(16, 165, 121, 0.15)',
          color: '#10A579',
          border: '1px solid rgba(16, 165, 121, 0.3)',
          padding: '3px 8px',
          borderRadius: 6,
          fontSize: '11px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          ✓ Confirmed
        </span>
      )
    }
    if (status === 'pr_cash_pending') {
      return (
        <span style={{
          background: 'rgba(245, 158, 11, 0.15)',
          color: '#F59E0B',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          padding: '3px 8px',
          borderRadius: 6,
          fontSize: '11px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          ⏳ Cash Pending
        </span>
      )
    }
    if (status === 'paid') {
      return (
        <span style={{
          background: 'rgba(16, 165, 121, 0.15)',
          color: '#10A579',
          border: '1px solid rgba(16, 165, 121, 0.3)',
          padding: '3px 8px',
          borderRadius: 6,
          fontSize: '11px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          ✓ Paid
        </span>
      )
    }
    return (
      <span style={{
        background: STAGEWAY_THEME.light,
        color: STAGEWAY_THEME.textMuted,
        border: `1px solid ${STAGEWAY_THEME.borderLight}`,
        padding: '3px 8px',
        borderRadius: 6,
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em'
      }}>
        {status}
      </span>
    )
  }

  const filteredSales = sales.filter(s => {
    const q = searchQuery.toLowerCase()
    const matchesQuery = !q ||
      s.name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      (s.ticketId && s.ticketId.toLowerCase().includes(q))
    const matchesPayment = paymentFilter === 'all' ||
      (paymentFilter === 'cash' && s.paymentMethod === 'cash') ||
      (paymentFilter === 'razorpay' && s.paymentMethod === 'razorpay') ||
      (paymentFilter === 'direct' && (s.paymentMethod === 'direct_pr' || !s.paymentMethod))
    return matchesQuery && matchesPayment
  })

  return (
    <div style={{
      minHeight: '100vh',
      background: STAGEWAY_THEME.canvasBg,
      color: STAGEWAY_THEME.textPrimary,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Session Expired Banner */}
      {sessionExpired && (
        <div style={{
          background: '#DC2626',
          color: '#FFFFFF',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontWeight: 600,
          fontSize: '0.9rem',
          zIndex: 999
        }}>
          <span>Your partner session has expired. Please sign in again to continue.</span>
          <button
            onClick={onLogout}
            style={{
              background: '#FFFFFF',
              color: '#DC2626',
              border: 'none',
              padding: '6px 14px',
              borderRadius: 6,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Log In Again
          </button>
        </div>
      )}

      {/* Top Navbar */}
      <header style={{
        height: 64,
        background: STAGEWAY_THEME.sidebarBg,
        borderBottom: `1px solid ${STAGEWAY_THEME.borderLight}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 20,
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '0.04em', color: STAGEWAY_THEME.textPrimary }}>
            STAGEWAY
          </span>
          <span style={{
            background: 'rgba(16, 165, 121, 0.15)',
            color: '#10A579',
            border: '1px solid rgba(16, 165, 121, 0.3)',
            borderRadius: 6,
            padding: '2px 8px',
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.06em'
          }}>
            PR PARTNER
          </span>
        </div>

        {/* Tab Switcher */}
        <nav style={{ display: 'flex', gap: 4, marginLeft: 20 }}>
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'sales', label: `My Sales (${sales.length})` },
            { key: 'events', label: `Assigned Events (${events.length})` },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                background: activeTab === tab.key ? STAGEWAY_THEME.light : 'transparent',
                color: activeTab === tab.key ? STAGEWAY_THEME.textPrimary : STAGEWAY_THEME.textMuted,
                border: activeTab === tab.key ? `1px solid ${STAGEWAY_THEME.borderMedium}` : '1px solid transparent',
                borderRadius: 8,
                padding: '8px 16px',
                fontWeight: activeTab === tab.key ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Actions & Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Sell Ticket button */}
          <button
            onClick={() => { setSellModalEventId(undefined); setShowSell(true) }}
            style={{
              background: '#10A579',
              color: '#FFFFFF',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            + Sell Ticket
          </button>

          {/* Theme Mode Toggle */}
          <button
            onClick={toggleTheme}
            title="Toggle Dark / Light Theme"
            style={{
              background: STAGEWAY_THEME.surface,
              border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
              color: STAGEWAY_THEME.textSecondary,
              padding: '7px 11px',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            {themeMode === 'dark' ? '☀️' : '🌙'}
          </button>

          {/* User Profile Pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: STAGEWAY_THEME.surface,
            border: `1px solid ${STAGEWAY_THEME.borderLight}`,
            borderRadius: 8,
            padding: '6px 12px'
          }}>
            <div style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: '#10A579',
              color: '#FFFFFF',
              fontWeight: 800,
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {prUser.displayName.charAt(0).toUpperCase()}
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: STAGEWAY_THEME.textPrimary }}>
              {prUser.displayName}
            </div>
          </div>

          {/* Sign Out */}
          <button
            onClick={onLogout}
            title="Sign Out"
            style={{
              background: 'transparent',
              border: `1px solid ${STAGEWAY_THEME.borderLight}`,
              color: STAGEWAY_THEME.textMuted,
              padding: '7px 12px',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, padding: '24px 32px', maxWidth: 1300, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {/* KPI Row (always visible across tabs) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 28
        }}>
          {/* KPI 1: Passes Sold */}
          <div style={{
            background: STAGEWAY_THEME.surface,
            border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
            borderRadius: 12,
            padding: '18px 20px',
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: STAGEWAY_THEME.textMuted, letterSpacing: '0.05em' }}>
              PASSES ISSUED
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: STAGEWAY_THEME.textPrimary, marginTop: 4 }}>
              {totalSold}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#10A579', marginTop: 4, fontWeight: 600 }}>
              ↑ Total orders generated
            </div>
          </div>

          {/* KPI 2: Total Revenue */}
          <div style={{
            background: STAGEWAY_THEME.surface,
            border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
            borderRadius: 12,
            padding: '18px 20px',
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: STAGEWAY_THEME.textMuted, letterSpacing: '0.05em' }}>
              GROSS REVENUE
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#10A579', marginTop: 4 }}>
              ₹{totalRevenue.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.8rem', color: STAGEWAY_THEME.textSecondary, marginTop: 4 }}>
              Confirmed & settled passes
            </div>
          </div>

          {/* KPI 3: Confirmed Passes */}
          <div style={{
            background: STAGEWAY_THEME.surface,
            border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
            borderRadius: 12,
            padding: '18px 20px',
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: STAGEWAY_THEME.textMuted, letterSpacing: '0.05em' }}>
              CONFIRMED DELIVERIES
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: STAGEWAY_THEME.textPrimary, marginTop: 4 }}>
              {confirmedCount}
            </div>
            <div style={{ fontSize: '0.8rem', color: STAGEWAY_THEME.textSecondary, marginTop: 4 }}>
              Direct passes & online sales
            </div>
          </div>

          {/* KPI 4: Pending Approvals */}
          <div style={{
            background: STAGEWAY_THEME.surface,
            border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
            borderRadius: 12,
            padding: '18px 20px',
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: STAGEWAY_THEME.textMuted, letterSpacing: '0.05em' }}>
              PENDING APPROVAL
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: pendingCash > 0 ? '#F59E0B' : STAGEWAY_THEME.textPrimary, marginTop: 4 }}>
              {pendingCash}
            </div>
            <div style={{ fontSize: '0.8rem', color: STAGEWAY_THEME.textSecondary, marginTop: 4 }}>
              Cash orders awaiting organizer
            </div>
          </div>
        </div>

        {/* ================= TAB 1: OVERVIEW ================= */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Quick action card */}
            <div style={{
              background: `linear-gradient(135deg, ${STAGEWAY_THEME.surface} 0%, ${STAGEWAY_THEME.light} 100%)`,
              border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
              borderRadius: 14,
              padding: '28px 32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 8px 20px rgba(0,0,0,0.15)'
            }}>
              <div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 6px', color: STAGEWAY_THEME.textPrimary }}>
                  Welcome back, {prUser.displayName}!
                </h2>
                <p style={{ margin: 0, fontSize: '0.9rem', color: STAGEWAY_THEME.textSecondary, maxWidth: 600, lineHeight: 1.5 }}>
                  You have access to <strong>{events.length}</strong> event(s). Issue tickets directly or collect cash orders to be verified by the organizer.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => { setSellModalEventId(undefined); setShowSell(true) }}
                  style={{
                    background: '#10A579',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '12px 22px',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  + Issue New Pass
                </button>
                <button
                  onClick={() => setActiveTab('events')}
                  style={{
                    background: STAGEWAY_THEME.surface,
                    color: STAGEWAY_THEME.textPrimary,
                    border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                    padding: '12px 20px',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  View Events
                </button>
              </div>
            </div>

            {/* Recent Sales preview */}
            <div style={{
              background: STAGEWAY_THEME.surface,
              border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
              borderRadius: 14,
              padding: 24,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: STAGEWAY_THEME.textPrimary }}>
                    Recent Ticket Orders
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: STAGEWAY_THEME.textSecondary, marginTop: 2 }}>
                    Latest passes generated under your partner attribution
                  </div>
                </div>
                {sales.length > 5 && (
                  <button
                    onClick={() => setActiveTab('sales')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#10A579',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    View All {sales.length} Sales →
                  </button>
                )}
              </div>

              {sales.length === 0 ? (
                <div style={{ padding: '36px 20px', textAlign: 'center', color: STAGEWAY_THEME.textMuted }}>
                  No ticket sales recorded yet. Click <strong>+ Issue New Pass</strong> to generate your first pass!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sales.slice(0, 5).map(sale => (
                    <div
                      key={sale.orderId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 18px',
                        background: STAGEWAY_THEME.light,
                        borderRadius: 10,
                        border: `1px solid ${STAGEWAY_THEME.borderLight}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                          width: 38,
                          height: 38,
                          borderRadius: 8,
                          background: STAGEWAY_THEME.surface,
                          border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                          color: STAGEWAY_THEME.textPrimary,
                          fontWeight: 700,
                          fontSize: '1rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {sale.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem', color: STAGEWAY_THEME.textPrimary }}>
                            {sale.name}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: STAGEWAY_THEME.textSecondary }}>
                            {sale.email} • {sale.ticketType || sale.gender || 'Pass'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: STAGEWAY_THEME.textPrimary }}>
                            ₹{sale.amount?.toLocaleString()}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: STAGEWAY_THEME.textMuted }}>
                            {new Date(sale.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </div>
                        </div>
                        {statusBadge(sale.status)}
                        <button
                          onClick={() => setViewSale(sale)}
                          style={{
                            background: STAGEWAY_THEME.surface,
                            border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                            color: STAGEWAY_THEME.textPrimary,
                            padding: '6px 12px',
                            borderRadius: 6,
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: MY SALES ================= */}
        {activeTab === 'sales' && (
          <div style={{
            background: STAGEWAY_THEME.surface,
            border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
            borderRadius: 14,
            padding: 24,
          }}>
            {/* Filter Bar */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: STAGEWAY_THEME.textPrimary }}>
                  Ticket Sales Ledger
                </h3>
                <div style={{ fontSize: '0.8rem', color: STAGEWAY_THEME.textSecondary, marginTop: 2 }}>
                  Showing {filteredSales.length} of {sales.length} total orders
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {/* Search */}
                <input
                  type="text"
                  placeholder="Search name, email, pass ID…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    background: STAGEWAY_THEME.inputBg,
                    border: `1px solid ${STAGEWAY_THEME.inputBorder}`,
                    color: STAGEWAY_THEME.textPrimary,
                    padding: '8px 14px',
                    borderRadius: 8,
                    fontSize: '0.85rem',
                    minWidth: 240,
                    outline: 'none'
                  }}
                />

                {/* Filter Payment */}
                <select
                  value={paymentFilter}
                  onChange={e => setPaymentFilter(e.target.value as any)}
                  style={{
                    background: STAGEWAY_THEME.inputBg,
                    border: `1px solid ${STAGEWAY_THEME.inputBorder}`,
                    color: STAGEWAY_THEME.textPrimary,
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                >
                  <option value="all">All Payment Methods</option>
                  <option value="direct">Direct PR Pass</option>
                  <option value="cash">Cash Pending</option>
                  <option value="razorpay">Razorpay Online</option>
                </select>

                <button
                  onClick={loadData}
                  title="Refresh Sales"
                  style={{
                    background: STAGEWAY_THEME.light,
                    border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                    color: STAGEWAY_THEME.textSecondary,
                    padding: '8px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600
                  }}
                >
                  ↻ Refresh
                </button>
              </div>
            </div>

            {loading ? (
              <div style={{ padding: '48px', textAlign: 'center', color: STAGEWAY_THEME.textMuted }}>
                Loading sales ledger…
              </div>
            ) : filteredSales.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', color: STAGEWAY_THEME.textMuted }}>
                No sales records match your filters.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${STAGEWAY_THEME.borderLight}`, color: STAGEWAY_THEME.textMuted, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '12px 14px' }}>Date</th>
                      <th style={{ padding: '12px 14px' }}>Attendee</th>
                      <th style={{ padding: '12px 14px' }}>Tier / Event</th>
                      <th style={{ padding: '12px 14px' }}>Amount</th>
                      <th style={{ padding: '12px 14px' }}>Method</th>
                      <th style={{ padding: '12px 14px' }}>Status</th>
                      <th style={{ padding: '12px 14px' }}>Pass ID</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.map(sale => (
                      <tr
                        key={sale.orderId}
                        style={{
                          borderBottom: `1px solid ${STAGEWAY_THEME.borderLight}`,
                          transition: 'background 0.1s ease',
                        }}
                      >
                        <td style={{ padding: '14px', color: STAGEWAY_THEME.textSecondary, whiteSpace: 'nowrap' }}>
                          {new Date(sale.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '14px' }}>
                          <div style={{ fontWeight: 600, color: STAGEWAY_THEME.textPrimary }}>{sale.name}</div>
                          <div style={{ fontSize: '0.8rem', color: STAGEWAY_THEME.textSecondary }}>{sale.email} • {sale.phone}</div>
                        </td>
                        <td style={{ padding: '14px' }}>
                          <div style={{ fontWeight: 600, color: STAGEWAY_THEME.textPrimary }}>{sale.ticketType || sale.gender || 'General'}</div>
                          <div style={{ fontSize: '0.8rem', color: STAGEWAY_THEME.textMuted }}>{sale.event}</div>
                        </td>
                        <td style={{ padding: '14px', fontWeight: 800, color: STAGEWAY_THEME.textPrimary }}>
                          ₹{sale.amount?.toLocaleString()}
                        </td>
                        <td style={{ padding: '14px' }}>
                          <span style={{
                            background: STAGEWAY_THEME.light,
                            border: `1px solid ${STAGEWAY_THEME.borderLight}`,
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: '11px',
                            fontWeight: 700,
                            textTransform: 'uppercase'
                          }}>
                            {sale.paymentMethod === 'cash' ? 'Cash' : sale.paymentMethod === 'razorpay' ? 'Razorpay' : 'Direct PR'}
                          </span>
                        </td>
                        <td style={{ padding: '14px' }}>
                          {statusBadge(sale.status)}
                        </td>
                        <td style={{ padding: '14px', fontFamily: 'monospace', fontSize: '0.8rem', color: STAGEWAY_THEME.textMuted }}>
                          {sale.ticketId || '—'}
                        </td>
                        <td style={{ padding: '14px', textAlign: 'right' }}>
                          <button
                            onClick={() => setViewSale(sale)}
                            style={{
                              background: STAGEWAY_THEME.light,
                              border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                              color: STAGEWAY_THEME.textPrimary,
                              padding: '6px 12px',
                              borderRadius: 6,
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: ASSIGNED EVENTS ================= */}
        {activeTab === 'events' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: STAGEWAY_THEME.textPrimary }}>
                Assigned Events & Inventory
              </h3>
              <div style={{ fontSize: '0.85rem', color: STAGEWAY_THEME.textSecondary, marginTop: 4 }}>
                Events you are authorized to promote and sell passes for.
              </div>
            </div>

            {loading ? (
              <div style={{ padding: '48px', textAlign: 'center', color: STAGEWAY_THEME.textMuted }}>
                Loading assigned events…
              </div>
            ) : events.length === 0 ? (
              <div style={{
                background: STAGEWAY_THEME.surface,
                border: `1.5px dashed ${STAGEWAY_THEME.borderMedium}`,
                borderRadius: 14,
                padding: '48px 24px',
                textAlign: 'center',
                color: STAGEWAY_THEME.textMuted
              }}>
                No events assigned yet. Contact your organizer to be assigned to active events.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
                {events.map(ev => (
                  <div
                    key={ev.id}
                    style={{
                      background: STAGEWAY_THEME.surface,
                      border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                      borderRadius: 14,
                      padding: 22,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.1)'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: STAGEWAY_THEME.textPrimary }}>
                            {ev.name}
                          </h4>
                          <div style={{ fontSize: '0.8rem', color: STAGEWAY_THEME.textSecondary, marginTop: 4 }}>
                            📍 {ev.venue || 'Venue TBA'} {ev.city ? `· ${ev.city}` : ''}
                          </div>
                        </div>
                        <span style={{
                          background: 'rgba(16, 165, 121, 0.15)',
                          color: '#10A579',
                          border: '1px solid rgba(16, 165, 121, 0.3)',
                          borderRadius: 6,
                          padding: '2px 8px',
                          fontSize: '11px',
                          fontWeight: 700
                        }}>
                          ACTIVE
                        </span>
                      </div>

                      {ev.date && (
                        <div style={{ fontSize: '0.85rem', color: STAGEWAY_THEME.textMuted, marginBottom: 16 }}>
                          🗓 {ev.date} {ev.time ? `at ${ev.time}` : ''}
                        </div>
                      )}

                      {/* Ticket tiers */}
                      <div style={{ borderTop: `1px solid ${STAGEWAY_THEME.borderLight}`, paddingTop: 14, marginBottom: 16 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                          Available Pass Tiers
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {(ev.ticketCategories || []).map(cat => (
                            <div
                              key={cat.id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: STAGEWAY_THEME.light,
                                padding: '8px 12px',
                                borderRadius: 8,
                                fontSize: '0.85rem'
                              }}
                            >
                              <span style={{ fontWeight: 600, color: STAGEWAY_THEME.textPrimary }}>{cat.name}</span>
                              <span style={{ fontWeight: 800, color: '#10A579' }}>
                                {cat.currency || 'INR'} {Number(cat.price).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setSellModalEventId(ev.id)
                        setShowSell(true)
                      }}
                      style={{
                        width: '100%',
                        background: '#10A579',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '10px',
                        borderRadius: 8,
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: 'pointer'
                      }}
                    >
                      Issue Pass for This Event
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ================= MODAL: SELL TICKET ================= */}
      {showSell && (
        <SellTicketModal
          prUser={prUser}
          initialEventId={sellModalEventId}
          onClose={() => setShowSell(false)}
          onSuccess={() => {
            setShowSell(false)
            loadData()
          }}
        />
      )}

      {/* ================= MODAL: VIEW SALE DETAILS ================= */}
      {viewSale && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
          }}
          onClick={() => setViewSale(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 520,
              background: STAGEWAY_THEME.surface,
              border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '20px 24px', borderBottom: `1px solid ${STAGEWAY_THEME.borderLight}`,
              background: STAGEWAY_THEME.sidebarBg
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: STAGEWAY_THEME.textPrimary }}>
                  Ticket Order Details
                </h3>
                <div style={{ fontSize: '0.8rem', color: STAGEWAY_THEME.textSecondary, marginTop: 2 }}>
                  Order ID: {viewSale.orderId}
                </div>
              </div>
              <button
                onClick={() => setViewSale(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: STAGEWAY_THEME.textMuted,
                  fontSize: '1.25rem',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Attendee */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Buyer / Attendee
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: STAGEWAY_THEME.light, padding: '12px 16px', borderRadius: 10,
                  border: `1px solid ${STAGEWAY_THEME.borderLight}`
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 8, background: STAGEWAY_THEME.surface,
                    border: `1px solid ${STAGEWAY_THEME.borderMedium}`, color: STAGEWAY_THEME.textPrimary,
                    fontWeight: 800, fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {viewSale.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: STAGEWAY_THEME.textPrimary }}>{viewSale.name}</div>
                    <div style={{ fontSize: '0.85rem', color: STAGEWAY_THEME.textSecondary }}>{viewSale.email} • {viewSale.phone}</div>
                  </div>
                </div>
              </div>

              {/* Pass details */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Pass Information
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ background: STAGEWAY_THEME.light, padding: '12px 14px', borderRadius: 8, border: `1px solid ${STAGEWAY_THEME.borderLight}` }}>
                    <div style={{ fontSize: '0.75rem', color: STAGEWAY_THEME.textMuted, fontWeight: 700 }}>EVENT</div>
                    <div style={{ fontWeight: 600, marginTop: 3, color: STAGEWAY_THEME.textPrimary }}>{viewSale.event}</div>
                  </div>
                  <div style={{ background: STAGEWAY_THEME.light, padding: '12px 14px', borderRadius: 8, border: `1px solid ${STAGEWAY_THEME.borderLight}` }}>
                    <div style={{ fontSize: '0.75rem', color: STAGEWAY_THEME.textMuted, fontWeight: 700 }}>PASS TIER</div>
                    <div style={{ fontWeight: 600, marginTop: 3, color: STAGEWAY_THEME.textPrimary }}>{viewSale.ticketType || viewSale.gender || 'General Pass'}</div>
                  </div>
                  <div style={{ background: STAGEWAY_THEME.light, padding: '12px 14px', borderRadius: 8, border: `1px solid ${STAGEWAY_THEME.borderLight}` }}>
                    <div style={{ fontSize: '0.75rem', color: STAGEWAY_THEME.textMuted, fontWeight: 700 }}>QUANTITY</div>
                    <div style={{ fontWeight: 600, marginTop: 3, color: STAGEWAY_THEME.textPrimary }}>{viewSale.quantity || 1} pass(es)</div>
                  </div>
                  <div style={{ background: STAGEWAY_THEME.light, padding: '12px 14px', borderRadius: 8, border: `1px solid ${STAGEWAY_THEME.borderLight}` }}>
                    <div style={{ fontSize: '0.75rem', color: STAGEWAY_THEME.textMuted, fontWeight: 700 }}>STATUS</div>
                    <div style={{ marginTop: 4 }}>{statusBadge(viewSale.status)}</div>
                  </div>
                </div>
              </div>

              {/* Actions for Ticket Pass */}
              {viewSale.ticketId && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={async () => {
                      try {
                        const response = await fetch(`${API}/api/pr/tickets/${encodeURIComponent(viewSale.ticketId!)}/download`, { headers: prAuthHeaders() })
                        if (!response.ok) throw new Error('Ticket download is not authorized.')
                        const url = URL.createObjectURL(await response.blob())
                        const anchor = document.createElement('a')
                        anchor.href = url
                        anchor.download = `Stageway-pass-${viewSale.ticketId}.pdf`
                        document.body.appendChild(anchor)
                        anchor.click()
                        anchor.remove()
                        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
                      } catch (error) {
                        alert(error instanceof Error ? error.message : 'Ticket download failed.')
                      }
                    }}
                    style={{
                      flex: 1,
                      background: '#10A579',
                      color: '#FFFFFF',
                      border: 'none',
                      padding: '11px',
                      borderRadius: 8,
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      cursor: 'pointer'
                    }}
                  >
                    Download Pass PDF 📄
                  </button>

                  <button
                    onClick={async (e) => {
                      const btn = e.currentTarget
                      const orig = btn.innerText
                      btn.innerText = 'Sending…'
                      try {
                        const response = await fetch(`${API}/api/pr/tickets/${encodeURIComponent(viewSale.ticketId!)}/resend`, { method: 'POST', headers: prAuthHeaders() })
                        if (!response.ok) throw new Error('Ticket resend failed.')
                        btn.innerText = 'Email Sent! ✓'
                      } catch {
                        btn.innerText = 'Failed to Send'
                      }
                      setTimeout(() => btn.innerText = orig, 2500)
                    }}
                    style={{
                      flex: 1,
                      background: STAGEWAY_THEME.light,
                      color: STAGEWAY_THEME.textPrimary,
                      border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                      padding: '11px',
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      cursor: 'pointer'
                    }}
                  >
                    Resend Email ✉️
                  </button>
                </div>
              )}

              {/* Payment Summary */}
              <div style={{
                background: STAGEWAY_THEME.light,
                borderRadius: 10,
                padding: '16px 18px',
                border: `1px solid ${STAGEWAY_THEME.borderLight}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem' }}>
                  <span style={{ color: STAGEWAY_THEME.textSecondary }}>Payment Gateway</span>
                  <span style={{ fontWeight: 600, color: STAGEWAY_THEME.textPrimary }}>
                    {viewSale.paymentMethod === 'cash' ? 'Cash Collection' : viewSale.paymentMethod === 'razorpay' ? 'Razorpay' : 'Direct Pass'} ({viewSale.paymentId || '—'})
                  </span>
                </div>
                <div style={{
                  borderTop: `1px solid ${STAGEWAY_THEME.borderLight}`,
                  paddingTop: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 800,
                  fontSize: '1.1rem'
                }}>
                  <span style={{ color: STAGEWAY_THEME.textPrimary }}>Total Paid</span>
                  <span style={{ color: '#10A579' }}>₹{viewSale.amount?.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== ROOT ====================
export default function PRApp() {
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('stageway_theme_mode') || localStorage.getItem('theme')
      return saved === 'light' ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode)
    try {
      localStorage.setItem('stageway_theme_mode', themeMode)
      localStorage.setItem('theme', themeMode)
    } catch {}
  }, [themeMode])

  const toggleTheme = useCallback(() => {
    setThemeMode(prev => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  const [prUser, setPrUser] = useState<PRUser | null>(() => {
    try {
      const saved = sessionStorage.getItem('pr_user') || localStorage.getItem('pr_user')
      const token = sessionStorage.getItem('pr_token') || localStorage.getItem('pr_token')
      if (!saved || !token || !token.includes('.')) return null
      return JSON.parse(saved)
    } catch {
      return null
    }
  })

  function handleLogout() {
    const token = getPRToken()
    void fetch('/api/auth/logout', { method: 'POST', headers: { 'x-auth-token': token } }).catch(() => {})
    sessionStorage.removeItem('pr_user')
    sessionStorage.removeItem('pr_token')
    localStorage.removeItem('pr_user')
    localStorage.removeItem('pr_token')
    setPrUser(null)
  }

  if (!prUser) {
    return <LoginPage onLogin={setPrUser} themeMode={themeMode} toggleTheme={toggleTheme} />
  }

  return (
    <PRDashboard
      prUser={prUser}
      onLogout={handleLogout}
      themeMode={themeMode}
      toggleTheme={toggleTheme}
    />
  )
}
