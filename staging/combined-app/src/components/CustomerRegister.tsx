import React, { useState, useEffect } from 'react'

interface CustomerRegisterProps {
  onRegisterSuccess: (user: any) => void
  onGoToLogin: () => void
}

export default function CustomerRegister({ onRegisterSuccess, onGoToLogin }: CustomerRegisterProps) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [k]: e.target.value }))
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.password) return
    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/customer/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          name: form.name.trim(),
          phone: form.phone.trim(),
        })
      })
      const data = await res.json()
      if (data.success) {
        // Auto-login after register
        const loginRes = await fetch('/api/customer/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email.trim().toLowerCase(), password: form.password })
        })
        const loginData = await loginRes.json()
        if (loginData.success && loginData.user) {
          localStorage.setItem('littx_customer', JSON.stringify(loginData.user))
          localStorage.setItem('littx_customer_token', loginData.token)
          onRegisterSuccess(loginData.user)
        } else {
          onGoToLogin()
        }
      } else {
        setError(data.message || 'Registration failed. Please try again.')
      }
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const strength = form.password.length === 0 ? 0
    : form.password.length < 6 ? 1
    : form.password.length < 10 ? 2 : 3

  const strengthColors = ['transparent', '#FF6B6B', '#F5B942', '#3DDC84']
  const strengthLabels = ['', 'Weak', 'Fair', 'Strong']

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse 80% 80% at 50% -10%, rgba(216,255,63,0.07) 0%, transparent 70%), linear-gradient(160deg, #07060f 0%, #0A0912 40%, #0d0b1a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 20px',
      fontFamily: 'Inter, sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background orbs */}
      <div style={{
        position: 'absolute', top: '20%', right: '5%',
        width: 300, height: 300, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(216,255,63,0.05) 0%, transparent 70%)',
        animation: 'pulse 7s ease-in-out infinite', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '15%', left: '5%',
        width: 240, height: 240, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(61,220,132,0.05) 0%, transparent 70%)',
        animation: 'pulse 9s ease-in-out infinite 1s', pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%', maxWidth: 460,
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(24px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <a href="/" style={{ display: 'inline-block', marginBottom: 18 }}>
            <img src="/logo.png" alt="LITTX" style={{ height: 36, width: 'auto' }} />
          </a>
          <h1 style={{
            margin: '0 0 8px',
            fontSize: '1.9rem',
            fontWeight: 900,
            background: 'linear-gradient(135deg, #F0EEF8 0%, #D8FF3F 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.03em',
          }}>Create Account</h1>
          <p style={{ margin: 0, color: '#9896A8', fontSize: 13 }}>
            Join LITTX to book events instantly
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(15,13,26,0.85)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(216,255,63,0.15)',
          borderRadius: 24,
          padding: '32px 30px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(216,255,63,0.04) inset',
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
            }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Name */}
            <Field label="Full Name" id="reg-name">
              <input
                id="reg-name"
                type="text"
                value={form.name}
                onChange={set('name')}
                placeholder="Your full name"
                required
                autoFocus
                style={inputStyle(!!form.name)}
              />
            </Field>

            {/* Email */}
            <Field label="Email Address" id="reg-email">
              <input
                id="reg-email"
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="you@example.com"
                required
                style={inputStyle(!!form.email)}
              />
            </Field>

            {/* Phone */}
            <Field label="Phone Number (Optional)" id="reg-phone">
              <input
                id="reg-phone"
                type="tel"
                value={form.phone}
                onChange={set('phone')}
                placeholder="+91 98765 43210"
                style={inputStyle(!!form.phone)}
              />
            </Field>

            {/* Password */}
            <Field label="Password" id="reg-password">
              <div style={{ position: 'relative' }}>
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  placeholder="Min. 6 characters"
                  required
                  style={{ ...inputStyle(!!form.password), paddingRight: 48 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#5C5A6A', fontSize: 15, padding: 0 }}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              {/* Password strength */}
              {form.password.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {[1,2,3].map(i => (
                    <div key={i} style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: i <= strength ? strengthColors[strength] : 'rgba(255,255,255,0.08)',
                      transition: 'background 0.3s',
                    }} />
                  ))}
                  <span style={{ fontSize: 10, fontWeight: 700, color: strengthColors[strength], minWidth: 36, textAlign: 'right' }}>
                    {strengthLabels[strength]}
                  </span>
                </div>
              )}
            </Field>

            {/* Confirm Password */}
            <Field label="Confirm Password" id="reg-confirm">
              <input
                id="reg-confirm"
                type="password"
                value={form.confirm}
                onChange={set('confirm')}
                placeholder="Re-enter password"
                required
                style={{
                  ...inputStyle(!!form.confirm),
                  borderColor: form.confirm && form.confirm !== form.password
                    ? 'rgba(255,107,107,0.4)'
                    : form.confirm && form.confirm === form.password
                    ? 'rgba(61,220,132,0.4)'
                    : 'rgba(255,255,255,0.08)'
                }}
              />
            </Field>

            {/* Submit */}
            <button
              id="customer-register-submit"
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? 'rgba(216,255,63,0.3)' : 'linear-gradient(135deg, #D8FF3F 0%, #9AE600 100%)',
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
                marginTop: 6,
              }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid #0A0912', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                  Creating account…
                </span>
              ) : 'Create Account →'}
            </button>
          </form>

          {/* Already have account */}
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(216,255,63,0.1), transparent)', marginBottom: 20 }} />
            <span style={{ color: '#5C5A6A', fontSize: 13 }}>Already have an account? </span>
            <button
              id="customer-go-to-login"
              onClick={onGoToLogin}
              style={{ background: 'none', border: 'none', color: '#D8FF3F', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              Sign in
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <a href="/" style={{ color: '#5C5A6A', fontSize: 12, textDecoration: 'none', fontWeight: 600 }}>← Back to LITTX</a>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.15);opacity:1} }
        @keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} style={{
        display: 'block', fontSize: 11, fontWeight: 700, color: '#D8FF3F',
        letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8,
      }}>{label}</label>
      {children}
    </div>
  )
}

function inputStyle(filled: boolean): React.CSSProperties {
  return {
    width: '100%',
    background: 'rgba(10,9,18,0.8)',
    border: `1px solid ${filled ? 'rgba(216,255,63,0.3)' : 'rgba(255,255,255,0.08)'}`,
    borderRadius: 14,
    color: '#F0EEF8',
    padding: '13px 16px',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
    fontFamily: 'Inter, sans-serif',
  }
}
