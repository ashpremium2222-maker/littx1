import React, { useState } from 'react'
import PublicSignInModal from './PublicSignInModal'

interface PublicWebsiteProps {
  onLoginSuccess: (session: any) => void
}

export default function PublicWebsite({ onLoginSuccess }: PublicWebsiteProps) {
  const [showSignInModal, setShowSignInModal] = useState(false)

  return (
    <div className="app-canvas" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Public Header Navbar */}
      <header
        style={{
          height: '76px',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--line)',
          background: 'rgba(10, 9, 18, 0.75)',
          backdropFilter: 'blur(16px)',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/logo.png" alt="LITTX" style={{ height: '28px', width: 'auto' }} />
          <span style={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: '0.05em', color: 'var(--ink)' }}>LITTX</span>
          <span className="badge-pro">PLATFORM</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a href="#features" style={{ color: 'var(--ink-soft)', textDecoration: 'none', fontSize: '13px', fontWeight: 600 }}>Features</a>
          <a href="#companies" style={{ color: 'var(--ink-soft)', textDecoration: 'none', fontSize: '13px', fontWeight: 600 }}>Event Companies</a>
          <a href="/master-admin" style={{ color: 'var(--ink-faint)', textDecoration: 'none', fontSize: '11px', fontWeight: 600 }}>Master Admin</a>

          {/* Customer Portal CTA */}
          <a
            href="/customer/login"
            style={{
              padding: '8px 18px',
              borderRadius: 10,
              background: 'rgba(216,255,63,0.1)',
              border: '1px solid rgba(216,255,63,0.3)',
              color: '#D8FF3F',
              fontSize: '12px',
              fontWeight: 800,
              textDecoration: 'none',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              transition: 'all 0.2s',
            }}
          >
            🎟 Customer Login
          </a>

          <button
            onClick={() => setShowSignInModal(true)}
            className="btn btn-primary"
            style={{ padding: '8px 22px', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}
          >
            SIGN IN
          </button>
        </div>
      </header>

      {/* Hero Banner Section */}
      <section style={{ padding: '80px 24px', textAlign: 'center', maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
        <div className="badge badge-volt" style={{ fontSize: '11px', padding: '6px 16px' }}>
          <span className="badge-dot" /> POWERING 24+ LEADING EVENT COMPANIES
        </div>

        <h1 style={{ fontSize: '3.2rem', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.03em', margin: 0, background: 'linear-gradient(135deg, #FFFFFF 0%, #D8FF3F 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Next-Generation Multi-Tenant Event Operations & Pass Engine
        </h1>

        <p style={{ fontSize: '1.1rem', color: 'var(--ink-soft)', maxWidth: '680px', lineHeight: 1.6, margin: 0 }}>
          Run every gate, order, PR network, and ticket payout from one unified SaaS engine. Zero delay gate validation, automated cash workflows, and enterprise multi-tenant security.
        </p>

        <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={() => setShowSignInModal(true)}
            className="btn btn-primary"
            style={{ padding: '14px 32px', fontSize: '1rem', fontWeight: 800 }}
          >
            SIGN IN TO PORTAL ➔
          </button>
          <a
            href="/customer/login"
            style={{
              padding: '14px 32px',
              borderRadius: 'var(--radius-lg)',
              background: 'rgba(216,255,63,0.08)',
              border: '1px solid rgba(216,255,63,0.25)',
              color: '#D8FF3F',
              fontSize: '1rem',
              fontWeight: 800,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            🎟 Book Event Tickets
          </a>
        </div>
      </section>

      {/* Live Stats Ticker */}
      <section style={{ background: 'var(--panel)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', padding: '24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--volt)' }}>482,931+</div>
            <div style={{ fontSize: '11px', color: 'var(--ink-faint)', fontWeight: 700, textTransform: 'uppercase', marginTop: '4px' }}>Tickets Issued</div>
          </div>
          <div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--green)' }}>₹4.82Cr</div>
            <div style={{ fontSize: '11px', color: 'var(--ink-faint)', fontWeight: 700, textTransform: 'uppercase', marginTop: '4px' }}>Gross GMV Processed</div>
          </div>
          <div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--ink)' }}>2,184</div>
            <div style={{ fontSize: '11px', color: 'var(--ink-faint)', fontWeight: 700, textTransform: 'uppercase', marginTop: '4px' }}>PR Partners Active</div>
          </div>
          <div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--amber)' }}>100%</div>
            <div style={{ fontSize: '11px', color: 'var(--ink-faint)', fontWeight: 700, textTransform: 'uppercase', marginTop: '4px' }}>Gate Validation Rate</div>
          </div>
        </div>
      </section>

      {/* Sign In Modal */}
      {showSignInModal && (
        <PublicSignInModal
          onClose={() => setShowSignInModal(false)}
          onLoginSuccess={onLoginSuccess}
        />
      )}
    </div>
  )
}
