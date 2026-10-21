import React, { useCallback, useEffect, useState } from 'react'

type TeamMember = { role: 'seller' | 'pr'; principalId: string }
type Invitation = { invitationId: string; recipientEmail: string; role: 'seller' | 'pr'; status: string; expiresAt: string }

export default function EventTeamManager({ eventId }: { eventId: string }) {
  const [team, setTeam] = useState<TeamMember[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [role, setRole] = useState<'seller' | 'pr'>('seller')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const token = sessionStorage.getItem('littx_token') || ''
    const response = await fetch(`/api/organizer/events/${encodeURIComponent(eventId)}/team`, { headers: { 'x-auth-token': token }, cache: 'no-store' })
    const data = await response.json()
    if (!response.ok || !data.success) throw new Error(data.message || 'Event team could not be loaded.')
    setTeam(data.team || []); setInvitations(data.invitations || [])
  }, [eventId])
  useEffect(() => { void load().catch(cause => setError(cause instanceof Error ? cause.message : 'Event team could not be loaded.')) }, [load])
  const invite = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(`/api/organizer/events/${encodeURIComponent(eventId)}/invitations`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': sessionStorage.getItem('littx_token') || '' }, body: JSON.stringify({ email, role }) })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Invitation could not be sent.')
      setEmail(''); setMessage('Invitation sent to the verified email. It expires in seven days.'); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invitation could not be sent.') } finally { setBusy(false) }
  }
  const revokeInvitation = async (id: string) => {
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(`/api/organizer/events/${encodeURIComponent(eventId)}/invitations/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-auth-token': sessionStorage.getItem('littx_token') || '' } })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Invitation could not be revoked.')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invitation could not be revoked.') } finally { setBusy(false) }
  }
  const resendInvitation = async (id: string) => {
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(`/api/organizer/events/${encodeURIComponent(eventId)}/invitations/${encodeURIComponent(id)}/resend`, { method: 'POST', headers: { 'x-auth-token': sessionStorage.getItem('littx_token') || '' } })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Invitation could not be resent.')
      setMessage('A new single-use invitation was sent. The prior link is no longer valid.'); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invitation could not be resent.') } finally { setBusy(false) }
  }
  const removeMember = async (member: TeamMember) => {
    if (!window.confirm(`Remove ${member.principalId} from this event? Their access to this event will stop immediately.`)) return
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(`/api/organizer/events/${encodeURIComponent(eventId)}/team/${member.role}/${encodeURIComponent(member.principalId)}`, { method: 'DELETE', headers: { 'x-auth-token': sessionStorage.getItem('littx_token') || '' } })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Event assignment could not be removed.')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Event assignment could not be removed.') } finally { setBusy(false) }
  }
  return <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
    <h3>Event team</h3>
    <form onSubmit={invite} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      <select aria-label="Invitation role" value={role} onChange={event => setRole(event.target.value as 'seller' | 'pr')}><option value="seller">Seller</option><option value="pr">PR representative</option></select>
      <input aria-label="Invitee email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Verified invitee email" required />
      <button className="btn-secondary" disabled={busy}>{busy ? 'Working…' : 'Send 7-day invitation'}</button>
    </form>
    {error && <div role="alert" style={{ color: 'var(--red)' }}>{error}</div>}{message && <div role="status" className="muted-sm">{message}</div>}
    <div className="table-scroll"><table className="table"><thead><tr><th>Role</th><th>Account / recipient</th><th>Status</th><th></th></tr></thead><tbody>
      {team.map(member => <tr key={`${member.role}:${member.principalId}`}><td>{member.role}</td><td>{member.principalId}</td><td>Assigned</td><td><button className="btn-secondary" disabled={busy} onClick={() => void removeMember(member)}>Remove</button></td></tr>)}
      {invitations.filter(invitation => ['pending', 'accepted', 'expired', 'revoked'].includes(invitation.status)).map(invitation => <tr key={invitation.invitationId}><td>{invitation.role}</td><td>{invitation.recipientEmail}</td><td>{invitation.status}{invitation.status === 'pending' ? ` · expires ${new Date(invitation.expiresAt).toLocaleDateString()}` : ''}</td><td>{invitation.status === 'pending' && <><button className="btn-secondary" disabled={busy} onClick={() => void resendInvitation(invitation.invitationId)}>Resend</button> <button className="btn-secondary" disabled={busy} onClick={() => void revokeInvitation(invitation.invitationId)}>Revoke</button></>}{invitation.status === 'expired' && <button className="btn-secondary" disabled={busy} onClick={() => void resendInvitation(invitation.invitationId)}>Send new invitation</button>}</td></tr>)}
      {!team.length && !invitations.some(invitation => ['pending', 'accepted', 'expired', 'revoked'].includes(invitation.status)) && <tr><td colSpan={4}>No sellers or PR representatives assigned.</td></tr>}
    </tbody></table></div>
  </div>
}
