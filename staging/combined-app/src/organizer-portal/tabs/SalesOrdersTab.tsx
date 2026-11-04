import React, { useState, useMemo } from 'react'
import { OrganizerEvent, OrganizerOrder } from '../types'
import { STAGEWAY_THEME } from '../theme'

interface SalesOrdersTabProps {
  events: OrganizerEvent[]
  selectedEventId: string | null
  onSelectEventId: (id: string) => void
}

export default function SalesOrdersTab({
  events,
  selectedEventId,
  onSelectEventId,
}: SalesOrdersTabProps) {
  const [channelFilter, setChannelFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const allOrders = useMemo(() => {
    const list: Array<OrganizerOrder & { eventName: string; eventId: string }> = []
    events.forEach(e => {
      if (!selectedEventId || selectedEventId === 'all' || e.eventId === selectedEventId) {
        (e.orders || []).forEach(o => {
          list.push({ ...o, eventName: e.name, eventId: e.eventId })
        })
      }
    })
    return list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
  }, [events, selectedEventId])

  const filteredOrders = useMemo(() => {
    return allOrders.filter(order => {
      const matchChannel = channelFilter === 'all' || order.channel === channelFilter
      const matchStatus =
        statusFilter === 'all' ||
        (order.status || '').toLowerCase().includes(statusFilter.toLowerCase()) ||
        (order.paymentStatus || '').toLowerCase().includes(statusFilter.toLowerCase())
      const matchSearch =
        !searchTerm ||
        (order.orderId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.ticketId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.ticketType || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.sellerName || '').toLowerCase().includes(searchTerm.toLowerCase())
      return matchChannel && matchStatus && matchSearch
    })
  }, [allOrders, channelFilter, statusFilter, searchTerm])

  const totalAmount = filteredOrders.reduce((sum, o) => sum + (o.amount || 0), 0)
  const totalAdmissions = filteredOrders.reduce((sum, o) => sum + (o.admissions || 0), 0)
  const onlineCount = filteredOrders.filter(o => o.channel === 'online').length
  const offlineCount = filteredOrders.filter(o => o.channel === 'offline').length

  const exportCSV = () => {
    if (!filteredOrders.length) return
    const headers = ['Order ID', 'Ticket ID', 'Event', 'Category', 'Channel', 'Seller/PR', 'Admissions', 'Amount (INR)', 'Status', 'Payment Status', 'Created At']
    const rows = filteredOrders.map(o => [
      o.orderId,
      o.ticketId || '',
      `"${o.eventName.replace(/"/g, '""')}"`,
      `"${o.ticketType.replace(/"/g, '""')}"`,
      o.channel,
      o.sellerName || o.sellerId || '',
      o.admissions,
      o.amount || 0,
      o.status,
      o.paymentStatus || '',
      o.createdAt ? new Date(o.createdAt).toLocaleString() : '',
    ])
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `stageway_orders_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* FILTER CONTROLS BAR */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          background: STAGEWAY_THEME.surface,
          border: `1px solid ${STAGEWAY_THEME.border}`,
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1 }}>
          <select
            value={selectedEventId || 'all'}
            onChange={e => onSelectEventId(e.target.value)}
            style={{
              background: '#F8FCFA',
              border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
              borderRadius: 6,
              padding: '8px 12px',
              color: STAGEWAY_THEME.textPrimary,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <option value="all">All Productions ({events.length})</option>
            {events.map(e => (
              <option key={e.eventId} value={e.eventId}>
                {e.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search Order ID, Ticket ID, Seller..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              background: '#F8FCFA',
              border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
              borderRadius: 6,
              padding: '8px 12px',
              color: STAGEWAY_THEME.textPrimary,
              fontSize: 13,
              minWidth: 240,
            }}
          />

          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'online', 'offline'] as const).map(ch => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                style={{
                  background: channelFilter === ch ? STAGEWAY_THEME.primary : '#FFFFFF',
                  color: channelFilter === ch ? '#FFFFFF' : STAGEWAY_THEME.textSecondary,
                  border: `1px solid ${channelFilter === ch ? STAGEWAY_THEME.primary : STAGEWAY_THEME.border}`,
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {ch}
              </button>
            ))}
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{
              background: '#F8FCFA',
              border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
              borderRadius: 6,
              padding: '8px 12px',
              color: STAGEWAY_THEME.textPrimary,
              fontSize: 12,
              fontFamily: 'JetBrains Mono, monospace',
              cursor: 'pointer',
            }}
          >
            <option value="all">All States</option>
            <option value="confirmed">Confirmed / Paid</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <button
          onClick={exportCSV}
          disabled={!filteredOrders.length}
          style={{
            background: STAGEWAY_THEME.light,
            color: STAGEWAY_THEME.textSecondary,
            border: `1px solid ${STAGEWAY_THEME.border}`,
            borderRadius: 6,
            padding: '8px 14px',
            fontSize: 12,
            fontFamily: 'JetBrains Mono, monospace',
            cursor: filteredOrders.length ? 'pointer' : 'not-allowed',
            opacity: filteredOrders.length ? 1 : 0.4,
          }}
        >
          ⬇ Export CSV ({filteredOrders.length})
        </button>
      </div>

      {/* METRIC STRIP */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          background: STAGEWAY_THEME.surface,
          border: `1px solid ${STAGEWAY_THEME.border}`,
          borderRadius: 10,
          padding: '14px 18px',
        }}
      >
        <div>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted }}>
            FILTERED REVENUE
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: STAGEWAY_THEME.primary, marginTop: 4 }}>
            ₹{totalAmount.toLocaleString()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted }}>
            TOTAL ORDERS
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: STAGEWAY_THEME.primary, marginTop: 4 }}>
            {filteredOrders.length}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted }}>
            ADMISSIONS
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: STAGEWAY_THEME.primary, marginTop: 4 }}>
            {totalAdmissions} pax
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted }}>
            CHANNELS
          </div>
          <div style={{ fontSize: 13, color: STAGEWAY_THEME.textMuted, marginTop: 6, fontFamily: 'JetBrains Mono, monospace' }}>
            {onlineCount} Online · {offlineCount} Offline/PR
          </div>
        </div>
      </div>

      {/* DATA TABLE */}
      <div
        style={{
          background: STAGEWAY_THEME.surface,
          border: `1px solid ${STAGEWAY_THEME.border}`,
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {filteredOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: STAGEWAY_THEME.textMuted, fontSize: 13 }}>
            No orders match the filter criteria.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: `1px solid ${STAGEWAY_THEME.border}`,
                    background: STAGEWAY_THEME.light,
                    color: STAGEWAY_THEME.textPrimary,
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 11,
                  }}
                >
                  <th style={{ padding: '12px 14px', fontWeight: 500 }}>ORDER / QR</th>
                  <th style={{ padding: '12px 14px', fontWeight: 500 }}>EVENT</th>
                  <th style={{ padding: '12px 14px', fontWeight: 500 }}>TIER</th>
                  <th style={{ padding: '12px 14px', fontWeight: 500 }}>STATE</th>
                  <th style={{ padding: '12px 14px', fontWeight: 500 }}>CHANNEL</th>
                  <th style={{ padding: '12px 14px', fontWeight: 500 }}>ADMISSIONS</th>
                  <th style={{ padding: '12px 14px', fontWeight: 500 }}>AMOUNT</th>
                  <th style={{ padding: '12px 14px', fontWeight: 500 }}>GATE SCAN</th>
                  <th style={{ padding: '12px 14px', fontWeight: 500 }}>DATE</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const isConfirmed = order.status === 'confirmed' || order.status === 'completed'
                  const isPending = order.status === 'pending'

                  return (
                    <tr
                      key={order.orderId}
                      style={{ borderBottom: `1px solid ${STAGEWAY_THEME.border}` }}
                    >
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: STAGEWAY_THEME.textPrimary }}>
                          {order.orderId}
                        </div>
                        <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, marginTop: 2 }}>
                          {order.ticketId ? `QR: ${order.ticketId.slice(0, 16)}...` : 'No QR'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: STAGEWAY_THEME.textSecondary }}>
                        {order.eventName}
                      </td>
                      <td style={{ padding: '12px 14px', color: STAGEWAY_THEME.textPrimary, fontWeight: 500 }}>
                        {order.ticketType}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: 'JetBrains Mono, monospace',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: isConfirmed
                              ? 'rgba(16, 165, 121, 0.12)'
                              : isPending
                              ? 'rgba(217, 119, 6, 0.12)'
                              : 'rgba(220, 38, 38, 0.1)',
                            color: isConfirmed ? '#10A579' : isPending ? '#D97706' : '#DC2626',
                            border: `1px solid ${
                              isConfirmed
                                ? 'rgba(16, 165, 121, 0.3)'
                                : isPending
                                ? 'rgba(217, 119, 6, 0.3)'
                                : 'rgba(220, 38, 38, 0.25)'
                            }`,
                          }}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: 'JetBrains Mono, monospace',
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: order.channel === 'online' ? 'rgba(59, 130, 246, 0.1)' : STAGEWAY_THEME.light,
                            color: order.channel === 'online' ? '#3B82F6' : STAGEWAY_THEME.textMuted,
                            border: `1px solid ${order.channel === 'online' ? 'rgba(59, 130, 246, 0.2)' : STAGEWAY_THEME.border}`,
                            textTransform: 'uppercase',
                          }}
                        >
                          {order.channel}
                        </span>
                        {order.sellerName && (
                          <div style={{ fontSize: 10, color: STAGEWAY_THEME.textMuted, marginTop: 2 }}>
                            {order.sellerName}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textSecondary }}>
                        {order.admissions} pax
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: STAGEWAY_THEME.textPrimary }}>
                        {order.amount !== null ? `₹${Number(order.amount).toLocaleString()}` : 'Unverified'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {order.scannedAdmissions > 0 ? (
                          <span style={{ fontSize: 11, color: '#10A579', fontFamily: 'JetBrains Mono, monospace' }}>
                            ✓ {order.scannedAdmissions}/{order.admissions} checked in
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: STAGEWAY_THEME.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>
                            Unscanned
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 11, color: STAGEWAY_THEME.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>
                        {order.createdAt ? new Date(order.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
