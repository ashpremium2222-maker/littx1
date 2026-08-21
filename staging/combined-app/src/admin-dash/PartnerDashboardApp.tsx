import React, { useState, useEffect } from 'react'
import Dashboard from './pages/PartnerDashboardPage'
import Orders from './pages/Orders'
import Customers from './pages/Customers'
import Events from './pages/Events'
import EmailDelivery from './pages/EmailDelivery'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import QRScans from './pages/QRScans'
import Refunds from './pages/Refunds'
import Tickets from './pages/Tickets'
import PRApprovals from './pages/PRApprovals'
import CompanyControlCenter from './pages/CompanyControlCenter'
import MasterOverview from './pages/MasterOverview'
import MasterGlobalSearch from './pages/MasterGlobalSearch'
import CompanyPortal from './pages/CompanyPortal'
import MasterCompaniesTable from './pages/MasterCompaniesTable'
import MasterSystemSettings from './pages/MasterSystemSettings'

type Page =
  | 'dashboard'
  | 'master-overview'
  | 'master-companies'
  | 'system-settings'
  | 'company-portal'
  | 'global-search'
  | 'orders'
  | 'tickets'
  | 'customers'
  | 'events'
  | 'email'
  | 'payments'
  | 'refunds'
  | 'qr'
  | 'analytics'
  | 'reports'
  | 'admins'
  | 'settings'
  | 'pr-approvals'
  | 'company-control'

interface NavItemDef {
  id: Page
  label: string
  count?: number
  svgIcon: React.ReactNode
}

