import React, { useState } from 'react'

interface PublicSignInModalProps {
  onClose: () => void
  onLoginSuccess: (session: any) => void
}

export default function PublicSignInModal({ onClose, onLoginSuccess }: PublicSignInModalProps) {
  const [loginType, setLoginType] = useState<'select' | 'company' | 'pr'>('select')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      const data = await res.json()
      if (data.success && data.user) {
        sessionStorage.setItem('littx_user', JSON.stringify(data.user))
        sessionStorage.setItem('littx_token', data.token)
        onLoginSuccess(data.user)
      } else {
        setError(data.message || 'Invalid login credentials.')
      }
    } catch (err: any) {
      setError(err.message || 'Server connection error.')
    } finally {
      setLoading(false)
    }
  }

  const quickFill = (u: string, p: string) => {
    setUsername(u)
    setPassword(p)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 3000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: 0,
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #0F0D1A 0%, #0A0912 100%)',
          border: '1px solid rgba(216,255,63,0.3)',
          boxShadow: '0 25px 70px rgba(0,0,0,0.95)'
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', background: 'var(--panel-2)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/logo.png" alt="LITTX" style={{ height: '24px', width: 'auto' }} />
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--ink)' }}>
              {loginType === 'select' ? 'SIGN IN TO LITTX' : loginType === 'company' ? 'Event Company Portal' : 'PR Partner Portal'}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: '1.3rem' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '28px' }}>
          {loginType === 'select' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '13px', color: 'var(--ink-soft)', textAlign: 'center', marginBottom: '8px' }}>
                Select your account portal type to continue:
              </div>

              {/* Option 1: Event Company */}
              <button
                onClick={() => { setLoginType('company'); setError(''); }}
                style={{
                  padding: '18px',
                  borderRadius: '14px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line)',
                  color: 'var(--ink)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--volt-dim)', border: '1px solid rgba(216,255,63,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--volt)', fontSize: '1.3rem' }}>
                  🏢
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--ink)' }}>Event Company</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>Sign in as Event Organiser or Manager</div>
                </div>
              </button>

              {/* Option 2: PR Partner */}
              <button
                onClick={() => { setLoginType('pr'); setError(''); }}
                style={{
                  padding: '18px',
                  borderRadius: '14px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line)',
                  color: 'var(--ink)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(245, 185, 66, 0.15)', border: '1px solid rgba(245, 185, 66, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F5B942', fontSize: '1.3rem' }}>
                  🤝
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--ink)' }}>PR Partner</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>Sign in to PR sales & commission portal</div>
                </div>
              </button>
            </div>
          ) : (
            <div>
              <button
                onClick={() => setLoginType('select')}
                style={{ background: 'none', border: 'none', color: 'var(--volt)', cursor: 'pointer', fontSize: '11px', fontWeight: 700, marginBottom: '16px', padding: 0 }}
              >
                ← Back to Portal Options
              </button>

              {error && (
                <div style={{ background: 'rgba(255,107,107,0.15)', border: '1px solid rgba(255,107,107,0.3)', color: 'var(--red)', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, marginBottom: '16px' }}>
                  ⚠️ {error}
                </div>
              )}

              <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label>{loginType === 'company' ? 'COMPANY ADMIN EMAIL / USERNAME' : 'PR USERNAME'}</label>
                  <input
                    type="text"
                    placeholder={loginType === 'company' ? 'admin@littlane.in' : 'partner1'}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="field">
                  <label>PASSWORD</label>
                  <input
                    type="password"
                    placeholder="••••••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary" disabled={loading} style={{ padding: '14px', marginTop: '6px', fontSize: '14px' }}>
                  {loading ? 'Authenticating…' : `Sign in to ${loginType === 'company' ? 'Company' : 'PR'} Portal`}
                </button>
              </form>

              {/* Demo Fill Helper */}
              <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid var(--line)' }}>
                <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Demo Credentials
                </div>
                {loginType === 'company' ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => quickFill('admin@littlane.in', 'littlane-2026')} className="btn btn-secondary" style={{ fontSize: '10px', padding: '4px 8px' }}>Littlane Admin</button>
                    <button onClick={() => quickFill('admin@nexora.in', 'nexora-2026')} className="btn btn-secondary" style={{ fontSize: '10px', padding: '4px 8px' }}>Nexora Admin</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => quickFill('partner1', 'ftpr@001')} className="btn btn-secondary" style={{ fontSize: '10px', padding: '4px 8px' }}>Partner One</button>
                    <button onClick={() => quickFill('partner3', 'ftpr@003')} className="btn btn-secondary" style={{ fontSize: '10px', padding: '4px 8px' }}>Partner Three</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
