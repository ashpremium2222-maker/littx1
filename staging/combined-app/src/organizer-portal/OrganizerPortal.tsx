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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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
    if (!window.confirm(`Submit "${event.name}" for public review? Once reviewed by the platform administrators, the event will be officially published.`)) {
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
          background: '#0A0912',
          color: '#F5F2EA',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          fontFamily: 'Unbounded, sans-serif',
        }}
      >
        <div style={{ color: '#D8FF3F', fontSize: 24, letterSpacing: '0.05em' }}>STAGEWAY</div>
        <div style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.6)' }}>
          Loading Organizer Dashboard…
        </div>
      </div>
    )
  }

  const navItems: Array<{ id: OrganizerTab; label: string; icon: string }> = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'events', label: 'My Events', icon: '🎪' },
    { id: 'tiers', label: 'Ticket Tiers', icon: '🎟️' },
    { id: 'sales', label: 'Sales & Orders', icon: '💳' },
    { id: 'scans', label: 'Gate Check-in', icon: '📱' },
    { id: 'team', label: 'Team & PR', icon: '🤝' },
    { id: 'payouts', label: 'Payouts', icon: '⚡' },
    { id: 'profile', label: 'Profile', icon: '⚙️' },
  ]

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: '#0A0912',
        color: '#F5F2EA',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* SIDEBAR NAVIGATION */}
      <aside
        style={{
          width: 260,
          background: '#111018',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 40,
        }}
        className="organizer-sidebar"
      >
        <div>
          {/* Logo Brand Header */}
          <div
            style={{
              padding: '24px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#D8FF3F',
                color: '#0A0912',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Unbounded, sans-serif',
                fontWeight: 900,
                fontSize: 16,
              }}
            >
              S
            </div>
            <div>
              <div style={{ fontFamily: 'Unbounded, sans-serif', fontWeight: 800, fontSize: 15, letterSpacing: '0.02em', color: '#F5F2EA' }}>
                STAGEWAY
              </div>
              <div style={{ fontSize: 9.5, fontFamily: 'JetBrains Mono, monospace', color: '#D8FF3F', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                ORGANIZER PORTAL
              </div>
            </div>
          </div>

          {/* Org Info Snapshot */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.4)', textTransform: 'uppercase' }}>
              LOGGED IN PROMOTER
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F5F2EA', marginTop: 3 }}>
              {profile.organizationName || displayName}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(245,242,234,0.5)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#31E7C8' }}>●</span> Approved Partner
            </div>
          </div>

          {/* Navigation Items */}
          <nav style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {navItems.map(item => {
              const active = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id)
                    setMobileMenuOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: active ? 'rgba(216,255,63,0.12)' : 'transparent',
                    color: active ? '#D8FF3F' : 'rgba(245,242,234,0.7)',
                    border: '1px solid',
                    borderColor: active ? 'rgba(216,255,63,0.25)' : 'transparent',
                    fontFamily: active ? 'Unbounded, sans-serif' : 'Inter, sans-serif',
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Bottom Actions */}
        <div style={{ padding: '16px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              width: '100%',
              background: '#D8FF3F',
              color: '#0A0912',
              border: 'none',
              borderRadius: 8,
              padding: '10px 14px',
              fontFamily: 'Unbounded, sans-serif',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              textTransform: 'uppercase',
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
              color: 'rgba(245,242,234,0.6)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: '8px 12px',
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
            height: 68,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(17,16,24,0.85)',
            backdropFilter: 'blur(12px)',
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
            <h1 style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 16, fontWeight: 700, margin: 0 }}>
              {navItems.find(i => i.id === activeTab)?.label}
            </h1>

            {events.length > 0 && (
              <span style={{ fontSize: 11, color: 'rgba(245,242,234,0.4)', fontFamily: 'JetBrains Mono, monospace' }}>
                · {events.length} Assigned Event{events.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Quick Event Switcher */}
            {events.length > 0 && (
              <select
                value={selectedEventId || ''}
                onChange={e => setSelectedEventId(e.target.value)}
                style={{
                  background: 'rgba(10,9,18,0.85)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6,
                  padding: '6px 12px',
                  color: '#F5F2EA',
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
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#F5F2EA',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
              title="Refresh Data"
            >
              🔄
            </button>
          </div>
        </header>

        {/* ERROR BANNER */}
        {error && (
          <div
            style={{
              margin: '16px 24px 0',
              padding: '12px 18px',
              borderRadius: 8,
              background: 'rgba(255,107,107,0.15)',
              border: '1px solid #FF6B6B',
              color: '#FF6B6B',
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => void loadData()}
              style={{ background: 'transparent', border: 'none', color: '#FF6B6B', cursor: 'pointer', textDecoration: 'underline' }}
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
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              background: '#141220',
              border: '1px solid rgba(216,255,63,0.3)',
              borderRadius: 16,
              width: '100%',
              maxWidth: 640,
              padding: 28,
              boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 18, margin: 0, color: '#D8FF3F' }}>
                  Create Event Draft
                </h2>
                <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.5)', marginTop: 4 }}>
                  Save your draft now; configure ticket tiers and team members before submitting for review.
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#F5F2EA', fontSize: 20, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDraft} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
                  EVENT NAME *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Neon Horizon Festival"
                  value={draftForm.name}
                  onChange={e => setDraftForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    background: 'rgba(10,9,18,0.85)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 6,
                    padding: '9px 12px',
                    color: '#F5F2EA',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
                    CITY *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mumbai, Bengaluru, Goa"
                    value={draftForm.city}
                    onChange={e => setDraftForm(prev => ({ ...prev, city: e.target.value }))}
                    required
                    style={{
                      width: '100%',
                      background: 'rgba(10,9,18,0.85)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 6,
                      padding: '9px 12px',
                      color: '#F5F2EA',
                      fontSize: 13,
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
                    VENUE NAME
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. The Great Eastern Mills"
                    value={draftForm.venue}
                    onChange={e => setDraftForm(prev => ({ ...prev, venue: e.target.value }))}
                    style={{
                      width: '100%',
                      background: 'rgba(10,9,18,0.85)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 6,
                      padding: '9px 12px',
                      color: '#F5F2EA',
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
                    EVENT START DATE & TIME
                  </label>
                  <input
                    type="datetime-local"
                    value={draftForm.startsAt}
                    onChange={e => setDraftForm(prev => ({ ...prev, startsAt: e.target.value }))}
                    style={{
                      width: '100%',
                      background: 'rgba(10,9,18,0.85)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 6,
                      padding: '9px 12px',
                      color: '#F5F2EA',
                      fontSize: 12,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
                    EVENT END DATE & TIME
                  </label>
                  <input
                    type="datetime-local"
                    value={draftForm.endsAt}
                    onChange={e => setDraftForm(prev => ({ ...prev, endsAt: e.target.value }))}
                    style={{
                      width: '100%',
                      background: 'rgba(10,9,18,0.85)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 6,
                      padding: '9px 12px',
                      color: '#F5F2EA',
                      fontSize: 12,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
                  POSTER IMAGE URL (OPTIONAL)
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/poster.jpg"
                  value={draftForm.posterUrl}
                  onChange={e => setDraftForm(prev => ({ ...prev, posterUrl: e.target.value }))}
                  style={{
                    width: '100%',
                    background: 'rgba(10,9,18,0.85)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 6,
                    padding: '9px 12px',
                    color: '#F5F2EA',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
                  DESCRIPTION
                </label>
                <textarea
                  placeholder="Set times, genre, dress code, age limit, entry requirements..."
                  value={draftForm.description}
                  onChange={e => setDraftForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  style={{
                    width: '100%',
                    background: 'rgba(10,9,18,0.85)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 6,
                    padding: '9px 12px',
                    color: '#F5F2EA',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(245,242,234,0.7)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: '10px 18px',
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
                    background: '#D8FF3F',
                    color: '#0A0912',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 24px',
                    fontFamily: 'Unbounded, sans-serif',
                    fontWeight: 800,
                    fontSize: 12,
                    cursor: creatingDraft ? 'not-allowed' : 'pointer',
                    textTransform: 'uppercase',
                  }}
                >
                  {creatingDraft ? 'Saving Draft…' : 'Save Event Draft'}
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
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              background: '#141220',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 16,
              width: '100%',
              maxWidth: 640,
              padding: 28,
              boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 18, margin: 0, color: '#F5F2EA' }}>
                  Edit Event Details
                </h2>
                <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.5)', marginTop: 4 }}>
                  {editingEvent.name}
                </div>
              </div>
              <button
                onClick={() => setEditingEvent(null)}
                style={{ background: 'transparent', border: 'none', color: '#F5F2EA', fontSize: 20, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
                  EVENT NAME
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    background: 'rgba(10,9,18,0.85)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 6,
                    padding: '9px 12px',
                    color: '#F5F2EA',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
                    CITY
                  </label>
                  <input
                    type="text"
                    value={editForm.city}
                    onChange={e => setEditForm(prev => ({ ...prev, city: e.target.value }))}
                    style={{
                      width: '100%',
                      background: 'rgba(10,9,18,0.85)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 6,
                      padding: '9px 12px',
                      color: '#F5F2EA',
                      fontSize: 13,
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
                    VENUE
                  </label>
                  <input
                    type="text"
                    value={editForm.venue}
                    onChange={e => setEditForm(prev => ({ ...prev, venue: e.target.value }))}
                    style={{
                      width: '100%',
                      background: 'rgba(10,9,18,0.85)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 6,
                      padding: '9px 12px',
                      color: '#F5F2EA',
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
                    START DATE & TIME
                  </label>
                  <input
                    type="datetime-local"
                    value={editForm.startsAt}
                    onChange={e => setEditForm(prev => ({ ...prev, startsAt: e.target.value }))}
                    style={{
                      width: '100%',
                      background: 'rgba(10,9,18,0.85)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 6,
                      padding: '9px 12px',
                      color: '#F5F2EA',
                      fontSize: 12,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
                    END DATE & TIME
                  </label>
                  <input
                    type="datetime-local"
                    value={editForm.endsAt}
                    onChange={e => setEditForm(prev => ({ ...prev, endsAt: e.target.value }))}
                    style={{
                      width: '100%',
                      background: 'rgba(10,9,18,0.85)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 6,
                      padding: '9px 12px',
                      color: '#F5F2EA',
                      fontSize: 12,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
                  POSTER IMAGE URL
                </label>
                <input
                  type="url"
                  value={editForm.posterUrl}
                  onChange={e => setEditForm(prev => ({ ...prev, posterUrl: e.target.value }))}
                  style={{
                    width: '100%',
                    background: 'rgba(10,9,18,0.85)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 6,
                    padding: '9px 12px',
                    color: '#F5F2EA',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
                  DESCRIPTION
                </label>
                <textarea
                  value={editForm.description}
                  onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  style={{
                    width: '100%',
                    background: 'rgba(10,9,18,0.85)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 6,
                    padding: '9px 12px',
                    color: '#F5F2EA',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(245,242,234,0.7)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: '10px 18px',
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
                    background: '#D8FF3F',
                    color: '#0A0912',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 24px',
                    fontFamily: 'Unbounded, sans-serif',
                    fontWeight: 800,
                    fontSize: 12,
                    cursor: savingEdit ? 'not-allowed' : 'pointer',
                    textTransform: 'uppercase',
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
