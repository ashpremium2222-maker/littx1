import React, { useState } from 'react'

interface UserSession {
  userId: string
  displayName: string
  role: string
  companyId: string
  allowedPasses?: any[]
  token?: string
}

interface LoginPageProps {
  onLoginSuccess: (session: UserSession) => void
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ipLocked, setIpLocked] = useState<{ lockedIp: string } | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    setLoading(true)
    setError('')
    setIpLocked(null)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      const data = await res.json()
      if (data.success && data.user) {
        const tokenVal = data.token || 'dash-2026'
        localStorage.setItem('littx_user', JSON.stringify(data.user))
        localStorage.setItem('littx_token', tokenVal)
        sessionStorage.setItem('littx_user', JSON.stringify(data.user))
        sessionStorage.setItem('littx_token', tokenVal)
        onLoginSuccess(data.user)
      } else if (data.ipLocked) {
        // Distinct handling — this is a device lock, not a password error
        setIpLocked({ lockedIp: data.lockedIp || 'another device' })
      } else {
        setError(data.message || 'Invalid login credentials')
      }
    } catch (err: any) {
      setError(err.message || 'Server connection error')
    } finally {
      setLoading(false)
    }
  }

  // Quick fill helper for testing
  const quickFill = (u: string, p: string) => {
    setUsername(u)
    setPassword(p)
  }

  return (
    <div className="app-canvas" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '36px',
          background: 'linear-gradient(135deg, #0F0D1A 0%, #0A0912 100%)',
          border: '1px solid rgba(216,255,63,0.25)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.95)'
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img src="/logo.png" alt="LITTX" style={{ height: '36px', width: 'auto', margin: '0 auto 12px', display: 'block' }} />
          <h2 style={{ margin: '0 0 6px', fontSize: '1.5rem', fontWeight: 800, color: 'var(--ink)' }}>LITTX PLATFORM</h2>
          <div style={{ fontSize: '12px', color: 'var(--ink-faint)' }}>Multi-Tenant SaaS Event Portal</div>
        </div>

        {/* IP-lock error — distinct from a password error, shown as a device-locked warning */}
        {ipLocked && (
          <div
            style={{
              background: 'rgba(168,85,247,0.1)',
              border: '1px solid rgba(168,85,247,0.35)',
              color: '#c4b5fd',
              padding: '14px 16px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 600,
              marginBottom: '20px',
              textAlign: 'center',
              lineHeight: 1.6
            }}
          >
            🔒 Account locked to another device<br />
            <span style={{ fontWeight: 400, color: '#a78bfa' }}>
              IP: <code style={{ background: 'rgba(168,85,247,0.15)', padding: '2px 6px', borderRadius: 4 }}>{ipLocked.lockedIp}</code>
            </span><br />
            Contact your admin to unlock this account.
          </div>
        )}

        {error && (
          <div
            style={{
              background: 'rgba(255,107,107,0.15)',
              border: '1px solid rgba(255,107,107,0.3)',
              color: 'var(--red)',
              padding: '12px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 600,
              marginBottom: '20px',
              textAlign: 'center'
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="field">
            <label style={{ color: 'var(--volt)', fontWeight: 700 }}>USERNAME / EMAIL / SELLER ID</label>
            <input
              type="text"
              placeholder="e.g. superadmin@littx.in or admin@littlane.in"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label style={{ color: 'var(--volt)', fontWeight: 700 }}>PASSWORD</label>
            <input
              type="password"
              placeholder="••••••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '14px', fontSize: '14px', marginTop: '8px' }}
          >
            {loading ? 'Authenticating…' : 'Log in to Portal'}
          </button>
        </form>

        {/* Quick Demo Credentials Switcher */}
        <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.05em', textAlign: 'center' }}>
            DEMO MULTI-TENANT CREDENTIALS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              onClick={() => quickFill('superadmin@littx.in', 'littx-master-2026')}
              className="btn btn-secondary"
              style={{ fontSize: '10px', padding: '6px', textAlign: 'left', display: 'flex', flexDirection: 'column' }}
            >
              <strong style={{ color: 'var(--volt)' }}>Master Admin</strong>
              <span style={{ fontSize: '9px', opacity: 0.7 }}>superadmin@littx.in</span>
            </button>

            <button
              onClick={() => quickFill('admin@littlane.in', 'littlane-2026')}
              className="btn btn-secondary"
              style={{ fontSize: '10px', padding: '6px', textAlign: 'left', display: 'flex', flexDirection: 'column' }}
            >
              <strong style={{ color: 'var(--green)' }}>Company Admin</strong>
              <span style={{ fontSize: '9px', opacity: 0.7 }}>admin@littlane.in</span>
            </button>

            <button
              onClick={() => quickFill('partner1', 'ftpr@001')}
              className="btn btn-secondary"
              style={{ fontSize: '10px', padding: '6px', textAlign: 'left', display: 'flex', flexDirection: 'column' }}
            >
              <strong style={{ color: 'var(--amber)' }}>PR Partner</strong>
              <span style={{ fontSize: '9px', opacity: 0.7 }}>partner1</span>
            </button>

            <button
              onClick={() => quickFill('SELLER-A', 'littx-a-2026')}
              className="btn btn-secondary"
              style={{ fontSize: '10px', padding: '6px', textAlign: 'left', display: 'flex', flexDirection: 'column' }}
            >
              <strong style={{ color: 'var(--violet-2)' }}>Seller App</strong>
              <span style={{ fontSize: '9px', opacity: 0.7 }}>SELLER-A</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
