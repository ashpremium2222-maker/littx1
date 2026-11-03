import React, { useState, useEffect, useCallback } from 'react'
import { OrganizerEvent, PRPartner } from '../types'

interface PRPartnersTabProps {
  events: OrganizerEvent[]
  preselectedEventId?: string | null
  onOpenEventSettings?: (event: OrganizerEvent) => void
}

export default function PRPartnersTab({
  events,
  preselectedEventId,
  onOpenEventSettings,
}: PRPartnersTabProps) {
  const [partners, setPartners] = useState<PRPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Form State
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [accessType, setAccessType] = useState<'all' | 'single'>(preselectedEventId ? 'single' : 'all')
  const [selectedEventId, setSelectedEventId] = useState<string>(preselectedEventId || events[0]?.eventId || '')
  const [showPassword, setShowPassword] = useState(false)

  // Newly Created Credentials Pop-up
  const [newCredentials, setNewCredentials] = useState<{
    username: string
    password: string
    displayName: string
    accessType: 'all' | 'single'
    eventName?: string
  } | null>(null)

  // Filters
  const [filterScope, setFilterScope] = useState<'all' | 'full' | 'single'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const loadPartners = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const res = await fetch('/api/organizer/pr-partners', {
        headers: { 'x-auth-token': token },
        cache: 'no-store',
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load PR partners.')
      setPartners(data.partners || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PR partners.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPartners()
  }, [loadPartners])

  useEffect(() => {
    if (preselectedEventId) {
      setAccessType('single')
      setSelectedEventId(preselectedEventId)
    }
  }, [preselectedEventId])

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
      if (cleanUsername.length < 3) throw new Error('Username must be at least 3 characters.')
      if (password.length < 6) throw new Error('Password must be at least 6 characters.')
      if (accessType === 'single' && !selectedEventId) throw new Error('Please select an event for single-event PR.')

      const res = await fetch('/api/organizer/pr-partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({
          username: cleanUsername,
          password,
          displayName: displayName.trim() || cleanUsername,
          accessType,
          eventId: accessType === 'single' ? selectedEventId : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to create PR partner.')

      const targetEvent = events.find(e => e.eventId === selectedEventId)
      setNewCredentials({
        username: cleanUsername,
        password,
        displayName: displayName.trim() || cleanUsername,
        accessType,
        eventName: targetEvent?.name,
      })

      setUsername('')
      setPassword('')
      setDisplayName('')
      setMessage(`PR Partner account "${cleanUsername}" created successfully!`)
      await loadPartners()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create PR partner.')
    } finally {
      setBusy(false)
    }
  }

  const handleRevokePartner = async (userId: string) => {
    if (!window.confirm(`Revoke PR access for "${userId}"? They will no longer be able to log in or generate tickets.`)) {
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const res = await fetch(`/api/organizer/pr-partners/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { 'x-auth-token': token },
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to revoke PR partner.')
      setMessage(`PR partner "${userId}" has been revoked.`)
      await loadPartners()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke PR partner.')
    } finally {
      setBusy(false)
    }
  }

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const totalPartners = partners.length
  const totalTicketsSold = partners.reduce((sum, p) => sum + (p.ticketsSold || 0), 0)
  const totalPRRevenue = partners.reduce((sum, p) => sum + (p.totalRevenue || 0), 0)

  const filteredPartners = partners.filter(p => {
    const matchesSearch =
      !searchQuery ||
      p.userId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.displayName.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesScope =
      filterScope === 'all' ||
      (filterScope === 'full' && p.accessType === 'all') ||
      (filterScope === 'single' && p.accessType === 'single')
    return matchesSearch && matchesScope
  })

  const portalUrl = `${window.location.origin}/pr`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI TILES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div style={{ background: '#14161C', border: '1px solid #20232B', borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            TOTAL PR PARTNERS
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#EDEDEF', marginTop: 4 }}>
            {totalPartners}
          </div>
          <div style={{ fontSize: 12, color: '#555962', marginTop: 2 }}>
            Active promotional representatives
          </div>
        </div>

        <div style={{ background: '#14161C', border: '1px solid #20232B', borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            PASSES GENERATED
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#10B981', marginTop: 4 }}>
            {totalTicketsSold}
          </div>
          <div style={{ fontSize: 12, color: '#555962', marginTop: 2 }}>
            Issued via partner panel (/pr)
          </div>
        </div>

        <div style={{ background: '#14161C', border: '1px solid #20232B', borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            PR ATTRIBUTED REVENUE
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#EDEDEF', marginTop: 4 }}>
            ₹{totalPRRevenue.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: '#555962', marginTop: 2 }}>
            Across all promotional sales
          </div>
        </div>
      </div>

      {/* FEEDBACK BANNERS */}
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

      {/* NEW CREDENTIALS POP-UP CARD */}
      {newCredentials && (
        <div
          style={{
            background: '#0E1210',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 10,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#10B981', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>✓</span> PR Partner Account Created Ready For Login
              </div>
              <div style={{ fontSize: 12, color: '#8B909A', marginTop: 2 }}>
                Share these credentials with your promotional partner. They can log in immediately at the Partner Portal.
              </div>
            </div>
            <button
              onClick={() => setNewCredentials(null)}
              style={{ background: 'transparent', border: 'none', color: '#8B909A', cursor: 'pointer', fontSize: 16 }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
              background: '#070A08',
              border: '1px solid rgba(16, 185, 129, 0.15)',
              borderRadius: 8,
              padding: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase' }}>
                PR PORTAL URL
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: '#EDEDEF' }}>
                  {portalUrl}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(portalUrl, 'url')}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    color: copiedKey === 'url' ? '#10B981' : '#EDEDEF',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  {copiedKey === 'url' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase' }}>
                USERNAME / ID
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: '#EDEDEF', fontWeight: 600 }}>
                  {newCredentials.username}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(newCredentials.username, 'user')}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    color: copiedKey === 'user' ? '#10B981' : '#EDEDEF',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  {copiedKey === 'user' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase' }}>
                PASSWORD
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: '#EDEDEF', fontWeight: 600 }}>
                  {newCredentials.password}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(newCredentials.password, 'pass')}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    color: copiedKey === 'pass' ? '#10B981' : '#EDEDEF',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  {copiedKey === 'pass' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase' }}>
                ACCESS SCOPE
              </div>
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: newCredentials.accessType === 'all' ? '#10B981' : '#F59E0B' }}>
                {newCredentials.accessType === 'all' ? '● Full Access (All Events)' : `● Single Event: ${newCredentials.eventName || 'Selected'}`}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <a
              href="/pr"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: '#EDEDEF',
                color: '#0B0C0E',
                padding: '7px 16px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              Open PR Panel ↗
            </a>
          </div>
        </div>
      )}

      {/* CREATE PR PARTNER FORM */}
      <div
        style={{
          background: '#14161C',
          border: '1px solid #20232B',
          borderRadius: 10,
          padding: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#EDEDEF', margin: 0 }}>
            Create Promotional Partner Account
          </h2>
          <p style={{ fontSize: 12, color: '#8B909A', margin: '4px 0 0', lineHeight: 1.5 }}>
            Directly set an ID and password for your PR partner. They will sign in on the PR Panel (/pr) to generate passes for attendees.
          </p>
        </div>

        <form onSubmit={handleCreatePartner} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Row 1: Username & Password & Display Name */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                PR ID / USERNAME *
              </label>
              <input
                type="text"
                placeholder="e.g. pr_sumit or promo_delhi"
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                required
                style={{
                  width: '100%',
                  background: '#0E1013',
                  border: '1px solid #282C36',
                  borderRadius: 6,
                  padding: '9px 12px',
                  color: '#EDEDEF',
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
              <span style={{ fontSize: 10.5, color: '#555962', marginTop: 3, display: 'block' }}>
                Used by the PR partner to log in
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                PASSWORD *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    background: '#0E1013',
                    border: '1px solid #282C36',
                    borderRadius: 6,
                    padding: '9px 40px 9px 12px',
                    color: '#EDEDEF',
                    fontSize: 13,
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: '#8B909A',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <span style={{ fontSize: 10.5, color: '#555962', marginTop: 3, display: 'block' }}>
                Secret login password for PR partner
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                PARTNER DISPLAY NAME
              </label>
              <input
                type="text"
                placeholder="e.g. Sumit Sharma PR"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
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
              <span style={{ fontSize: 10.5, color: '#555962', marginTop: 3, display: 'block' }}>
                Shown on generated tickets and receipts
              </span>
            </div>
          </div>

          {/* Row 2: Access Scope Type (Full Access vs Single Event) */}
          <div
            style={{
              background: '#0E1013',
              border: '1px solid #1C1F26',
              borderRadius: 8,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <label style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase' }}>
              PR ACCESS TYPE
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {/* Option 1: Full Access PR */}
              <div
                onClick={() => setAccessType('all')}
                style={{
                  border: `1px solid ${accessType === 'all' ? '#10B981' : '#282C36'}`,
                  background: accessType === 'all' ? 'rgba(16, 185, 129, 0.05)' : 'transparent',
                  borderRadius: 8,
                  padding: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="radio"
                  name="accessType"
                  checked={accessType === 'all'}
                  onChange={() => setAccessType('all')}
                  style={{ marginTop: 3, cursor: 'pointer', accentColor: '#10B981' }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: accessType === 'all' ? '#EDEDEF' : '#8B909A' }}>
                    Full Access PR
                  </div>
                  <div style={{ fontSize: 11.5, color: '#555962', marginTop: 2, lineHeight: 1.4 }}>
                    Can generate tickets for <strong>all events</strong> produced by your organization now and in the future.
                  </div>
                </div>
              </div>

              {/* Option 2: Single Event PR */}
              <div
                onClick={() => setAccessType('single')}
                style={{
                  border: `1px solid ${accessType === 'single' ? '#F59E0B' : '#282C36'}`,
                  background: accessType === 'single' ? 'rgba(245, 158, 11, 0.05)' : 'transparent',
                  borderRadius: 8,
                  padding: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="radio"
                  name="accessType"
                  checked={accessType === 'single'}
                  onChange={() => setAccessType('single')}
                  style={{ marginTop: 3, cursor: 'pointer', accentColor: '#F59E0B' }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: accessType === 'single' ? '#EDEDEF' : '#8B909A' }}>
                    Single Event PR
                  </div>
                  <div style={{ fontSize: 11.5, color: '#555962', marginTop: 2, lineHeight: 1.4 }}>
                    Restricted strictly to <strong>one specific event</strong>. Only passes for the chosen event can be generated.
                  </div>
                </div>
              </div>
            </div>

            {/* Dropdown if single event is selected */}
            {accessType === 'single' && (
              <div style={{ marginTop: 6, paddingTop: 12, borderTop: '1px solid #1C1F26' }}>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#F59E0B', marginBottom: 6 }}>
                  ASSIGN SPECIFIC EVENT *
                </label>
                {events.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#EF4444' }}>
                    No events exist yet. Create an event first to assign a single-event PR.
                  </div>
                ) : (
                  <select
                    value={selectedEventId}
                    onChange={e => setSelectedEventId(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      maxWidth: 400,
                      background: '#14161C',
                      border: '1px solid #282C36',
                      borderRadius: 6,
                      padding: '9px 12px',
                      color: '#EDEDEF',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    {events.map(event => (
                      <option key={event.eventId} value={event.eventId}>
                        {event.name} ({event.city || 'Event'}) — {event.status}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="submit"
              disabled={busy || (accessType === 'single' && events.length === 0)}
              style={{
                background: '#EDEDEF',
                color: '#0B0C0E',
                border: 'none',
                borderRadius: 6,
                padding: '10px 22px',
                fontSize: 13,
                fontWeight: 600,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              {busy ? 'Creating Account…' : '+ Create PR Partner Account'}
            </button>
          </div>
        </form>
      </div>

      {/* ROSTER TABLE */}
      <div
        style={{
          background: '#14161C',
          border: '1px solid #20232B',
          borderRadius: 10,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Table controls */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1E2026',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#EDEDEF' }}>
              Promotional Partners Roster ({partners.length})
            </span>

            <input
              type="text"
              placeholder="Search partner ID or name…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                background: '#0E1013',
                border: '1px solid #282C36',
                borderRadius: 6,
                padding: '6px 10px',
                color: '#EDEDEF',
                fontSize: 12,
                minWidth: 200,
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'full', 'single'] as const).map(scope => (
              <button
                key={scope}
                onClick={() => setFilterScope(scope)}
                style={{
                  background: filterScope === scope ? '#EDEDEF' : 'rgba(255,255,255,0.04)',
                  color: filterScope === scope ? '#0B0C0E' : '#8B909A',
                  border: '1px solid',
                  borderColor: filterScope === scope ? '#EDEDEF' : 'rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  padding: '5px 10px',
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {scope === 'all' ? 'All Partners' : scope === 'full' ? 'Full Access' : 'Single Event'}
              </button>
            ))}
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#555962', fontSize: 13 }}>
            Loading promotional partners…
          </div>
        ) : filteredPartners.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#555962', fontSize: 13 }}>
            {partners.length === 0
              ? 'No PR partners created yet. Use the form above to create your first promotional partner account.'
              : 'No partners match the current search or filter criteria.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#101216', borderBottom: '1px solid #1E2026' }}>
                  <th style={{ padding: '12px 20px', fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase' }}>
                    PARTNER (ID & NAME)
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase' }}>
                    ACCESS SCOPE
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase' }}>
                    PASSES ISSUED
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase' }}>
                    REVENUE ATTRIBUTED
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase' }}>
                    STATUS
                  </th>
                  <th style={{ padding: '12px 20px', fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase', textAlign: 'right' }}>
                    ACTIONS
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPartners.map(partner => {
                  const isFull = partner.accessType === 'all'
                  const singleEventName = partner.assignedEvents?.[0]?.name

                  return (
                    <tr
                      key={partner.userId}
                      style={{ borderBottom: '1px solid #1A1D24', transition: 'background 0.1s ease' }}
                    >
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ fontWeight: 600, color: '#EDEDEF' }}>
                          {partner.displayName}
                        </div>
                        <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginTop: 2 }}>
                          @{partner.userId}
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        {isFull ? (
                          <span
                            style={{
                              fontSize: 10.5,
                              fontFamily: 'JetBrains Mono, monospace',
                              fontWeight: 600,
                              padding: '3px 8px',
                              borderRadius: 4,
                              background: 'rgba(16, 185, 129, 0.1)',
                              color: '#10B981',
                              border: '1px solid rgba(16, 185, 129, 0.25)',
                              textTransform: 'uppercase',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <span>●</span> Full Access (All Events)
                          </span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span
                              style={{
                                fontSize: 10.5,
                                fontFamily: 'JetBrains Mono, monospace',
                                fontWeight: 600,
                                padding: '3px 8px',
                                borderRadius: 4,
                                background: 'rgba(245, 158, 11, 0.1)',
                                color: '#F59E0B',
                                border: '1px solid rgba(245, 158, 11, 0.25)',
                                textTransform: 'uppercase',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                alignSelf: 'flex-start',
                              }}
                            >
                              <span>●</span> Single Event
                            </span>
                            <span style={{ fontSize: 11.5, color: '#EDEDEF', marginTop: 2 }}>
                              {singleEventName || partner.assignedEventIds?.[0] || 'Specific Event'}
                            </span>
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: '#EDEDEF' }}>
                          {partner.ticketsSold}
                        </span>
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: '#EDEDEF' }}>
                          ₹{Number(partner.totalRevenue || 0).toLocaleString()}
                        </span>
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: 'JetBrains Mono, monospace',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            color: partner.active ? '#10B981' : '#EF4444',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: partner.active ? '#10B981' : '#EF4444' }} />
                          {partner.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleRevokePartner(partner.userId)}
                          disabled={busy}
                          style={{
                            background: 'rgba(239, 68, 68, 0.08)',
                            color: '#EF4444',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: 6,
                            padding: '5px 10px',
                            fontSize: 11,
                            fontFamily: 'JetBrains Mono, monospace',
                            cursor: busy ? 'not-allowed' : 'pointer',
                          }}
                        >
                          Revoke Access
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
