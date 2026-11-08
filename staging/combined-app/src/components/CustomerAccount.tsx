import { useEffect, useState } from 'react'

type Customer = { name: string; email: string; phone?: string; phoneVerified?: boolean }

function csrfCookie() {
  const prefix = location.protocol === 'https:' ? '__Host-stageway_csrf=' : 'stageway_csrf='
  const value = document.cookie.split('; ').find(item => item.startsWith(prefix))?.slice(prefix.length)
  return value ? decodeURIComponent(value) : ''
}

export default function CustomerAccount() {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    const token = sessionStorage.getItem('littx_customer_token') || ''
    if (!token) { location.replace('/customer/login'); return }
    fetch('/api/customer/session', { headers: { 'x-auth-token': token }, cache: 'no-store' })
      .then(async response => {
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.message || 'Sign in again to continue.')
        if (alive) { setCustomer(data.user); sessionStorage.setItem('littx_customer', JSON.stringify(data.user)) }
      })
      .catch(reason => {
        if (!alive) return
        setError(reason instanceof Error ? reason.message : 'Your session could not be verified.')
        sessionStorage.removeItem('littx_customer'); sessionStorage.removeItem('littx_customer_token')
      })
    return () => { alive = false }
  }, [])

  async function signOut() {
    const token = sessionStorage.getItem('littx_customer_token') || ''
    try {
      await fetch('/api/customer/logout', { method: 'POST', headers: { 'x-auth-token': token, 'x-csrf-token': csrfCookie() } })
    } finally {
      sessionStorage.removeItem('littx_customer'); sessionStorage.removeItem('littx_customer_token')
      location.assign('/customer/login')
    }
  }

  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, color: '#F0EEF8', background: 'radial-gradient(ellipse 70% 60% at 50% 0%,rgba(216,255,63,.1),transparent 72%),#090811', fontFamily: 'Inter, sans-serif' }}>
    <section style={{ width: 'min(100%,520px)', padding: 'clamp(26px,6vw,48px)', border: '1px solid rgba(216,255,63,.18)', borderRadius: 28, background: 'rgba(18,16,29,.82)', boxShadow: '0 30px 90px rgba(0,0,0,.45)' }}>
      <a href="/" style={{ color: '#D8FF3F', textDecoration: 'none', fontSize: 12, fontWeight: 700 }}>← LITTX</a>
      {error ? <><h1 style={{ margin: '28px 0 8px' }}>Sign in again</h1><p style={{ color: '#AAA7B6', lineHeight: 1.6 }}>{error}</p><a href="/customer/login" style={{ color: '#D8FF3F' }}>Go to sign in →</a></> : !customer ? <p role="status" style={{ marginTop: 36, color: '#AAA7B6' }}>Checking your secure session…</p> : <>
        <p style={{ margin: '32px 0 8px', color: '#D8FF3F', fontSize: 11, fontWeight: 800, letterSpacing: '.16em' }}>YOUR LITTX ACCOUNT</p>
        <h1 style={{ margin: '0 0 24px', fontSize: 'clamp(28px,6vw,42px)', letterSpacing: '-.04em' }}>Hey, {customer.name.split(/\s+/)[0]}.</h1>
        <div style={{ display: 'grid', gap: 12, padding: 20, border: '1px solid rgba(255,255,255,.08)', borderRadius: 18, background: 'rgba(255,255,255,.035)' }}>
          <div><small style={{ display: 'block', marginBottom: 5, color: '#858292' }}>EMAIL</small>{customer.email}</div>
          {customer.phone && <div><small style={{ display: 'block', marginBottom: 5, color: '#858292' }}>VERIFIED PHONE</small>{customer.phone}</div>}
          <p style={{ margin: '4px 0 0', color: '#AAA7B6', fontSize: 13 }}>You’re signed in securely. Your tickets remain available from My tickets.</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>
          <a href="/events" style={{ flex: '1 1 170px', padding: 14, borderRadius: 13, background: 'linear-gradient(135deg,#D8FF3F,#9AE600)', color: '#090811', textAlign: 'center', textDecoration: 'none', fontWeight: 800 }}>Explore events</a>
          <a href="/bookings" style={{ flex: '1 1 140px', padding: 14, border: '1px solid rgba(255,255,255,.15)', borderRadius: 13, color: '#F0EEF8', textAlign: 'center', textDecoration: 'none', fontWeight: 700 }}>My tickets</a>
        </div>
        <button type="button" onClick={signOut} style={{ marginTop: 18, padding: '10px 0', border: 0, background: 'none', color: '#AAA7B6', cursor: 'pointer' }}>Sign out</button>
      </>}
    </section>
  </main>
}
