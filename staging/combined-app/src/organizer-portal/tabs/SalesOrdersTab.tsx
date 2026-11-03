import React, { useState, useMemo } from 'react'
import { OrganizerEvent, OrganizerOrder } from '../types'

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
          background: '#14161C',
          border: '1px solid #20232B',
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1 }}>
          <select
            value={selectedEventId || 'all'}
            onChange={e => onSelectEventId(e.target.value)}
            style={{
              background: '#0E1013',
              border: '1px solid #282C36',
              borderRadius: 6,
              padding: '8px 12px',
              color: '#EDEDEF',
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
            {(['all', 'online', 'offline'] as const).map(ch => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                style={{
                  background: channelFilter === ch ? '#EDEDEF' : 'rgba(255,255,255,0.04)',
                  color: channelFilter === ch ? '#0B0C0E' : '#8B909A',
                  border: '1px solid',
                  borderColor: channelFilter === ch ? '#EDEDEF' : 'rgba(255,255,255,0.08)',
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
              background: '#0E1013',
              border: '1px solid #282C36',
              borderRadius: 6,
              padding: '8px 12px',
              color: '#EDEDEF',
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
            background: 'rgba(255,255,255,0.06)',
            color: '#EDEDEF',
            border: '1px solid rgba(255,255,255,0.12)',
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
          background: '#14161C',
          border: '1px solid #20232B',
          borderRadius: 10,
          padding: '14px 18px',
        }}
      >
        <div>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A' }}>
            FILTERED REVENUE
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#EDEDEF', marginTop: 4 }}>
            ₹{totalAmount.toLocaleString()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A' }}>
            TOTAL ORDERS
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#EDEDEF', marginTop: 4 }}>
            {filteredOrders.length}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A' }}>
            ADMISSIONS
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#EDEDEF', marginTop: 4 }}>
            {totalAdmissions} pax
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A' }}>
            CHANNELS
          </div>
          <div style={{ fontSize: 13, color: '#8B909A', marginTop: 6, fontFamily: 'JetBrains Mono, monospace' }}>
            {onlineCount} Online · {offlineCount} Offline/PR
          </div>
        </div>
      </div>

      {/* DATA TABLE */}
      <div
        style={{
          background: '#14161C',
          border: '1px solid #20232B',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {filteredOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#555962', fontSize: 13 }}>
            No orders match the filter criteria.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid #20232B',
                    background: '#0E1013',
                    color: '#8B909A',
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
                      style={{ borderBottom: '1px solid #1A1D24' }}
                    >
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: '#EDEDEF' }}>
                          {order.orderId}
                        </div>
                        <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#555962', marginTop: 2 }}>
                          {order.ticketId ? `QR: ${order.ticketId.slice(0, 16)}…` : 'No QR'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#8B909A' }}>
                        {order.eventName}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#EDEDEF', fontWeight: 500 }}>
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
                              ? 'rgba(16, 185, 129, 0.1)'
                              : isPending
                              ? 'rgba(245, 158, 11, 0.1)'
                              : 'rgba(239, 68, 68, 0.1)',
                            color: isConfirmed ? '#10B981' : isPending ? '#F59E0B' : '#EF4444',
                            border: `1px solid ${
                              isConfirmed
                                ? 'rgba(16, 185, 129, 0.25)'
                                : isPending
                                ? 'rgba(245, 158, 11, 0.25)'
                                : 'rgba(239, 68, 68, 0.25)'
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
                            background: order.channel === 'online' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                            color: order.channel === 'online' ? '#60A5FA' : '#8B909A',
                            border: `1px solid ${order.channel === 'online' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.1)'}`,
                            textTransform: 'uppercase',
                          }}
                        >
                          {order.channel}
                        </span>
                        {order.sellerName && (
                          <div style={{ fontSize: 10, color: '#8B909A', marginTop: 2 }}>
                            {order.sellerName}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: 'JetBrains Mono, monospace', color: '#8B909A' }}>
                        {order.admissions} pax
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#EDEDEF' }}>
                        {order.amount !== null ? `₹${Number(order.amount).toLocaleString()}` : 'Unverified'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {order.scannedAdmissions > 0 ? (
                          <span style={{ fontSize: 11, color: '#10B981', fontFamily: 'JetBrains Mono, monospace' }}>
                            ✓ {order.scannedAdmissions}/{order.admissions} checked in
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: '#555962', fontFamily: 'JetBrains Mono, monospace' }}>
                            Unscanned
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 11, color: '#555962', fontFamily: 'JetBrains Mono, monospace' }}>
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
