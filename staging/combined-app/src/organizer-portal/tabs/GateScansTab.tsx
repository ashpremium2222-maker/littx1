import React, { useState } from 'react'
import { OrganizerEvent } from '../types'

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
          background: 'rgba(20,16,38,0.7)',
          border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: 14,
          padding: 48,
          textAlign: 'center',
          color: 'rgba(245,242,234,0.5)',
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
      {/* HEADER & EVENT PICKER */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.6)', textTransform: 'uppercase' }}>
            Gate Feed For:
          </label>
          <select
            value={activeEvent.eventId}
            onChange={e => onSelectEventId(e.target.value)}
            style={{
              background: 'rgba(10,9,18,0.9)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              padding: '8px 14px',
              color: '#F5F2EA',
              fontFamily: 'Unbounded, sans-serif',
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
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#31E7C8',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#31E7C8',
                boxShadow: '0 0 10px #31E7C8',
                animation: 'pulse 1.8s infinite',
              }}
            />
            LIVE GATE ENGINE
          </span>
          <button
            onClick={onRefresh}
            style={{
              background: 'rgba(255,255,255,0.08)',
              color: '#F5F2EA',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* METRIC TILES */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        {/* Admitted Rate */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(49,231,200,0.15), rgba(10,9,18,0.95))',
            border: '1px solid rgba(49,231,200,0.35)',
            borderRadius: 14,
            padding: 18,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.6)', textTransform: 'uppercase' }}>
            ADMISSION PROGRESS
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
            <span style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 32, fontWeight: 900, color: '#31E7C8' }}>
              {checkInRate}%
            </span>
            <span style={{ fontSize: 13, color: 'rgba(245,242,234,0.7)', fontFamily: 'JetBrains Mono, monospace' }}>
              ({admissionsCheckedIn}/{totalAdmissionsExpected})
            </span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 999, marginTop: 12, overflow: 'hidden' }}>
            <div style={{ width: `${checkInRate}%`, height: '100%', background: '#31E7C8', borderRadius: 999 }} />
          </div>
        </div>

        {/* Total Accepted Scans */}
        <div
          style={{
            background: 'rgba(20,16,38,0.9)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: 18,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.6)', textTransform: 'uppercase' }}>
            VERIFIED SCANS
          </div>
          <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 28, fontWeight: 800, color: '#D8FF3F', marginTop: 8 }}>
            {scans.accepted}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.5)', marginTop: 6 }}>
            Valid unique digital QR code passes admitted
          </div>
        </div>

        {/* Duplicate Security Alerts */}
        <div
          style={{
            background:
              scans.duplicate > 0
                ? 'linear-gradient(135deg, rgba(255,107,107,0.18), rgba(10,9,18,0.95))'
                : 'rgba(20,16,38,0.9)',
            border: scans.duplicate > 0 ? '1px solid #FF6B6B' : '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: 18,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: scans.duplicate > 0 ? '#FF6B6B' : 'rgba(245,242,234,0.6)', textTransform: 'uppercase' }}>
            DUPLICATE DETECTIONS
          </div>
          <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 28, fontWeight: 800, color: scans.duplicate > 0 ? '#FF6B6B' : '#F5F2EA', marginTop: 8 }}>
            {scans.duplicate}
          </div>
          <div style={{ fontSize: 12, color: scans.duplicate > 0 ? '#FF6B6B' : 'rgba(245,242,234,0.5)', marginTop: 6 }}>
            {scans.duplicate > 0 ? 'Tampered / re-shared passes intercepted' : 'Zero duplicate fraud detected'}
          </div>
        </div>

        {/* Remaining Guests */}
        <div
          style={{
            background: 'rgba(20,16,38,0.9)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: 18,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.6)', textTransform: 'uppercase' }}>
            REMAINING GUESTS
          </div>
          <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 28, fontWeight: 800, color: '#8B5CF6', marginTop: 8 }}>
            {Math.max(0, totalAdmissionsExpected - admissionsCheckedIn)}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.5)', marginTop: 6 }}>
            Expected attendees yet to arrive at gate
          </div>
        </div>
      </div>

      {/* RECENT SCAN FEED */}
      <div
        style={{
          background: 'rgba(20,16,38,0.9)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 16, margin: 0 }}>
              Live Gate Scanner Feed
            </h3>
            <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.5)', marginTop: 3 }}>
              Audit stream recorded by door devices and native scanner applications
            </div>
          </div>

          <input
            type="text"
            placeholder="Filter by Ticket ID..."
            value={ticketSearch}
            onChange={e => setTicketSearch(e.target.value)}
            style={{
              background: 'rgba(10,9,18,0.85)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              padding: '7px 12px',
              color: '#F5F2EA',
              fontSize: 12,
              fontFamily: 'JetBrains Mono, monospace',
              minWidth: 200,
            }}
          />
        </div>

        {recentScans.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(245,242,234,0.4)', fontSize: 13 }}>
            No recent gate scans recorded for this event.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                    padding: '12px 16px',
                    borderRadius: 10,
                    background: isDuplicate
                      ? 'rgba(255,107,107,0.1)'
                      : isAccepted
                      ? 'rgba(49,231,200,0.06)'
                      : 'rgba(255,255,255,0.04)',
                    border: '1px solid',
                    borderColor: isDuplicate
                      ? 'rgba(255,107,107,0.3)'
                      : isAccepted
                      ? 'rgba(49,231,200,0.2)'
                      : 'rgba(255,255,255,0.08)',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 18 }}>{isAccepted ? '✅' : isDuplicate ? '⚠️' : '❌'}</span>
                    <div>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: '#F5F2EA' }}>
                        {scan.ticketId}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(245,242,234,0.5)', marginTop: 2 }}>
                        {scan.admissionCount} admission{scan.admissionCount === 1 ? '' : 's'} · Result:{' '}
                        <strong style={{ color: isAccepted ? '#31E7C8' : '#FF6B6B', textTransform: 'uppercase' }}>
                          {scan.result}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.5)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {scan.timestamp ? new Date(scan.timestamp).toLocaleString() : 'Just now'}
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
