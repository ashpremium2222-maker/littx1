import React, { useState, useEffect } from 'react'

interface CustomerLoginProps {
  onLoginSuccess: (user: any) => void
  onGoToRegister: () => void
}

export default function CustomerLogin({ onLoginSuccess, onGoToRegister }: CustomerLoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/customer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      })
      const data = await res.json()
      if (data.success && data.user) {
        localStorage.setItem('littx_customer', JSON.stringify(data.user))
        localStorage.setItem('littx_customer_token', data.token)
        onLoginSuccess(data.user)
      } else {
        setError(data.message || 'Invalid email or password.')
      }
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse 80% 80% at 50% -10%, rgba(216,255,63,0.08) 0%, transparent 70%), linear-gradient(160deg, #07060f 0%, #0A0912 40%, #0d0b1a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'Inter, sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Animated background orbs */}
      <div style={{
        position: 'absolute', top: '15%', left: '10%',
        width: 320, height: 320,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(216,255,63,0.04) 0%, transparent 70%)',
        animation: 'pulse 6s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '20%', right: '8%',
        width: 250, height: 250,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(100,60,240,0.07) 0%, transparent 70%)',
        animation: 'pulse 8s ease-in-out infinite 2s',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%',
        maxWidth: 440,
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(24px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}>
        {/* Logo + header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <a href="/" style={{ display: 'inline-block', marginBottom: 20 }}>
            <img src="/logo.png" alt="LITTX" style={{ height: 38, width: 'auto' }} />
          </a>
          <h1 style={{
            margin: '0 0 8px',
            fontSize: '2rem',
            fontWeight: 900,
            background: 'linear-gradient(135deg, #F0EEF8 0%, #D8FF3F 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.03em',
          }}>Welcome Back</h1>
          <p style={{ margin: 0, color: '#9896A8', fontSize: 14 }}>
            Sign in to browse events & view your bookings
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(15,13,26,0.85)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(216,255,63,0.15)',
          borderRadius: 24,
          padding: '36px 32px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(216,255,63,0.05) inset',
        }}>
          {error && (
            <div style={{
              background: 'rgba(255,107,107,0.1)',
              border: '1px solid rgba(255,107,107,0.3)',
              borderRadius: 12,
              padding: '12px 16px',
              marginBottom: 20,
              color: '#FF6B6B',
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Email */}
            <div>
              <label style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 700,
                color: '#D8FF3F',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}>Email Address</label>
              <input
                id="customer-login-email"
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="you@example.com"
                required
                autoFocus
                style={{
                  width: '100%',
                  background: 'rgba(10,9,18,0.8)',
                  border: `1px solid ${email ? 'rgba(216,255,63,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 14,
                  color: '#F0EEF8',
                  padding: '14px 16px',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                  fontFamily: 'Inter, sans-serif',
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 700,
                color: '#D8FF3F',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="customer-login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  placeholder="••••••••••••"
                  required
                  style={{
                    width: '100%',
                    background: 'rgba(10,9,18,0.8)',
                    border: `1px solid ${password ? 'rgba(216,255,63,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 14,
                    color: '#F0EEF8',
                    padding: '14px 48px 14px 16px',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                    fontFamily: 'Inter, sans-serif',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#5C5A6A',
                    fontSize: 16,
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              id="customer-login-submit"
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading
                  ? 'rgba(216,255,63,0.3)'
                  : 'linear-gradient(135deg, #D8FF3F 0%, #9AE600 100%)',
                color: '#0A0912',
                border: 'none',
                borderRadius: 14,
                padding: '16px',
                fontSize: 14,
                fontWeight: 800,
                cursor: loading ? 'not-allowed' : 'pointer',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                transition: 'all 0.2s',
                boxShadow: loading ? 'none' : '0 8px 24px rgba(216,255,63,0.25)',
                marginTop: 4,
              }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid #0A0912', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                  Signing in…
                </span>
              ) : 'Sign In →'}
            </button>
          </form>

          {/* Divider + Register */}
          <div style={{ marginTop: 28, textAlign: 'center' }}>
            <div style={{
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(216,255,63,0.1), transparent)',
              marginBottom: 20,
            }} />
            <span style={{ color: '#5C5A6A', fontSize: 13 }}>Don't have an account? </span>
            <button
              id="customer-go-to-register"
              onClick={onGoToRegister}
              style={{
                background: 'none',
                border: 'none',
                color: '#D8FF3F',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              Create account
            </button>
          </div>
        </div>

        {/* Back to site */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <a
            href="/"
            style={{ color: '#5C5A6A', fontSize: 12, textDecoration: 'none', fontWeight: 600, letterSpacing: '0.04em' }}
          >
            ← Back to LITTX
          </a>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.15); opacity: 1; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
