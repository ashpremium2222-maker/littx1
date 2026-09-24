import React, { useState } from 'react'

interface UserSession {
  userId: string
  displayName: string
  role: string
  companyId: string
  portalScope: 'admin' | 'dashboard'
  token?: string
}

interface LoginPageProps {
  portal: 'admin' | 'dashboard'
  onLoginSuccess: (session: UserSession) => void
}

export default function LoginPage({ portal, onLoginSuccess }: LoginPageProps) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const portalTitle = portal === 'admin' ? 'Admin Portal' : 'Dashboard'

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/portal-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portal, password })
      })
      const data = await res.json()
      if (!res.ok || !data.success || !data.user || !data.token) {
        setError(data.message || 'Invalid access key')
        return
      }

      const session = { ...data.user, token: data.token } as UserSession
      localStorage.setItem('littx_user', JSON.stringify(session))
      localStorage.setItem('littx_token', data.token)
      sessionStorage.setItem('littx_user', JSON.stringify(session))
      sessionStorage.setItem('littx_token', data.token)
      setPassword('')
      onLoginSuccess(session)
    } catch (err: any) {
      setError(err.message || 'Server connection error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-canvas theme-dark" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: '#09080F' }}>
      <div className="card" style={{ width: '100%', maxWidth: '460px', padding: '36px', background: 'linear-gradient(135deg, #0F0D1A 0%, #0A0912 100%)', border: '1px solid rgba(216,255,63,0.25)', boxShadow: '0 20px 60px rgba(0,0,0,0.95)' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img src="/logo.png" alt="LITTX" style={{ height: '36px', width: 'auto', margin: '0 auto 12px', display: 'block' }} />
          <h2 style={{ margin: '0 0 6px', fontSize: '1.5rem', fontWeight: 800, color: 'var(--ink)' }}>LITTX {portalTitle.toUpperCase()}</h2>
          <div style={{ fontSize: '12px', color: 'var(--ink-faint)' }}>Enter your access key to continue</div>
        </div>

        {error && <div style={{ background: 'rgba(255,107,107,0.15)', border: '1px solid rgba(255,107,107,0.3)', color: 'var(--red)', padding: '12px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, marginBottom: '20px', textAlign: 'center' }}>⚠️ {error}</div>}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="field">
            <label style={{ color: 'var(--volt)', fontWeight: 700 }}>ACCESS KEY</label>
            <input type="password" placeholder="Enter access key" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus autoComplete="current-password" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: '14px', fontSize: '14px', marginTop: '8px' }}>
            {loading ? 'Authenticating…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
