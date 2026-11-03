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
          background: '#14161C',
          border: '1px solid #20232B',
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1 }}>
          <input
            type="text"
            placeholder="Search by event, city, or venue..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              background: '#0E1013',
              border: '1px solid #282C36',
              borderRadius: 6,
              padding: '8px 12px',
              color: '#EDEDEF',
              fontSize: 13,
              minWidth: 240,
            }}
          />

          <div style={{ display: 'flex', gap: 6 }}>
            {['all', 'published', 'draft', 'pending_review'].map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                style={{
                  background: filterStatus === status ? '#EDEDEF' : 'rgba(255,255,255,0.04)',
                  color: filterStatus === status ? '#0B0C0E' : '#8B909A',
                  border: '1px solid',
                  borderColor: filterStatus === status ? '#EDEDEF' : 'rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  padding: '6px 12px',
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
            background: '#EDEDEF',
            color: '#0B0C0E',
            border: 'none',
            fontWeight: 600,
            fontSize: 12,
            padding: '9px 16px',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          + Create Event Draft
        </button>
      </div>

      {/* EVENT LISTING */}
      {filteredEvents.length === 0 ? (
        <div
          style={{
            background: '#14161C',
            border: '1px dashed #282C36',
            borderRadius: 10,
            padding: 48,
            textAlign: 'center',
            color: '#555962',
          }}
        >
          No events match the selected criteria.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
          {filteredEvents.map(event => {
            const isLive = event.status === 'published' || event.status === 'active'
            const isReview = event.status === 'pending_review'

            const admissionsScanned = event.scans?.admissions || 0
            const totalAdmissions = event.sales?.admissions || 0
            const scanPercent = totalAdmissions > 0 ? Math.round((admissionsScanned / totalAdmissions) * 100) : 0

            return (
              <div
                key={event.eventId}
                style={{
                  background: '#14161C',
                  border: '1px solid #20232B',
                  borderRadius: 10,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                {/* Event Top Bar */}
                <div
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #1E2026',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: 'JetBrains Mono, monospace',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: isLive
                        ? 'rgba(16, 185, 129, 0.1)'
                        : isReview
                        ? 'rgba(245, 158, 11, 0.1)'
                        : 'rgba(255, 255, 255, 0.05)',
                      color: isLive ? '#10B981' : isReview ? '#F59E0B' : '#8B909A',
                      border: `1px solid ${
                        isLive
                          ? 'rgba(16, 185, 129, 0.25)'
                          : isReview
                          ? 'rgba(245, 158, 11, 0.25)'
                          : 'rgba(255, 255, 255, 0.1)'
                      }`,
                    }}
                  >
                    ● {event.status.replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: 12, color: '#8B909A' }}>
                    {event.city || 'India'}
                  </span>
                </div>

                {/* Event Details */}
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                  <div>
                    <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 6px', color: '#EDEDEF' }}>
                      {event.name}
                    </h3>
                    <div style={{ fontSize: 12, color: '#8B909A', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      <span>📍 {event.venue || 'Venue TBD'}</span>
                      <span>🗓️ {event.startsAt ? new Date(event.startsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Date TBD'}</span>
                    </div>
                  </div>

                  {event.description && (
                    <p style={{ fontSize: 12, color: '#8B909A', lineHeight: 1.5, margin: 0, maxHeight: 48, overflow: 'hidden' }}>
                      {event.description}
                    </p>
                  )}

                  {/* Metrics bar */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 8,
                      background: '#0E1013',
                      border: '1px solid #1C1F26',
                      padding: '10px 12px',
                      borderRadius: 6,
                      marginTop: 'auto',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 9.5, color: '#8B909A', fontFamily: 'JetBrains Mono, monospace' }}>VERIFIED SALES</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#EDEDEF', marginTop: 2 }}>
                        ₹{Number(event.sales.verifiedRevenue || 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9.5, color: '#8B909A', fontFamily: 'JetBrains Mono, monospace' }}>PASSES</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#EDEDEF', marginTop: 2 }}>
                        {event.sales.ticketsIssued} QR
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9.5, color: '#8B909A', fontFamily: 'JetBrains Mono, monospace' }}>CHECK-IN</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#EDEDEF', marginTop: 2 }}>
                        {scanPercent}% ({admissionsScanned})
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: '#8B909A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{event.ticketCategories.length} Ticket Categories configured</span>
                    <button
                      onClick={() => onSelectEvent(event.eventId, 'tiers')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#EDEDEF',
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
                    background: '#0E1013',
                    borderTop: '1px solid #1E2026',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => onEditEvent(event)}
                      style={{
                        background: '#EDEDEF',
                        color: '#0B0C0E',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      ⚙️ Event Settings
                    </button>
                    <button
                      onClick={() => onSelectEvent(event.eventId, 'pr')}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        color: '#EDEDEF',
                        border: '1px solid rgba(255,255,255,0.1)',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      PR Partners
                    </button>
                    <button
                      onClick={() => onSelectEvent(event.eventId, 'tiers')}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        color: '#EDEDEF',
                        border: '1px solid rgba(255,255,255,0.1)',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      Tiers
                    </button>
                  </div>

                  {event.status === 'draft' && (
                    <button
                      onClick={() => handleSubmitReview(event)}
                      disabled={submittingId === event.eventId}
                      style={{
                        background: '#EDEDEF',
                        color: '#0B0C0E',
                        border: 'none',
                        padding: '6px 14px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {submittingId === event.eventId ? 'Submitting…' : 'Submit for Review'}
                    </button>
                  )}

                  {event.status === 'pending_review' && (
                    <span style={{ fontSize: 11, color: '#F59E0B', fontFamily: 'JetBrains Mono, monospace' }}>
                      ⏳ Under review
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
