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
  
  const isMasterAdmin = portal === 'admin'
  const isOrganizer = portal === 'organizer'
  const portalTitle = isMasterAdmin ? 'Enterprise Admin' : isOrganizer ? 'Organizer Portal' : 'Dashboard'

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    setError('')

    try {
      let data: any = null
      let ok = false

      // If username provided (organizer or admin with email/username), try /api/auth/login first
      if (username.trim()) {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password }),
        })
        data = await res.json().catch(() => ({}))
        ok = res.ok && data.success
      }

      // If not successful or no username provided, try /api/portal-auth/login
      if (!ok) {
        const res = await fetch('/api/portal-auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ portal, password }),
        })
        const portalData = await res.json().catch(() => ({}))
        if (res.ok && portalData.success) {
          data = portalData
          ok = true
        } else if (!data?.message) {
          data = portalData
        }
      }

      if (!ok || !data?.success || !data?.user || !data?.token) {
        setError(data?.message || 'Invalid access credentials. Please verify your credentials and try again.')
        return
      }

      const session = {
        ...data.user,
        portalScope: isMasterAdmin ? 'admin' : isOrganizer ? 'organizer' : 'dashboard',
        token: data.token
      } as UserSession

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
      setError(err.message || 'Server connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const fillMasterAdminCredentials = () => {
    setUsername('superadmin@stageway.in')
    setPassword('Stageway@2026!')
  }

  const fillOrganizerCredentials = () => {
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
        padding: 24,
        background: '#0B0C0E',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Background ambient emerald glow */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 500,
          height: 350,
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, rgba(11, 12, 14, 0) 70%)',
          pointerEvents: 'none'
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: 440,
          padding: 36,
          background: '#121418',
          border: '1px solid #222630',
          borderRadius: 16,
          boxShadow: '0 24px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(16, 185, 129, 0.1)',
          position: 'relative',
          zIndex: 1
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)', boxShadow: '0 8px 24px rgba(16, 185, 129, 0.35)', marginBottom: 14 }}>
            <span style={{ color: '#FFF', fontWeight: 900, fontSize: 22, fontFamily: 'system-ui' }}>S</span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 6 }}>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#F9FAFB', letterSpacing: '-0.02em' }}>
              STAGEWAY
            </h1>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block', boxShadow: '0 0 8px #10B981' }} />
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, color: '#10B981', letterSpacing: '0.02em', marginBottom: 4 }}>
            {brandTitle || `Stageway ${portalTitle}`}
          </div>
          
          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
            {accessHelpText || (isMasterAdmin ? 'Master platform control & management' : 'Authorized access only')}
          </div>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#F87171',
              padding: '11px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              marginBottom: 20,
              textAlign: 'center',
              lineHeight: 1.4
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {(isOrganizer || isMasterAdmin) && (
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9CA3AF', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {isMasterAdmin ? 'Admin Account Email / ID' : 'Account Email / ID'}
              </label>
              <input
                type="text"
                name="account-username"
                placeholder={isMasterAdmin ? "superadmin@stageway.in" : "organizer@stageway.in"}
                value={username}
                onChange={event => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                style={{
                  width: '100%',
                  background: '#161920',
                  border: '1px solid #222630',
                  borderRadius: 8,
                  padding: '11px 14px',
                  color: '#F9FAFB',
                  fontSize: 13,
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={e => e.currentTarget.style.borderColor = '#10B981'}
                onBlur={e => e.currentTarget.style.borderColor = '#222630'}
              />
            </div>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {isMasterAdmin ? 'Password or Access Key' : isOrganizer ? 'Password' : 'Access Key'}
              </label>
            </div>
            <input
              type="password"
              name="account-password"
              placeholder={isMasterAdmin ? "Enter password or access key" : "Enter password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoFocus={!isOrganizer && !isMasterAdmin}
              autoComplete="current-password"
              style={{
                width: '100%',
                background: '#161920',
                border: '1px solid #222630',
                borderRadius: 8,
                padding: '11px 14px',
                color: '#F9FAFB',
                fontSize: 13,
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#10B981'}
              onBlur={e => e.currentTarget.style.borderColor = '#222630'}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: 13,
              fontWeight: 700,
              marginTop: 4,
              background: loading ? '#059669' : 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)',
              transition: 'opacity 0.2s, transform 0.1s'
            }}
          >
            {loading ? 'Authenticating…' : 'Sign In to Portal'}
          </button>
        </form>

        <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid #222630', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          {isMasterAdmin && (
            <button
              type="button"
              onClick={fillMasterAdminCredentials}
              style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                color: '#10B981',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Fill Master Admin Credentials
            </button>
          )}

          {isOrganizer && (
            <>
              <button
                type="button"
                onClick={fillOrganizerCredentials}
                style={{
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  color: '#10B981',
                  borderRadius: 8,
                  padding: '7px 14px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Fill Test Organizer Credentials
              </button>

              <div style={{ fontSize: 12, color: '#6B7280', display: 'flex', gap: 8 }}>
                <a href="/organizer/apply" style={{ color: '#9CA3AF', textDecoration: 'none' }}>
                  Apply as organizer
                </a>
                <span>·</span>
                <a href="/organizer/activate" style={{ color: '#9CA3AF', textDecoration: 'none' }}>
                  Activate account
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
