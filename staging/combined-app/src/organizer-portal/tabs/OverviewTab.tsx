import React from 'react'
import { OrganizerEvent } from '../types'
import { STAGEWAY_THEME } from '../theme'

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
            background: STAGEWAY_THEME.surface,
            border: `1px solid ${STAGEWAY_THEME.border}`,
            borderRadius: 10,
            padding: 20,
            boxShadow: '0 1px 3px rgba(4, 120, 87, 0.05)',
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.primary, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
            Verified Gross Revenue
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: STAGEWAY_THEME.primary, marginTop: 8, letterSpacing: '-0.02em' }}>
            ₹{totalRevenue.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, marginTop: 4 }}>
            Across {events.length} production{events.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* Confirmed Orders */}
        <div
          style={{
            background: STAGEWAY_THEME.surface,
            border: `1px solid ${STAGEWAY_THEME.border}`,
            borderRadius: 10,
            padding: 20,
            boxShadow: '0 1px 3px rgba(4, 120, 87, 0.05)',
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.primary, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
            Issued Passes
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: STAGEWAY_THEME.primary, marginTop: 8, letterSpacing: '-0.02em' }}>
            {totalTicketsIssued.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, marginTop: 4 }}>
            {totalOrders} confirmed orders ({totalAdmissions} admissions)
          </div>
        </div>

        {/* Admission Rate */}
        <div
          style={{
            background: STAGEWAY_THEME.surface,
            border: `1px solid ${STAGEWAY_THEME.border}`,
            borderRadius: 10,
            padding: 20,
            boxShadow: '0 1px 3px rgba(4, 120, 87, 0.05)',
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.primary, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
            Gate Check-in Progress
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: STAGEWAY_THEME.primary, letterSpacing: '-0.02em' }}>
              {scanRate}%
            </span>
            <span style={{ fontSize: 13, color: STAGEWAY_THEME.secondary, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
              ({totalScanned}/{totalAdmissions})
            </span>
          </div>
          <div style={{ fontSize: 12, color: totalDuplicates > 0 ? STAGEWAY_THEME.danger : STAGEWAY_THEME.textMuted, marginTop: 4 }}>
            {totalDuplicates > 0 ? `${totalDuplicates} duplicate scan attempts flagged` : 'Zero duplicate fraud flagged'}
          </div>
        </div>

        {/* Active Productions */}
        <div
          style={{
            background: STAGEWAY_THEME.surface,
            border: `1px solid ${STAGEWAY_THEME.border}`,
            borderRadius: 10,
            padding: 20,
            boxShadow: '0 1px 3px rgba(4, 120, 87, 0.05)',
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.primary, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
            Published Events
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: STAGEWAY_THEME.primary, marginTop: 8, letterSpacing: '-0.02em' }}>
            {activeEventsCount}
          </div>
          <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, marginTop: 4 }}>
            {events.length - activeEventsCount} drafts / awaiting platform review
          </div>
        </div>
      </div>

      {/* EMPTY ONBOARDING BANNER */}
      {events.length === 0 && (
        <div
          style={{
            background: STAGEWAY_THEME.surface,
            border: `1.5px dashed ${STAGEWAY_THEME.borderMedium}`,
            borderRadius: 12,
            padding: 48,
            textAlign: 'center',
            boxShadow: '0 2px 8px rgba(4, 120, 87, 0.04)',
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: STAGEWAY_THEME.light,
              color: STAGEWAY_THEME.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: 24,
            }}
          >
            🎪
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: STAGEWAY_THEME.primary, margin: '0 0 8px' }}>
            No events scheduled yet
          </h2>
          <p style={{ color: STAGEWAY_THEME.textSecondary, maxWidth: 520, margin: '0 auto 24px', fontSize: 13, lineHeight: 1.6 }}>
            Create an event draft to define ticket tiers, set inventory thresholds, assign gate scanners, and submit for platform publication.
          </p>
          <button
            onClick={onOpenCreateDraft}
            style={{
              background: STAGEWAY_THEME.primary,
              color: STAGEWAY_THEME.textOnEmerald,
              border: 'none',
              fontWeight: 600,
              fontSize: 13,
              padding: '11px 22px',
              borderRadius: 8,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(4, 120, 87, 0.25)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = STAGEWAY_THEME.secondary)}
            onMouseLeave={e => (e.currentTarget.style.background = STAGEWAY_THEME.primary)}
          >
            + Create Event Draft
          </button>
        </div>
      )}

      {/* PRODUCTIONS SNAPSHOT */}
      {events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: STAGEWAY_THEME.textPrimary, margin: 0 }}>
              Active Productions
            </h2>
            <button
              onClick={onOpenCreateDraft}
              style={{
                background: STAGEWAY_THEME.primary,
                color: STAGEWAY_THEME.textOnEmerald,
                border: 'none',
                fontWeight: 600,
                fontSize: 12,
                padding: '8px 16px',
                borderRadius: 6,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(4, 120, 87, 0.2)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = STAGEWAY_THEME.secondary)}
              onMouseLeave={e => (e.currentTarget.style.background = STAGEWAY_THEME.primary)}
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
                    background: STAGEWAY_THEME.surface,
                    border: `1px solid ${STAGEWAY_THEME.border}`,
                    borderRadius: 10,
                    padding: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 16,
                    boxShadow: '0 1px 4px rgba(4, 120, 87, 0.05)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: 6,
                          background: isLive
                            ? STAGEWAY_THEME.light
                            : isReview
                            ? '#FEF3C7'
                            : '#F1F5F9',
                          color: isLive ? STAGEWAY_THEME.primary : isReview ? '#D97706' : STAGEWAY_THEME.textMuted,
                          border: `1px solid ${
                            isLive
                              ? STAGEWAY_THEME.secondary
                              : isReview
                              ? '#FDE68A'
                              : '#CBD5E1'
                          }`,
                          textTransform: 'uppercase',
                        }}
                      >
                        {event.status.replace('_', ' ')}
                      </span>
                      <span style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted }}>
                        {event.city || 'India'}
                      </span>
                    </div>

                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: STAGEWAY_THEME.textPrimary }}>
                      {event.name}
                    </h3>
                    <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted }}>
                      {event.venue || 'Venue TBD'} · {event.startsAt ? new Date(event.startsAt).toLocaleDateString() : 'Date TBD'}
                    </div>

                    {/* MINI STATS */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 8,
                        background: STAGEWAY_THEME.light,
                        borderRadius: 8,
                        padding: '12px 8px',
                        marginTop: 14,
                        textAlign: 'center',
                        border: `1px solid ${STAGEWAY_THEME.borderLight}`,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.primary, fontWeight: 600 }}>
                          REVENUE
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: STAGEWAY_THEME.primary, marginTop: 2 }}>
                          ₹{(event.sales.verifiedRevenue || 0).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.primary, fontWeight: 600 }}>
                          PASSES
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: STAGEWAY_THEME.primary, marginTop: 2 }}>
                          {event.sales.ticketsIssued} QR
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.primary, fontWeight: 600 }}>
                          CHECK-IN
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: STAGEWAY_THEME.secondary, marginTop: 2 }}>
                          {eventScanRate}%
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => onSelectEvent(event.eventId, 'tiers')}
                      style={{
                        flex: 1,
                        background: STAGEWAY_THEME.primary,
                        color: STAGEWAY_THEME.textOnEmerald,
                        border: 'none',
                        borderRadius: 6,
                        padding: '8px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'background 0.1s ease',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = STAGEWAY_THEME.secondary)}
                      onMouseLeave={e => (e.currentTarget.style.background = STAGEWAY_THEME.primary)}
                    >
                      Ticket Tiers
                    </button>
                    <button
                      onClick={() => onSelectEvent(event.eventId, 'scans')}
                      style={{
                        flex: 1,
                        background: STAGEWAY_THEME.surface,
                        color: STAGEWAY_THEME.primary,
                        border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                        borderRadius: 6,
                        padding: '8px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'background 0.1s ease',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = STAGEWAY_THEME.light)}
                      onMouseLeave={e => (e.currentTarget.style.background = STAGEWAY_THEME.surface)}
                    >
                      Gate Log
                    </button>
                    <button
                      onClick={() => onSelectEvent(event.eventId, 'events')}
                      style={{
                        background: STAGEWAY_THEME.surface,
                        color: STAGEWAY_THEME.textSecondary,
                        border: `1px solid ${STAGEWAY_THEME.borderLight}`,
                        borderRadius: 6,
                        padding: '8px 12px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
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

      {/* RECENT SALES ACTIVITY */}
      <div
        style={{
          background: STAGEWAY_THEME.surface,
          border: `1px solid ${STAGEWAY_THEME.border}`,
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 1px 4px rgba(4, 120, 87, 0.05)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: STAGEWAY_THEME.textPrimary, margin: 0 }}>
              Recent Sales Activity
            </h3>
            <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, marginTop: 2 }}>
              Latest transactions across all authorized ticketing channels
            </div>
          </div>
          <button
            onClick={() => onSelectEvent(events[0]?.eventId || '', 'sales')}
            style={{
              background: 'transparent',
              color: STAGEWAY_THEME.primary,
              border: 'none',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            All Orders →
          </button>
        </div>

        {allRecentOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 0', color: STAGEWAY_THEME.textMuted, fontSize: 13 }}>
            No recent orders recorded yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: STAGEWAY_THEME.light, color: STAGEWAY_THEME.primary, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, borderBottom: `1px solid ${STAGEWAY_THEME.borderMedium}` }}>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>ORDER</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>EVENT</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>CATEGORY</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>CHANNEL</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>QTY</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>AMOUNT</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>TIME</th>
                </tr>
              </thead>
              <tbody>
                {allRecentOrders.map(order => (
                  <tr key={order.orderId} style={{ borderBottom: `1px solid ${STAGEWAY_THEME.borderLight}`, transition: 'background 0.1s ease' }} onMouseEnter={e => (e.currentTarget.style.background = STAGEWAY_THEME.light)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px', fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.primary, fontWeight: 600 }}>
                      {order.orderId}
                    </td>
                    <td style={{ padding: '12px', color: STAGEWAY_THEME.textSecondary, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {order.eventName}
                    </td>
                    <td style={{ padding: '12px', color: STAGEWAY_THEME.textPrimary, fontWeight: 600 }}>
                      {order.ticketType}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: 'JetBrains Mono, monospace',
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: order.channel === 'online' ? STAGEWAY_THEME.light : '#F1F5F9',
                          color: order.channel === 'online' ? STAGEWAY_THEME.primary : STAGEWAY_THEME.textMuted,
                          border: `1px solid ${order.channel === 'online' ? STAGEWAY_THEME.secondary : '#CBD5E1'}`,
                          textTransform: 'uppercase',
                          fontWeight: 600,
                        }}
                      >
                        {order.channel} {order.sellerName ? `· ${order.sellerName}` : ''}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textSecondary }}>
                      {order.admissions} pax
                    </td>
                    <td style={{ padding: '12px', fontWeight: 700, color: STAGEWAY_THEME.primary }}>
                      {order.amount ? `₹${Number(order.amount).toLocaleString()}` : 'Unverified'}
                    </td>
                    <td style={{ padding: '12px', fontSize: 11, color: STAGEWAY_THEME.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>
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
