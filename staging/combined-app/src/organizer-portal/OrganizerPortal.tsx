import React, { useEffect, useState } from 'react'
import { OrganizerCategory, OrganizerEvent, OrganizerProfile, OrganizerTab } from './types'
import OverviewTab from './tabs/OverviewTab'
import EventsTab from './tabs/EventsTab'
import TicketTiersTab from './tabs/TicketTiersTab'
import SalesOrdersTab from './tabs/SalesOrdersTab'
import GateScansTab from './tabs/GateScansTab'
import TeamPRTab from './tabs/TeamPRTab'
import PayoutsTab from './tabs/PayoutsTab'
import ProfileTab from './tabs/ProfileTab'

export default function OrganizerPortal({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<OrganizerTab>('overview')
  const [events, setEvents] = useState<OrganizerEvent[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('Organizer')
  const [profile, setProfile] = useState<OrganizerProfile>({
    displayName: '',
    organizationName: '',
    verifiedEmail: null,
    emailVerified: false,
    companyId: '',
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Create Draft Modal State
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creatingDraft, setCreatingDraft] = useState(false)
  const [draftForm, setDraftForm] = useState({
    name: '',
    category: '',
    venue: '',
    city: '',
    description: '',
    posterUrl: '',
    startsAt: '',
    endsAt: '',
  })

  // Edit Event Modal State
  const [editingEvent, setEditingEvent] = useState<OrganizerEvent | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    venue: '',
    city: '',
    description: '',
    posterUrl: '',
    startsAt: '',
    endsAt: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)

  const localDatetime = (value?: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return ''
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }

  const loadData = async () => {
    setError('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const res = await fetch('/api/organizer/overview', {
        headers: { 'x-auth-token': token },
        cache: 'no-store',
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Could not load organizer data.')

      const evs: OrganizerEvent[] = data.events || []
      setEvents(evs)
      setDisplayName(data.organizer?.displayName || 'Organizer')

      if (!selectedEventId && evs.length > 0) {
        setSelectedEventId(evs[0].eventId)
      }

      const profRes = await fetch('/api/organizer/profile', {
        headers: { 'x-auth-token': token },
        cache: 'no-store',
      })
      const profData = await profRes.json()
      if (profRes.ok && profData.success) {
        setProfile(profData.profile)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load organizer data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const handleSelectEvent = (eventId: string, tab?: string) => {
    setSelectedEventId(eventId)
    if (tab && (['overview', 'events', 'tiers', 'sales', 'scans', 'team', 'payouts', 'profile'] as string[]).includes(tab)) {
      setActiveTab(tab as OrganizerTab)
    }
  }

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreatingDraft(true)
    setError('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({
          ...draftForm,
          images: draftForm.posterUrl.trim() ? [draftForm.posterUrl.trim()] : [],
          startsAt: draftForm.startsAt ? new Date(draftForm.startsAt).toISOString() : null,
          endsAt: draftForm.endsAt ? new Date(draftForm.endsAt).toISOString() : null,
          ticketCategories: [],
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Draft creation failed.')
      setDraftForm({
        name: '',
        category: '',
        venue: '',
        city: '',
        description: '',
        posterUrl: '',
        startsAt: '',
        endsAt: '',
      })
      setShowCreateModal(false)
      await loadData()
      if (data.event?.id || data.event?.eventId) {
        setSelectedEventId(data.event.id || data.event.eventId)
        setActiveTab('tiers')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Draft creation failed.')
    } finally {
      setCreatingDraft(false)
    }
  }

  const handleOpenEdit = (event: OrganizerEvent) => {
    setEditingEvent(event)
    setEditForm({
      name: event.name,
      venue: event.venue || '',
      city: event.city || '',
      description: event.description || '',
      posterUrl: event.images?.[0] || '',
      startsAt: localDatetime(event.startsAt),
      endsAt: localDatetime(event.endsAt),
    })
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEvent) return
    setSavingEdit(true)
    setError('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const res = await fetch(`/api/admin/events/${encodeURIComponent(editingEvent.eventId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({
          name: editForm.name,
          venue: editForm.venue,
          city: editForm.city,
          description: editForm.description,
          images: editForm.posterUrl.trim() ? [editForm.posterUrl.trim()] : [],
          startsAt: editForm.startsAt ? new Date(editForm.startsAt).toISOString() : null,
          endsAt: editForm.endsAt ? new Date(editForm.endsAt).toISOString() : null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to save event info.')
      setEditingEvent(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event info.')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleSaveTiers = async (eventId: string, categories: OrganizerCategory[]) => {
    const token = sessionStorage.getItem('littx_token') || ''
    const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ ticketCategories: categories }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to save ticket categories.')
    await loadData()
  }

  const handleSubmitForReview = async (event: OrganizerEvent) => {
    if (!window.confirm(`Submit "${event.name}" for public review? Once approved by the platform team, tickets will be available for public booking.`)) {
      return
    }
    const token = sessionStorage.getItem('littx_token') || ''
    const res = await fetch(`/api/admin/events/${encodeURIComponent(event.eventId)}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ status: 'pending_review' }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data.message || 'Submission for review failed.')
    await loadData()
  }

  const handleSaveProfile = async (dispName: string, orgName: string) => {
    const token = sessionStorage.getItem('littx_token') || ''
    const res = await fetch('/api/organizer/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ displayName: dispName, organizationName: orgName }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update profile.')
    setProfile(data.profile)
    setDisplayName(data.profile.displayName)
  }

  const handleLogout = async () => {
    const token = sessionStorage.getItem('littx_token') || ''
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'x-auth-token': token } }).catch(() => {})
    onLogout()
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0B0C0E',
          color: '#EDEDEF',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>Stageway</div>
        <div style={{ fontSize: 12, color: '#8B909A', fontFamily: 'JetBrains Mono, monospace' }}>
          Loading dashboard…
        </div>
      </div>
    )
  }

  const navItems: Array<{ id: OrganizerTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'events', label: 'My Events' },
    { id: 'tiers', label: 'Ticket Tiers' },
    { id: 'sales', label: 'Sales & Orders' },
    { id: 'scans', label: 'Gate Check-in' },
    { id: 'team', label: 'Team & PR' },
    { id: 'payouts', label: 'Payouts & Settlement' },
    { id: 'profile', label: 'Entity Profile' },
  ]

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: '#0B0C0E',
        color: '#EDEDEF',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* PROFESSIONAL SIDEBAR */}
      <aside
        style={{
          width: 240,
          background: '#101216',
          borderRight: '1px solid #1E2026',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 40,
        }}
      >
        <div>
          {/* Brand Header */}
          <div
            style={{
              padding: '20px',
              borderBottom: '1px solid #1E2026',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                background: '#EDEDEF',
                color: '#0B0C0E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              S
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#EDEDEF', letterSpacing: '-0.01em' }}>
                Stageway
              </div>
              <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Organizer Portal
              </div>
            </div>
          </div>

          {/* Org Profile Pill */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #1E2026' }}>
            <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#555962', textTransform: 'uppercase' }}>
              PROMOTER
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile.organizationName || displayName}
            </div>
          </div>

          {/* Nav List */}
          <nav style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {navItems.map(item => {
              const active = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: active ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                    color: active ? '#EDEDEF' : '#8B909A',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.1s ease',
                  }}
                >
                  {item.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Bottom Actions */}
        <div style={{ padding: '16px', borderTop: '1px solid #1E2026' }}>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              width: '100%',
              background: '#EDEDEF',
              color: '#0B0C0E',
              border: 'none',
              borderRadius: 6,
              padding: '9px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: 8,
            }}
          >
            + Create Event
          </button>

          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              background: 'transparent',
              color: '#8B909A',
              border: '1px solid #20232B',
              borderRadius: 6,
              padding: '7px 12px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* TOP STATUS BAR */}
        <header
          style={{
            height: 60,
            borderBottom: '1px solid #1E2026',
            background: '#101216',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            position: 'sticky',
            top: 0,
            zIndex: 30,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 15, fontWeight: 600, color: '#EDEDEF', margin: 0 }}>
              {navItems.find(i => i.id === activeTab)?.label}
            </h1>

            {events.length > 0 && (
              <span style={{ fontSize: 12, color: '#555962', fontFamily: 'JetBrains Mono, monospace' }}>
                · {events.length} production{events.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {events.length > 0 && (
              <select
                value={selectedEventId || ''}
                onChange={e => setSelectedEventId(e.target.value)}
                style={{
                  background: '#0E1013',
                  border: '1px solid #282C36',
                  borderRadius: 6,
                  padding: '6px 10px',
                  color: '#EDEDEF',
                  fontSize: 12,
                  fontFamily: 'JetBrains Mono, monospace',
                  cursor: 'pointer',
                  maxWidth: 220,
                }}
              >
                {events.map(e => (
                  <option key={e.eventId} value={e.eventId}>
                    {e.name}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={() => void loadData()}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid #20232B',
                color: '#8B909A',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
              title="Refresh"
            >
              Refresh
            </button>
          </div>
        </header>

        {/* ERROR NOTIFICATION */}
        {error && (
          <div
            style={{
              margin: '16px 24px 0',
              padding: '12px 16px',
              borderRadius: 6,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#EF4444',
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => void loadData()}
              style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* TAB BODY */}
        <main style={{ padding: '24px clamp(16px, 3vw, 36px)', flex: 1, minHeight: 0 }}>
          {activeTab === 'overview' && (
            <OverviewTab
              events={events}
              onSelectEvent={handleSelectEvent}
              onOpenCreateDraft={() => setShowCreateModal(true)}
            />
          )}

          {activeTab === 'events' && (
            <EventsTab
              events={events}
              onSelectEvent={handleSelectEvent}
              onOpenCreateDraft={() => setShowCreateModal(true)}
              onEditEvent={handleOpenEdit}
              onSubmitForReview={handleSubmitForReview}
            />
          )}

          {activeTab === 'tiers' && (
            <TicketTiersTab
              events={events}
              selectedEventId={selectedEventId}
              onSelectEventId={setSelectedEventId}
              onSaveTiers={handleSaveTiers}
            />
          )}

          {activeTab === 'sales' && (
            <SalesOrdersTab
              events={events}
              selectedEventId={selectedEventId}
              onSelectEventId={setSelectedEventId}
            />
          )}

          {activeTab === 'scans' && (
            <GateScansTab
              events={events}
              selectedEventId={selectedEventId}
              onSelectEventId={setSelectedEventId}
              onRefresh={loadData}
            />
          )}

          {activeTab === 'team' && (
            <TeamPRTab
              events={events}
              selectedEventId={selectedEventId}
              onSelectEventId={setSelectedEventId}
            />
          )}

          {activeTab === 'payouts' && <PayoutsTab />}

          {activeTab === 'profile' && (
            <ProfileTab profile={profile} onSaveProfile={handleSaveProfile} />
          )}
        </main>
      </div>

      {/* CREATE EVENT DRAFT MODAL */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              background: '#14161C',
              border: '1px solid #282C36',
              borderRadius: 10,
              width: '100%',
              maxWidth: 600,
              padding: 24,
              boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#EDEDEF' }}>
                  Create Event Draft
                </h2>
                <div style={{ fontSize: 12, color: '#8B909A', marginTop: 2 }}>
                  Set up event venue and timing details. You can configure ticket tiers next.
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#8B909A', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDraft} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                  EVENT TITLE *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Saturday Night Session"
                  value={draftForm.name}
                  onChange={e => setDraftForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    background: '#0E1013',
                    border: '1px solid #282C36',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: '#EDEDEF',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                    CITY *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mumbai"
                    value={draftForm.city}
                    onChange={e => setDraftForm(prev => ({ ...prev, city: e.target.value }))}
                    required
                    style={{
                      width: '100%',
                      background: '#0E1013',
                      border: '1px solid #282C36',
                      borderRadius: 6,
                      padding: '8px 12px',
                      color: '#EDEDEF',
                      fontSize: 13,
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                    VENUE
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Blue Frog"
                    value={draftForm.venue}
                    onChange={e => setDraftForm(prev => ({ ...prev, venue: e.target.value }))}
                    style={{
                      width: '100%',
                      background: '#0E1013',
                      border: '1px solid #282C36',
                      borderRadius: 6,
                      padding: '8px 12px',
                      color: '#EDEDEF',
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                    START DATE & TIME
                  </label>
                  <input
                    type="datetime-local"
                    value={draftForm.startsAt}
                    onChange={e => setDraftForm(prev => ({ ...prev, startsAt: e.target.value }))}
                    style={{
                      width: '100%',
                      background: '#0E1013',
                      border: '1px solid #282C36',
                      borderRadius: 6,
                      padding: '8px 12px',
                      color: '#EDEDEF',
                      fontSize: 12,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                    END DATE & TIME
                  </label>
                  <input
                    type="datetime-local"
                    value={draftForm.endsAt}
                    onChange={e => setDraftForm(prev => ({ ...prev, endsAt: e.target.value }))}
                    style={{
                      width: '100%',
                      background: '#0E1013',
                      border: '1px solid #282C36',
                      borderRadius: 6,
                      padding: '8px 12px',
                      color: '#EDEDEF',
                      fontSize: 12,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                  POSTER IMAGE URL
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={draftForm.posterUrl}
                  onChange={e => setDraftForm(prev => ({ ...prev, posterUrl: e.target.value }))}
                  style={{
                    width: '100%',
                    background: '#0E1013',
                    border: '1px solid #282C36',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: '#EDEDEF',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                  EVENT DESCRIPTION
                </label>
                <textarea
                  placeholder="Lineup, entry requirements, age limit..."
                  value={draftForm.description}
                  onChange={e => setDraftForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  style={{
                    width: '100%',
                    background: '#0E1013',
                    border: '1px solid #282C36',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: '#EDEDEF',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    color: '#8B909A',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: '8px 16px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingDraft}
                  style={{
                    background: '#EDEDEF',
                    color: '#0B0C0E',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 20px',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: creatingDraft ? 'not-allowed' : 'pointer',
                  }}
                >
                  {creatingDraft ? 'Saving…' : 'Save Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT EVENT INFO MODAL */}
      {editingEvent && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              background: '#14161C',
              border: '1px solid #282C36',
              borderRadius: 10,
              width: '100%',
              maxWidth: 600,
              padding: 24,
              boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#EDEDEF' }}>
                  Edit Event Details
                </h2>
                <div style={{ fontSize: 12, color: '#8B909A', marginTop: 2 }}>
                  {editingEvent.name}
                </div>
              </div>
              <button
                onClick={() => setEditingEvent(null)}
                style={{ background: 'transparent', border: 'none', color: '#8B909A', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                  EVENT TITLE
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    background: '#0E1013',
                    border: '1px solid #282C36',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: '#EDEDEF',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                    CITY
                  </label>
                  <input
                    type="text"
                    value={editForm.city}
                    onChange={e => setEditForm(prev => ({ ...prev, city: e.target.value }))}
                    style={{
                      width: '100%',
                      background: '#0E1013',
                      border: '1px solid #282C36',
                      borderRadius: 6,
                      padding: '8px 12px',
                      color: '#EDEDEF',
                      fontSize: 13,
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                    VENUE
                  </label>
                  <input
                    type="text"
                    value={editForm.venue}
                    onChange={e => setEditForm(prev => ({ ...prev, venue: e.target.value }))}
                    style={{
                      width: '100%',
                      background: '#0E1013',
                      border: '1px solid #282C36',
                      borderRadius: 6,
                      padding: '8px 12px',
                      color: '#EDEDEF',
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                    START DATE & TIME
                  </label>
                  <input
                    type="datetime-local"
                    value={editForm.startsAt}
                    onChange={e => setEditForm(prev => ({ ...prev, startsAt: e.target.value }))}
                    style={{
                      width: '100%',
                      background: '#0E1013',
                      border: '1px solid #282C36',
                      borderRadius: 6,
                      padding: '8px 12px',
                      color: '#EDEDEF',
                      fontSize: 12,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                    END DATE & TIME
                  </label>
                  <input
                    type="datetime-local"
                    value={editForm.endsAt}
                    onChange={e => setEditForm(prev => ({ ...prev, endsAt: e.target.value }))}
                    style={{
                      width: '100%',
                      background: '#0E1013',
                      border: '1px solid #282C36',
                      borderRadius: 6,
                      padding: '8px 12px',
                      color: '#EDEDEF',
                      fontSize: 12,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                  POSTER IMAGE URL
                </label>
                <input
                  type="url"
                  value={editForm.posterUrl}
                  onChange={e => setEditForm(prev => ({ ...prev, posterUrl: e.target.value }))}
                  style={{
                    width: '100%',
                    background: '#0E1013',
                    border: '1px solid #282C36',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: '#EDEDEF',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                  DESCRIPTION
                </label>
                <textarea
                  value={editForm.description}
                  onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  style={{
                    width: '100%',
                    background: '#0E1013',
                    border: '1px solid #282C36',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: '#EDEDEF',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    color: '#8B909A',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: '8px 16px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  style={{
                    background: '#EDEDEF',
                    color: '#0B0C0E',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 20px',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: savingEdit ? 'not-allowed' : 'pointer',
                  }}
                >
                  {savingEdit ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
