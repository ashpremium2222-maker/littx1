import { useState, useEffect } from 'react'
import Dashboard from './Dashboard'
import Orders from './Orders'
import Tickets from './Tickets'
import Events from './Events'
import PRApprovals from './PRApprovals'
import QRScans from './QRScans'
import { customerTotal, isConfirmedSale } from '../reporting'

interface CompanyPortalProps {
  companyId: string
  companyName?: string
  adminKey: string
  userRole?: string
}

type CompanyTab = 'overview' | 'events' | 'tickets' | 'orders' | 'prs' | 'scans'

function isApprovalOnlySale(sale: any) {
  return (
    sale?.approvalStatus === 'PENDING' ||
    sale?.approvalStatus === 'REJECTED' ||
    sale?.status === 'pending_approval' ||
    sale?.deliveryStatus === 'PENDING_APPROVAL' ||
    sale?.deliveryStatus === 'BLOCKED'
  )
}

function normalizeSellerId(value: any) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function saleCompanyId(sale: any) {
  if (sale?.companyId) return sale.companyId
  const seller = normalizeSellerId(sale?.sellerId || sale?.generatedBy || sale?.prUserId)
  if (seller === 'LITTLANE' || seller === 'SELLER-A') return 'littlane'
  if (seller === 'NITRO' || seller === 'SELLER-B') return 'nitro'
  if (seller === '7TH-HEAVEN' || seller === 'SELLER-C') return '7th-heaven'
  if (seller === 'PARTNER-SLOT-1') return 'partner-slot-1'
  if (seller === 'PARTNER-SLOT-2') return 'partner-slot-2'
  return seller ? seller.toLowerCase() : 'littlane'
}

function eventIdentifier(event: any) {
  return String(event?.eventId || event?.id || event?._id || '')
}

