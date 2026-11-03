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
      setMessage(`Invitation sent to ${email}. Single-use link expires in 7 days.`)
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
      setMessage('New single-use invitation sent. The previous token is no longer valid.')
      await loadTeam()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend invitation.')
    } finally {
      setBusy(false)
    }
  }

  const removeMember = async (member: TeamMember) => {
    if (!activeEvent) return
    if (!window.confirm(`Revoke access for ${member.principalId}? Their access to this event will stop immediately.`)) {
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
      <div style={{ background: '#14161C', border: '1px dashed #282C36', borderRadius: 10, padding: 48, textAlign: 'center', color: '#555962' }}>
        No events available. Create an event first to manage team coordinators.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* HEADER & SELECTOR */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          background: '#14161C',
          border: '1px solid #20232B',
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase' }}>
            Production Team For:
          </label>
          <select
            value={activeEvent.eventId}
            onChange={e => onSelectEventId(e.target.value)}
            style={{
              background: '#0E1013',
              border: '1px solid #282C36',
              borderRadius: 6,
              padding: '8px 12px',
              color: '#EDEDEF',
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

        <div style={{ fontSize: 12, color: '#8B909A' }}>
          {team.length} Active Member{team.length === 1 ? '' : 's'} · {invitations.filter(i => i.status === 'pending').length} Pending Link{invitations.filter(i => i.status === 'pending').length === 1 ? '' : 's'}
        </div>
      </div>

      {error && (
        <div role="alert" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 8, padding: '12px 16px', color: '#EF4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      {message && (
        <div role="status" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 8, padding: '12px 16px', color: '#10B981', fontSize: 13 }}>
          {message}
        </div>
      )}

      {/* INVITE FORM */}
      <div
        style={{
          background: '#14161C',
          border: '1px solid #20232B',
          borderRadius: 10,
          padding: 20,
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#EDEDEF', margin: '0 0 4px' }}>
          Assign Authorized Seller or PR Representative
        </h3>
        <p style={{ fontSize: 12, color: '#8B909A', margin: '0 0 16px', lineHeight: 1.5 }}>
          Sellers can issue direct door tickets. PR coordinators receive exclusive tracked referral links to earn attribution on customer sales.
        </p>

        <form onSubmit={sendInvite} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select
            value={role}
            onChange={e => setRole(e.target.value as 'seller' | 'pr')}
            style={{
              background: '#0E1013',
              border: '1px solid #282C36',
              borderRadius: 6,
              padding: '9px 12px',
              color: '#EDEDEF',
              fontSize: 13,
            }}
          >
            <option value="seller">Seller (Direct Ticket Issuer)</option>
            <option value="pr">PR Coordinator (Attribution Link)</option>
          </select>

          <input
            type="email"
            placeholder="Recipient email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{
              flex: 1,
              minWidth: 260,
              background: '#0E1013',
              border: '1px solid #282C36',
              borderRadius: 6,
              padding: '9px 12px',
              color: '#EDEDEF',
              fontSize: 13,
            }}
          />

          <button
            type="submit"
            disabled={busy}
            style={{
              background: '#EDEDEF',
              color: '#0B0C0E',
              border: 'none',
              padding: '9px 18px',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 12,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Sending…' : 'Send Invitation'}
          </button>
        </form>
      </div>

      {/* ACTIVE TEAM ROSTER */}
      <div
        style={{
          background: '#14161C',
          border: '1px solid #20232B',
          borderRadius: 10,
          padding: 20,
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#EDEDEF', margin: '0 0 14px' }}>
          Active Team Members ({team.length})
        </h3>

        {team.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: '#555962', fontSize: 13 }}>
            No sellers or PR coordinators actively assigned to {activeEvent.name}.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {team.map(member => (
              <div
                key={`${member.role}:${member.principalId}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '11px 16px',
                  borderRadius: 6,
                  background: '#0E1013',
                  border: '1px solid #1C1F26',
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
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: member.role === 'seller' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                      color: member.role === 'seller' ? '#60A5FA' : '#8B909A',
                      border: `1px solid ${member.role === 'seller' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.1)'}`,
                    }}
                  >
                    {member.role === 'seller' ? 'Seller' : 'PR Coordinator'}
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#EDEDEF', fontWeight: 500 }}>
                    {member.principalId}
                  </span>
                </div>

                <button
                  onClick={() => removeMember(member)}
                  disabled={busy}
                  style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    color: '#EF4444',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: 6,
                    padding: '5px 12px',
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

      {/* PENDING INVITATIONS */}
      {invitations.length > 0 && (
        <div
          style={{
            background: '#14161C',
            border: '1px solid #20232B',
            borderRadius: 10,
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#EDEDEF', margin: '0 0 14px' }}>
            Invitation Requests
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                    padding: '11px 16px',
                    borderRadius: 6,
                    background: '#0E1013',
                    border: '1px solid #1C1F26',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: 'JetBrains Mono, monospace',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'rgba(255,255,255,0.04)',
                        color: '#8B909A',
                        textTransform: 'uppercase',
                      }}
                    >
                      {inv.role}
                    </span>
                    <span style={{ fontSize: 13, color: '#EDEDEF' }}>{inv.recipientEmail}</span>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: 'JetBrains Mono, monospace',
                        color: isPending ? '#10B981' : isExpired ? '#EF4444' : '#8B909A',
                      }}
                    >
                      ({inv.status} {isPending ? `· expires ${new Date(inv.expiresAt).toLocaleDateString()}` : ''})
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    {isPending && (
                      <>
                        <button
                          onClick={() => resendInvitation(inv.invitationId)}
                          disabled={busy}
                          style={{
                            background: 'rgba(255,255,255,0.04)',
                            color: '#EDEDEF',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 6,
                            padding: '5px 10px',
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
                            background: 'rgba(239, 68, 68, 0.08)',
                            color: '#EF4444',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: 6,
                            padding: '5px 10px',
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
                          background: 'rgba(255,255,255,0.04)',
                          color: '#EDEDEF',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 6,
                          padding: '5px 10px',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        New Link
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
