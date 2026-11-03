import React, { useState } from 'react'
import { OrganizerEvent } from '../types'

interface EventsTabProps {
  events: OrganizerEvent[]
  onSelectEvent: (eventId: string, tab?: string) => void
  onOpenCreateDraft: () => void
  onEditEvent: (event: OrganizerEvent) => void
  onSubmitForReview: (event: OrganizerEvent) => Promise<void>
}

export default function EventsTab({
  events,
  onSelectEvent,
  onOpenCreateDraft,
  onEditEvent,
  onSubmitForReview,
}: EventsTabProps) {
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  const filteredEvents = events.filter(e => {
    const matchesStatus = filterStatus === 'all' || e.status.toLowerCase() === filterStatus.toLowerCase()
    const matchesSearch =
      !searchTerm ||
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.city || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.venue || '').toLowerCase().includes(searchTerm.toLowerCase())
    return matchesStatus && matchesSearch
  })

  const handleSubmitReview = async (event: OrganizerEvent) => {
    setSubmittingId(event.eventId)
    try {
      await onSubmitForReview(event)
    } finally {
      setSubmittingId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* HEADER & CONTROLS */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1 }}>
          {/* Search */}
          <input
            type="text"
            placeholder="Search by event, city, or venue..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              background: 'rgba(10,9,18,0.8)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              padding: '9px 14px',
              color: '#F5F2EA',
              fontSize: 13,
              minWidth: 240,
            }}
          />

          {/* Status Filter Chips */}
          <div style={{ display: 'flex', gap: 6 }}>
            {['all', 'published', 'draft', 'pending_review'].map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                style={{
                  background: filterStatus === status ? '#D8FF3F' : 'rgba(255,255,255,0.05)',
                  color: filterStatus === status ? '#0A0912' : 'rgba(245,242,234,0.7)',
                  border: '1px solid',
                  borderColor: filterStatus === status ? '#D8FF3F' : 'rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  padding: '7px 12px',
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onOpenCreateDraft}
          style={{
            background: '#D8FF3F',
            color: '#0A0912',
            border: 'none',
            fontFamily: 'Unbounded, sans-serif',
            fontWeight: 700,
            fontSize: 12,
            padding: '10px 18px',
            borderRadius: 8,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          + Create Event Draft
        </button>
      </div>

      {/* EVENT LISTING */}
      {filteredEvents.length === 0 ? (
        <div
          style={{
            background: 'rgba(20,16,38,0.6)',
            border: '1px dashed rgba(255,255,255,0.1)',
            borderRadius: 14,
            padding: 48,
            textAlign: 'center',
            color: 'rgba(245,242,234,0.5)',
          }}
        >
          No events match the selected criteria.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 18 }}>
          {filteredEvents.map(event => {
            const statusBadgeColor =
              event.status === 'published' || event.status === 'active'
                ? '#31E7C8'
                : event.status === 'pending_review'
                ? '#F5B942'
                : '#8B5CF6'

            const admissionsScanned = event.scans?.admissions || 0
            const totalAdmissions = event.sales?.admissions || 0
            const scanPercent = totalAdmissions > 0 ? Math.round((admissionsScanned / totalAdmissions) * 100) : 0

            return (
              <div
                key={event.eventId}
                style={{
                  background: 'rgba(20,16,38,0.92)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 16,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}
              >
                {/* Event Poster / Header banner */}
                <div
                  style={{
                    height: 120,
                    position: 'relative',
                    background: event.images?.[0]
                      ? `url(${event.images[0]}) center/cover no-repeat`
                      : 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(216,255,63,0.15))',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(to bottom, rgba(10,9,18,0.2), rgba(20,16,38,0.95))',
                    }}
                  />
                  <span
                    style={{
                      position: 'relative',
                      fontSize: 10,
                      fontFamily: 'JetBrains Mono, monospace',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: 'rgba(10,9,18,0.85)',
                      color: statusBadgeColor,
                      border: `1px solid ${statusBadgeColor}66`,
                    }}
                  >
                    ● {event.status.replace('_', ' ')}
                  </span>
                  <span
                    style={{
                      position: 'relative',
                      fontSize: 11,
                      fontFamily: 'JetBrains Mono, monospace',
                      color: '#F5F2EA',
                      background: 'rgba(10,9,18,0.7)',
                      padding: '4px 8px',
                      borderRadius: 4,
                    }}
                  >
                    {event.city || 'India'}
                  </span>
                </div>

                {/* Event Body */}
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                  <div>
                    <h3 style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 18, margin: '0 0 6px', color: '#F5F2EA' }}>
                      {event.name}
                    </h3>
                    <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.6)', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      <span>📍 {event.venue || 'Venue TBD'}</span>
                      <span>🗓️ {event.startsAt ? new Date(event.startsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Date TBD'}</span>
                    </div>
                  </div>

                  {event.description && (
                    <p style={{ fontSize: 12, color: 'rgba(245,242,234,0.5)', lineHeight: 1.5, margin: 0, maxHeight: 48, overflow: 'hidden' }}>
                      {event.description}
                    </p>
                  )}

                  {/* Metrics grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 8,
                      background: 'rgba(10,9,18,0.6)',
                      border: '1px solid rgba(255,255,255,0.04)',
                      padding: '10px 12px',
                      borderRadius: 10,
                      marginTop: 'auto',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 9.5, color: 'rgba(245,242,234,0.5)', fontFamily: 'JetBrains Mono, monospace' }}>VERIFIED SALES</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#D8FF3F', marginTop: 2 }}>
                        ₹{Number(event.sales.verifiedRevenue || 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9.5, color: 'rgba(245,242,234,0.5)', fontFamily: 'JetBrains Mono, monospace' }}>ISSUED TICKETS</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#F5F2EA', marginTop: 2 }}>
                        {event.sales.ticketsIssued} QR
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9.5, color: 'rgba(245,242,234,0.5)', fontFamily: 'JetBrains Mono, monospace' }}>ADMISSION RATE</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#31E7C8', marginTop: 2 }}>
                        {scanPercent}% ({admissionsScanned})
                      </div>
                    </div>
                  </div>

                  {/* Ticket Tiers Counter */}
                  <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{event.ticketCategories.length} Ticket Categories configured</span>
                    <button
                      onClick={() => onSelectEvent(event.eventId, 'tiers')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#D8FF3F',
                        fontSize: 11,
                        fontFamily: 'JetBrains Mono, monospace',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      Manage Tiers →
                    </button>
                  </div>
                </div>

                {/* Footer Action Bar */}
                <div
                  style={{
                    padding: '12px 20px',
                    background: 'rgba(10,9,18,0.5)',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => onEditEvent(event)}
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        color: '#F5F2EA',
                        border: '1px solid rgba(255,255,255,0.12)',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Edit Info
                    </button>
                    <button
                      onClick={() => onSelectEvent(event.eventId, 'team')}
                      style={{
                        background: 'rgba(139,92,246,0.12)',
                        color: '#8B5CF6',
                        border: '1px solid rgba(139,92,246,0.25)',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Team & PR
                    </button>
                  </div>

                  {event.status === 'draft' && (
                    <button
                      onClick={() => handleSubmitReview(event)}
                      disabled={submittingId === event.eventId}
                      style={{
                        background: '#31E7C8',
                        color: '#0A0912',
                        border: 'none',
                        padding: '6px 14px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontFamily: 'Unbounded, sans-serif',
                        fontWeight: 700,
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                      }}
                    >
                      {submittingId === event.eventId ? 'Submitting…' : 'Submit for Review'}
                    </button>
                  )}

                  {event.status === 'pending_review' && (
                    <span style={{ fontSize: 11, color: '#F5B942', fontFamily: 'JetBrains Mono, monospace' }}>
                      ⏳ Under review by Admin
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
