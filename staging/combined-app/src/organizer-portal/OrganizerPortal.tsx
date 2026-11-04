import React, { useEffect, useState } from 'react'
import { OrganizerCategory, OrganizerEvent, OrganizerProfile, OrganizerTab } from './types'
import { STAGEWAY_THEME } from './theme'
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
          const freshRes = await fetch('/api/organizer/overview', { headers: { 'x-auth-token': sessionStorage.getItem('littx_token') || '' }, cache: 'no-store' })
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

  // Shared input style for modals
  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#F8FCFA',
    border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
    borderRadius: 6,
    padding: '8px 12px',
    color: STAGEWAY_THEME.textPrimary,
    fontSize: 13,
    boxSizing: 'border-box',
    outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: STAGEWAY_THEME.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: STAGEWAY_THEME.light,
          color: STAGEWAY_THEME.textPrimary,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <img src="/stageway-logo.png" alt="StageWay" style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 10, background: STAGEWAY_THEME.primary, padding: 6 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: STAGEWAY_THEME.primary }}>Stageway</div>
        <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted }}>Loading dashboard...</div>
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
        background: STAGEWAY_THEME.light,
        color: STAGEWAY_THEME.textPrimary,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* ── SIDEBAR ── */}
      <aside
        style={{
          width: 240,
          background: STAGEWAY_THEME.primary,
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
              borderBottom: '1px solid rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <img
              src="/stageway-logo.png"
              alt="StageWay"
              style={{ width: 34, height: 34, objectFit: 'contain', borderRadius: 8, background: 'rgba(255,255,255,0.15)', padding: 4 }}
              onError={(e) => {
                const el = e.target as HTMLImageElement
                el.style.display = 'none'
                const fb = el.nextSibling as HTMLElement
                if (fb) fb.style.display = 'flex'
              }}
            />
            <div
              style={{
                width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.15)',
                color: '#fff', display: 'none', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 16,
              }}
            >
              S
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
                Stageway
              </div>
              <div style={{ fontSize: 10, color: '#A7F3D0', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Organizer Portal
              </div>
            </div>
          </div>

          {/* Org Profile Pill */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              PROMOTER
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                    background: active ? '#FFFFFF' : 'transparent',
                    color: active ? STAGEWAY_THEME.primary : '#E8F5EF',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: active ? 700 : 400,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.1s ease',
                    width: '100%',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  {item.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Bottom Actions */}
        <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              width: '100%',
              background: STAGEWAY_THEME.secondary,
              color: '#FFFFFF',
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
              color: '#E8F5EF',
              border: '1px solid rgba(232, 245, 239, 0.35)',
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

      {/* ── MAIN CONTENT AREA ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* TOP STATUS BAR */}
        <header
          style={{
            height: 60,
            borderBottom: `1px solid ${STAGEWAY_THEME.border}`,
            background: '#FFFFFF',
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
            <h1 style={{ fontSize: 15, fontWeight: 700, color: STAGEWAY_THEME.textPrimary, margin: 0 }}>
              {navItems.find(i => i.id === activeTab)?.label}
            </h1>

            {events.length > 0 && (
              <span style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted }}>
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
                  background: '#FFFFFF',
                  border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                  borderRadius: 6,
                  padding: '6px 10px',
                  color: STAGEWAY_THEME.textPrimary,
                  fontSize: 12,
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
                background: STAGEWAY_THEME.light,
                border: `1px solid ${STAGEWAY_THEME.secondary}`,
                color: STAGEWAY_THEME.primary,
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
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
              background: 'rgba(220, 38, 38, 0.08)',
              border: '1px solid rgba(220, 38, 38, 0.25)',
              color: '#DC2626',
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
                    background: '#DC2626',
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
                  style={{ background: 'transparent', border: 'none', color: '#DC2626', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        {/* TAB BODY */}
        <main style={{ padding: '24px clamp(16px, 3vw, 36px)', flex: 1, minHeight: 0, background: STAGEWAY_THEME.light }}>
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

      {/* ── CREATE EVENT DRAFT MODAL ── */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(15, 23, 42, 0.5)',
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
              background: '#FFFFFF',
              border: `1px solid ${STAGEWAY_THEME.border}`,
              borderRadius: 12,
              width: '100%',
              maxWidth: 600,
              padding: 28,
              boxShadow: '0 20px 60px rgba(4, 120, 87, 0.12)',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `1px solid ${STAGEWAY_THEME.border}`, paddingBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: STAGEWAY_THEME.primary }}>
                  Create Event Draft
                </h2>
                <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, marginTop: 3 }}>
                  Set up event venue and timing. Configure ticket tiers next.
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'transparent', border: 'none', color: STAGEWAY_THEME.textMuted, fontSize: 20, cursor: 'pointer', padding: '0 4px' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDraft} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>EVENT TITLE *</label>
                <input
                  type="text"
                  placeholder="e.g. Saturday Night Session"
                  value={draftForm.name}
                  onChange={e => setDraftForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>CITY *</label>
                  <input
                    type="text"
                    placeholder="e.g. Mumbai"
                    value={draftForm.city}
                    onChange={e => setDraftForm(prev => ({ ...prev, city: e.target.value }))}
                    required
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>VENUE</label>
                  <input
                    type="text"
                    placeholder="e.g. Blue Frog"
                    value={draftForm.venue}
                    onChange={e => setDraftForm(prev => ({ ...prev, venue: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>START DATE & TIME</label>
                  <input
                    type="datetime-local"
                    value={draftForm.startsAt}
                    onChange={e => setDraftForm(prev => ({ ...prev, startsAt: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>END DATE & TIME</label>
                  <input
                    type="datetime-local"
                    value={draftForm.endsAt}
                    onChange={e => setDraftForm(prev => ({ ...prev, endsAt: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>POSTER IMAGE URL</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={draftForm.posterUrl}
                  onChange={e => setDraftForm(prev => ({ ...prev, posterUrl: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>EVENT DESCRIPTION</label>
                <textarea
                  placeholder="Lineup, entry requirements, age limit..."
                  value={draftForm.description}
                  onChange={e => setDraftForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    background: STAGEWAY_THEME.light,
                    color: STAGEWAY_THEME.textSecondary,
                    border: `1px solid ${STAGEWAY_THEME.border}`,
                    borderRadius: 6,
                    padding: '8px 18px',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingDraft}
                  style={{
                    background: creatingDraft ? STAGEWAY_THEME.secondary : STAGEWAY_THEME.primary,
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 22px',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: creatingDraft ? 'not-allowed' : 'pointer',
                  }}
                >
                  {creatingDraft ? 'Saving...' : 'Save Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EVENT SETTINGS MODAL ── */}
      {editingEvent && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(15, 23, 42, 0.55)',
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
              background: '#FFFFFF',
              border: `1px solid ${STAGEWAY_THEME.border}`,
              borderRadius: 14,
              width: '100%',
              maxWidth: 760,
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px 32px',
              boxShadow: '0 24px 64px rgba(4, 120, 87, 0.14)',
              display: 'flex',
              flexDirection: 'column',
              gap: 22,
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `1px solid ${STAGEWAY_THEME.border}`, paddingBottom: 18 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0, color: STAGEWAY_THEME.primary, letterSpacing: '-0.01em' }}>
                    Event Settings
                  </h2>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      padding: '3px 9px',
                      borderRadius: 20,
                      background:
                        editingEvent.status === 'published' ? 'rgba(16, 165, 121, 0.12)'
                        : editingEvent.status === 'pending_review' ? 'rgba(217, 119, 6, 0.12)'
                        : STAGEWAY_THEME.light,
                      color:
                        editingEvent.status === 'published' ? STAGEWAY_THEME.secondary
                        : editingEvent.status === 'pending_review' ? '#D97706'
                        : STAGEWAY_THEME.textMuted,
                      border: `1px solid ${
                        editingEvent.status === 'published' ? STAGEWAY_THEME.borderMedium
                        : editingEvent.status === 'pending_review' ? 'rgba(217, 119, 6, 0.3)'
                        : STAGEWAY_THEME.border}`,
                    }}
                  >
                    {editingEvent.status.replace('_', ' ')}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: STAGEWAY_THEME.textMuted, marginTop: 5 }}>
                  Configure core details, dates, venue, ticket tiers, and promotional partners for{' '}
                  <strong style={{ color: STAGEWAY_THEME.textPrimary }}>{editingEvent.name}</strong>
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
                    background: STAGEWAY_THEME.light,
                    color: STAGEWAY_THEME.primary,
                    border: `1px solid ${STAGEWAY_THEME.border}`,
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 11.5,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Manage Tiers →
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
                    background: STAGEWAY_THEME.light,
                    color: STAGEWAY_THEME.primary,
                    border: `1px solid ${STAGEWAY_THEME.border}`,
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 11.5,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  PR Partners →
                </button>
                <button
                  onClick={() => setEditingEvent(null)}
                  style={{ background: 'transparent', border: 'none', color: STAGEWAY_THEME.textMuted, fontSize: 20, cursor: 'pointer', padding: '0 4px' }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Event Settings Form */}
            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

              {/* SECTION 1: GENERAL INFORMATION */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: STAGEWAY_THEME.primary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  1. General Information
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>EVENT TITLE *</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                      required
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>PUBLIC URL SLUG</label>
                    <input
                      type="text"
                      placeholder="e.g. saturday-night-live"
                      value={editForm.slug}
                      onChange={e => setEditForm(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>CATEGORY</label>
                    <select
                      value={editForm.category}
                      onChange={e => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                      style={{ ...inputStyle, cursor: 'pointer' }}
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
                  <label style={labelStyle}>DESCRIPTION</label>
                  <textarea
                    value={editForm.description}
                    onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    placeholder="Enter artist lineup, event bio, dress code, age restrictions, and entry policies..."
                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                  />
                </div>
              </div>

              {/* SECTION 2: DATE & VENUE */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 16, borderTop: `1px solid ${STAGEWAY_THEME.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: STAGEWAY_THEME.primary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  2. Date, Time & Venue
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>CITY *</label>
                    <input
                      type="text"
                      placeholder="e.g. Mumbai, Delhi, Bengaluru"
                      value={editForm.city}
                      onChange={e => setEditForm(prev => ({ ...prev, city: e.target.value }))}
                      required
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>VENUE NAME</label>
                    <input
                      type="text"
                      placeholder="e.g. Dome NSCI, Worli"
                      value={editForm.venue}
                      onChange={e => setEditForm(prev => ({ ...prev, venue: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>FULL ADDRESS</label>
                    <input
                      type="text"
                      placeholder="Street address, landmarks..."
                      value={editForm.address}
                      onChange={e => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>EVENT START *</label>
                    <input
                      type="datetime-local"
                      value={editForm.startsAt}
                      onChange={e => setEditForm(prev => ({ ...prev, startsAt: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>EVENT END</label>
                    <input
                      type="datetime-local"
                      value={editForm.endsAt}
                      onChange={e => setEditForm(prev => ({ ...prev, endsAt: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>TICKET SALES START</label>
                    <input
                      type="datetime-local"
                      value={editForm.salesStartAt}
                      onChange={e => setEditForm(prev => ({ ...prev, salesStartAt: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>TICKET SALES END</label>
                    <input
                      type="datetime-local"
                      value={editForm.salesEndAt}
                      onChange={e => setEditForm(prev => ({ ...prev, salesEndAt: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: MEDIA & VISIBILITY */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 16, borderTop: `1px solid ${STAGEWAY_THEME.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: STAGEWAY_THEME.primary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  3. Media & Visibility
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>POSTER IMAGE URL</label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={editForm.posterUrl}
                      onChange={e => setEditForm(prev => ({ ...prev, posterUrl: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>VISIBILITY</label>
                    <select
                      value={editForm.visibility}
                      onChange={e => setEditForm(prev => ({ ...prev, visibility: e.target.value }))}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="public">Public (Visible on Stageway)</option>
                      <option value="unlisted">Unlisted (Direct Link Only)</option>
                      <option value="private">Private (Team Only)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 4: PR PARTNERS */}
              <div
                style={{
                  background: STAGEWAY_THEME.light,
                  border: `1px solid ${STAGEWAY_THEME.border}`,
                  borderRadius: 10,
                  padding: 18,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: STAGEWAY_THEME.primary }}>
                    Promotional Partners (PR)
                  </div>
                  <div style={{ fontSize: 11.5, color: STAGEWAY_THEME.textMuted, marginTop: 3 }}>
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
                    background: STAGEWAY_THEME.primary,
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 16px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  + Add PR Partner
                </button>
              </div>

              {/* Form Actions Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: 18,
                  borderTop: `1px solid ${STAGEWAY_THEME.border}`,
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
                      background: 'rgba(217, 119, 6, 0.08)',
                      color: '#D97706',
                      border: '1px solid rgba(217, 119, 6, 0.3)',
                      borderRadius: 6,
                      padding: '8px 18px',
                      fontSize: 13,
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
                      background: STAGEWAY_THEME.light,
                      color: STAGEWAY_THEME.textSecondary,
                      border: `1px solid ${STAGEWAY_THEME.border}`,
                      borderRadius: 6,
                      padding: '8px 20px',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={savingEdit}
                    style={{
                      background: savingEdit ? STAGEWAY_THEME.secondary : STAGEWAY_THEME.primary,
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 6,
                      padding: '8px 24px',
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: savingEdit ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {savingEdit ? 'Saving...' : 'Save Event Settings'}
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
