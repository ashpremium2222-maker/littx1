import React, { useState, useEffect } from 'react'
import Dashboard from './Dashboard'
import Orders from './Orders'
import Tickets from './Tickets'
import Events from './Events'
import PRApprovals from './PRApprovals'
import QRScans from './QRScans'

interface CompanyPortalProps {
  companyId: string
  companyName?: string
  userRole?: string
}

type CompanyTab = 'overview' | 'events' | 'tickets' | 'orders' | 'prs' | 'scans'

export default function CompanyPortal({ companyId = 'littlane', companyName = 'Littlane Events' }: CompanyPortalProps) {
  const [activeTab, setActiveTab] = useState<CompanyTab>('overview')
  const [selectedEventName, setSelectedEventName] = useState<string>('all')
  const [events, setEvents] = useState<any[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCompanyData = async () => {
    setLoading(true)
    try {
      const [eventsRes, salesRes] = await Promise.all([
        fetch('/api/master/companies/' + companyId + '/control-center'),
        fetch('/api/admin/sales')
      ])

      const eventsData = await eventsRes.json()
      const salesData = await salesRes.json()

      if (eventsData.success) {
        setEvents(eventsData.events || [])
      }

      if (salesData.success) {
        // Filter sales by companyId
        const companySales = (salesData.sales || []).filter((s: any) => (s.companyId || 'littlane') === companyId)
        setSales(companySales)
      }
    } catch (err) {
      console.error('Failed to load company portal data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCompanyData()
  }, [companyId])

  // Filter sales dynamically based on Event Switcher selection
  const filteredSales = selectedEventName === 'all'
    ? sales
    : sales.filter(s => (s.event || '').toLowerCase() === selectedEventName.toLowerCase())

  const paidSales = filteredSales.filter(s => ['paid', 'ticket_generated', 'emailed', 'scanned'].includes(s.status))
  const totalRevenue = paidSales.reduce((acc, s) => acc + (s.amount || 0), 0)

  const summary = {
    totalOrders: filteredSales.length,
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
            value={selectedEventName}
            onChange={(e) => setSelectedEventName(e.target.value)}
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
              <option key={e._id || e.name} value={e.name}>
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
        <Dashboard sales={filteredSales} summary={summary} testMode={false} onManualGenerate={() => {}} />
      )}

      {activeTab === 'events' && (
        <Events sales={filteredSales} adminKey="littx-admin" onNavigateToTickets={() => setActiveTab('tickets')} />
      )}

      {activeTab === 'tickets' && (
        <Tickets
          sales={filteredSales}
          allSales={sales}
          onResend={async () => {}}
          adminKey="littx-admin"
          onReload={fetchCompanyData}
          globalSearch=""
          isPresentation={false}
          eventFilter="all"
          onEventFilterChange={() => {}}
        />
      )}

      {activeTab === 'orders' && (
        <Orders sales={filteredSales} onResend={async () => {}} globalSearch="" isPresentation={false} adminKey="littx-admin" onReload={fetchCompanyData} />
      )}

      {activeTab === 'prs' && (
        <PRApprovals sales={filteredSales} adminKey="littx-admin" isPresentation={false} />
      )}

      {activeTab === 'scans' && (
        <QRScans sales={filteredSales} isPresentation={false} />
      )}
    </div>
  )
}
