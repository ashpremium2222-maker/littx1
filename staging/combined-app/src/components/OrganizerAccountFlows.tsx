import React, { useState } from 'react'

function AccountFlowCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="app-canvas theme-dark" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}><section className="card" style={{ width: '100%', maxWidth: 520, display: 'grid', gap: 14 }}><h1>{title}</h1>{children}</section></main>
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
  return <AccountFlowCard title="Apply to organize on Stageway">
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      {stage === 'apply' ? <>
        <label>Organization name<input value={organizationName} onChange={event => setOrganizationName(event.target.value)} maxLength={160} required /></label>
        <label>Contact name<input value={contactName} onChange={event => setContactName(event.target.value)} maxLength={120} required /></label>
        <label>Verified email<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
      </> : <>
        <label>Verification challenge ID<input value={challengeId} onChange={event => setChallengeId(event.target.value)} required /></label>
        <label>Email code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value)} required /></label>
      </>}
      {error && <div role="alert">{error}</div>}{message && <div role="status">{message}</div>}
      {stage === 'verify' && <div className="muted-sm">Application reference: {applicationId}</div>}
      <button className="btn-primary" disabled={busy}>{busy ? 'Please wait…' : stage === 'apply' ? 'Send verification code' : 'Verify email and submit'}</button>
    </form>
    <a href="/organizer">Return to organizer sign in</a>
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
  return <AccountFlowCard title="Activate organizer account"><form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
    <label>Verified email<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
    <label>Activation challenge ID<input value={challengeId} onChange={event => setChallengeId(event.target.value)} required /></label>
    <label>Email code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value)} required /></label>
    <label>Create password<input type="password" autoComplete="new-password" minLength={12} maxLength={200} value={password} onChange={event => setPassword(event.target.value)} required /></label>
    {error && <div role="alert">{error}</div>}{message && <div role="status">{message}</div>}
    <button className="btn-primary" disabled={busy}>{busy ? 'Activating…' : 'Activate account'}</button>
  </form><a href="/organizer">Return to organizer sign in</a></AccountFlowCard>
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
  return <AccountFlowCard title="Accept event team invitation"><p className="muted-sm">This invitation is recipient-bound, usable once, and expires after seven days. Sellers must register a passkey during their first login.</p><form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
    <label>Invited email<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
    <label>Create a 12+ character password, or enter your current password for an existing account<input type="password" autoComplete="current-password" maxLength={200} value={password} onChange={event => setPassword(event.target.value)} required /></label>
    {error && <div role="alert">{error}</div>}{message && <div role="status">{message}</div>}
    <button className="btn-primary" disabled={busy || !token}>{busy ? 'Accepting…' : 'Accept invitation'}</button>
  </form></AccountFlowCard>
}
