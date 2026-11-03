import React, { useState, useEffect, useCallback } from 'react'
import { OrganizerEvent } from '../types'

interface TeamPRTabProps {
  events: OrganizerEvent[]
  selectedEventId: string | null
  onSelectEventId: (id: string) => void
}

interface TeamMember {
  role: 'seller' | 'pr'
  principalId: string
}

interface Invitation {
  invitationId: string
  recipientEmail: string
  role: 'seller' | 'pr'
  status: string
  expiresAt: string
}

export default function TeamPRTab({
  events,
  selectedEventId,
  onSelectEventId,
}: TeamPRTabProps) {
  const activeEvent = events.find(e => e.eventId === selectedEventId) || events[0] || null
  const [team, setTeam] = useState<TeamMember[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [role, setRole] = useState<'seller' | 'pr'>('seller')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadTeam = useCallback(async () => {
    if (!activeEvent) return
    setLoading(true)
    setError('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const res = await fetch(`/api/organizer/events/${encodeURIComponent(activeEvent.eventId)}/team`, {
        headers: { 'x-auth-token': token },
        cache: 'no-store',
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load team data.')
      setTeam(data.team || [])
      setInvitations(data.invitations || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team data.')
    } finally {
      setLoading(false)
    }
  }, [activeEvent?.eventId])

  useEffect(() => {
    void loadTeam()
  }, [loadTeam])

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeEvent) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const res = await fetch(`/api/organizer/events/${encodeURIComponent(activeEvent.eventId)}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ email, role }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to send invitation.')
      setEmail('')
      setMessage(`Invitation sent to ${email}. The link is valid for 7 days.`)
      await loadTeam()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation.')
    } finally {
      setBusy(false)
    }
  }

  const revokeInvitation = async (id: string) => {
    if (!activeEvent) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const res = await fetch(
        `/api/organizer/events/${encodeURIComponent(activeEvent.eventId)}/invitations/${encodeURIComponent(id)}`,
        { method: 'DELETE', headers: { 'x-auth-token': token } }
      )
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to revoke invitation.')
      setMessage('Invitation revoked successfully.')
      await loadTeam()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invitation.')
    } finally {
      setBusy(false)
    }
  }

  const resendInvitation = async (id: string) => {
    if (!activeEvent) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const res = await fetch(
        `/api/organizer/events/${encodeURIComponent(activeEvent.eventId)}/invitations/${encodeURIComponent(id)}/resend`,
        { method: 'POST', headers: { 'x-auth-token': token } }
      )
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to resend invitation.')
      setMessage('New single-use invitation sent. The previous link has been invalidated.')
      await loadTeam()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend invitation.')
    } finally {
      setBusy(false)
    }
  }

  const removeMember = async (member: TeamMember) => {
    if (!activeEvent) return
    if (!window.confirm(`Revoke access for ${member.principalId}? They will no longer be able to sell or promote tickets for this event.`)) {
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const res = await fetch(
        `/api/organizer/events/${encodeURIComponent(activeEvent.eventId)}/team/${member.role}/${encodeURIComponent(member.principalId)}`,
        { method: 'DELETE', headers: { 'x-auth-token': token } }
      )
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to remove member.')
      setMessage(`Removed ${member.principalId} from event.`)
      await loadTeam()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member.')
    } finally {
      setBusy(false)
    }
  }

  if (!activeEvent) {
    return (
      <div style={{ background: 'rgba(20,16,38,0.7)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 14, padding: 48, textAlign: 'center', color: 'rgba(245,242,234,0.5)' }}>
        No events available. Create an event first to manage team coordinators.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* EVENT SELECTOR HEADER */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          background: 'rgba(20,16,38,0.7)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.6)', textTransform: 'uppercase' }}>
            Event Team For:
          </label>
          <select
            value={activeEvent.eventId}
            onChange={e => onSelectEventId(e.target.value)}
            style={{
              background: 'rgba(10,9,18,0.9)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              padding: '8px 14px',
              color: '#F5F2EA',
              fontFamily: 'Unbounded, sans-serif',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              minWidth: 260,
            }}
          >
            {events.map(e => (
              <option key={e.eventId} value={e.eventId}>
                {e.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.6)' }}>
          {team.length} Active Member{team.length === 1 ? '' : 's'} · {invitations.filter(i => i.status === 'pending').length} Pending
        </div>
      </div>

      {error && (
        <div role="alert" style={{ background: 'rgba(255,107,107,0.15)', border: '1px solid #FF6B6B', borderRadius: 10, padding: '12px 16px', color: '#FF6B6B', fontSize: 13 }}>
          {error}
        </div>
      )}

      {message && (
        <div role="status" style={{ background: 'rgba(49,231,200,0.15)', border: '1px solid #31E7C8', borderRadius: 10, padding: '12px 16px', color: '#31E7C8', fontSize: 13 }}>
          {message}
        </div>
      )}

      {/* INVITE NEW MEMBER CARD */}
      <div
        style={{
          background: 'rgba(20,16,38,0.9)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          padding: 20,
        }}
      >
        <h3 style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 16, margin: '0 0 6px' }}>
          Invite Seller or PR Coordinator
        </h3>
        <p style={{ fontSize: 12, color: 'rgba(245,242,234,0.6)', margin: '0 0 16px' }}>
          Assign authorized sellers (to issue tickets from cash/offline sales) or PR representatives (who earn attribution via tracked promotional links).
        </p>

        <form onSubmit={sendInvite} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select
            value={role}
            onChange={e => setRole(e.target.value as 'seller' | 'pr')}
            style={{
              background: 'rgba(10,9,18,0.85)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#F5F2EA',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <option value="seller">Seller (Direct Ticket Issuer)</option>
            <option value="pr">PR Representative (Tracking Link)</option>
          </select>

          <input
            type="email"
            placeholder="Verified invitee email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{
              flex: 1,
              minWidth: 260,
              background: 'rgba(10,9,18,0.85)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#F5F2EA',
              fontSize: 13,
            }}
          />

          <button
            type="submit"
            disabled={busy}
            style={{
              background: '#D8FF3F',
              color: '#0A0912',
              border: 'none',
              padding: '10px 20px',
              borderRadius: 8,
              fontFamily: 'Unbounded, sans-serif',
              fontWeight: 700,
              fontSize: 12,
              cursor: busy ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase',
            }}
          >
            {busy ? 'Sending…' : 'Send 7-Day Invite'}
          </button>
        </form>
      </div>

      {/* ACTIVE TEAM ROSTER */}
      <div
        style={{
          background: 'rgba(20,16,38,0.9)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          padding: 20,
        }}
      >
        <h3 style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 16, margin: '0 0 14px' }}>
          Active Event Coordinators ({team.length})
        </h3>

        {team.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(245,242,234,0.4)', fontSize: 13 }}>
            No sellers or PR coordinators actively assigned to {activeEvent.name}.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {team.map(member => (
              <div
                key={`${member.role}:${member.principalId}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: 'rgba(10,9,18,0.6)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: 'JetBrains Mono, monospace',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: member.role === 'seller' ? 'rgba(56,217,196,0.15)' : 'rgba(245,185,66,0.15)',
                      color: member.role === 'seller' ? '#31E7C8' : '#F5B942',
                    }}
                  >
                    {member.role === 'seller' ? 'Seller' : 'PR Coordinator'}
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#F5F2EA', fontWeight: 600 }}>
                    {member.principalId}
                  </span>
                </div>

                <button
                  onClick={() => removeMember(member)}
                  disabled={busy}
                  style={{
                    background: 'rgba(255,107,107,0.1)',
                    color: '#FF6B6B',
                    border: '1px solid rgba(255,107,107,0.3)',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Revoke Role
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PENDING & EXPIRED INVITATIONS */}
      {invitations.length > 0 && (
        <div
          style={{
            background: 'rgba(20,16,38,0.9)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: 20,
          }}
        >
          <h3 style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 16, margin: '0 0 14px' }}>
            Pending & Past Invitations
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invitations.map(inv => {
              const isPending = inv.status === 'pending'
              const isExpired = inv.status === 'expired'

              return (
                <div
                  key={inv.invitationId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderRadius: 8,
                    background: 'rgba(10,9,18,0.4)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: 'JetBrains Mono, monospace',
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'rgba(255,255,255,0.06)',
                          color: 'rgba(245,242,234,0.7)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {inv.role}
                      </span>
                      <span style={{ fontSize: 13, color: '#F5F2EA' }}>{inv.recipientEmail}</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: 'JetBrains Mono, monospace',
                          color: isPending ? '#31E7C8' : isExpired ? '#FF6B6B' : 'rgba(245,242,234,0.4)',
                        }}
                      >
                        ({inv.status} {isPending ? `· expires ${new Date(inv.expiresAt).toLocaleDateString()}` : ''})
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    {isPending && (
                      <>
                        <button
                          onClick={() => resendInvitation(inv.invitationId)}
                          disabled={busy}
                          style={{
                            background: 'rgba(255,255,255,0.08)',
                            color: '#F5F2EA',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 6,
                            padding: '6px 12px',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          Resend
                        </button>
                        <button
                          onClick={() => revokeInvitation(inv.invitationId)}
                          disabled={busy}
                          style={{
                            background: 'rgba(255,107,107,0.1)',
                            color: '#FF6B6B',
                            border: '1px solid rgba(255,107,107,0.3)',
                            borderRadius: 6,
                            padding: '6px 12px',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          Revoke
                        </button>
                      </>
                    )}
                    {isExpired && (
                      <button
                        onClick={() => resendInvitation(inv.invitationId)}
                        disabled={busy}
                        style={{
                          background: 'rgba(255,255,255,0.08)',
                          color: '#F5F2EA',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 6,
                          padding: '6px 12px',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        Send New Link
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
