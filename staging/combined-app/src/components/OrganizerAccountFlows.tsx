import React, { useState } from 'react'

function AccountFlowCard({ title, eyebrow, description, step, children }: { title: string; eyebrow: string; description: string; step?: number; children: React.ReactNode }) {
  return <main className="account-flow-page">
    <div className="account-flow-shell">
      <aside className="account-flow-aside" aria-label="Stageway organizer portal">
        <a className="account-flow-brand" href="/" aria-label="Stageway home"><span className="account-flow-mark">S</span><span>stageway</span></a>
        <div className="account-flow-aside-copy">
          <span className="account-flow-overline">MADE FOR LIVE MOMENTS</span>
          <h2>Bring your next event to life.</h2>
          <p>Manage events, reach your audience, and make every show night run smoothly.</p>
        </div>
        <div className="account-flow-aside-footer"><span className="account-flow-live-dot" /> Organizer portal <span>•</span> Secure access</div>
        <div className="account-flow-orbit account-flow-orbit-one" /><div className="account-flow-orbit account-flow-orbit-two" />
      </aside>
      <section className="account-flow-content">
        <div className="account-flow-mobile-brand"><span className="account-flow-mark">S</span><span>stageway</span></div>
        <div className="account-flow-form-wrap">
          <div className="account-flow-heading">
            <span className="account-flow-overline">{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {typeof step === 'number' && <div className="account-flow-progress" aria-label={`Step ${step} of 2`}><span className={step >= 1 ? 'is-complete' : ''} /><span className={step >= 2 ? 'is-complete' : ''} /><small>{step === 1 ? 'YOUR DETAILS' : 'VERIFY YOUR EMAIL'}</small></div>}
          <div className="account-flow-form-card">{children}</div>
        </div>
        <footer className="account-flow-footer">© {new Date().getFullYear()} Stageway <span>•</span> Your events, all in one place</footer>
      </section>
    </div>
  </main>
}

export function OrganizerApplicationFlow() {
  const [stage, setStage] = useState<'apply' | 'verify'>('apply')
  const [applicationId, setApplicationId] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      if (stage === 'apply') {
        const response = await fetch('/api/organizer/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationName, contactName, email }) })
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.message || 'Application could not be submitted.')
        setApplicationId(data.applicationId); setChallengeId(data.challengeId); setStage('verify'); setMessage('Check the submitted email for the verification code.')
      } else {
        const response = await fetch(`/api/organizer/applications/${encodeURIComponent(applicationId)}/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, challengeId, code }) })
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.message || 'Email verification failed.')
        setMessage('Email verified. Your application is now waiting for platform review.')
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Request failed.') } finally { setBusy(false) }
  }
  return <AccountFlowCard title={stage === 'apply' ? 'Let’s get your events moving.' : 'Verify your email'} eyebrow="ORGANIZER APPLICATION" description={stage === 'apply' ? 'Tell us a little about your organization. We’ll send a one-time code to confirm your email.' : 'Enter the six-digit code we sent to your email to submit your application for review.'} step={stage === 'apply' ? 1 : 2}>
    <form onSubmit={submit} className="account-flow-form">
      {stage === 'apply' ? <>
        <label className="account-flow-field"><span>Organization name</span><input autoComplete="organization" placeholder="e.g. Northstar Live" value={organizationName} onChange={event => setOrganizationName(event.target.value)} maxLength={160} required /></label>
        <label className="account-flow-field"><span>Your name</span><input autoComplete="name" placeholder="Name of the primary contact" value={contactName} onChange={event => setContactName(event.target.value)} maxLength={120} required /></label>
        <label className="account-flow-field"><span>Work email</span><input type="email" autoComplete="email" placeholder="you@organization.com" value={email} onChange={event => setEmail(event.target.value)} required /></label>
      </> : <>
        <label className="account-flow-field"><span>Verification challenge ID</span><input autoComplete="off" value={challengeId} onChange={event => setChallengeId(event.target.value)} required /></label>
        <label className="account-flow-field"><span>Six-digit email code</span><input className="account-flow-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required /></label>
      </>}
      {error && <div className="account-flow-notice account-flow-notice-error" role="alert">{error}</div>}{message && <div className="account-flow-notice" role="status">{message}</div>}
      {stage === 'verify' && <div className="account-flow-reference"><span>APPLICATION REFERENCE</span><code>{applicationId}</code></div>}
      <button className="account-flow-submit" disabled={busy}>{busy ? 'Please wait…' : stage === 'apply' ? 'Send verification code' : 'Verify email and submit'}<span aria-hidden="true">→</span></button>
    </form>
    <div className="account-flow-bottom"><span>Already have an account?</span><a href="/organizer">Sign in to organizer portal <span aria-hidden="true">→</span></a></div>
  </AccountFlowCard>
}

export function OrganizerActivationFlow() {
  const [email, setEmail] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/organizer/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, challengeId, code, password }) })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Activation failed.')
      setPassword(''); setMessage('Account activated. You can now sign in at the organizer portal.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Activation failed.') } finally { setBusy(false) }
  }
  return <AccountFlowCard title="Your organizer account is waiting." eyebrow="ACCOUNT ACTIVATION" description="Confirm your invitation and choose a strong password to finish setting up your organizer access."><form onSubmit={submit} className="account-flow-form">
    <label className="account-flow-field"><span>Verified email</span><input type="email" autoComplete="email" placeholder="you@organization.com" value={email} onChange={event => setEmail(event.target.value)} required /></label>
    <label className="account-flow-field"><span>Activation challenge ID</span><input autoComplete="off" value={challengeId} onChange={event => setChallengeId(event.target.value)} required /></label>
    <label className="account-flow-field"><span>Six-digit email code</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required /></label>
    <label className="account-flow-field"><span>Create password <small>12 characters or more</small></span><input type="password" autoComplete="new-password" minLength={12} maxLength={200} value={password} onChange={event => setPassword(event.target.value)} required /></label>
    {error && <div className="account-flow-notice account-flow-notice-error" role="alert">{error}</div>}{message && <div className="account-flow-notice" role="status">{message}</div>}
    <button className="account-flow-submit" disabled={busy}>{busy ? 'Activating…' : 'Activate account'}<span aria-hidden="true">→</span></button>
  </form><div className="account-flow-bottom"><span>Already activated?</span><a href="/organizer">Sign in to organizer portal <span aria-hidden="true">→</span></a></div></AccountFlowCard>
}

export function InvitationAcceptanceFlow() {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email, password }) })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Invitation could not be accepted.')
      setToken(''); setPassword(''); window.history.replaceState({}, '', '/accept-invitation');
      setMessage(data.nextStep || 'Invitation accepted. Sign in through your assigned portal.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invitation could not be accepted.') } finally { setBusy(false) }
  }
  return <AccountFlowCard title="You’re invited to the team." eyebrow="EVENT TEAM INVITATION" description="Accept your invitation to get started. The link is private, can be used once, and expires after seven days."><form onSubmit={submit} className="account-flow-form">
    <label className="account-flow-field"><span>Invited email</span><input type="email" autoComplete="email" placeholder="you@organization.com" value={email} onChange={event => setEmail(event.target.value)} required /></label>
    <label className="account-flow-field"><span>Password <small>Use 12+ characters, or your current password</small></span><input type="password" autoComplete="current-password" maxLength={200} value={password} onChange={event => setPassword(event.target.value)} required /></label>
    {error && <div className="account-flow-notice account-flow-notice-error" role="alert">{error}</div>}{message && <div className="account-flow-notice" role="status">{message}</div>}
    <button className="account-flow-submit" disabled={busy || !token}>{busy ? 'Accepting…' : 'Accept invitation'}<span aria-hidden="true">→</span></button>
    <p className="account-flow-security-note">Sellers will set up a passkey when they first sign in.</p>
  </form></AccountFlowCard>
}