export default function CompanyPortal({ companyId = 'littlane', companyName = 'Littlane Ent', adminKey }: CompanyPortalProps) {
  const [activeTab, setActiveTab] = useState<CompanyTab>('overview')
  const [selectedEventId, setSelectedEventId] = useState('all')
  const [events, setEvents] = useState<any[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const fetchCompanyData = async () => {
    setLoading(true)
    setLoadError('')
    try {
      if (!adminKey) throw new Error('Your administrator session is unavailable. Sign in again.')
      const headers = { 'x-auth-token': adminKey }
      const [eventsRes, salesRes] = await Promise.all([
        fetch('/api/master/companies/' + encodeURIComponent(companyId) + '/control-center', { headers, cache: 'no-store' }),
        fetch('/api/admin/sales', { headers, cache: 'no-store' })
      ])

      const [eventsData, salesData] = await Promise.all([eventsRes.json(), salesRes.json()])
      if (!eventsRes.ok || !eventsData.success) throw new Error(eventsData.message || 'Company event data could not be loaded.')
      if (!salesRes.ok || !salesData.success) throw new Error(salesData.message || 'Company sales data could not be loaded.')
      setEvents(eventsData.events || [])
      setSales((salesData.sales || []).filter((sale: any) => saleCompanyId(sale) === companyId))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Company workspace data could not be loaded.'
      setLoadError(message)
      console.error('Failed to load company portal data:', message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCompanyData()
  }, [companyId, adminKey])

  const resendTicket = async (ticketId: string) => {
    try {
      const response = await fetch(`/api/admin/tickets/${encodeURIComponent(ticketId)}/resend`, {
        method: 'POST', headers: { 'x-auth-token': adminKey }
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Ticket email could not be resent.')
      window.alert(data.message || 'Ticket email resent.')
      await fetchCompanyData()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Ticket email could not be resent.')
    }
  }

  // Filter sales dynamically based on Event Switcher selection
  const selectedEvent = events.find(event => eventIdentifier(event) === selectedEventId)
  const sameNameEventCount = selectedEvent ? events.filter(event => String(event.name || '').toLowerCase() === String(selectedEvent.name || '').toLowerCase()).length : 0
  const filteredSales = selectedEventId === 'all'
    ? sales
    : sales.filter(sale => sale.eventId
      ? String(sale.eventId) === selectedEventId
      : sameNameEventCount === 1 && String(sale.event || '').toLowerCase() === String(selectedEvent?.name || '').toLowerCase())
  const ticketedSales = filteredSales.filter(s => !isApprovalOnlySale(s))
  const ticketedAllSales = sales.filter(s => !isApprovalOnlySale(s))

  const paidSales = ticketedSales.filter(isConfirmedSale)
  const totalRevenue = paidSales.reduce((acc, s) => acc + customerTotal(s), 0)

  const summary = {
    totalOrders: paidSales.length,
    paidOrders: paidSales.length,
    totalRevenue,
    emailFailures: sales.filter(s => s.emailStatus === 'failed').length,
    ticketFailures: sales.filter(s => s.status === 'ticket_generation_failed').length
  }

  if (loading) {
    return <div style={{ padding: '40px', color: 'var(--ink-faint)', textAlign: 'center' }}>Loading Company Workspace…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {loadError && <div role="alert" className="card" style={{ color: 'var(--red)' }}>{loadError} <button className="btn-secondary" onClick={() => { void fetchCompanyData() }}>Retry</button></div>}
      {/* Header bar with EVENT SWITCHER */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #15121F 0%, #0A0912 100%)',
          border: '1px solid rgba(216,255,63,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'var(--volt-dim)',
              border: '1px solid rgba(216,255,63,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--volt)',
              fontWeight: 800,
              fontSize: '1.2rem'
            }}
          >
            🏢
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge-pro" style={{ background: 'var(--volt)', color: '#0A0912' }}>COMPANY PORTAL</span>
              <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Tenant ID: {companyId}</span>
            </div>
            <h2 style={{ margin: '4px 0 0', fontSize: '1.3rem', color: 'var(--ink)' }}>{companyName}</h2>
          </div>
        </div>

        {/* EVENT SWITCHER DROPDOWN */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--volt)', textTransform: 'uppercase' }}>EVENT SWITCHER:</span>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            style={{
              background: 'var(--panel-2)',
              border: '1px solid var(--volt)',
              padding: '8px 16px',
              borderRadius: '10px',
              color: 'var(--volt)',
              fontWeight: 800,
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">🌐 All Company Events ({events.length})</option>
            {events.map((e) => (
              <option key={eventIdentifier(e) || e.name} value={eventIdentifier(e)}>
                🎟️ {e.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--line)', paddingBottom: '4px' }}>
        {[
          { id: 'overview', label: 'Dashboard Overview' },
          { id: 'events', label: 'My Events' },
          { id: 'tickets', label: 'Tickets' },
          { id: 'orders', label: 'Orders' },
          { id: 'prs', label: 'PR Approvals & Network' },
          { id: 'scans', label: 'Check-in Logs' }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as CompanyTab)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === t.id ? 'var(--volt-dim)' : 'var(--panel-2)',
              color: activeTab === t.id ? 'var(--volt)' : 'var(--ink-soft)'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'overview' && (
        <Dashboard sales={ticketedSales} summary={summary} testMode={false} onManualGenerate={() => {}} />
      )}

      {activeTab === 'events' && (
        <Events sales={ticketedSales} adminKey={adminKey} onNavigateToTickets={() => setActiveTab('tickets')} />
      )}

      {activeTab === 'tickets' && (
        <Tickets
          sales={ticketedSales}
          allSales={ticketedAllSales}
          onResend={resendTicket}
          adminKey={adminKey}
          onReload={fetchCompanyData}
          globalSearch=""
          isPresentation={false}
          eventFilter="all"
          onEventFilterChange={() => {}}
        />
      )}

      {activeTab === 'orders' && (
        <Orders sales={ticketedSales} onResend={resendTicket} globalSearch="" isPresentation={false} adminKey={adminKey} onReload={fetchCompanyData} />
      )}

      {activeTab === 'prs' && (
        <PRApprovals sales={filteredSales} adminKey={adminKey} isPresentation={false} />
      )}

      {activeTab === 'scans' && (
        <QRScans sales={ticketedSales} isPresentation={false} />
      )}
    </div>
  )
}
