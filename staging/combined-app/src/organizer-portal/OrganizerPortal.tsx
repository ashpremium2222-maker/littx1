import React, { useEffect, useState } from 'react'
import { OrganizerCategory, OrganizerEvent, OrganizerProfile, OrganizerTab } from './types'
import OverviewTab from './tabs/OverviewTab'
import EventsTab from './tabs/EventsTab'
import TicketTiersTab from './tabs/TicketTiersTab'
import SalesOrdersTab from './tabs/SalesOrdersTab'
import GateScansTab from './tabs/GateScansTab'
import TeamPRTab from './tabs/TeamPRTab'
import PRPartnersTab from './tabs/PRPartnersTab'
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
    slug: '',
    category: '',
    venue: '',
    city: '',
    address: '',
    timezone: 'Asia/Kolkata',
    description: '',
    posterUrl: '',
    startsAt: '',
    endsAt: '',
    salesStartAt: '',
    salesEndAt: '',
    visibility: 'public',
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

      const newId = data.event?.id || data.event?.eventId
      if (newId) {
        setSelectedEventId(newId)
        // Automatically open Event Settings for the new event!
        try {
          const freshRes = await fetch('/api/organizer/overview', { headers: { 'x-auth-token': token }, cache: 'no-store' })
          const freshData = await freshRes.json()
          const matched = (freshData.events || []).find((ev: any) => ev.eventId === newId || ev.id === newId)
          if (matched) {
            handleOpenEdit(matched)
          } else if (data.event) {
            handleOpenEdit({
              ...data.event,
              eventId: newId,
              ticketCategories: data.event.ticketCategories || [],
              sales: data.event.sales || { orders: 0, confirmedOrders: 0, ticketsIssued: 0, admissions: 0, online: { admissions: 0 }, offline: { admissions: 0 }, verifiedRevenue: 0, pending: 0, pendingAmount: 0, cancelled: 0, expired: 0, unverified: 0, unverifiedAmount: 0, refundRequests: 0, refundApprovals: 0, refundRejections: 0 },
              scans: { accepted: 0, duplicate: 0, admissions: 0, recent: [] },
              refundRequests: [],
              activity: [],
              orders: [],
            })
          }
        } catch {
          // fallback
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Draft creation failed.')
    } finally {
      setCreatingDraft(false)
    }
  }

  const handleOpenEdit = (event: any) => {
    setEditingEvent(event)
    setEditForm({
      name: event.name || '',
      slug: event.slug || '',
      category: event.category || '',
      venue: event.venue || '',
      city: event.city || '',
      address: event.address || '',
      timezone: event.timezone || 'Asia/Kolkata',
      description: event.description || '',
      posterUrl: event.images?.[0] || '',
      startsAt: localDatetime(event.startsAt),
      endsAt: localDatetime(event.endsAt),
      salesStartAt: localDatetime(event.salesStartAt),
      salesEndAt: localDatetime(event.salesEndAt),
      visibility: event.visibility || 'public',
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
          name: editForm.name.trim(),
          slug: editForm.slug.trim() || undefined,
          category: editForm.category.trim(),
          venue: editForm.venue.trim(),
          city: editForm.city.trim(),
          address: editForm.address.trim(),
          timezone: editForm.timezone.trim() || 'Asia/Kolkata',
          description: editForm.description,
          images: editForm.posterUrl.trim() ? [editForm.posterUrl.trim()] : [],
          startsAt: editForm.startsAt ? new Date(editForm.startsAt).toISOString() : null,
          endsAt: editForm.endsAt ? new Date(editForm.endsAt).toISOString() : null,
          salesStartAt: editForm.salesStartAt ? new Date(editForm.salesStartAt).toISOString() : null,
          salesEndAt: editForm.salesEndAt ? new Date(editForm.salesEndAt).toISOString() : null,
          visibility: editForm.visibility || 'public',
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
          Loading dashboardâ€¦
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
    { id: 'pr', label: 'PR Partners' },
    { id: 'team', label: 'Team Coordinators' },
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
                Â· {events.length} production{events.length === 1 ? '' : 's'}
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
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {error.toLowerCase().includes('session') ? (
                <button
                  onClick={handleLogout}
                  style={{
                    background: '#EF4444',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: 4,
                    padding: '4px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Log In Again
                </button>
              ) : (
                <button
                  onClick={() => void loadData()}
                  style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Retry
                </button>
              )}
            </div>
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

          {activeTab === 'pr' && (
            <PRPartnersTab
              events={events}
              preselectedEventId={selectedEventId}
              onOpenEventSettings={handleOpenEdit}
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
                âœ•
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
                  {creatingDraft ? 'Savingâ€¦' : 'Save Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMPREHENSIVE EVENT SETTINGS MODAL */}
      {editingEvent && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
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
              borderRadius: 12,
              width: '100%',
              maxWidth: 760,
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px 28px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #1E2026', paddingBottom: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#EDEDEF', letterSpacing: '-0.01em' }}>
                    Event Settings
                  </h2>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: 'JetBrains Mono, monospace',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: editingEvent.status === 'published' ? 'rgba(16, 185, 129, 0.1)' : editingEvent.status === 'pending_review' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                      color: editingEvent.status === 'published' ? '#10B981' : editingEvent.status === 'pending_review' ? '#F59E0B' : '#8B909A',
                      border: `1px solid ${editingEvent.status === 'published' ? 'rgba(16, 185, 129, 0.25)' : editingEvent.status === 'pending_review' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.1)'}`,
                    }}
                  >
                    â— {editingEvent.status.replace('_', ' ')}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: '#8B909A', marginTop: 4 }}>
                  Configure core details, dates, venue, ticket tiers, and promotional partners for <strong style={{ color: '#EDEDEF' }}>{editingEvent.name}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    const targetId = editingEvent.eventId
                    setEditingEvent(null)
                    setSelectedEventId(targetId)
                    setActiveTab('tiers')
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    color: '#EDEDEF',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 11.5,
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Manage Tiers â†’
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const targetId = editingEvent.eventId
                    setEditingEvent(null)
                    setSelectedEventId(targetId)
                    setActiveTab('pr')
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    color: '#EDEDEF',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 11.5,
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  PR Partners â†’
                </button>
                <button
                  onClick={() => setEditingEvent(null)}
                  style={{ background: 'transparent', border: 'none', color: '#8B909A', fontSize: 20, cursor: 'pointer', padding: '0 4px' }}
                >
                  âœ•
                </button>
              </div>
            </div>

            {/* Event Settings Form */}
            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* SECTION 1: GENERAL INFORMATION */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  1. GENERAL INFORMATION
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                      EVENT TITLE *
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

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                      PUBLIC URL SLUG
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. saturday-night-live"
                      value={editForm.slug}
                      onChange={e => setEditForm(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                      style={{
                        width: '100%',
                        background: '#0E1013',
                        border: '1px solid #282C36',
                        borderRadius: 6,
                        padding: '8px 12px',
                        color: '#EDEDEF',
                        fontSize: 13,
                        fontFamily: 'JetBrains Mono, monospace',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                      CATEGORY
                    </label>
                    <select
                      value={editForm.category}
                      onChange={e => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                      style={{
                        width: '100%',
                        background: '#0E1013',
                        border: '1px solid #282C36',
                        borderRadius: 6,
                        padding: '8px 12px',
                        color: '#EDEDEF',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      <option value="">Select category</option>
                      <option value="Music">Music / Concert</option>
                      <option value="Nightlife">Nightlife / Club</option>
                      <option value="Festival">Festival</option>
                      <option value="Conference">Conference / Seminar</option>
                      <option value="Exhibition">Exhibition / Expo</option>
                      <option value="Food & Drink">Food & Drink</option>
                      <option value="Sports">Sports / Fitness</option>
                      <option value="Theatre">Theatre & Arts</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                    DESCRIPTION
                  </label>
                  <textarea
                    value={editForm.description}
                    onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    placeholder="Enter artist lineup, event bio, dress code, age restrictions, and entry policies..."
                    style={{
                      width: '100%',
                      background: '#0E1013',
                      border: '1px solid #282C36',
                      borderRadius: 6,
                      padding: '8px 12px',
                      color: '#EDEDEF',
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  />
                </div>
              </div>

              {/* SECTION 2: DATE & VENUE */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 14, borderTop: '1px solid #1E2026' }}>
                <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  2. DATE, TIME & VENUE
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                      CITY *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Mumbai, Delhi, Bengaluru"
                      value={editForm.city}
                      onChange={e => setEditForm(prev => ({ ...prev, city: e.target.value }))}
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
                      VENUE NAME
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Dome NSCI, Worli"
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

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                      FULL ADDRESS
                    </label>
                    <input
                      type="text"
                      placeholder="Street address, landmarks..."
                      value={editForm.address}
                      onChange={e => setEditForm(prev => ({ ...prev, address: e.target.value }))}
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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                      EVENT START *
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
                      EVENT END
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

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                      TICKET SALES START
                    </label>
                    <input
                      type="datetime-local"
                      value={editForm.salesStartAt}
                      onChange={e => setEditForm(prev => ({ ...prev, salesStartAt: e.target.value }))}
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
                      TICKET SALES END
                    </label>
                    <input
                      type="datetime-local"
                      value={editForm.salesEndAt}
                      onChange={e => setEditForm(prev => ({ ...prev, salesEndAt: e.target.value }))}
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
              </div>

              {/* SECTION 3: MEDIA & VISIBILITY */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 14, borderTop: '1px solid #1E2026' }}>
                <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  3. MEDIA & VISIBILITY
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                      POSTER IMAGE URL
                    </label>
                    <input
                      type="url"
                      placeholder="https://..."
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
                      VISIBILITY
                    </label>
                    <select
                      value={editForm.visibility}
                      onChange={e => setEditForm(prev => ({ ...prev, visibility: e.target.value }))}
                      style={{
                        width: '100%',
                        background: '#0E1013',
                        border: '1px solid #282C36',
                        borderRadius: 6,
                        padding: '8px 12px',
                        color: '#EDEDEF',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      <option value="public">Public (Visible on Stageway)</option>
                      <option value="unlisted">Unlisted (Direct Link Only)</option>
                      <option value="private">Private (Team Only)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 4: PR PARTNERS FOR THIS EVENT */}
              <div
                style={{
                  background: '#0E1013',
                  border: '1px solid #1C1F26',
                  borderRadius: 8,
                  padding: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF' }}>
                    Promotional Partners (PR)
                  </div>
                  <div style={{ fontSize: 11.5, color: '#8B909A', marginTop: 2 }}>
                    Create login IDs for partners to sell and generate passes directly for this event on the PR Panel (/pr).
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const targetId = editingEvent.eventId
                    setEditingEvent(null)
                    setSelectedEventId(targetId)
                    setActiveTab('pr')
                  }}
                  style={{
                    background: '#EDEDEF',
                    color: '#0B0C0E',
                    border: 'none',
                    borderRadius: 6,
                    padding: '7px 14px',
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  + Add PR Partner for this Event
                </button>
              </div>

              {/* Form Actions Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: 16,
                  borderTop: '1px solid #1E2026',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                {editingEvent.status === 'draft' ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleSubmitForReview(editingEvent)
                      setEditingEvent(null)
                    }}
                    style={{
                      background: 'rgba(245, 158, 11, 0.1)',
                      color: '#F59E0B',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: 6,
                      padding: '8px 16px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Submit for Public Review
                  </button>
                ) : (
                  <div />
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setEditingEvent(null)}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      color: '#8B909A',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 6,
                      padding: '8px 18px',
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
                      padding: '8px 22px',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: savingEdit ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {savingEdit ? 'Savingâ€¦' : 'Save Event Settings'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
