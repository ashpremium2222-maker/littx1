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
  const totalRevenue = events.reduce((sum, e) => sum + (e.sales.verifiedRevenue || 0), 0)
  const totalOrders = events.reduce((sum, e) => sum + e.sales.confirmedOrders, 0)
  const totalTicketsIssued = events.reduce((sum, e) => sum + e.sales.ticketsIssued, 0)
  const totalAdmissions = events.reduce((sum, e) => sum + e.sales.admissions, 0)
  const totalScanned = events.reduce((sum, e) => sum + e.scans.admissions, 0)
  const totalDuplicates = events.reduce((sum, e) => sum + e.scans.duplicate, 0)
  const activeEventsCount = events.filter(e => e.status === 'published' || e.status === 'active').length

  const scanRate = totalAdmissions > 0 ? Math.min(100, Math.round((totalScanned / totalAdmissions) * 100)) : 0

  const allRecentOrders = events
    .flatMap(e => (e.orders || []).map(o => ({ ...o, eventName: e.name, eventId: e.eventId })))
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 8)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI METRIC CARDS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        {/* Verified Revenue */}
        <div
          style={{
            background: '#14161C',
            border: '1px solid #20232B',
            borderRadius: 10,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Verified Gross Revenue
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#EDEDEF', marginTop: 8, letterSpacing: '-0.02em' }}>
            ₹{totalRevenue.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: '#8B909A', marginTop: 4 }}>
            Across {events.length} production{events.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* Confirmed Orders */}
        <div
          style={{
            background: '#14161C',
            border: '1px solid #20232B',
            borderRadius: 10,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Issued Passes
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#EDEDEF', marginTop: 8, letterSpacing: '-0.02em' }}>
            {totalTicketsIssued.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: '#8B909A', marginTop: 4 }}>
            {totalOrders} confirmed orders ({totalAdmissions} admissions)
          </div>
        </div>

        {/* Admission Rate */}
        <div
          style={{
            background: '#14161C',
            border: '1px solid #20232B',
            borderRadius: 10,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Gate Check-in Progress
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: '#EDEDEF', letterSpacing: '-0.02em' }}>
              {scanRate}%
            </span>
            <span style={{ fontSize: 13, color: '#8B909A', fontFamily: 'JetBrains Mono, monospace' }}>
              ({totalScanned}/{totalAdmissions})
            </span>
          </div>
          <div style={{ fontSize: 12, color: totalDuplicates > 0 ? '#EF4444' : '#8B909A', marginTop: 4 }}>
            {totalDuplicates > 0 ? `${totalDuplicates} duplicate scan attempts flagged` : 'Zero duplicate fraud flagged'}
          </div>
        </div>

        {/* Active Productions */}
        <div
          style={{
            background: '#14161C',
            border: '1px solid #20232B',
            borderRadius: 10,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Published Events
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#EDEDEF', marginTop: 8, letterSpacing: '-0.02em' }}>
            {activeEventsCount}
          </div>
          <div style={{ fontSize: 12, color: '#8B909A', marginTop: 4 }}>
            {events.length - activeEventsCount} drafts / awaiting platform review
          </div>
        </div>
      </div>

      {/* EMPTY ONBOARDING BANNER */}
      {events.length === 0 && (
        <div
          style={{
            background: '#14161C',
            border: '1px dashed #282C36',
            borderRadius: 10,
            padding: 40,
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#EDEDEF', margin: '0 0 8px' }}>
            No events scheduled yet
          </h2>
          <p style={{ color: '#8B909A', maxWidth: 500, margin: '0 auto 20px', fontSize: 13, lineHeight: 1.6 }}>
            Create an event draft to define ticket tiers, set inventory thresholds, assign gate scanners, and submit for platform publication.
          </p>
          <button
            onClick={onOpenCreateDraft}
            style={{
              background: '#EDEDEF',
              color: '#0B0C0E',
              border: 'none',
              fontWeight: 600,
              fontSize: 13,
              padding: '10px 20px',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            + Create Event Draft
          </button>
        </div>
      )}

      {/* PRODUCTIONS SNAPSHOT */}
      {events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#EDEDEF', margin: 0 }}>
              Active Productions
            </h2>
            <button
              onClick={onOpenCreateDraft}
              style={{
                background: '#EDEDEF',
                color: '#0B0C0E',
                border: 'none',
                fontWeight: 600,
                fontSize: 12,
                padding: '7px 14px',
                borderRadius: 6,
                cursor: 'pointer',
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

              const isLive = event.status === 'published' || event.status === 'active'
              const isReview = event.status === 'pending_review'

              return (
                <div
                  key={event.eventId}
                  style={{
                    background: '#14161C',
                    border: '1px solid #20232B',
                    borderRadius: 10,
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 600,
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
                          textTransform: 'uppercase',
                        }}
                      >
                        {event.status.replace('_', ' ')}
                      </span>
                      <span style={{ fontSize: 12, color: '#8B909A' }}>
                        {event.city || 'India'}
                      </span>
                    </div>

                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px', color: '#EDEDEF' }}>
                      {event.name}
                    </h3>
                    <div style={{ fontSize: 12, color: '#8B909A' }}>
                      {event.venue || 'Venue TBD'} · {event.startsAt ? new Date(event.startsAt).toLocaleDateString() : 'Date TBD'}
                    </div>

                    {/* Performance metrics bar */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 8,
                        background: '#0E1013',
                        border: '1px solid #1C1F26',
                        padding: '10px 12px',
                        borderRadius: 6,
                        marginTop: 14,
                        textAlign: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 10, color: '#8B909A', fontFamily: 'JetBrains Mono, monospace' }}>REVENUE</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#EDEDEF', marginTop: 2 }}>
                          ₹{Number(event.sales.verifiedRevenue || 0).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#8B909A', fontFamily: 'JetBrains Mono, monospace' }}>PASSES</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#EDEDEF', marginTop: 2 }}>
                          {event.sales.ticketsIssued} QR
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#8B909A', fontFamily: 'JetBrains Mono, monospace' }}>CHECK-IN</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#EDEDEF', marginTop: 2 }}>
                          {eventScanRate}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => onSelectEvent(event.eventId, 'tiers')}
                      style={{
                        flex: 1,
                        background: 'rgba(255,255,255,0.04)',
                        color: '#EDEDEF',
                        border: '1px solid rgba(255,255,255,0.1)',
                        padding: '8px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      Ticket Tiers
                    </button>
                    <button
                      onClick={() => onSelectEvent(event.eventId, 'scans')}
                      style={{
                        flex: 1,
                        background: 'rgba(255,255,255,0.04)',
                        color: '#EDEDEF',
                        border: '1px solid rgba(255,255,255,0.1)',
                        padding: '8px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      Gate Log
                    </button>
                    <button
                      onClick={() => onSelectEvent(event.eventId, 'events')}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        color: '#8B909A',
                        border: '1px solid rgba(255,255,255,0.1)',
                        padding: '8px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                      title="Edit event details"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* RECENT SALES TABLE */}
      <div
        style={{
          background: '#14161C',
          border: '1px solid #20232B',
          borderRadius: 10,
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#EDEDEF', margin: 0 }}>
              Recent Sales Activity
            </h3>
            <div style={{ fontSize: 12, color: '#8B909A', marginTop: 2 }}>
              Latest transactions across all authorized ticketing channels
            </div>
          </div>
          <button
            onClick={() => onSelectEvent(events[0]?.eventId || '', 'sales')}
            style={{
              background: 'transparent',
              color: '#8B909A',
              border: 'none',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            All Orders →
          </button>
        </div>

        {allRecentOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: '#555962', fontSize: 13 }}>
            No recent orders recorded yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #20232B', color: '#8B909A', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                  <th style={{ padding: '8px 10px', fontWeight: 500 }}>ORDER</th>
                  <th style={{ padding: '8px 10px', fontWeight: 500 }}>EVENT</th>
                  <th style={{ padding: '8px 10px', fontWeight: 500 }}>CATEGORY</th>
                  <th style={{ padding: '8px 10px', fontWeight: 500 }}>CHANNEL</th>
                  <th style={{ padding: '8px 10px', fontWeight: 500 }}>QTY</th>
                  <th style={{ padding: '8px 10px', fontWeight: 500 }}>AMOUNT</th>
                  <th style={{ padding: '8px 10px', fontWeight: 500 }}>TIME</th>
                </tr>
              </thead>
              <tbody>
                {allRecentOrders.map(order => (
                  <tr key={order.orderId} style={{ borderBottom: '1px solid #1A1D24' }}>
                    <td style={{ padding: '10px', fontFamily: 'JetBrains Mono, monospace', color: '#EDEDEF' }}>
                      {order.orderId}
                    </td>
                    <td style={{ padding: '10px', color: '#8B909A', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {order.eventName}
                    </td>
                    <td style={{ padding: '10px', color: '#EDEDEF', fontWeight: 500 }}>
                      {order.ticketType}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: 'JetBrains Mono, monospace',
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: order.channel === 'online' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                          color: order.channel === 'online' ? '#60A5FA' : '#8B909A',
                          border: `1px solid ${order.channel === 'online' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.1)'}`,
                          textTransform: 'uppercase',
                        }}
                      >
                        {order.channel} {order.sellerName ? `· ${order.sellerName}` : ''}
                      </span>
                    </td>
                    <td style={{ padding: '10px', fontFamily: 'JetBrains Mono, monospace', color: '#8B909A' }}>
                      {order.admissions} pax
                    </td>
                    <td style={{ padding: '10px', fontWeight: 600, color: '#EDEDEF' }}>
                      {order.amount ? `₹${Number(order.amount).toLocaleString()}` : 'Unverified'}
                    </td>
                    <td style={{ padding: '10px', fontSize: 11, color: '#555962', fontFamily: 'JetBrains Mono, monospace' }}>
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
