import React, { useState } from 'react'
import { OrganizerEvent } from '../types'
import { STAGEWAY_THEME } from '../theme'

interface GateScansTabProps {
  events: OrganizerEvent[]
  selectedEventId: string | null
  onSelectEventId: (id: string) => void
  onRefresh: () => void
}

export default function GateScansTab({
  events,
  selectedEventId,
  onSelectEventId,
  onRefresh,
}: GateScansTabProps) {
  const activeEvent = events.find(e => e.eventId === selectedEventId) || events[0] || null
  const [ticketSearch, setTicketSearch] = useState('')

  if (!activeEvent) {
    return (
      <div
        style={{
          background: STAGEWAY_THEME.light,
          border: `1px dashed ${STAGEWAY_THEME.borderMedium}`,
          borderRadius: 10,
          padding: 48,
          textAlign: 'center',
          color: STAGEWAY_THEME.textMuted,
        }}
      >
        No events available. Create an event first to monitor gate scan traffic.
      </div>
    )
  }

  const { scans, sales } = activeEvent
  const totalAdmissionsExpected = sales.admissions || 0
  const admissionsCheckedIn = scans.admissions || 0
  const checkInRate =
    totalAdmissionsExpected > 0 ? Math.min(100, Math.round((admissionsCheckedIn / totalAdmissionsExpected) * 100)) : 0

  const recentScans = (scans.recent || []).filter(
    s => !ticketSearch || s.ticketId.toLowerCase().includes(ticketSearch.toLowerCase())
  )

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
          background: STAGEWAY_THEME.surface,
          border: `1px solid ${STAGEWAY_THEME.border}`,
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase' }}>
            Production:
          </label>
          <select
            value={activeEvent.eventId}
            onChange={e => onSelectEventId(e.target.value)}
            style={{
              background: '#F8FCFA',
              border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
              borderRadius: 6,
              padding: '8px 12px',
              color: STAGEWAY_THEME.textPrimary,
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted }}>
            Scanner sync active
          </span>
          <button
            onClick={onRefresh}
            style={{
              background: STAGEWAY_THEME.light,
              color: STAGEWAY_THEME.textSecondary,
              border: `1px solid ${STAGEWAY_THEME.border}`,
              borderRadius: 6,
              padding: '7px 14px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Refresh Feed
          </button>
        </div>
      </div>

      {/* METRIC CARDS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        {/* Admission Progress */}
        <div
          style={{
            background: STAGEWAY_THEME.surface,
            border: `1px solid ${STAGEWAY_THEME.border}`,
            borderRadius: 10,
            padding: 18,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Admission Progress
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: STAGEWAY_THEME.primary, letterSpacing: '-0.02em' }}>
              {checkInRate}%
            </span>
            <span style={{ fontSize: 13, color: STAGEWAY_THEME.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>
              ({admissionsCheckedIn}/{totalAdmissionsExpected})
            </span>
          </div>
          <div style={{ height: 4, background: STAGEWAY_THEME.light, borderRadius: 999, marginTop: 12, overflow: 'hidden' }}>
            <div style={{ width: `${checkInRate}%`, height: '100%', background: STAGEWAY_THEME.primary, borderRadius: 999 }} />
          </div>
        </div>

        {/* Verified Scans */}
        <div
          style={{
            background: STAGEWAY_THEME.surface,
            border: `1px solid ${STAGEWAY_THEME.border}`,
            borderRadius: 10,
            padding: 18,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Verified Scans
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: STAGEWAY_THEME.primary, marginTop: 8, letterSpacing: '-0.02em' }}>
            {scans.accepted}
          </div>
          <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, marginTop: 4 }}>
            Digital QR passes admitted through gate
          </div>
        </div>

        {/* Duplicate Scan Attempts */}
        <div
          style={{
            background: STAGEWAY_THEME.surface,
            border: scans.duplicate > 0 ? '1px solid rgba(239, 68, 68, 0.4)' : `1px solid ${STAGEWAY_THEME.border}`,
            borderRadius: 10,
            padding: 18,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: scans.duplicate > 0 ? '#EF4444' : STAGEWAY_THEME.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Duplicate Scan Attempts
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: scans.duplicate > 0 ? '#EF4444' : STAGEWAY_THEME.primary, marginTop: 8, letterSpacing: '-0.02em' }}>
            {scans.duplicate}
          </div>
          <div style={{ fontSize: 12, color: scans.duplicate > 0 ? '#EF4444' : STAGEWAY_THEME.textMuted, marginTop: 4 }}>
            {scans.duplicate > 0 ? 'Duplicate / reused passes intercepted' : 'Zero duplicate fraud detected'}
          </div>
        </div>

        {/* Remaining Guests */}
        <div
          style={{
            background: STAGEWAY_THEME.surface,
            border: `1px solid ${STAGEWAY_THEME.border}`,
            borderRadius: 10,
            padding: 18,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Unchecked Attendees
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: STAGEWAY_THEME.primary, marginTop: 8, letterSpacing: '-0.02em' }}>
            {Math.max(0, totalAdmissionsExpected - admissionsCheckedIn)}
          </div>
          <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, marginTop: 4 }}>
            Ticket holders yet to present pass
          </div>
        </div>
      </div>

      {/* SCAN AUDIT FEED */}
      <div
        style={{
          background: STAGEWAY_THEME.surface,
          border: `1px solid ${STAGEWAY_THEME.border}`,
          borderRadius: 10,
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: STAGEWAY_THEME.textPrimary, margin: 0 }}>
              Live Gate Scan Stream
            </h3>
            <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, marginTop: 2 }}>
              Verified door transactions recorded by gate devices
            </div>
          </div>

          <input
            type="text"
            placeholder="Search Ticket ID..."
            value={ticketSearch}
            onChange={e => setTicketSearch(e.target.value)}
            style={{
              background: '#F8FCFA',
              border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
              borderRadius: 6,
              padding: '7px 12px',
              color: STAGEWAY_THEME.textPrimary,
              fontSize: 12,
              fontFamily: 'JetBrains Mono, monospace',
              minWidth: 200,
            }}
          />
        </div>

        {recentScans.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: STAGEWAY_THEME.textMuted, fontSize: 13 }}>
            No recent gate scans logged for this production.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentScans.map((scan, index) => {
              const isAccepted = scan.result === 'accepted'
              const isDuplicate = scan.result === 'duplicate'

              return (
                <div
                  key={`${scan.ticketId}-${index}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '11px 16px',
                    borderRadius: 6,
                    background: isDuplicate
                      ? 'rgba(239, 68, 68, 0.06)'
                      : STAGEWAY_THEME.light,
                    border: '1px solid',
                    borderColor: isDuplicate
                      ? 'rgba(239, 68, 68, 0.25)'
                      : STAGEWAY_THEME.border,
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: 'JetBrains Mono, monospace',
                        fontWeight: 600,
                        padding: '2px 7px',
                        borderRadius: 4,
                        background: isAccepted
                          ? 'rgba(16, 165, 121, 0.12)'
                          : 'rgba(239, 68, 68, 0.1)',
                        color: isAccepted ? STAGEWAY_THEME.secondary : '#EF4444',
                        border: `1px solid ${isAccepted ? 'rgba(16, 165, 121, 0.3)' : 'rgba(239, 68, 68, 0.25)'}`,
                        textTransform: 'uppercase',
                      }}
                    >
                      {scan.result}
                    </span>
                    <div>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 500, color: STAGEWAY_THEME.textPrimary }}>
                        {scan.ticketId}
                      </div>
                      <div style={{ fontSize: 11, color: STAGEWAY_THEME.textMuted, marginTop: 1 }}>
                        {scan.admissionCount} admission{scan.admissionCount === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: STAGEWAY_THEME.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>
                    {scan.timestamp ? new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Just now'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
