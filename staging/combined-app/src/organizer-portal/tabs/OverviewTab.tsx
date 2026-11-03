import React from 'react'
import { OrganizerEvent } from '../types'

interface OverviewTabProps {
  events: OrganizerEvent[]
  onSelectEvent: (eventId: string, tab?: string) => void
  onOpenCreateDraft: () => void
}

export default function OverviewTab({
  events,
  onSelectEvent,
  onOpenCreateDraft,
}: OverviewTabProps) {
  // Aggregate KPI stats across all assigned events
  const totalRevenue = events.reduce((sum, e) => sum + (e.sales.verifiedRevenue || 0), 0)
  const totalOrders = events.reduce((sum, e) => sum + e.sales.confirmedOrders, 0)
  const totalTicketsIssued = events.reduce((sum, e) => sum + e.sales.ticketsIssued, 0)
  const totalAdmissions = events.reduce((sum, e) => sum + e.sales.admissions, 0)
  const totalScanned = events.reduce((sum, e) => sum + e.scans.admissions, 0)
  const totalDuplicates = events.reduce((sum, e) => sum + e.scans.duplicate, 0)
  const activeEventsCount = events.filter(e => e.status === 'published' || e.status === 'active').length

  const scanRate = totalAdmissions > 0 ? Math.min(100, Math.round((totalScanned / totalAdmissions) * 100)) : 0

  // Combine recent orders across all events, sorted by date
  const allRecentOrders = events
    .flatMap(e => (e.orders || []).map(o => ({ ...o, eventName: e.name, eventId: e.eventId })))
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 8)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI HERO TILES */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        {/* Total Revenue Tile */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(216,255,63,0.12), rgba(10,9,18,0.95))',
            border: '1px solid rgba(216,255,63,0.3)',
            borderRadius: 14,
            padding: 20,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: 0, right: 0, width: 4, height: '100%', background: '#D8FF3F' }} />
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(245,242,234,0.6)', textTransform: 'uppercase' }}>
            TOTAL REVENUE (VERIFIED)
          </div>
          <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 28, fontWeight: 800, color: '#D8FF3F', marginTop: 8 }}>
            ₹{totalRevenue.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.5)', marginTop: 6 }}>
            Across {events.length} event{events.length === 1 ? '' : 's'} · direct payouts
          </div>
        </div>

        {/* Tickets & Orders Tile */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(255,46,126,0.12), rgba(10,9,18,0.95))',
            border: '1px solid rgba(255,46,126,0.3)',
            borderRadius: 14,
            padding: 20,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: 0, right: 0, width: 4, height: '100%', background: '#FF2E7E' }} />
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(245,242,234,0.6)', textTransform: 'uppercase' }}>
            CONFIRMED TICKETS
          </div>
          <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 28, fontWeight: 800, color: '#FF2E7E', marginTop: 8 }}>
            {totalTicketsIssued.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.5)', marginTop: 6 }}>
            {totalOrders} confirmed orders ({totalAdmissions} admissions)
          </div>
        </div>

        {/* Gate Check-in Rate Tile */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(49,231,200,0.12), rgba(10,9,18,0.95))',
            border: '1px solid rgba(49,231,200,0.3)',
            borderRadius: 14,
            padding: 20,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: 0, right: 0, width: 4, height: '100%', background: '#31E7C8' }} />
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(245,242,234,0.6)', textTransform: 'uppercase' }}>
            GATE CHECK-IN RATE
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
            <span style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 28, fontWeight: 800, color: '#31E7C8' }}>
              {scanRate}%
            </span>
            <span style={{ fontSize: 13, color: 'rgba(245,242,234,0.7)', fontFamily: 'JetBrains Mono, monospace' }}>
              ({totalScanned}/{totalAdmissions})
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.5)', marginTop: 6 }}>
            {totalDuplicates > 0 ? (
              <span style={{ color: '#FF6B6B' }}>⚠️ {totalDuplicates} duplicate scan attempts</span>
            ) : (
              'Clean gate security · 0 duplicate alerts'
            )}
          </div>
        </div>

        {/* Active Productions Tile */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(10,9,18,0.95))',
            border: '1px solid rgba(139,92,246,0.3)',
            borderRadius: 14,
            padding: 20,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: 0, right: 0, width: 4, height: '100%', background: '#8B5CF6' }} />
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(245,242,234,0.6)', textTransform: 'uppercase' }}>
            ACTIVE PRODUCTIONS
          </div>
          <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 28, fontWeight: 800, color: '#8B5CF6', marginTop: 8 }}>
            {activeEventsCount}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.5)', marginTop: 6 }}>
            {events.length - activeEventsCount} draft / pending review
          </div>
        </div>
      </div>

      {/* QUICK LAUNCH BANNER IF NO PUBLISHED EVENTS */}
      {events.length === 0 && (
        <div
          style={{
            background: 'rgba(20,16,38,0.85)',
            border: '1px dashed rgba(216,255,63,0.4)',
            borderRadius: 16,
            padding: 36,
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 22, margin: '0 0 10px' }}>
            No live events yet
          </h2>
          <p style={{ color: 'rgba(245,242,234,0.6)', maxWidth: 540, margin: '0 auto 20px', lineHeight: 1.6 }}>
            Create your first event draft to configure ticket tiers, set capacity, invite promotional sellers, and submit for platform publication.
          </p>
          <button
            onClick={onOpenCreateDraft}
            style={{
              background: '#D8FF3F',
              color: '#0A0912',
              border: 'none',
              fontFamily: 'Unbounded, sans-serif',
              fontWeight: 700,
              fontSize: 13,
              padding: '12px 24px',
              borderRadius: 8,
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            + Create Event Draft
          </button>
        </div>
      )}

      {/* ACTIVE EVENTS SNAPSHOT */}
      {events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 18, margin: 0 }}>
              Your Events & Productions
            </h2>
            <button
              onClick={onOpenCreateDraft}
              style={{
                background: '#D8FF3F',
                color: '#0A0912',
                border: 'none',
                fontFamily: 'Unbounded, sans-serif',
                fontWeight: 700,
                fontSize: 12,
                padding: '8px 16px',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              + New Event Draft
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            {events.map(event => {
              const eventScanRate =
                event.sales.admissions > 0
                  ? Math.min(100, Math.round((event.scans.admissions / event.sales.admissions) * 100))
                  : 0

              const statusColor =
                event.status === 'published' || event.status === 'active'
                  ? '#31E7C8'
                  : event.status === 'pending_review'
                  ? '#F5B942'
                  : 'rgba(245,242,234,0.5)'

              return (
                <div
                  key={event.eventId}
                  style={{
                    background: 'rgba(20,16,38,0.9)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 14,
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: 'JetBrains Mono, monospace',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 999,
                          background: `${statusColor}22`,
                          color: statusColor,
                          border: `1px solid ${statusColor}55`,
                        }}
                      >
                        {event.status}
                      </span>
                      <span style={{ fontSize: 11, color: 'rgba(245,242,234,0.5)', fontFamily: 'JetBrains Mono, monospace' }}>
                        {event.city || 'India'}
                      </span>
                    </div>

                    <h3 style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 16, margin: '6px 0 4px', color: '#F5F2EA' }}>
                      {event.name}
                    </h3>
                    <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.6)' }}>
                      📍 {event.venue || 'Venue TBD'} · 🗓️ {event.startsAt ? new Date(event.startsAt).toLocaleDateString() : 'Date TBD'}
                    </div>

                    {/* Mini metrics bar */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 8,
                        background: 'rgba(10,9,18,0.6)',
                        padding: '10px 12px',
                        borderRadius: 8,
                        marginTop: 14,
                        textAlign: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 10, color: 'rgba(245,242,234,0.5)', fontFamily: 'JetBrains Mono, monospace' }}>REVENUE</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#D8FF3F', marginTop: 2 }}>
                          ₹{Number(event.sales.verifiedRevenue || 0).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'rgba(245,242,234,0.5)', fontFamily: 'JetBrains Mono, monospace' }}>SOLD</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#F5F2EA', marginTop: 2 }}>
                          {event.sales.ticketsIssued} QR
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'rgba(245,242,234,0.5)', fontFamily: 'JetBrains Mono, monospace' }}>ADMITTED</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#31E7C8', marginTop: 2 }}>
                          {eventScanRate}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick actions for this event */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => onSelectEvent(event.eventId, 'tiers')}
                      style={{
                        flex: 1,
                        background: 'rgba(255,255,255,0.06)',
                        color: '#F5F2EA',
                        border: '1px solid rgba(255,255,255,0.12)',
                        padding: '8px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Ticket Tiers
                    </button>
                    <button
                      onClick={() => onSelectEvent(event.eventId, 'scans')}
                      style={{
                        flex: 1,
                        background: 'rgba(49,231,200,0.1)',
                        color: '#31E7C8',
                        border: '1px solid rgba(49,231,200,0.3)',
                        padding: '8px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Live Gate
                    </button>
                    <button
                      onClick={() => onSelectEvent(event.eventId, 'events')}
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        color: '#F5F2EA',
                        border: '1px solid rgba(255,255,255,0.12)',
                        padding: '8px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      ⚙️
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* RECENT SALES TICKER / TABLE */}
      <div
        style={{
          background: 'rgba(20,16,38,0.85)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h3 style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 16, margin: 0 }}>
              Recent Sales Activity
            </h3>
            <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.5)', marginTop: 3 }}>
              Live orders from online checkout, authorized promoters, and PR reps
            </div>
          </div>
          <button
            onClick={() => onSelectEvent(events[0]?.eventId || '', 'sales')}
            style={{
              background: 'transparent',
              color: '#D8FF3F',
              border: 'none',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            View All Orders →
          </button>
        </div>

        {allRecentOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(245,242,234,0.4)', fontSize: 13 }}>
            No recent orders recorded yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(245,242,234,0.5)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                  <th style={{ padding: '8px 10px' }}>ORDER ID</th>
                  <th style={{ padding: '8px 10px' }}>EVENT</th>
                  <th style={{ padding: '8px 10px' }}>CATEGORY</th>
                  <th style={{ padding: '8px 10px' }}>CHANNEL</th>
                  <th style={{ padding: '8px 10px' }}>ADMISSIONS</th>
                  <th style={{ padding: '8px 10px' }}>AMOUNT</th>
                  <th style={{ padding: '8px 10px' }}>TIME</th>
                </tr>
              </thead>
              <tbody>
                {allRecentOrders.map(order => (
                  <tr key={order.orderId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px', fontFamily: 'JetBrains Mono, monospace', color: '#F5F2EA' }}>
                      {order.orderId}
                    </td>
                    <td style={{ padding: '10px', color: 'rgba(245,242,234,0.85)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {order.eventName}
                    </td>
                    <td style={{ padding: '10px', color: '#D8FF3F' }}>
                      {order.ticketType}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: 'JetBrains Mono, monospace',
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: order.channel === 'online' ? 'rgba(56,217,196,0.15)' : 'rgba(245,185,66,0.15)',
                          color: order.channel === 'online' ? '#31E7C8' : '#F5B942',
                          textTransform: 'uppercase',
                        }}
                      >
                        {order.channel} {order.sellerName ? `· ${order.sellerName}` : ''}
                      </span>
                    </td>
                    <td style={{ padding: '10px', fontFamily: 'JetBrains Mono, monospace' }}>
                      {order.admissions} pax
                    </td>
                    <td style={{ padding: '10px', fontWeight: 600, color: '#F5F2EA' }}>
                      {order.amount ? `₹${Number(order.amount).toLocaleString()}` : 'Unverified'}
                    </td>
                    <td style={{ padding: '10px', fontSize: 11, color: 'rgba(245,242,234,0.4)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
