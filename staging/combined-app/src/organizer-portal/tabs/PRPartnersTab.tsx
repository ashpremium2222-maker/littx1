import React, { useState, useEffect, useCallback } from 'react'
import { OrganizerEvent, PRPartner } from '../types'
import { STAGEWAY_THEME } from '../theme'

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
        <div style={{ background: STAGEWAY_THEME.surface, border: `1px solid ${STAGEWAY_THEME.border}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            TOTAL PR PARTNERS
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: STAGEWAY_THEME.primary, marginTop: 4 }}>
            {totalPartners}
          </div>
          <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, marginTop: 2 }}>
            Active promotional representatives
          </div>
        </div>

        <div style={{ background: STAGEWAY_THEME.surface, border: `1px solid ${STAGEWAY_THEME.border}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            PASSES GENERATED
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: STAGEWAY_THEME.primary, marginTop: 4 }}>
            {totalTicketsSold}
          </div>
          <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, marginTop: 2 }}>
            Issued via partner panel (/pr)
          </div>
        </div>

        <div style={{ background: STAGEWAY_THEME.surface, border: `1px solid ${STAGEWAY_THEME.border}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            PR ATTRIBUTED REVENUE
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: STAGEWAY_THEME.primary, marginTop: 4 }}>
            ₹{totalPRRevenue.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, marginTop: 2 }}>
            Across all promotional sales
          </div>
        </div>
      </div>

      {/* FEEDBACK BANNERS */}
      {error && (
        <div role="alert" style={{ background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.25)', borderRadius: 8, padding: '12px 16px', color: STAGEWAY_THEME.danger, fontSize: 13 }}>
          {error}
        </div>
      )}

      {message && (
        <div role="status" style={{ background: 'rgba(16, 165, 121, 0.1)', border: '1px solid rgba(16, 165, 121, 0.25)', borderRadius: 8, padding: '12px 16px', color: STAGEWAY_THEME.secondary, fontSize: 13 }}>
          {message}
        </div>
      )}

      {/* NEW CREDENTIALS POP-UP CARD */}
      {newCredentials && (
        <div
          style={{
            background: STAGEWAY_THEME.light,
            border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
            borderRadius: 10,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: STAGEWAY_THEME.primary, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>✓</span> PR Partner Account Created — Ready For Login
              </div>
              <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, marginTop: 2 }}>
                Share these credentials with your promotional partner. They can log in immediately at the Partner Portal.
              </div>
            </div>
            <button
              onClick={() => setNewCredentials(null)}
              style={{ background: 'transparent', border: 'none', color: STAGEWAY_THEME.textMuted, cursor: 'pointer', fontSize: 16 }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
              background: STAGEWAY_THEME.surface,
              border: `1px solid ${STAGEWAY_THEME.border}`,
              borderRadius: 8,
              padding: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase' }}>
                PR PORTAL URL
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textPrimary }}>
                  {portalUrl}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(portalUrl, 'url')}
                  style={{
                    background: STAGEWAY_THEME.light,
                    color: copiedKey === 'url' ? STAGEWAY_THEME.primary : STAGEWAY_THEME.textSecondary,
                    border: `1px solid ${STAGEWAY_THEME.border}`,
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
              <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase' }}>
                USERNAME / ID
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textPrimary, fontWeight: 600 }}>
                  {newCredentials.username}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(newCredentials.username, 'user')}
                  style={{
                    background: STAGEWAY_THEME.light,
                    color: copiedKey === 'user' ? STAGEWAY_THEME.primary : STAGEWAY_THEME.textSecondary,
                    border: `1px solid ${STAGEWAY_THEME.border}`,
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
              <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase' }}>
                PASSWORD
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textPrimary, fontWeight: 600 }}>
                  {newCredentials.password}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(newCredentials.password, 'pass')}
                  style={{
                    background: STAGEWAY_THEME.light,
                    color: copiedKey === 'pass' ? STAGEWAY_THEME.primary : STAGEWAY_THEME.textSecondary,
                    border: `1px solid ${STAGEWAY_THEME.border}`,
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
              <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase' }}>
                ACCESS SCOPE
              </div>
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: newCredentials.accessType === 'all' ? STAGEWAY_THEME.primary : STAGEWAY_THEME.warning }}>
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
                background: STAGEWAY_THEME.primary,
                color: '#FFFFFF',
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
              Open PR Panel →
            </a>
          </div>
        </div>
      )}

      {/* CREATE PR PARTNER FORM */}
      <div
        style={{
          background: STAGEWAY_THEME.surface,
          border: `1px solid ${STAGEWAY_THEME.border}`,
          borderRadius: 10,
          padding: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: STAGEWAY_THEME.textPrimary, margin: 0 }}>
            Create Promotional Partner Account
          </h2>
          <p style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, margin: '4px 0 0', lineHeight: 1.5 }}>
            Directly set an ID and password for your PR partner. They will sign in on the PR Panel (/pr) to generate passes for attendees.
          </p>
        </div>

        <form onSubmit={handleCreatePartner} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Row 1: Username & Password & Display Name */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.primary, marginBottom: 4 }}>
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
                  background: '#F8FCFA',
                  border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                  borderRadius: 6,
                  padding: '9px 12px',
                  color: STAGEWAY_THEME.textPrimary,
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
              <span style={{ fontSize: 10.5, color: STAGEWAY_THEME.textMuted, marginTop: 3, display: 'block' }}>
                Used by the PR partner to log in
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.primary, marginBottom: 4 }}>
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
                    background: '#F8FCFA',
                    border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                    borderRadius: 6,
                    padding: '9px 40px 9px 12px',
                    color: STAGEWAY_THEME.textPrimary,
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
                    color: STAGEWAY_THEME.textMuted,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <span style={{ fontSize: 10.5, color: STAGEWAY_THEME.textMuted, marginTop: 3, display: 'block' }}>
                Secret login password for PR partner
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.primary, marginBottom: 4 }}>
                PARTNER DISPLAY NAME
              </label>
              <input
                type="text"
                placeholder="e.g. Sumit Sharma PR"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                style={{
                  width: '100%',
                  background: '#F8FCFA',
                  border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                  borderRadius: 6,
                  padding: '9px 12px',
                  color: STAGEWAY_THEME.textPrimary,
                  fontSize: 13,
                }}
              />
              <span style={{ fontSize: 10.5, color: STAGEWAY_THEME.textMuted, marginTop: 3, display: 'block' }}>
                Shown on generated tickets and receipts
              </span>
            </div>
          </div>

          {/* Row 2: Access Scope Type (Full Access vs Single Event) */}
          <div
            style={{
              background: STAGEWAY_THEME.light,
              border: `1px solid ${STAGEWAY_THEME.border}`,
              borderRadius: 8,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <label style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.primary, textTransform: 'uppercase' }}>
              PR ACCESS TYPE
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {/* Option 1: Full Access PR */}
              <div
                onClick={() => setAccessType('all')}
                style={{
                  border: `1px solid ${accessType === 'all' ? STAGEWAY_THEME.primary : STAGEWAY_THEME.border}`,
                  background: accessType === 'all' ? 'rgba(4, 120, 87, 0.06)' : STAGEWAY_THEME.surface,
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
                  style={{ marginTop: 3, cursor: 'pointer', accentColor: STAGEWAY_THEME.primary }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: accessType === 'all' ? STAGEWAY_THEME.textPrimary : STAGEWAY_THEME.textMuted }}>
                    Full Access PR
                  </div>
                  <div style={{ fontSize: 11.5, color: STAGEWAY_THEME.textMuted, marginTop: 2, lineHeight: 1.4 }}>
                    Can generate tickets for <strong>all events</strong> produced by your organization now and in the future.
                  </div>
                </div>
              </div>

              {/* Option 2: Single Event PR */}
              <div
                onClick={() => setAccessType('single')}
                style={{
                  border: `1px solid ${accessType === 'single' ? STAGEWAY_THEME.warning : STAGEWAY_THEME.border}`,
                  background: accessType === 'single' ? 'rgba(217, 119, 6, 0.05)' : STAGEWAY_THEME.surface,
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
                  style={{ marginTop: 3, cursor: 'pointer', accentColor: STAGEWAY_THEME.warning }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: accessType === 'single' ? STAGEWAY_THEME.textPrimary : STAGEWAY_THEME.textMuted }}>
                    Single Event PR
                  </div>
                  <div style={{ fontSize: 11.5, color: STAGEWAY_THEME.textMuted, marginTop: 2, lineHeight: 1.4 }}>
                    Restricted strictly to <strong>one specific event</strong>. Only passes for the chosen event can be generated.
                  </div>
                </div>
              </div>
            </div>

            {/* Dropdown if single event is selected */}
            {accessType === 'single' && (
              <div style={{ marginTop: 6, paddingTop: 12, borderTop: `1px solid ${STAGEWAY_THEME.border}` }}>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.warning, marginBottom: 6 }}>
                  ASSIGN SPECIFIC EVENT *
                </label>
                {events.length === 0 ? (
                  <div style={{ fontSize: 12, color: STAGEWAY_THEME.danger }}>
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
                      background: '#F8FCFA',
                      border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                      borderRadius: 6,
                      padding: '9px 12px',
                      color: STAGEWAY_THEME.textPrimary,
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
                background: STAGEWAY_THEME.primary,
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 6,
                padding: '10px 22px',
                fontSize: 13,
                fontWeight: 600,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? 'Creating Account...' : '+ Create PR Partner Account'}
            </button>
          </div>
        </form>
      </div>

      {/* ROSTER TABLE */}
      <div
        style={{
          background: STAGEWAY_THEME.surface,
          border: `1px solid ${STAGEWAY_THEME.border}`,
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
            borderBottom: `1px solid ${STAGEWAY_THEME.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: STAGEWAY_THEME.textPrimary }}>
              Promotional Partners Roster ({partners.length})
            </span>

            <input
              type="text"
              placeholder="Search partner ID or name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                background: '#F8FCFA',
                border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                borderRadius: 6,
                padding: '6px 10px',
                color: STAGEWAY_THEME.textPrimary,
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
                  background: filterScope === scope ? STAGEWAY_THEME.primary : '#FFFFFF',
                  color: filterScope === scope ? '#FFFFFF' : STAGEWAY_THEME.textSecondary,
                  border: `1px solid ${filterScope === scope ? STAGEWAY_THEME.primary : STAGEWAY_THEME.border}`,
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
          <div style={{ padding: 40, textAlign: 'center', color: STAGEWAY_THEME.textMuted, fontSize: 13 }}>
            Loading promotional partners...
          </div>
        ) : filteredPartners.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: STAGEWAY_THEME.textMuted, fontSize: 13 }}>
            {partners.length === 0
              ? 'No PR partners created yet. Use the form above to create your first promotional partner account.'
              : 'No partners match the current search or filter criteria.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: STAGEWAY_THEME.light, borderBottom: `1px solid ${STAGEWAY_THEME.border}` }}>
                  <th style={{ padding: '12px 20px', fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase' }}>
                    PARTNER (ID &amp; NAME)
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase' }}>
                    ACCESS SCOPE
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase' }}>
                    PASSES ISSUED
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase' }}>
                    REVENUE ATTRIBUTED
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase' }}>
                    STATUS
                  </th>
                  <th style={{ padding: '12px 20px', fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase', textAlign: 'right' }}>
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
                      style={{ borderBottom: `1px solid ${STAGEWAY_THEME.border}`, transition: 'background 0.1s ease' }}
                    >
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ fontWeight: 600, color: STAGEWAY_THEME.textPrimary }}>
                          {partner.displayName}
                        </div>
                        <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, marginTop: 2 }}>
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
                              background: 'rgba(16, 165, 121, 0.12)',
                              color: STAGEWAY_THEME.secondary,
                              border: '1px solid rgba(16, 165, 121, 0.3)',
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
                                background: 'rgba(217, 119, 6, 0.12)',
                                color: STAGEWAY_THEME.warning,
                                border: '1px solid rgba(217, 119, 6, 0.3)',
                                textTransform: 'uppercase',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                alignSelf: 'flex-start',
                              }}
                            >
                              <span>●</span> Single Event
                            </span>
                            <span style={{ fontSize: 11.5, color: STAGEWAY_THEME.textPrimary, marginTop: 2 }}>
                              {singleEventName || partner.assignedEventIds?.[0] || 'Specific Event'}
                            </span>
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: STAGEWAY_THEME.textPrimary }}>
                          {partner.ticketsSold}
                        </span>
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: STAGEWAY_THEME.textPrimary }}>
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
                            color: partner.active ? STAGEWAY_THEME.primary : STAGEWAY_THEME.danger,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: partner.active ? STAGEWAY_THEME.primary : STAGEWAY_THEME.danger }} />
                          {partner.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleRevokePartner(partner.userId)}
                          disabled={busy}
                          style={{
                            background: 'rgba(220, 38, 38, 0.08)',
                            color: STAGEWAY_THEME.danger,
                            border: '1px solid rgba(220, 38, 38, 0.2)',
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
