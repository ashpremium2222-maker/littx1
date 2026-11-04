import React, { useState } from 'react'

interface UserSession {
  userId: string
  displayName: string
  role: string
  companyId: string
  portalScope: 'admin' | 'dashboard' | 'organizer'
  token?: string
}

interface LoginPageProps {
  portal: 'admin' | 'dashboard' | 'organizer'
  onLoginSuccess: (session: UserSession) => void
  brandTitle?: string
  accessHelpText?: string
}

export default function LoginPage({ portal, onLoginSuccess, brandTitle, accessHelpText }: LoginPageProps) {
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const portalTitle = portal === 'admin' ? 'Admin Portal' : portal === 'organizer' ? 'Organizer Portal' : 'Dashboard'

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch(portal === 'organizer' ? '/api/auth/login' : '/api/portal-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(portal === 'organizer' ? { username, password } : { portal, password }),
      })
      const data = await res.json()
      if (!res.ok || !data.success || !data.user || !data.token) {
        setError(data.message || 'Invalid access credentials')
        return
      }

      const session = { ...data.user, token: data.token } as UserSession
      sessionStorage.setItem('littx_user', JSON.stringify(session))
      sessionStorage.setItem('littx_token', data.token)
      localStorage.setItem('littx_user', JSON.stringify(session))
      localStorage.setItem('littx_token', data.token)
      if (data.cookieSession) {
        sessionStorage.removeItem('ft_admin_key')
        localStorage.removeItem('ft_admin_key')
      }
      setPassword('')
      onLoginSuccess(session)
    } catch (err: any) {
      setError(err.message || 'Server connection error')
    } finally {
      setLoading(false)
    }
  }

  const fillTestCredentials = () => {
    setUsername('organizer@stageway.in')
    setPassword('Organizer@2026!')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: '#0B0C0E',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          padding: 32,
          background: '#14161C',
          border: '1px solid #20232B',
          borderRadius: 12,
          boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo.png" alt="Stageway" style={{ height: 32, width: 'auto', margin: '0 auto 12px', display: 'block' }} />
          <h2 style={{ margin: '0 0 6px', fontSize: '1.25rem', fontWeight: 600, color: '#EDEDEF', letterSpacing: '-0.01em' }}>
            {brandTitle || `Stageway ${portalTitle}`}
          </h2>
          <div style={{ fontSize: 12, color: '#8B909A' }}>
            {accessHelpText || 'Enter your access credentials to proceed'}
          </div>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#EF4444',
              padding: '10px 14px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              marginBottom: 16,
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {portal === 'organizer' && (
            <div>
              <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4, textTransform: 'uppercase' }}>
                Account Email / ID
              </label>
              <input
                type="text"
                name="organizer-account"
                placeholder="organizer@stageway.in"
                value={username}
                onChange={event => setUsername(event.target.value)}
                required
                autoComplete="username"
                autoFocus
                style={{
                  width: '100%',
                  background: '#0E1013',
                  border: '1px solid #282C36',
                  borderRadius: 6,
                  padding: '9px 12px',
                  color: '#EDEDEF',
                  fontSize: 13,
                }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4, textTransform: 'uppercase' }}>
              {portal === 'organizer' ? 'Password' : 'Access Key'}
            </label>
            <input
              type="password"
              name={portal === 'organizer' ? 'organizer-password' : 'portal-access-key'}
              placeholder={portal === 'organizer' ? 'Enter password' : 'Enter access key'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoFocus={portal !== 'organizer'}
              autoComplete={portal === 'organizer' ? 'current-password' : 'off'}
              style={{
                width: '100%',
                background: '#0E1013',
                border: '1px solid #282C36',
                borderRadius: 6,
                padding: '9px 12px',
                color: '#EDEDEF',
                fontSize: 13,
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '11px',
              fontSize: 13,
              fontWeight: 600,
              marginTop: 6,
              background: '#EDEDEF',
              color: '#0B0C0E',
              border: 'none',
              borderRadius: 6,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Authenticating…' : 'Sign In'}
          </button>
        </form>

        {portal === 'organizer' && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #1E2026', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              onClick={fillTestCredentials}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#8B909A',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 11,
                fontFamily: 'JetBrains Mono, monospace',
                cursor: 'pointer',
              }}
            >
              Fill Test Credentials
            </button>

            <div style={{ fontSize: 12, color: '#555962', display: 'flex', gap: 8 }}>
              <a href="/organizer/apply" style={{ color: '#8B909A', textDecoration: 'none' }}>
                Apply as organizer
              </a>
              <span>·</span>
              <a href="/organizer/activate" style={{ color: '#8B909A', textDecoration: 'none' }}>
                Activate account
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