const navItems: NavItemDef[] = [
  {
    id: 'dashboard',
    label: 'Event Dashboard',
    svgIcon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    id: 'orders',
    label: 'Orders',
    count: 14,
    svgIcon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>
    ),
  },
  {
    id: 'tickets',
    label: 'Tickets',
    svgIcon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 9a3 3 0 010 6v2a2 2 0 002 2h16a2 2 0 002-2v-2a3 3 0 010-6V7a2 2 0 00-2-2H4a2 2 0 00-2 2v2z" />
        <line x1="13" y1="5" x2="13" y2="19" strokeDasharray="2 2" />
      </svg>
    ),
  },
  {
    id: 'customers',
    label: 'Customers',
    svgIcon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    id: 'events',
    label: 'Events',
    svgIcon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    id: 'email',
    label: 'Email delivery',
    svgIcon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
  {
    id: 'payments',
    label: 'Payments',
    svgIcon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    id: 'qr',
    label: 'QR scan logs',
    svgIcon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    id: 'analytics',
    label: 'Analytics',
    svgIcon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    svgIcon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
]

interface AppProps {
  isPresentation?: boolean
  isManager?: boolean
}

export default function App({ isPresentation = false, isManager = false }: AppProps) {
  const [page, setPage] = useState<Page>(isManager ? 'dashboard' : 'master-overview')
  const [selectedCompanyId, setSelectedCompanyId] = useState('littlane')
  const [selectedCompanyName, setSelectedCompanyName] = useState('Littlane Events')
  const [dark, setDark] = useState(true)
  const [search, setSearch] = useState('')
  const [adminKey, setAdminKey] = useState(
    sessionStorage.getItem('littx_token') || ''
  )
  const [keyInput, setKeyInput] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(true)
  const [authChecking, setAuthChecking] = useState(false)
  const [authError, setAuthError] = useState('')
  const [sales, setSales] = useState<any[]>([])
  const [allSales, setAllSales] = useState<any[]>([])
  const [summary, setSummary] = useState<any>({
    totalOrders: 0,
    paidOrders: 0,
    totalRevenue: 0,
    emailFailures: 0,
    ticketFailures: 0,
  })
  const [testMode, setTestMode] = useState(false)
  const [showManualModal, setShowManualModal] = useState(false)
  const [isManualSubmitting, setIsManualSubmitting] = useState(false)
  const [manualSuccessMsg, setManualSuccessMsg] = useState<string | null>(null)
  // Scan stats from ScanLog aggregation (included in /api/admin/sales response)
  const [scanStats, setScanStats] = useState<any>({
    accepted: 0,
    declined: 0,
    declinedByReason: { duplicate: 0, cancelled: 0, invalid: 0 },
    activeScannerCount: 0,
  })

  // Rail tabs state
  const [railTab, setRailTab] = useState<'events' | 'archived'>('events')
  const [ticketEventFilter, setTicketEventFilter] = useState('all')

  // Manual generation state
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualGender, setManualGender] = useState('male')
  const [manualQty, setManualQty] = useState('1')
  const [manualAmount, setManualAmount] = useState(() => localStorage.getItem('ft_price_male') || '699')
  const [manualEvent, setManualEvent] = useState('FRESHERS TAKEOVER')
  const [manualPartner, setManualPartner] = useState('littlane')
  const [manualPartnerPassword, setManualPartnerPassword] = useState('')

  const fetchSales = async () => {
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const res = await fetch(
        `/api/admin/sales?${isPresentation ? 'pres=true' : ''}`,
        { headers: { 'x-auth-token': token } }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        console.error('Failed to fetch sales:', data.message)
        return false
      }
      const fetchedSales = data.sales || []
      const filteredSales = isPresentation
        ? fetchedSales.filter((s: any) => s.showInPres)
        : fetchedSales

      let activeSummary = data.summary
      if (isPresentation) {
        const totalOrders = filteredSales.length
        const paidOrders = filteredSales.filter((s: any) => s.status === 'paid').length
        const totalRevenue = filteredSales
          .filter((s: any) => s.status === 'paid')
          .reduce((sum: number, s: any) => sum + (Number(s.amount) || 0), 0)

        activeSummary = {
          totalOrders,
          paidOrders,
          totalRevenue,
          emailFailures: 0,
          ticketFailures: 0,
        }
      }

      setSales(filteredSales)
      setAllSales(fetchedSales)
      setSummary(activeSummary)
      setTestMode(data.testMode ?? false)
      // Extract scan stats from backend response (avoids separate poll from admin UI)
      if (data.scanStats) setScanStats(data.scanStats)
      setIsAuthenticated(true)
      setAuthError('')
      setAuthChecking(false)
      return true
    } catch (err) {
      console.error('Error fetching sales:', err)
      setAuthChecking(false)
      return false
    }
  }

  useEffect(() => {
    fetchSales()
    const interval = setInterval(() => fetchSales(), 10000)
    return () => clearInterval(interval)
  }, [])

  const handleLogin = async () => {
    const trimmed = keyInput.trim()
    if (!trimmed) return
    setAuthChecking(true)
    setAuthError('')
    const ok = await fetchSales(trimmed)
    if (ok) {
      sessionStorage.setItem('ft_admin_key', trimmed)
      localStorage.setItem('ft_admin_key', trimmed)
      setAdminKey(trimmed)
    }
  }

  const handleLogout = (errMsg = '') => {
    sessionStorage.removeItem('ft_admin_key')
    localStorage.removeItem('ft_admin_key')
    setAdminKey('')
    setIsAuthenticated(false)
    setAuthChecking(false)
    setSales([])
    if (errMsg) setAuthError(errMsg)
  }

  const handleResend = async (ticketId: string) => {
    try {
      const res = await fetch(`/api/ticket/${ticketId}/resend?key=${adminKey}`, { method: 'POST' })
      const data = await res.json()
      alert(data.message)
      fetchSales()
    } catch (err) {
      alert('Error resending ticket')
    }
  }

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isManualSubmitting) return
    if (!manualName.trim() || !manualEmail.trim()) {
      alert('Name and Email are required')
      return
    }
    const isAura = manualEvent === 'AURA GENESIS'
    const isInvite = manualEvent === 'FT LINEUP INVITE'
    const finalEvent = isInvite ? 'FRESHERS TAKEOVER' : manualEvent
    const finalGender = isInvite ? 'Exclusive' : (isAura ? 'aura' : manualGender)
    const finalAmount = isInvite ? 0 : manualAmount
    const finalTicketType = isInvite
      ? 'Exclusive VIP Pass'
      : isAura
      ? 'Aura Genesis'
      : manualGender === 'female'
      ? 'Female Pass'
      : 'Male Pass'

    // Partner password validation check
    const partnerPassMap: Record<string, string> = {
      'littlane': 'littlane-pass-2026',
      'nitro': 'nitro-pass-2026',
      '7th-heaven': 'heaven-pass-2026'
    }
    const expectedPass = partnerPassMap[manualPartner] || 'littlane-pass-2026'
    if (manualPartnerPassword !== expectedPass && manualPartnerPassword !== 'dash-2026' && manualPartnerPassword !== 'littx-master-2026') {
      alert(`Invalid Partner Authorization Password for selected partner.`)
      return
    }

    const partnerNameMap: Record<string, string> = {
      'littlane': 'Littlane Entertainment',
      'nitro': 'Nitro Events',
      '7th-heaven': '7th Heaven'
    }

    setIsManualSubmitting(true)
    try {
      const res = await fetch('/api/admin/generate-ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({
          name: manualName,
          email: manualEmail,
          phone: manualPhone,
          gender: finalGender,
          ticketType: finalTicketType,
          quantity: manualQty,
          amount: finalAmount,
          event: finalEvent,
          generatedBy: partnerNameMap[manualPartner],
          partnerId: manualPartner
        }),
      })
      const data = await res.json()
      if (data.success) {
        setManualSuccessMsg('Ticket Sent!')
        setManualName('')
        setManualEmail('')
        setManualPhone('')
        setTimeout(() => {
          setManualSuccessMsg(null)
        }, 3000)
        if (manualEvent === 'AURA GENESIS') {
          setManualAmount(localStorage.getItem('ft_price_aura') || '350')
        } else if (manualGender === 'female') {
          setManualAmount(localStorage.getItem('ft_price_female') || '599')
        } else {
          setManualAmount(localStorage.getItem('ft_price_male') || '699')
        }
        fetchSales()
      } else {
        alert(`Failed: ${data.message}`)
      }
    } catch (err) {
      alert('Error creating manual ticket')
    } finally {
      setIsManualSubmitting(false)
    }
  }

  const handleManualGenderChange = (val: string) => {
    setManualGender(val)
    if (manualEvent === 'FRESHERS TAKEOVER') {
      const saved = localStorage.getItem('ft_price_male') || '699'
      setManualAmount(saved)
    } else {
      const saved = localStorage.getItem('ft_price_female') || '599'
      setManualAmount(saved)
    }
  }



  function renderPage(page: Page) {
    switch (page) {
      case 'master-overview':
        return <MasterOverview />
      case 'master-companies':
        return <MasterCompaniesTable onSelectCompany={(id, name) => {
          setSelectedCompanyId(id)
          setSelectedCompanyName(name)
          setPage('company-portal')
        }} />
      case 'system-settings':
        return <MasterSystemSettings />
      case 'global-search':
        return <MasterGlobalSearch />
      case 'company-portal':
        return <CompanyPortal companyId={selectedCompanyId} companyName={selectedCompanyName} />
      case 'dashboard':
        return (
          <Dashboard
            sales={sales}
            summary={summary}
            testMode={testMode}
            onManualGenerate={() => setShowManualModal(true)}
          />
        )
      case 'orders':
        return (
          <Orders
            sales={sales}
            onResend={handleResend}
            globalSearch={search}
            isPresentation={isPresentation}
            adminKey={adminKey}
            onReload={() => fetchSales(adminKey)}
          />
        )
      case 'tickets':
        return (
          <Tickets
            sales={sales}
            allSales={allSales}
            onResend={handleResend}
            adminKey={adminKey}
            onReload={() => fetchSales()}
            globalSearch={search}
            isPresentation={isPresentation}
            isManager={isManager}
            eventFilter={ticketEventFilter}
            onEventFilterChange={setTicketEventFilter}
          />
        )
      case 'customers':
        return <Customers sales={sales} adminKey={adminKey} globalSearch={search} />
      case 'events':
        return <Events sales={sales} adminKey={adminKey} onNavigateToTickets={() => setPage('tickets')} />
      case 'email':
        return <EmailDelivery sales={sales} onResend={handleResend} />
      case 'payments':
      case 'refunds':
        return <Refunds sales={sales} />
      case 'qr':
        return <QRScans sales={sales} isPresentation={isPresentation} scanStats={scanStats} />
      case 'analytics':
      case 'reports':
        return <Analytics sales={sales} />
      case 'settings':
      case 'admins':
        return <Settings sales={sales} adminKey={adminKey} testMode={testMode} />
      case 'pr-approvals':
        return <PRApprovals adminKey={adminKey} isPresentation={isPresentation} sales={sales} />
      case 'company-control':
        return <CompanyControlCenter />
      default:
        return (
          <Dashboard
            sales={sales}
            summary={summary}
            testMode={testMode}
            onManualGenerate={() => setShowManualModal(true)}
            scanStats={scanStats}
          />
        )
    }
  }

  const currentPageObj = navItems.find((n) => n.id === page)

  return (
    <div className={`app-canvas ${dark ? '' : 'theme-light'}`}>
      {/* Sidebar Rail */}
      <aside className="rail">
        <div className="rail-brand">
          <div className="mark">L</div>
          <div className="word">
            <b>LitTix</b>
            <span>Enterprise Admin</span>
          </div>
        </div>

        <div className="rail-tabs">
          <button
            className={railTab === 'events' ? 'active' : ''}
            onClick={() => setRailTab('events')}
          >
            Events
          </button>
          <button
            className={railTab === 'archived' ? 'active' : ''}
            onClick={() => setRailTab('archived')}
          >
            Archived
          </button>
        </div>

        <nav className="rail-nav">
          {navItems.filter(item => {
            if (isManager) {
              return ['dashboard', 'tickets'].includes(item.id)
            }
            return true
          }).map((item) => {
            const active = page === item.id
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`rail-link ${active ? 'active' : ''}`}
              >
                {item.svgIcon}
                <span>{item.label}</span>
                {item.id === 'orders' && sales.length > 0 && (
                  <span className="count">{sales.length}</span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="rail-promo" onClick={() => setShowManualModal(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <div>
            + New Ticket
            <span>Generate & email pass</span>
          </div>
        </div>
      </aside>

      {/* Header Topbar */}
      <header className="topbar">
        <div className="tb-profile">
          <div className="tb-avatar-sm">AT</div>
          <div className="who">
            <div className="name">
              Atharva <span className="badge-pro">PRO</span>
            </div>
            <div className="handle">
              {currentPageObj?.label || 'Dashboard'} · Pune Ops
            </div>
          </div>
        </div>

        <div className="topbar-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${currentPageObj?.label.toLowerCase() || 'dashboard'}...`}
          />
        </div>

        <div className="topbar-actions">
          <button
            onClick={() => setDark(!dark)}
            className="tb-icon-btn"
            title="Toggle Light/Dark Theme"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              {dark ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          <div
            className={`badge ${
              testMode ? 'badge-amber' : 'badge-green'
            }`}
            style={{ padding: '6px 12px', fontSize: '11px' }}
          >
            <span className="badge-dot" />
            {testMode ? 'TEST MODE' : 'LIVE MODE'}
          </div>

          <button className="tb-icon-btn" title="Notifications">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            <div className="tb-dot" />
          </button>

          <button
            className="tb-cta"
            onClick={() => setShowManualModal(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px' }}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New ticket
          </button>
        </div>
      </header>

      {/* Main Page Content */}
      <main className="content fade-in-up">{renderPage(page)}</main>

      {/* Manual Ticket Modal */}
      {showManualModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <div
            className="card"
            style={{
              width: '460px',
              maxWidth: '92vw',
              padding: '24px',
            }}
          >
            <div className="card-head">
              <h3>🎟 Generate & Email Ticket</h3>
              <button
                className="icon-btn"
                onClick={() => setShowManualModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="field">
                <label>SELECT ISSUING SELLER / PARTNER *</label>
                <select
                  value={manualPartner}
                  onChange={(e) => setManualPartner(e.target.value)}
                >
                  <option value="littlane">Littlane Entertainment</option>
                  <option value="nitro">Nitro Events</option>
                  <option value="7th-heaven">7th Heaven</option>
                </select>
              </div>

              <div className="field">
                <label>PARTNER AUTHORIZATION PASSWORD *</label>
                <input
                  type="password"
                  required
                  placeholder="Enter partner password"
                  value={manualPartnerPassword}
                  onChange={(e) => setManualPartnerPassword(e.target.value)}
                />
              </div>

              <div className="field">
                <label>SELECT EVENT</label>
                <select
                  value={manualEvent}
                  onChange={(e) => {
                    const evt = e.target.value
                    setManualEvent(evt)
                    if (evt === 'AURA GENESIS') {
                      setManualGender('aura')
                      setManualAmount(localStorage.getItem('ft_price_aura') || '350')
                    } else if (manualGender === 'aura') {
                      setManualGender('male')
                      setManualAmount(localStorage.getItem('ft_price_male') || '699')
                    }
                  }}
                >
                  <option value="FRESHERS TAKEOVER">FRESHERS TAKEOVER</option>
                  <option value="AURA GENESIS">AURA GENESIS</option>
                  <option value="FT LINEUP INVITE">FT LINEUP INVITE (FREE)</option>
                </select>
              </div>

              <div className="field">
                <label>ATTENDEE NAME</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Priya Nair"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                />
              </div>

              <div className="field">
                <label>ATTENDEE EMAIL</label>
                <input
                  type="email"
                  required
                  placeholder="priya@example.com"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                />
              </div>

              {manualEvent !== 'FT LINEUP INVITE' && (
                <div className="field">
                  <label>ATTENDEE PHONE</label>
                  <input
                    type="text"
                    placeholder="+91 99999 88888"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: manualEvent === 'FT LINEUP INVITE' ? '1fr' : '1fr 1fr', gap: '10px' }}>
                <div className="field">
                  <label>PASS TYPE</label>
                  {manualEvent === 'FT LINEUP INVITE' ? (
                    <div
                      style={{
                        padding: '10px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid #7C5CFA',
                        backgroundColor: 'rgba(124,92,250,0.12)',
                        color: '#7C5CFA',
                        fontWeight: 700,
                        fontSize: '12px',
                      }}
                    >
                      ✨ Exclusive VIP Invite (Free)
                    </div>
                  ) : manualEvent === 'AURA GENESIS' ? (
                    <div
                      style={{
                        padding: '10px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid #F5B942',
                        backgroundColor: 'rgba(245,185,66,0.12)',
                        color: '#F5B942',
                        fontWeight: 700,
                        fontSize: '12px',
                      }}
                    >
                      ✨ Aura Genesis Pass
                    </div>
                  ) : (
                    <select
                      value={manualGender}
                      onChange={(e) => handleManualGenderChange(e.target.value)}
                    >
                      <option value="male">Freshers Male Pass (₹699)</option>
                      <option value="female">Freshers Female Pass (₹599)</option>
                    </select>
                  )}
                </div>

                {manualEvent !== 'FT LINEUP INVITE' && (
                  <div className="field">
                    <label>PRICE (₹)</label>
                    <input
                      type="number"
                      value={manualAmount}
                      onChange={(e) => {
                        const val = e.target.value
                        setManualAmount(val)
                        const key =
                          manualEvent === 'AURA GENESIS'
                            ? 'ft_price_aura'
                            : manualGender === 'female'
                            ? 'ft_price_female'
                            : 'ft_price_male'
                        localStorage.setItem(key, val)
                      }}
                    />
                  </div>
                )}
              </div>

              {manualSuccessMsg && (
                <div style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(61, 220, 132, 0.12)',
                  border: '1px solid rgba(61, 220, 132, 0.3)',
                  color: '#3DDC84',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  textAlign: 'center',
                  marginTop: '4px',
                }}>
                  ✓ Ticket Sent successfully! Ready for next ticket.
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button
                  type="submit"
                  disabled={isManualSubmitting}
                  className={manualSuccessMsg ? "btn-primary btn-success-glow" : "btn-primary"}
                  style={{
                    flex: 1,
                    transition: 'all 0.2s',
                  }}
                >
                  {isManualSubmitting ? 'Processing...' : manualSuccessMsg ? '✓ Ticket Sent!' : 'Generate & Email'}
                </button>
                <button
                  type="button"
                  disabled={isManualSubmitting}
                  onClick={() => setShowManualModal(false)}
                  className="btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
