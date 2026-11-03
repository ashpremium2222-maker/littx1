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

  // Gather orders based on selected event or all events
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

  // Filter orders
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

  // Aggregate metrics
  const totalAmount = filteredOrders.reduce((sum, o) => sum + (o.amount || 0), 0)
  const totalAdmissions = filteredOrders.reduce((sum, o) => sum + (o.admissions || 0), 0)
  const onlineCount = filteredOrders.filter(o => o.channel === 'online').length
  const offlineCount = filteredOrders.filter(o => o.channel === 'offline').length

  // CSV Export
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
    link.setAttribute('download', `stageway_sales_${Date.now()}.csv`)
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
          background: 'rgba(20,16,38,0.7)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1 }}>
          {/* Event Filter */}
          <select
            value={selectedEventId || 'all'}
            onChange={e => onSelectEventId(e.target.value)}
            style={{
              background: 'rgba(10,9,18,0.85)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              padding: '8px 12px',
              color: '#F5F2EA',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <option value="all">All Events ({events.length})</option>
            {events.map(e => (
              <option key={e.eventId} value={e.eventId}>
                {e.name}
              </option>
            ))}
          </select>

          {/* Search Box */}
          <input
            type="text"
            placeholder="Search Order ID, Ticket ID, Seller..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              background: 'rgba(10,9,18,0.85)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              padding: '8px 14px',
              color: '#F5F2EA',
              fontSize: 13,
              minWidth: 240,
            }}
          />

          {/* Channel Filters */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'online', 'offline'] as const).map(ch => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                style={{
                  background: channelFilter === ch ? '#D8FF3F' : 'rgba(255,255,255,0.05)',
                  color: channelFilter === ch ? '#0A0912' : 'rgba(245,242,234,0.7)',
                  border: '1px solid',
                  borderColor: channelFilter === ch ? '#D8FF3F' : 'rgba(255,255,255,0.08)',
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

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{
              background: 'rgba(10,9,18,0.85)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              padding: '8px 12px',
              color: '#F5F2EA',
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
            background: 'rgba(255,255,255,0.08)',
            color: '#F5F2EA',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 12,
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 600,
            cursor: filteredOrders.length ? 'pointer' : 'not-allowed',
            opacity: filteredOrders.length ? 1 : 0.5,
          }}
        >
          ⬇ Export CSV ({filteredOrders.length})
        </button>
      </div>

      {/* SUMMARY STATS BAR */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          background: 'rgba(20,16,38,0.85)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: '14px 18px',
        }}
      >
        <div>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)' }}>
            FILTERED REVENUE
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#D8FF3F', marginTop: 4 }}>
            ₹{totalAmount.toLocaleString()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)' }}>
            TOTAL ORDERS
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#F5F2EA', marginTop: 4 }}>
            {filteredOrders.length}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)' }}>
            TOTAL ADMISSIONS
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#31E7C8', marginTop: 4 }}>
            {totalAdmissions} pax
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)' }}>
            CHANNEL SPLIT
          </div>
          <div style={{ fontSize: 13, color: 'rgba(245,242,234,0.8)', marginTop: 6, fontFamily: 'JetBrains Mono, monospace' }}>
            <span style={{ color: '#31E7C8' }}>{onlineCount} Online</span> ·{' '}
            <span style={{ color: '#F5B942' }}>{offlineCount} Offline/PR</span>
          </div>
        </div>
      </div>

      {/* ORDERS DATA TABLE */}
      <div
        style={{
          background: 'rgba(20,16,38,0.9)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        {filteredOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'rgba(245,242,234,0.4)', fontSize: 13 }}>
            No orders found matching the filter criteria.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(10,9,18,0.6)',
                    color: 'rgba(245,242,234,0.5)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 11,
                  }}
                >
                  <th style={{ padding: '12px 14px' }}>ORDER ID / QR</th>
                  <th style={{ padding: '12px 14px' }}>EVENT</th>
                  <th style={{ padding: '12px 14px' }}>TIER</th>
                  <th style={{ padding: '12px 14px' }}>STATE</th>
                  <th style={{ padding: '12px 14px' }}>CHANNEL</th>
                  <th style={{ padding: '12px 14px' }}>ADMISSIONS</th>
                  <th style={{ padding: '12px 14px' }}>AMOUNT</th>
                  <th style={{ padding: '12px 14px' }}>GATE SCAN</th>
                  <th style={{ padding: '12px 14px' }}>DATE</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => (
                  <tr
                    key={order.orderId}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      transition: 'background 0.2s',
                    }}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: '#F5F2EA' }}>
                        {order.orderId}
                      </div>
                      <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.4)', marginTop: 2 }}>
                        {order.ticketId ? `QR: ${order.ticketId.slice(0, 16)}…` : 'No QR'}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {order.eventName}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#D8FF3F', fontWeight: 600 }}>
                      {order.ticketType}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: 'JetBrains Mono, monospace',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background:
                            order.status === 'confirmed' || order.status === 'completed'
                              ? 'rgba(49,231,200,0.15)'
                              : order.status === 'pending'
                              ? 'rgba(245,185,66,0.15)'
                              : 'rgba(255,107,107,0.15)',
                          color:
                            order.status === 'confirmed' || order.status === 'completed'
                              ? '#31E7C8'
                              : order.status === 'pending'
                              ? '#F5B942'
                              : '#FF6B6B',
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
                          background: order.channel === 'online' ? 'rgba(56,217,196,0.12)' : 'rgba(245,185,66,0.12)',
                          color: order.channel === 'online' ? '#31E7C8' : '#F5B942',
                          textTransform: 'uppercase',
                        }}
                      >
                        {order.channel}
                      </span>
                      {order.sellerName && (
                        <div style={{ fontSize: 10, color: 'rgba(245,242,234,0.5)', marginTop: 2 }}>
                          {order.sellerName}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: 'JetBrains Mono, monospace' }}>
                      {order.admissions} pax
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#F5F2EA' }}>
                      {order.amount !== null ? `₹${Number(order.amount).toLocaleString()}` : 'Unverified'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {order.scannedAdmissions > 0 ? (
                        <span style={{ fontSize: 11, color: '#31E7C8', fontFamily: 'JetBrains Mono, monospace' }}>
                          ✅ {order.scannedAdmissions}/{order.admissions} admitted
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'rgba(245,242,234,0.4)', fontFamily: 'JetBrains Mono, monospace' }}>
                          Not checked in
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 11, color: 'rgba(245,242,234,0.5)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {order.createdAt ? new Date(order.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
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
