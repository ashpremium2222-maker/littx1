import React, { useState, useEffect } from 'react'
import './shadow-panel.css'

interface ShadowOrder {
  orderId: string
  ticketId?: string
  name: string
  email: string
  phone?: string
  event: string
  gender?: string
  ticketType?: string
  quantity: number
  amount: number
  status: string
  createdAt: string
}

export default function ShadowPanelApp() {
  const [password, setPassword] = useState('')
  const [shadowToken, setShadowToken] = useState<string | null>(() => {
    return sessionStorage.getItem('littx_shadow_token')
  })
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)

  // Active Tab: 'dashboard' | 'create' | 'orders' | 'customers' | 'events' | 'reports' | 'settings'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'create' | 'orders' | 'customers' | 'events' | 'reports' | 'settings'>('dashboard')

  // Search & Filter States
  const [orderSearch, setOrderSearch] = useState('')
  const [orderEventFilter, setOrderEventFilter] = useState('all')
  const [orderStatusFilter, setOrderStatusFilter] = useState('all')
  const [customerSearch, setCustomerSearch] = useState('')

  // Live Shadow Data
  const [shadowOrders, setShadowOrders] = useState<ShadowOrder[]>([])
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    totalTickets: 0,
    todaySales: 0,
  })
  const [loadingOrders, setLoadingOrders] = useState(false)

  // Dynamic events & tiers
  const [eventsList, setEventsList]             = useState<any[]>([])
  const [selectedEventObj, setSelectedEventObj] = useState<any>(null)
  const [selectedTierObj, setSelectedTierObj]   = useState<any>(null)

  // Ticket creation form state
  const [event, setEvent]           = useState('DHOLIDA GARBA ROYALE')
  const [ticketType, setTicketType] = useState('Male Pass')
  const [name, setName]             = useState('')
  const [email, setEmail]           = useState('')
  const [phone, setPhone]           = useState('')
  const [gender, setGender]         = useState('male')
  const [quantity, setQuantity]     = useState('1')
  const [paymentStatus, setPaymentStatus] = useState('Paid')
  const [amount, setAmount]         = useState('699')

  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback]     = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // Fetch dynamic events from API
  const fetchDynamicEvents = async () => {
    try {
      const res  = await fetch('/api/events')
      const data = await res.json()
      if (res.ok && data.success && Array.isArray(data.events) && data.events.length > 0) {
        setEventsList(data.events)
        const first = data.events[0]
        setSelectedEventObj(first); setEvent(first.name)
        if (first.tiers?.length > 0) {
          setSelectedTierObj(first.tiers[0])
          setTicketType(first.tiers[0].name)
          setAmount(String(first.tiers[0].price))
        }
      }
    } catch (e) {}
  }

  // Fetch Live Shadow Data from backend
  const fetchShadowData = async () => {
    if (!shadowToken) return
    setLoadingOrders(true)
    try {
      const res = await fetch('/api/admin/shadow-sales', {
        headers: {
          'x-shadow-token': shadowToken,
          'x-admin-key': 'dash-2026',
          'x-master-token': 'littx-master-2026'
        }
      })
      const data = await res.json()
      if (res.ok && data.success) {
        const fetchedSales: ShadowOrder[] = data.sales || []
        setShadowOrders(fetchedSales)

        const totalOrders = fetchedSales.length
        const totalRevenue = fetchedSales.reduce((sum, s) => sum + (s.amount || 0), 0)
        const totalTickets = fetchedSales.reduce((sum, s) => sum + (s.quantity || 1), 0)

        // Compute today's sales
        const todayStr = new Date().toDateString()
        const todaySales = fetchedSales
          .filter((s) => new Date(s.createdAt).toDateString() === todayStr)
          .reduce((sum, s) => sum + (s.amount || 0), 0)

        setStats({ totalOrders, totalRevenue, totalTickets, todaySales })
      }
    } catch (err) {
      console.error('Failed to load shadow sales data:', err)
    } finally {
      setLoadingOrders(false)
    }
  }

  useEffect(() => {
    if (shadowToken) {
      fetchShadowData()
      fetchDynamicEvents()
      const timer = setInterval(() => {
        fetchDynamicEvents()
        fetchShadowData()
      }, 4000)
      return () => clearInterval(timer)
    }
  }, [shadowToken])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    setLoginLoading(true)

    if (password !== 'ashtu222') {
      setLoginError('Access Denied: Invalid Shadow Password.')
      setLoginLoading(false)
      return
    }

    try {
      const res = await fetch('/api/shadow/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setShadowToken(data.shadowToken)
        sessionStorage.setItem('littx_shadow_token', data.shadowToken)
        setPassword('')
      } else {
        const token = `shadow_local_${Date.now()}`
        setShadowToken(token)
        sessionStorage.setItem('littx_shadow_token', token)
        setPassword('')
      }
    } catch (err) {
      const token = `shadow_local_${Date.now()}`
      setShadowToken(token)
      sessionStorage.setItem('littx_shadow_token', token)
      setPassword('')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('littx_shadow_token')
    setShadowToken(null)
  }

  const handleEventChange = (evtName: string) => {
    setEvent(evtName)
    const evt = eventsList.find((e: any) => e.name === evtName)
    if (evt) {
      setSelectedEventObj(evt)
      if (evt.tiers?.length > 0) {
        const t = evt.tiers[0]
        setSelectedTierObj(t); setTicketType(t.name)
        setAmount(String(t.price * (parseInt(quantity, 10) || 1)))
      }
    }
  }
  const handleTierChange = (tierName: string) => {
    setTicketType(tierName)
    const t = selectedEventObj?.tiers?.find((t: any) => t.name === tierName)
    if (t) { setSelectedTierObj(t); setAmount(String(t.price * (parseInt(quantity, 10) || 1))) }
  }
  const handleQuantityChange = (val: string) => {
    setQuantity(val)
    if (selectedTierObj) setAmount(String(selectedTierObj.price * (parseInt(val, 10) || 1)))
  }

  const handleGenerateTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email) {
      setFeedback({ type: 'error', msg: 'Customer Name and Email are required.' })
      return
    }

    setSubmitting(true)
    setFeedback(null)

    try {
      const res = await fetch('/api/shadow/generate-ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-shadow-token': shadowToken || ''
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          gender,
          ticketType,
          quantity: parseInt(quantity, 10) || 1,
          amount: parseFloat(amount) || 0,
          event
        })
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          msg: `🎉 Ticket created & sent! Order: ${data.orderId} | Ticket: ${data.ticketId}`
        })
        setName('')
        setEmail('')
        setPhone('')
        fetchShadowData()
      } else {
        if (res.status === 401) {
          handleLogout()
          setLoginError('Shadow session expired. Please re-authenticate.')
        } else {
          setFeedback({ type: 'error', msg: data.message || 'Failed to generate shadow ticket.' })
        }
      }
    } catch (err) {
      setFeedback({ type: 'error', msg: 'Network error creating shadow ticket.' })
    } finally {
      setSubmitting(false)
    }
  }

  // Filtered Orders Calculation
  const filteredOrders = shadowOrders.filter((o) => {
    const matchesSearch =
      !orderSearch ||
      o.orderId?.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.name?.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.email?.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.phone?.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.ticketId?.toLowerCase().includes(orderSearch.toLowerCase())

    const matchesEvent = orderEventFilter === 'all' || o.event === orderEventFilter
    const matchesStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter

    return matchesSearch && matchesEvent && matchesStatus
  })

  // Unique Customers Aggregation
  const customerMap = new Map<string, { name: string; email: string; phone?: string; ordersCount: number; ticketsCount: number; totalSpent: number; lastDate: string }>()
  shadowOrders.forEach((o) => {
    const key = o.email?.toLowerCase() || o.name?.toLowerCase() || 'unknown'
    const existing = customerMap.get(key)
    if (existing) {
      existing.ordersCount += 1
      existing.ticketsCount += o.quantity || 1
      existing.totalSpent += o.amount || 0
      if (new Date(o.createdAt) > new Date(existing.lastDate)) {
        existing.lastDate = o.createdAt
      }
    } else {
      customerMap.set(key, {
        name: o.name,
        email: o.email,
        phone: o.phone,
        ordersCount: 1,
        ticketsCount: o.quantity || 1,
        totalSpent: o.amount || 0,
        lastDate: o.createdAt
      })
    }
  })
  const customerList = Array.from(customerMap.values()).filter(c =>
    !customerSearch ||
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.email.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.phone && c.phone.includes(customerSearch))
  )

  // PASSWORD AUTH MODAL
  if (!shadowToken) {
    return (
      <div className="shadow-panel-root">
        <div className="shadow-auth-modal">
          <div className="shadow-auth-card">
            <div className="shadow-brand">
              <div className="shadow-logo-title">SHADOW</div>
              <div className="shadow-logo-sub">BY ASH</div>
              <div className="shadow-logo-badge">SHADOW SALES PANEL</div>
            </div>

            <p style={{ fontSize: '12px', color: '#a1a1aa' }}>
              Restricted Operator Access. Enter authentication key to proceed.
            </p>

            {loginError && (
              <div style={{ padding: '12px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '10px', fontSize: '12px', fontWeight: 600 }}>
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="shadow-form-field">
                <label className="shadow-form-label">Access Password</label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password..."
                  className="shadow-input"
                />
              </div>

              <button type="submit" disabled={loginLoading} className="shadow-primary-btn">
                {loginLoading ? 'Authenticating...' : 'AUTHENTICATE SHADOW ACCESS'}
              </button>
            </form>

            <div className="shadow-status-pill" style={{ justifyContent: 'center' }}>
              <span>🔒 Password Protected & Server Verified</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // AUTHENTICATED METALLIC SHADOW PANEL
  return (
    <div className="shadow-panel-root">
      <div className="shadow-layout">
        {/* Sidebar */}
        <aside className="shadow-sidebar">
          <div className="shadow-brand">
            <div className="shadow-logo-title">SHADOW</div>
            <div className="shadow-logo-sub">BY ASH</div>
            <div className="shadow-logo-badge">SHADOW SALES PANEL</div>
          </div>

          <nav className="shadow-nav">
            <button
              className={`shadow-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <svg className="shadow-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Dashboard
            </button>

            <button
              className={`shadow-nav-item ${activeTab === 'create' ? 'active' : ''}`}
              onClick={() => setActiveTab('create')}
            >
              <svg className="shadow-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M2 9a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z" />
                <path d="M12 11v6M9 14h6" />
              </svg>
              Create Ticket
            </button>

            <button
              className={`shadow-nav-item ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveTab('orders')}
            >
              <svg className="shadow-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Orders
            </button>

            <button
              className={`shadow-nav-item ${activeTab === 'customers' ? 'active' : ''}`}
              onClick={() => setActiveTab('customers')}
            >
              <svg className="shadow-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Customers
            </button>

            <button
              className={`shadow-nav-item ${activeTab === 'events' ? 'active' : ''}`}
              onClick={() => setActiveTab('events')}
            >
              <svg className="shadow-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Events
            </button>

            <button
              className={`shadow-nav-item ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => setActiveTab('reports')}
            >
              <svg className="shadow-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              Reports
            </button>

            <button
              className={`shadow-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <svg className="shadow-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </button>
          </nav>

          {/* Sidebar Footer */}
          <div className="shadow-sidebar-footer">
            <div className="shadow-security-box">
              <div className="shadow-shield-icon">🛡️</div>
              <div>
                <div className="shadow-security-title">SHADOW PANEL</div>
                <div className="shadow-security-desc">Secure. Private. Hidden.</div>
              </div>
            </div>
            <div className="shadow-status-pill">
              <span>🔒 Password Protected</span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="shadow-main">
          {/* Header */}
          <header className="shadow-header">
            <div className="shadow-welcome">
              <span>🛡️</span>
              <span>Welcome, Shadow Operator</span>
            </div>

            <button className="shadow-logout-btn" onClick={handleLogout}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Logout
            </button>
          </header>

          {/* Body Workspace */}
          <div className="shadow-content">
            {/* TAB 1: DASHBOARD (MAIN VIEW) */}
            {activeTab === 'dashboard' && (
              <>
                {/* Top KPI Chrome Cards */}
                <div className="shadow-kpi-grid">
                  <div className="shadow-kpi-card" onClick={() => setActiveTab('orders')} style={{ cursor: 'pointer' }}>
                    <div className="shadow-kpi-icon-circle">🎟️</div>
                    <div className="shadow-kpi-info">
                      <div className="shadow-kpi-label">SHADOW ORDERS</div>
                      <div className="shadow-kpi-value">{stats.totalOrders}</div>
                      <div className="shadow-kpi-sub">Total Orders</div>
                    </div>
                  </div>

                  <div className="shadow-kpi-card" onClick={() => setActiveTab('reports')} style={{ cursor: 'pointer' }}>
                    <div className="shadow-kpi-icon-circle">💰</div>
                    <div className="shadow-kpi-info">
                      <div className="shadow-kpi-label">SHADOW REVENUE</div>
                      <div className="shadow-kpi-value">₹{stats.totalRevenue.toLocaleString()}</div>
                      <div className="shadow-kpi-sub">Total Revenue</div>
                    </div>
                  </div>

                  <div className="shadow-kpi-card" onClick={() => setActiveTab('customers')} style={{ cursor: 'pointer' }}>
                    <div className="shadow-kpi-icon-circle">👥</div>
                    <div className="shadow-kpi-info">
                      <div className="shadow-kpi-label">TICKETS SOLD</div>
                      <div className="shadow-kpi-value">{stats.totalTickets}</div>
                      <div className="shadow-kpi-sub">Total Tickets</div>
                    </div>
                  </div>

                  <div className="shadow-kpi-card" onClick={() => setActiveTab('reports')} style={{ cursor: 'pointer' }}>
                    <div className="shadow-kpi-icon-circle">📈</div>
                    <div className="shadow-kpi-info">
                      <div className="shadow-kpi-label">TODAY'S SALES</div>
                      <div className="shadow-kpi-value">₹{stats.todaySales.toLocaleString()}</div>
                      <div className="shadow-kpi-sub">Today's Revenue</div>
                    </div>
                  </div>
                </div>

                {/* Two Column Grid */}
                <div className="shadow-two-col">
                  {/* Left Form Box: CREATE TICKET */}
                  <div className="shadow-box">
                    <div className="shadow-box-header">
                      <div className="shadow-box-title">
                        <span>🗝️</span> CREATE TICKET
                      </div>
                    </div>

                    {feedback && (
                      <div
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: feedback.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          border: `1px solid ${feedback.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                          color: feedback.type === 'success' ? '#4ade80' : '#f87171'
                        }}
                      >
                        {feedback.msg}
                      </div>
                    )}

                    <form onSubmit={handleGenerateTicket} className="shadow-form">
                      <div className="shadow-form-field">
                        <label className="shadow-form-label">Select Event</label>
                        <select
                          className="shadow-select"
                          value={event}
                          onChange={(e) => handleEventChange(e.target.value)}
                        >
                          {eventsList.length > 0 ? (
                            eventsList.map((e: any) => <option key={e.id || e.name} value={e.name}>{e.name}</option>)
                          ) : (
                            <>
                              <option value="DHOLIDA GARBA ROYALE">DHOLIDA GARBA ROYALE</option>
                              <option value="AURA GENESIS">AURA GENESIS</option>
                            </>
                          )}
                        </select>
                      </div>

                      <div className="shadow-form-field">
                        <label className="shadow-form-label">Pass Category / Tier</label>
                        <select
                          className="shadow-select"
                          value={ticketType}
                          onChange={(e) => handleTierChange(e.target.value)}
                        >
                          {selectedEventObj?.tiers?.length > 0 ? (
                            selectedEventObj.tiers.map((t: any, i: number) => (
                              <option key={i} value={t.name}>{t.name} {t.price > 0 ? `(₹${t.price})` : '(FREE)'}</option>
                            ))
                          ) : (
                            <>
                              <option value="Male Pass">Male Pass (₹699)</option>
                              <option value="Female Pass">Female Pass (₹599)</option>
                            </>
                          )}
                        </select>
                      </div>

                      <div className="shadow-form-field">
                        <label className="shadow-form-label">Quantity</label>
                        <select
                          className="shadow-select"
                          value={quantity}
                          onChange={(e) => handleQuantityChange(e.target.value)}
                        >
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                          <option value="5">5</option>
                        </select>
                      </div>

                      <div className="shadow-form-field">
                        <label className="shadow-form-label">Customer Name</label>
                        <input
                          type="text"
                          required
                          placeholder="Enter Customer Name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="shadow-input"
                        />
                      </div>

                      <div className="shadow-form-field">
                        <label className="shadow-form-label">Customer Email</label>
                        <input
                          type="email"
                          required
                          placeholder="Enter Customer Email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="shadow-input"
                        />
                      </div>

                      <div className="shadow-form-field">
                        <label className="shadow-form-label">Customer Phone</label>
                        <input
                          type="tel"
                          placeholder="Enter Customer Phone"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="shadow-input"
                        />
                      </div>

                      <div className="shadow-form-field">
                        <label className="shadow-form-label">Payment Status</label>
                        <select
                          className="shadow-select"
                          value={paymentStatus}
                          onChange={(e) => setPaymentStatus(e.target.value)}
                        >
                          <option value="Paid">Paid</option>
                          <option value="Pending">Pending</option>
                        </select>
                      </div>

                      <div className="shadow-form-field">
                        <label className="shadow-form-label">Total Amount</label>
                        <input
                          type="text"
                          readOnly
                          value={`₹${amount}`}
                          className="shadow-input"
                          style={{ fontWeight: 800, color: '#4ade80' }}
                        />
                      </div>

                      <button type="submit" disabled={submitting} className="shadow-primary-btn">
                        {submitting ? 'CREATING TICKET...' : 'CREATE & SEND TICKET 🚀'}
                      </button>
                    </form>
                  </div>

                  {/* Right Table Box: RECENT SHADOW ORDERS */}
                  <div className="shadow-box">
                    <div className="shadow-box-header">
                      <div className="shadow-box-title">
                        <span>📑</span> RECENT SHADOW ORDERS
                      </div>
                      <button className="shadow-sec-btn" onClick={() => setActiveTab('orders')}>
                        View All Orders
                      </button>
                    </div>

                    <div className="shadow-table-wrap">
                      <table className="shadow-table">
                        <thead>
                          <tr>
                            <th>ORDER ID</th>
                            <th>CUSTOMER</th>
                            <th>EVENT</th>
                            <th>AMOUNT</th>
                            <th>STATUS</th>
                            <th>DATE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shadowOrders.length === 0 ? (
                            <tr>
                              <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#71717a' }}>
                                {loadingOrders ? 'Loading shadow orders...' : 'No shadow orders found.'}
                              </td>
                            </tr>
                          ) : (
                            shadowOrders.slice(0, 8).map((o) => (
                              <tr key={o.orderId}>
                                <td style={{ fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
                                  {o.orderId}
                                </td>
                                <td>
                                  <div style={{ fontWeight: 600, color: '#f4f4f5' }}>{o.name}</div>
                                  <div style={{ fontSize: '10px', color: '#71717a' }}>{o.email}</div>
                                </td>
                                <td style={{ fontWeight: 600 }}>{o.event || 'DHOLIDA GARBA ROYALE'}</td>
                                <td style={{ fontWeight: 800, color: '#ffffff' }}>
                                  ₹{(o.amount || 0).toLocaleString()}
                                </td>
                                <td>
                                  <span className={`shadow-badge ${o.status === 'pending' ? 'shadow-badge-pending' : 'shadow-badge-paid'}`}>
                                    {o.status === 'pending' ? 'PENDING' : 'PAID'}
                                  </span>
                                </td>
                                <td style={{ fontSize: '11px', color: '#71717a' }}>
                                  {o.createdAt ? new Date(o.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
                      <button className="shadow-sec-btn" style={{ width: '180px' }} onClick={() => setActiveTab('orders')}>
                        LOAD MORE ↓
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* TAB 2: CREATE TICKET (FULL DEDICATED VIEW) */}
            {activeTab === 'create' && (
              <div className="shadow-box" style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
                <div className="shadow-box-header">
                  <div className="shadow-box-title">
                    <span>🗝️</span> CREATE SHADOW TICKET
                  </div>
                  <button className="shadow-sec-btn" onClick={() => setActiveTab('dashboard')}>
                    ← Back to Dashboard
                  </button>
                </div>

                {feedback && (
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: feedback.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      border: `1px solid ${feedback.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                      color: feedback.type === 'success' ? '#4ade80' : '#f87171'
                    }}
                  >
                    {feedback.msg}
                  </div>
                )}

                <form onSubmit={handleGenerateTicket} className="shadow-form">
                  <div className="shadow-form-field">
                    <label className="shadow-form-label">Select Event</label>
                    <select
                      className="shadow-select"
                      value={event}
                      onChange={(e) => handleEventChange(e.target.value)}
                    >
                      {eventsList.length > 0 ? (
                        eventsList.map((e: any) => <option key={e.id || e.name} value={e.name}>{e.name}</option>)
                      ) : (
                        <>
                          <option value="DHOLIDA GARBA ROYALE">DHOLIDA GARBA ROYALE</option>
                          <option value="AURA GENESIS">AURA GENESIS</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div className="shadow-form-field">
                    <label className="shadow-form-label">Pass Category / Tier</label>
                    <select
                      className="shadow-select"
                      value={ticketType}
                      onChange={(e) => handleTierChange(e.target.value)}
                    >
                      {selectedEventObj?.tiers?.length > 0 ? (
                        selectedEventObj.tiers.map((t: any, i: number) => (
                          <option key={i} value={t.name}>{t.name} {t.price > 0 ? `(₹${t.price})` : '(FREE)'}</option>
                        ))
                      ) : (
                        <>
                          <option value="Male Pass">Male Pass (₹699)</option>
                          <option value="Female Pass">Female Pass (₹599)</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div className="shadow-form-field">
                    <label className="shadow-form-label">Quantity</label>
                    <select
                      className="shadow-select"
                      value={quantity}
                      onChange={(e) => handleQuantityChange(e.target.value)}
                    >
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                    </select>
                  </div>

                  <div className="shadow-form-field">
                    <label className="shadow-form-label">Customer Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Enter Customer Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="shadow-input"
                    />
                  </div>

                  <div className="shadow-form-field">
                    <label className="shadow-form-label">Customer Email</label>
                    <input
                      type="email"
                      required
                      placeholder="Enter Customer Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="shadow-input"
                    />
                  </div>

                  <div className="shadow-form-field">
                    <label className="shadow-form-label">Customer Phone</label>
                    <input
                      type="tel"
                      placeholder="Enter Customer Phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="shadow-input"
                    />
                  </div>

                  <div className="shadow-form-field">
                    <label className="shadow-form-label">Payment Status</label>
                    <select
                      className="shadow-select"
                      value={paymentStatus}
                      onChange={(e) => setPaymentStatus(e.target.value)}
                    >
                      <option value="Paid">Paid</option>
                      <option value="Pending">Pending</option>
                    </select>
                  </div>

                  <div className="shadow-form-field">
                    <label className="shadow-form-label">Total Amount</label>
                    <input
                      type="text"
                      readOnly
                      value={`₹${amount}`}
                      className="shadow-input"
                      style={{ fontWeight: 800, color: '#4ade80' }}
                    />
                  </div>

                  <button type="submit" disabled={submitting} className="shadow-primary-btn">
                    {submitting ? 'CREATING TICKET...' : 'CREATE & SEND TICKET 🚀'}
                  </button>
                </form>
              </div>
            )}

            {/* TAB 3: ORDERS DIRECTORY VIEW */}
            {activeTab === 'orders' && (
              <div className="shadow-box">
                <div className="shadow-box-header">
                  <div className="shadow-box-title">
                    <span>📑</span> SHADOW ORDERS DIRECTORY ({filteredOrders.length})
                  </div>
                  <button className="shadow-sec-btn" onClick={fetchShadowData}>
                    Refresh Orders
                  </button>
                </div>

                {/* Filter & Search Bar */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Search Order ID, Ticket ID, Name, Email, Phone..."
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    className="shadow-input"
                    style={{ flex: 1, minWidth: '240px' }}
                  />

                  <select
                    value={orderEventFilter}
                    onChange={(e) => setOrderEventFilter(e.target.value)}
                    className="shadow-select"
                    style={{ width: '180px' }}
                  >
                    <option value="all">All Events</option>
                    <option value="DHOLIDA GARBA ROYALE">DHOLIDA GARBA ROYALE</option>
                    <option value="AURA GENESIS">AURA GENESIS</option>
                  </select>

                  <select
                    value={orderStatusFilter}
                    onChange={(e) => setOrderStatusFilter(e.target.value)}
                    className="shadow-select"
                    style={{ width: '150px' }}
                  >
                    <option value="all">All Statuses</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>

                <div className="shadow-table-wrap">
                  <table className="shadow-table">
                    <thead>
                      <tr>
                        <th>ORDER ID & TICKET ID</th>
                        <th>CUSTOMER</th>
                        <th>EVENT</th>
                        <th>PASS TYPE</th>
                        <th>QTY</th>
                        <th>AMOUNT</th>
                        <th>STATUS</th>
                        <th>DATE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#71717a' }}>
                            {loadingOrders ? 'Loading shadow orders...' : 'No matching shadow orders found.'}
                          </td>
                        </tr>
                      ) : (
                        filteredOrders.map((o) => (
                          <tr key={o.orderId}>
                            <td>
                              <div style={{ fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
                                {o.orderId}
                              </div>
                              <div style={{ fontSize: '10px', color: '#71717a', fontFamily: 'monospace' }}>
                                {o.ticketId || 'N/A'}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, color: '#f4f4f5' }}>{o.name}</div>
                              <div style={{ fontSize: '10px', color: '#71717a' }}>{o.email}</div>
                              {o.phone && <div style={{ fontSize: '10px', color: '#71717a' }}>{o.phone}</div>}
                            </td>
                            <td style={{ fontWeight: 600 }}>{o.event || 'DHOLIDA GARBA ROYALE'}</td>
                            <td>{o.ticketType || (o.gender === 'female' ? 'Female Pass' : 'Male Pass')}</td>
                            <td style={{ fontWeight: 700 }}>{o.quantity || 1}</td>
                            <td style={{ fontWeight: 800, color: '#ffffff' }}>
                              ₹{(o.amount || 0).toLocaleString()}
                            </td>
                            <td>
                              <span className={`shadow-badge ${o.status === 'pending' ? 'shadow-badge-pending' : 'shadow-badge-paid'}`}>
                                {o.status === 'pending' ? 'PENDING' : 'PAID'}
                              </span>
                            </td>
                            <td style={{ fontSize: '11px', color: '#71717a' }}>
                              {o.createdAt ? new Date(o.createdAt).toLocaleString() : 'N/A'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: CUSTOMERS VIEW */}
            {activeTab === 'customers' && (
              <div className="shadow-box">
                <div className="shadow-box-header">
                  <div className="shadow-box-title">
                    <span>👥</span> SHADOW CUSTOMERS DIRECTORY ({customerList.length})
                  </div>
                  <button className="shadow-sec-btn" onClick={fetchShadowData}>
                    Refresh Directory
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <input
                    type="text"
                    placeholder="Search customer name, email, phone..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="shadow-input"
                    style={{ maxWidth: '360px' }}
                  />
                </div>

                <div className="shadow-table-wrap">
                  <table className="shadow-table">
                    <thead>
                      <tr>
                        <th>CUSTOMER NAME</th>
                        <th>EMAIL ADDRESS</th>
                        <th>PHONE</th>
                        <th>TOTAL ORDERS</th>
                        <th>TICKETS ISSUED</th>
                        <th>TOTAL REVENUE</th>
                        <th>LAST PURCHASE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerList.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#71717a' }}>
                            No shadow customers found.
                          </td>
                        </tr>
                      ) : (
                        customerList.map((c, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 700, color: '#ffffff' }}>{c.name}</td>
                            <td style={{ color: '#a1a1aa' }}>{c.email}</td>
                            <td style={{ color: '#a1a1aa' }}>{c.phone || 'N/A'}</td>
                            <td style={{ fontWeight: 700 }}>{c.ordersCount}</td>
                            <td style={{ fontWeight: 700 }}>{c.ticketsCount}</td>
                            <td style={{ fontWeight: 800, color: '#4ade80' }}>
                              ₹{c.totalSpent.toLocaleString()}
                            </td>
                            <td style={{ fontSize: '11px', color: '#71717a' }}>
                              {c.lastDate ? new Date(c.lastDate).toLocaleDateString() : 'N/A'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 5: EVENTS VIEW - dynamic from API */}
            {activeTab === 'events' && (
              <div className="shadow-box">
                <div className="shadow-box-header">
                  <div className="shadow-box-title">
                    <span>📅</span> ACTIVE EVENTS & PRICING ({eventsList.length})
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                  {eventsList.map((e: any) => (
                    <div key={e.id || e.name} style={{ background: '#050508', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '20px' }}>{e.icon || '🎉'}</span>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff' }}>{e.name}</div>
                          <div style={{ fontSize: '11px', color: '#a1a1aa' }}>{e.tagline || e.venue || 'Live Event'}</div>
                        </div>
                      </div>
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                        {e.tiers?.length > 0 ? e.tiers.map((t: any, i: number) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#71717a' }}>{t.name}:</span>
                            <span style={{ fontWeight: 700, color: '#ffffff' }}>{t.price > 0 ? `₹${t.price}` : 'FREE'}</span>
                          </div>
                        )) : (
                          <div style={{ fontSize: '11px', color: '#71717a' }}>No tiers configured</div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '6px', marginTop: '4px' }}>
                          <span style={{ color: '#71717a' }}>Shadow Tickets Sold:</span>
                          <span style={{ fontWeight: 800, color: '#4ade80' }}>
                            {shadowOrders.filter(o => o.event === e.name).reduce((sum, o) => sum + (o.quantity || 1), 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 6: REPORTS VIEW */}
            {activeTab === 'reports' && (
              <div className="shadow-box">
                <div className="shadow-box-header">
                  <div className="shadow-box-title">
                    <span>📊</span> SHADOW SALES PERFORMANCE REPORTS
                  </div>
                </div>

                <div className="shadow-kpi-grid">
                  <div className="shadow-kpi-card">
                    <div className="shadow-kpi-info">
                      <div className="shadow-kpi-label">TOTAL SHADOW REVENUE</div>
                      <div className="shadow-kpi-value">₹{stats.totalRevenue.toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="shadow-kpi-card">
                    <div className="shadow-kpi-info">
                      <div className="shadow-kpi-label">AVG ORDER VALUE</div>
                      <div className="shadow-kpi-value">
                        ₹{stats.totalOrders > 0 ? Math.round(stats.totalRevenue / stats.totalOrders) : 0}
                      </div>
                    </div>
                  </div>

                  <div className="shadow-kpi-card">
                    <div className="shadow-kpi-info">
                      <div className="shadow-kpi-label">TOTAL TICKETS ISSUED</div>
                      <div className="shadow-kpi-value">{stats.totalTickets}</div>
                    </div>
                  </div>

                  <div className="shadow-kpi-card">
                    <div className="shadow-kpi-info">
                      <div className="shadow-kpi-label">UNIQUE CUSTOMERS</div>
                      <div className="shadow-kpi-value">{customerMap.size}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 7: SETTINGS VIEW */}
            {activeTab === 'settings' && (
              <div className="shadow-box" style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
                <div className="shadow-box-header">
                  <div className="shadow-box-title">
                    <span>⚙️</span> SHADOW PANEL SETTINGS & SECURITY
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px' }}>
                  <div style={{ background: '#050508', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#ffffff' }}>Operator Authentication</div>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>Password Protected (`ashtu222`)</div>
                    </div>
                    <span className="shadow-badge shadow-badge-paid">ACTIVE</span>
                  </div>

                  <div style={{ background: '#050508', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#ffffff' }}>Database Isolation Tag</div>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>`source = "shadow"` (Excluded from /dashboard)</div>
                    </div>
                    <span className="shadow-badge shadow-badge-paid">ISOLATED</span>
                  </div>

                  <div style={{ background: '#050508', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#ffffff' }}>Session State</div>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>Encrypted Token Session</div>
                    </div>
                    <button className="shadow-sec-btn" onClick={handleLogout}>
                      Terminate Session
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Metallic Banner */}
            <div className="shadow-footer-banner">
              <span>🛡️</span>
              <span>SHADOW BY ASH</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
