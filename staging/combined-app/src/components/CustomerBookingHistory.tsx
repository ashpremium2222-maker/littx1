import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'

type Booking = {
  orderId: string
  event: string
  ticketCategory: string | null
  quantity: number
  admissionCount: number
  amount: number | null
  currency: string
  status: string
  createdAt: string | null
  reservationExpiresAt: string | null
  emailStatus: string
  whatsappStatus: string
  ticketId: string | null
  ticketAccessToken: string | null
}

export default function CustomerBookingHistory() {
  const [email, setEmail] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [code, setCode] = useState('')
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function requestCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice(''); setBookings(null)
    try {
      const response = await fetch('/api/customer/bookings/recovery/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'A verification code could not be sent.')
      setChallengeId(result.challengeId)
      setNotice(result.message)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'A verification code could not be sent.') }
    finally { setBusy(false) }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/customer/bookings/recovery/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, challengeId, code })
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Verification failed. Request a new code and try again.')
      setBookings(result.bookings || [])
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Verification failed. Request a new code and try again.') }
    finally { setBusy(false) }
  }

  async function downloadTicket(booking: Booking) {
    if (!booking.ticketId || !booking.ticketAccessToken) return
    setDownloading(booking.ticketId); setError('')
    try {
      const response = await fetch('/api/customer/bookings/ticket-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${booking.ticketAccessToken}` },
        body: JSON.stringify({ ticketId: booking.ticketId })
      })
      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(result?.message || 'Ticket download failed. Verify your booking again.')
      }
      const blobUrl = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = blobUrl
      anchor.download = `Stageway-ticket-${booking.ticketId}.pdf`
      document.body.appendChild(anchor); anchor.click(); anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Ticket download failed.') }
    finally { setDownloading('') }
  }

  const page: CSSProperties = { minHeight: '100vh', background: '#090811', color: '#f5f3fa', padding: 'clamp(20px, 5vw, 64px)', fontFamily: 'Inter, system-ui, sans-serif' }
  const panel: CSSProperties = { background: '#14121f', border: '1px solid #2a2737', borderRadius: 18, padding: 22, margin: '22px auto', maxWidth: 760 }
  const input: CSSProperties = { width: '100%', padding: '12px 14px', background: '#0c0b13', color: 'inherit', border: '1px solid #393548', borderRadius: 10, boxSizing: 'border-box' }

  return <main style={page}>
    <a href="/events" style={{ color: '#d8ff3f', textDecoration: 'none', fontWeight: 700 }}>← Browse events</a>
    <section style={panel}>
      <h1>Booking history</h1>
      <p style={{ color: '#bcb8c9' }}>Verify the email used for your booking to see its status and recover available tickets. Verification codes expire after 10 minutes and work once.</p>
      <form onSubmit={requestCode} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0,1fr) auto' }}>
        <label>Email address<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} style={{ ...input, display: 'block', marginTop: 6 }} /></label>
        <button disabled={busy} style={{ alignSelf: 'end', border: 0, borderRadius: 10, padding: '13px 18px', background: '#d8ff3f', color: '#111', fontWeight: 800 }}>{busy ? 'Sending…' : 'Send code'}</button>
      </form>
      {challengeId && <form onSubmit={verifyCode} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0,1fr) auto', marginTop: 16 }}>
        <label>6-digit verification code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value)} style={{ ...input, display: 'block', marginTop: 6 }} /></label>
        <button disabled={busy || code.length !== 6} style={{ alignSelf: 'end', border: '1px solid #4c4860', borderRadius: 10, padding: '12px 18px', background: '#201d2d', color: '#f5f3fa', fontWeight: 700 }}>{busy ? 'Checking…' : 'View bookings'}</button>
      </form>}
      {notice && <p role="status" style={{ color: '#d8ff3f' }}>{notice}</p>}
      {error && <p role="alert" style={{ color: '#ff7777' }}>{error}</p>}
    </section>
    {bookings && <section style={panel} aria-live="polite">
      <h2>Your bookings</h2>
      {bookings.length === 0 ? <p>No bookings were found for this verified email.</p> : bookings.map(booking => <article key={booking.orderId} style={{ borderTop: '1px solid #393548', padding: '18px 0' }}>
        <h3 style={{ margin: '0 0 8px' }}>{booking.event}</h3>
        <p>{booking.ticketCategory || 'Ticket'} · {booking.quantity} order item(s) · {booking.admissionCount} admission(s)</p>
        <p>Status: <strong>{booking.status.replace(/_/g, ' ')}</strong>{booking.amount !== null ? ` · ${booking.currency} ${booking.amount.toLocaleString()}` : ''}</p>
        {booking.reservationExpiresAt && ['pending', 'created'].includes(booking.status.toLowerCase()) && <p>Reservation expires {new Date(booking.reservationExpiresAt).toLocaleString()}.</p>}
        {booking.ticketId && <p>Ticket reference: <strong>{booking.ticketId}</strong></p>}
        <p>Email delivery: {booking.emailStatus} · WhatsApp delivery: {booking.whatsappStatus}</p>
        {booking.ticketAccessToken && <button type="button" disabled={downloading === booking.ticketId} onClick={() => downloadTicket(booking)} style={{ border: 0, borderRadius: 10, padding: '10px 14px', background: '#d8ff3f', color: '#111', fontWeight: 700, cursor: 'pointer' }}>{downloading === booking.ticketId ? 'Preparing PDF…' : 'Download ticket PDF'}</button>}
      </article>)}
    </section>}
  </main>
}
