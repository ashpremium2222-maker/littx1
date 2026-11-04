import { Fragment, useState, useMemo, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { customerTotal, isConfirmedSale } from '../reporting'

function formatINR(value: number) {
  const amount = Number(value)
  return `₹${(Number.isFinite(amount) ? amount : 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

interface DashboardProps {
  sales: any[]
  summary: any
  testMode: boolean
  onManualGenerate: () => void
  adminKey?: string
}

export default function Dashboard({ sales = [], summary = {}, testMode, onManualGenerate, adminKey = '' }: DashboardProps) {
  void [summary, onManualGenerate]
  const [period, setPeriod] = useState<'today' | '7d' | '30d'>('7d')
  const [popupEvent, setPopupEvent] = useState<{ name: string; top: number; left: number } | null>(null)
  const [expandedSeller, setExpandedSeller] = useState<string | null>(null)

  const paidSales = sales.filter(isConfirmedSale)
  const revenueSales = paidSales.filter(
    s => !s.gender || !String(s.gender).toLowerCase().includes('exclusive')
  )

  const totalRevenue = revenueSales.reduce((acc, s) => acc + customerTotal(s), 0)
  const totalTickets = paidSales.reduce((acc, s) => acc + (s.quantity || 1), 0)

  const todayStr = new Date().toDateString()
  const todayRevenue = revenueSales
    .filter(s => s.createdAt && new Date(s.createdAt).toDateString() === todayStr)
    .reduce((acc, s) => acc + customerTotal(s), 0)

  const revenueAfterCommission = revenueSales.reduce((total, sale) => {
    const gross = Number(sale.customerTotal ?? sale.amount ?? 0)
    const net = Number(sale.rateAfterCommission)
    const commission = Number(sale.commissionAmount)

    if (Number.isFinite(net)) return total + net
    if (Number.isFinite(commission)) return total + gross - commission
    return total + gross
  }, 0)

  const emailFailures = sales.filter(s => s.emailStatus === 'failed').length
  const ticketFailures = sales.filter(s => s.status === 'ticket_generation_failed').length

  const ticketSections = (() => {
    const grouped = new Map<string, any[]>()
    paidSales.forEach(sale => {
      const label = String(sale.ticketType || sale.gender || 'Ticket')
      grouped.set(label, [...(grouped.get(label) || []), sale])
    })
    const total = paidSales.reduce((sum, sale) => sum + (sale.quantity || 1), 0) || 1
    const colors = ['var(--grad-violet)', 'var(--grad-teal)', 'var(--grad-gold)', 'var(--grad-orange)']
    return Array.from(grouped, ([label, rows], index) => {
      const count = rows.reduce((sum, sale) => sum + (sale.quantity || 1), 0)
      return { id: label, label, color: colors[index % colors.length], background: colors[index % colors.length], count, pct: Math.round(count * 100 / total), sales: rows }
    })
  })()
  const activePopupSection = popupEvent ? ticketSections.find(section => section.id === popupEvent.name) : null

  // ==================== SELLER BREAKDOWN ====================
  const [sellerSummary, setSellerSummary] = useState<any[]>([])
  useEffect(() => {
    if (!adminKey) return
    const loadCompanySales = () => {
      fetch('/api/admin/seller-summary', { headers: { 'x-auth-token': adminKey, 'x-admin-key': adminKey } })
        .then(response => response.json())
        .then(data => {
          if (data.success && Array.isArray(data.companySummary)) setSellerSummary(data.companySummary)
        })
        .catch(() => {})
    }
    loadCompanySales()
    const timer = window.setInterval(loadCompanySales, 10000)
    return () => window.clearInterval(timer)
  }, [adminKey])

  const getChartData = () => {
    const chartData = []
    const now = new Date()

    if (period === '30d' || period === '7d') {
      const daysCount = period === '30d' ? 29 : 6
      const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      
      const dateKeyMap = new Map<string, { label: string; revenue: number; orders: number }>()
      for (let i = daysCount; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(d.getDate() - i)
        const dateKey = d.toISOString().slice(0, 10)
        
        let label = ''
        if (period === '7d') {
          label = weekdays[d.getDay()]
        } else {
          // 30d label format: "Aug 4" (to prevent overlapping on x-axis)
          label = `${months[d.getMonth()]} ${d.getDate()}`
        }
        
        dateKeyMap.set(dateKey, { label, revenue: 0, orders: 0 })
      }
      paidSales.forEach(s => {
        const raw = s.paidAt || s.createdAt
        if (!raw) return
        const d = new Date(raw)
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        if (dateKeyMap.has(dateKey)) {
          const cur = dateKeyMap.get(dateKey)!
          cur.revenue += s.amount || 0
          cur.orders += 1
        }
      })
      chartData.push(...Array.from(dateKeyMap.values()).map(v => ({
        time: v.label,
        revenue: v.revenue,
        orders: v.orders,
      })))
    } else {
      const blocks = ['12am', '3am', '6am', '9am', '12pm', '3pm', '6pm', '9pm']
      const blockMap = new Map<string, { revenue: number; orders: number }>()
      blocks.forEach(b => blockMap.set(b, { revenue: 0, orders: 0 }))

      paidSales.forEach(s => {
        const raw = s.paidAt || s.createdAt
        if (!raw) return
        const d = new Date(raw)
        if (d.toDateString() === todayStr) {
          const hour = d.getHours()
          const blockIndex = Math.floor(hour / 3)
          const key = blocks[blockIndex]
          if (blockMap.has(key)) {
            const cur = blockMap.get(key)!
            cur.revenue += s.amount || 0
            cur.orders += 1
          }
        }
      })
      chartData.push(...Array.from(blockMap.entries()).map(([time, v]) => ({ time, ...v })))
    }
    return chartData
  }

  const chartData = getChartData()

  const liveFeed = useMemo(() => {
    const list: any[] = []
    sales.forEach(sale => {
      const generatedAt = sale.generatedAt || sale.createdAt
      const dateVal = generatedAt ? new Date(generatedAt) : new Date()
      const diffMin = Math.round((Date.now() - dateVal.getTime()) / 60000)
      const timeLabel =
        diffMin > 60
          ? `${Math.round(diffMin / 60)}h ago`
          : diffMin > 0
          ? `${diffMin}m ago`
          : 'just now'

      list.push({
        id: `created-${sale.orderId}`,
        type: 'purchase',
        title: `${sale.name || 'Attendee'} booked a pass`,
        sub: `${sale.event || 'Event details unavailable'} · ₹${sale.amount || 0}`,
        time: timeLabel,
        badge: <span className="badge badge-blue"><span className="badge-dot" />New</span>,
      })

      if (['paid', 'ticket_generated', 'emailed', 'scanned'].includes(sale.status)) {
        list.push({
          id: `paid-${sale.orderId}`,
          type: 'payment',
          title: `Payment verified for ${sale.name || 'Attendee'}`,
          sub: `Order #${(sale.orderId || '').substring(0, 8)}`,
          time: sale.paidAt
            ? new Date(sale.paidAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : timeLabel,
          badge: <span className="badge badge-green"><span className="badge-dot" />Paid</span>,
        })
      }

      if (sale.emailStatus === 'failed') {
        list.push({
          id: `email-fail-${sale.orderId}`,
          type: 'email-fail',
          title: `Email delivery failed`,
          sub: sale.emailError || 'SMTP timeout',
          time: timeLabel,
          badge: <span className="badge badge-red"><span className="badge-dot" />Failed</span>,
        })
      }

      if (sale.status === 'scanned' || sale.scannedAt) {
        list.push({
          id: `scan-${sale.orderId}`,
          type: 'scan',
          title: `Gate QR scan validated`,
          sub: `Ticket #${sale.ticketId || ''}`,
          time: sale.scannedAt || timeLabel,
          badge: <span className="badge badge-green"><span className="badge-dot" />Valid</span>,
        })
      }
    })
    return list.slice(0, 8)
  }, [sales])

  // Calculate Health Score
  const healthScore = Math.max(
    10,
    Math.min(
      99,
      Math.round(
        100 -
          (emailFailures > 0 ? (emailFailures / Math.max(1, sales.length)) * 100 : 0) -
          (ticketFailures > 0 ? (ticketFailures / Math.max(1, sales.length)) * 100 : 0)
      )
    )
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gutter)' }}>
      <div className="kpi-row">
        <div className="tile tile-orange">
          <div className="tile-label">REVENUE MTD</div>
          <div className="tile-value">₹{totalRevenue.toLocaleString()}</div>
          <div className="tile-sub">From {totalTickets} paid passes</div>
          <div className="tile-delta">
            <span>↑</span> Verified sales
          </div>
        </div>

        <div className="tile tile-teal">
          <div className="tile-label">TODAY'S REVENUE</div>
          <div className="tile-value">₹{todayRevenue.toLocaleString()}</div>
          <div className="tile-sub">Sales logged today</div>
          <div className="tile-delta">
            <span>🟢</span> Live operations
          </div>
        </div>

        <div className="tile tile-violet">
          <div className="tile-label">REVENUE AFTER COMMISSION</div>
          <div className="tile-value">{formatINR(revenueAfterCommission)}</div>
          <div className="tile-sub">Gross ticket revenue less seller commission</div>
          <div className="tile-delta">
            <span>₹</span> Net ticket revenue
          </div>
        </div>

        <div className="tile tile-gold">
          <div className="tile-label">CONFIRMED PAID</div>
          <div className="tile-value">{totalTickets}</div>
          <div className="tile-sub">Tickets successfully issued</div>
          <div className="tile-delta">
            <span>✓</span> {testMode ? 'Test mode' : 'Live mode'}
          </div>
        </div>

        <div className="tile tile-dark">
          <div className="tile-label">SYSTEM FAILURES</div>
          <div className="tile-value">{emailFailures + ticketFailures}</div>
          <div className="tile-sub">{emailFailures} email · {ticketFailures} ticket</div>
          <div className={`tile-delta ${emailFailures + ticketFailures > 0 ? 'down' : 'up'}`}>
            <span>{emailFailures + ticketFailures > 0 ? '⚠' : '✓'}</span>{' '}
            {emailFailures + ticketFailures > 0 ? 'Requires attention' : 'All clear'}
          </div>
        </div>
      </div>

      <div className="card table-card">
        <div className="card-head" style={{ padding: '18px 18px 0' }}>
          <h3>Event Company Ticket Sales & Commission</h3>
          <div className="muted-sm">Confirmed tickets by event company and pass category</div>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Event Company</th>
                <th>Tickets Sold</th>
                <th>Gross Sales</th>
                <th>Commission Earned</th>
                <th>Net After Commission</th>
                <th>Pass Categories</th>
                <th>Latest Sale</th>
              </tr>
            </thead>
            <tbody>
              {sellerSummary.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: '24px' }}>
                    No event company ticket sales yet.
                  </td>
                </tr>
              ) : sellerSummary.map(seller => {
                const expanded = expandedSeller === seller.companyId
                const categories = Object.entries(seller.categories as Record<string, { ticketCount: number; grossSales: number; commissionEarned: number; netAfterCommission: number }>).sort((a, b) => b[1].ticketCount - a[1].ticketCount)
                return (
                  <Fragment key={seller.companyId}>
                    <tr>
                      <td>
                        <button
                          type="button"
                          onClick={() => setExpandedSeller(expanded ? null : seller.companyId)}
                          style={{ border: 0, padding: 0, background: 'none', color: 'var(--ink)', font: 'inherit', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}
                        >
                          {seller.name} <span style={{ color: 'var(--ink-faint)', fontSize: '11px' }}>{expanded ? 'Hide categories' : 'View categories'}</span>
                        </button>
                      </td>
                      <td>{seller.ticketCount}</td>
                      <td>{formatINR(seller.grossSales)}</td>
                      <td style={{ color: 'var(--green)', fontWeight: 700 }}>{formatINR(seller.commissionEarned)}</td>
                      <td>{formatINR(seller.netAfterCommission)}</td>
                      <td>{categories.length}</td>
                      <td style={{ color: 'var(--ink-soft)' }}>
                        {seller.lastSale ? new Date(seller.lastSale).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={7} style={{ padding: '12px 20px', background: 'var(--panel-2)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 2fr) repeat(4, minmax(115px, 1fr))', gap: '10px', color: 'var(--ink-faint)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                            <span>Pass Type</span><span>Tickets Sold</span><span>Gross Sales</span><span>Commission</span><span>Net After Commission</span>
                          </div>
                          {categories.length ? categories.map(([name, totals]) => (
                            <div key={name} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 2fr) repeat(4, minmax(115px, 1fr))', gap: '10px', paddingTop: '10px', color: 'var(--ink)' }}>
                              <span>{name}</span><span>{totals.ticketCount}</span><span>{formatINR(totals.grossSales)}</span><span>{formatINR(totals.commissionEarned)}</span><span>{formatINR(totals.netAfterCommission)}</span>
                            </div>
                          )) : <div style={{ paddingTop: '10px', color: 'var(--ink-faint)' }}>No category sales recorded.</div>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Main Split Content Row */}
      <div className="main-row">
        {/* Left Column */}
        <div className="left-col">
          {/* Revenue Chart Card */}
          <div className="card chart-card">
            <div className="card-head">
              <div>
                <h3>Revenue vs. Forecast</h3>
                <div className="muted-sm">Live pass sales, rolling timeframe</div>
              </div>
              <div className="card-head-actions">
                <div className="pill-toggle">
                  <button
                    className={period === '30d' ? 'active' : ''}
                    onClick={() => setPeriod('30d')}
                  >
                    30 Days
                  </button>
                  <button
                    className={period === '7d' ? 'active' : ''}
                    onClick={() => setPeriod('7d')}
                  >
                    7 Days
                  </button>
                  <button
                    className={period === 'today' ? 'active' : ''}
                    onClick={() => setPeriod('today')}
                  >
                    Today
                  </button>
                </div>
              </div>
            </div>

            <div style={{ height: '220px', width: '100%', marginTop: '10px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7C5CFA" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#7C5CFA" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    stroke="#64626F"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#64626F"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `₹${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#181A24',
                      borderColor: 'rgba(255,255,255,0.08)',
                      borderRadius: '10px',
                      color: '#F5F4F8',
                      fontSize: '12px',
                    }}
                    formatter={(val: any) => [`₹${val}`, 'Revenue']}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#7C5CFA"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#areaGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bottom Split Row (Gauge + Ticket Split) */}
          <div className="top-row">
            {/* System Health Score Gauge Card */}
            <div className="card gauge-card" style={{ flex: 1 }}>
              <div className="card-head">
                <h3>System Health Score</h3>
              </div>
              <div className="gauge-wrap" style={{ height: '140px' }}>
                <svg width="140" height="140" viewBox="0 0 160 160">
                  <defs>
                    <linearGradient id="gg" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#38D9C4" />
                      <stop offset="100%" stopColor="#7C5CFA" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="80"
                    cy="80"
                    r="60"
                    fill="none"
                    stroke="var(--panel-3)"
                    strokeWidth="12"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="60"
                    fill="none"
                    stroke="url(#gg)"
                    strokeWidth="12"
                    strokeDasharray="377"
                    strokeDashoffset={377 - (377 * healthScore) / 100}
                    strokeLinecap="round"
                    transform="rotate(-90 80 80)"
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                  />
                </svg>
                <div className="gauge-center">
                  <div className="n">{healthScore}</div>
                  <div className="l">Score</div>
                </div>
              </div>
            </div>

            {/* Ticket Type Split Card */}
            <div className="card" style={{ flex: 1.3 }}>
              <div className="card-head">
                <h3>Ticket Type Distribution</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {ticketSections.map(section => (
                  <div className="tier-row" key={section.id}>
                    <div className="h">
                      <span style={{ color: 'var(--ink)' }}>{section.label}</span>
                      <span className="muted">{section.count} ({section.pct}%)</span>
                    </div>
                    <div className="bar">
                      <div className="fill" style={{ width: `${section.pct}%`, background: section.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="right-col">
          {/* Ticket section overview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
            {ticketSections.map(section => (
              <div
                key={section.id}
                className="card lt-hover-lift"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  setPopupEvent({ name: section.id, top: rect.top + window.scrollY, left: rect.left - 520 })
                }}
                style={{ cursor: 'pointer', background: section.background, border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 'var(--radius-md)' }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{section.label}</h4>
                  <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--ink-soft)' }}>Event activity</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: section.color, fontFamily: 'monospace' }}>{section.count}</div>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--ink-faint)', letterSpacing: '0.05em' }}>SOLD</div>
                </div>
              </div>
            ))}
          </div>

          {/* Activity Timeline Card */}
          <div className="card timeline-card" style={{ flex: 1 }}>
            <div className="card-head">
              <h3>Real-Time Live Activity</h3>
              <div className="muted-sm">Latest 8 events</div>
            </div>

            <div className="timeline scroll" style={{ maxHeight: '340px' }}>
              {liveFeed.length === 0 ? (
                <div style={{ color: 'var(--ink-faint)', fontSize: '12px', padding: '16px 0', textAlign: 'center' }}>
                  No activity logged yet.
                </div>
              ) : (
                liveFeed.map(item => (
                  <div className="tl-item" key={item.id}>
                    <div className="tl-dot">
                      <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                        {item.type === 'payment'
                          ? 'verified'
                          : item.type === 'email-fail'
                          ? 'report'
                          : item.type === 'scan'
                          ? 'qr_code_scanner'
                          : 'shopping_cart'}
                      </span>
                    </div>
                    <div className="tl-body">
                      <div className="t">
                        <b>{item.title}</b>
                      </div>
                      <div className="time">{item.time} · {item.sub}</div>
                      <div className="tl-tags">{item.badge}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {popupEvent && (
        <>
          {/* Transparent click catcher backdrop */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 199,
              background: 'rgba(0, 0, 0, 0.25)',
              backdropFilter: 'blur(3px)',
              WebkitBackdropFilter: 'blur(3px)',
            }}
            onClick={() => setPopupEvent(null)}
          />

          <div
            className="scroll"
            style={{
              position: 'fixed',
              top: `${Math.max(80, Math.min(popupEvent.top, window.innerHeight - 520))}px`,
              left: `${Math.max(20, popupEvent.left)}px`,
              width: '500px',
              maxWidth: '90vw',
              maxHeight: '480px',
              overflowY: 'auto',
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: '20px',
              boxShadow: 'var(--shadow-card)',
              padding: '24px',
              zIndex: 200,
              backdropFilter: 'blur(40px)',
              WebkitBackdropFilter: 'blur(40px)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>
                  {activePopupSection?.label || 'Ticket section'} — Buyers
                </h3>
                <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '4px' }}>
                  {activePopupSection?.sales.length || 0} ticket buyers
                </div>
              </div>
              <button
                onClick={() => setPopupEvent(null)}
                style={{
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line)',
                  color: 'var(--ink)',
                  width: '30px',
                  height: '30px',
                  borderRadius: '9px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>

            {/* Buyer List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(() => {
                const list = activePopupSection?.sales || []

                if (list.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-faint)', fontSize: '13px' }}>
                      No buyers for this event yet.
                    </div>
                  )
                }

                return list.map((s: any, idx: number) => (
                  <div
                    key={s.orderId || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: 'var(--panel-2)',
                      border: '1px solid var(--line)',
                      borderRadius: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '9px',
                        background: activePopupSection?.color || 'var(--grad-violet)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}>
                        {(s.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink)' }}>{s.name || 'Unknown'}</div>
                        <div style={{ fontSize: '10.5px', color: 'var(--ink-soft)' }}>{s.email || '—'}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)' }}>₹{(s.amount || 0).toLocaleString()}</div>
                      <div style={{ fontSize: '10px', color: 'var(--ink-faint)' }}>{s.gender || 'pass'}</div>
                    </div>
                  </div>
                ))
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
