import { useState, useMemo, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'

interface DashboardProps {
  sales: any[]
  summary: any
  testMode: boolean
  onManualGenerate: () => void
  scanStats?: {
    accepted: number
    declined: number
    declinedByReason?: { duplicate: number; cancelled: number; invalid: number }
    activeScannerCount: number
  }
}

export default function Dashboard({ sales = [], summary = {}, testMode, onManualGenerate, scanStats }: DashboardProps) {
  const [period, setPeriod] = useState<'today' | '7d' | '30d'>('7d')
  const [chartMode, setChartMode] = useState<'actual' | 'forecast'>('actual')
  const [popupEvent, setPopupEvent] = useState<{ name: string; top: number; left: number } | null>(null)
  const [expandedSeller, setExpandedSeller] = useState<string | null>(null)

  const paidSales = sales.filter(s =>
    ['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(s.status)
  )
  const revenueSales = paidSales.filter(
    s => !s.gender || !String(s.gender).toLowerCase().includes('exclusive')
  )

  const totalRevenue = revenueSales.reduce((acc, s) => acc + (s.amount || 0), 0)
  const totalTickets = paidSales.reduce((acc, s) => acc + (s.quantity || 1), 0)

  const todayStr = new Date().toDateString()
  const todayRevenue = revenueSales
    .filter(s => s.createdAt && new Date(s.createdAt).toDateString() === todayStr)
    .reduce((acc, s) => acc + (s.amount || 0), 0)

  const manualSales = revenueSales.filter(s => s.paymentId === 'manual' || s.paymentMethod === 'manual' || s.paymentMethod === 'cash')
  const cashSales = revenueSales // all sales are cash/manual now

  const manualRevenue = manualSales.reduce((acc, s) => acc + (s.amount || 0), 0)
  const cashRevenue = totalRevenue // all revenue is cash

  const emailFailures = sales.filter(s => s.emailStatus === 'failed').length
  const ticketFailures = sales.filter(s => s.status === 'ticket_generation_failed').length
  const qrScannedCount = sales.filter(s => s.status === 'scanned' || !!s.scannedAt).length

  const [dynamicEvents, setDynamicEvents] = useState<any[]>([])
  const [knownSellerIds, setKnownSellerIds] = useState<string[]>([])

  useEffect(() => {
    const loadEvents = () => {
      fetch('/api/events')
        .then(r => r.json())
        .then(d => { if (d.success && Array.isArray(d.events)) setDynamicEvents(d.events) })
        .catch(() => {})
    }
    const loadSellers = () => {
      fetch('/api/admin/sellers')
        .then(r => r.json())
        .then(d => { if (d.success && Array.isArray(d.sellers)) setKnownSellerIds(d.sellers) })
        .catch(() => {})
    }
    loadEvents()
    loadSellers()
    const timer = setInterval(() => { loadEvents(); loadSellers() }, 15000)
    return () => clearInterval(timer)
  }, [])

  const freshersMale = useMemo(() => paidSales.filter(s => (s.event || '').toUpperCase().includes('FRESHERS') && (s.gender === 'male' || (s.ticketType || '').toLowerCase().includes('male'))), [paidSales])
  const freshersFemale = useMemo(() => paidSales.filter(s => (s.event || '').toUpperCase().includes('FRESHERS') && (s.gender === 'female' || (s.ticketType || '').toLowerCase().includes('female'))), [paidSales])
  const auraGenesis = useMemo(() => paidSales.filter(s => (s.event || '').toUpperCase().includes('AURA')), [paidSales])
  const ftInvite = useMemo(() => paidSales.filter(s => (s.gender || '').toLowerCase().includes('exclusive') || (s.ticketType || '').toLowerCase().includes('exclusive')), [paidSales])

  const maleCount = useMemo(() => freshersMale.reduce((acc, s) => acc + (s.quantity || 1), 0), [freshersMale])
  const femaleCount = useMemo(() => freshersFemale.reduce((acc, s) => acc + (s.quantity || 1), 0), [freshersFemale])
  const auraCount = useMemo(() => auraGenesis.reduce((acc, s) => acc + (s.quantity || 1), 0), [auraGenesis])
  const inviteCount = useMemo(() => ftInvite.reduce((acc, s) => acc + (s.quantity || 1), 0), [ftInvite])

  const grandTotal = Math.max(1, totalTickets)

  // Dynamic Event Breakdown based on master admin /api/events
  const eventBreakdown = useMemo(() => {
    if (dynamicEvents.length === 0) {
      return [
        { name: 'Male Pass (₹699)', count: maleCount, pct: Math.round((maleCount / grandTotal) * 100), color: 'var(--grad-violet)' },
        { name: 'Female Pass (₹599)', count: femaleCount, pct: Math.round((femaleCount / grandTotal) * 100), color: 'var(--grad-teal)' },
        { name: 'Aura Genesis', count: auraCount, pct: Math.round((auraCount / grandTotal) * 100), color: 'var(--grad-gold)' },
        { name: 'FT Lineup VIP Invite', count: inviteCount, pct: Math.round((inviteCount / grandTotal) * 100), color: 'var(--grad-orange)' },
      ]
    }

    const COLORS = ['var(--grad-violet)', 'var(--grad-teal)', 'var(--grad-gold)', 'var(--grad-orange)', 'linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%)']
    return dynamicEvents.map((evt, idx) => {
      const matchingSales = paidSales.filter(s => s.event === evt.name)
      const count = matchingSales.reduce((acc, s) => acc + (s.quantity || 1), 0)
      const pct = Math.round((count / grandTotal) * 100)
      return {
        name: evt.name,
        count,
        pct,
        color: evt.gradient || COLORS[idx % COLORS.length]
      }
    })
  }, [dynamicEvents, paidSales, grandTotal, maleCount, femaleCount, auraCount, inviteCount])

  // ==================== SELLER BREAKDOWN ====================
  const sellerSummary = useMemo(() => {
    const map: Record<string, { sellerId: string; ticketCount: number; revenue: number; lastSale: string | null; sales: any[] }> = {}
    // Pre-seed known sellers from API (so they show even with zero sales)
    for (const sid of knownSellerIds) {
      map[sid] = { sellerId: sid, ticketCount: 0, revenue: 0, lastSale: null, sales: [] }
    }
    for (const s of paidSales) {
      const who = s.generatedBy || s.prUserId || 'Admin'
      if (!map[who]) map[who] = { sellerId: who, ticketCount: 0, revenue: 0, lastSale: null, sales: [] }
      map[who].ticketCount += (s.quantity || 1)
      if (!String(s.gender || '').toLowerCase().includes('exclusive')) {
        map[who].revenue += (s.amount || 0)
      }
      if (!map[who].lastSale || (s.generatedAt && s.generatedAt > map[who].lastSale!)) {
        map[who].lastSale = s.generatedAt
      }
      map[who].sales.push(s)
    }
    return Object.values(map).filter(s => s.ticketCount > 0 || knownSellerIds.includes(s.sellerId)).sort((a, b) => b.revenue - a.revenue)
  }, [paidSales, knownSellerIds])

  const getChartData = () => {
    const chartData = []
    const now = new Date()

    if (period === '30d' || period === '7d') {
      const daysCount = period === '30d' ? 29 : 6
      const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      
      const dateKeyMap = new Map<string, { label: string; revenue: number; orders: number; forecast: number }>()
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
        
        dateKeyMap.set(dateKey, { label, revenue: 0, orders: 0, forecast: 0 })
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
        forecast: v.revenue > 0 ? Math.round(v.revenue * 1.25 + 1200) : 0,
      })))
    } else {
      const blocks = ['12am', '3am', '6am', '9am', '12pm', '3pm', '6pm', '9pm']
      const blockMap = new Map<string, { revenue: number; orders: number; forecast: number }>()
      blocks.forEach(b => blockMap.set(b, { revenue: 0, orders: 0, forecast: 0 }))

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
            cur.forecast = Math.round(cur.revenue * 1.2 + 500)
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
        sub: `${sale.event || 'DHOLIDA GARBA ROYALE'} · ₹${sale.amount || 0}`,
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
          <div className="tile-sub">From {paidSales.length} paid passes</div>
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
          <div className="tile-label">CASH COLLECTED</div>
          <div className="tile-value">₹{totalRevenue.toLocaleString()}</div>
          <div className="tile-sub">All manual / cash sales</div>
          <div className="tile-delta">
            <span>💵</span> {cashSales.length} manual transactions
          </div>
        </div>

        <div className="tile tile-gold">
          <div className="tile-label">CONFIRMED PAID</div>
          <div className="tile-value">{paidSales.length}</div>
          <div className="tile-sub">Tickets successfully issued</div>
          <div className="tile-delta">
            <span>✓</span> Cash-only mode
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

        {/* Gate Scans tile — sourced from ScanLog aggregation via /api/admin/sales scanStats */}
        <div className="tile tile-teal" style={{ borderColor: 'rgba(168,85,247,0.3)' }}>
          <div className="tile-label">GATE SCANS TODAY</div>
          <div className="tile-value">{scanStats ? scanStats.accepted : qrScannedCount}</div>
          <div className="tile-sub">
            {scanStats
              ? `${scanStats.declined} declined · ${scanStats.activeScannerCount} active scanner${scanStats.activeScannerCount !== 1 ? 's' : ''}`
              : `${qrScannedCount} scanned at gate`}
          </div>
          <div className="tile-delta up">
            <span>📲</span> Gate scanner live
          </div>
        </div>
      </div>

      {/* ==================== SELLER SALES BREAKDOWN ==================== */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div className="card-head" style={{ marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>🎯 Sales by Seller</h3>
            <div className="muted-sm">Who sold what, to whom, at what time — and how much ₹</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sellerSummary.map(seller => (
            <div key={seller.sellerId}>
              <div
                onClick={() => setExpandedSeller(expandedSeller === seller.sellerId ? null : seller.sellerId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line)',
                  borderRadius: '14px',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: seller.sellerId === 'SELLER-A' ? 'linear-gradient(135deg,#A855F7,#7C3AED)'
                      : seller.sellerId === 'SELLER-B' ? 'linear-gradient(135deg,#3B82F6,#1D4ED8)'
                      : seller.sellerId === 'SELLER-C' ? 'linear-gradient(135deg,#10B981,#047857)'
                      : 'linear-gradient(135deg,#F59E0B,#D97706)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 13, fontWeight: 800,
                  }}>
                    {seller.sellerId === 'Admin' ? 'A' : seller.sellerId.slice(-1)}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>
                      {seller.sellerId === 'littlane' ? 'Littlane Entertainment'
                        : seller.sellerId === 'nitro' ? 'Nitro Events'
                        : seller.sellerId === '7th-heaven' ? '7th Heaven'
                        : seller.sellerId === 'SELLER-A' ? 'Littlane Entertainment'
                        : seller.sellerId === 'SELLER-B' ? 'Nitro Events'
                        : seller.sellerId === 'SELLER-C' ? '7th Heaven'
                        : seller.sellerId}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 2 }}>
                      {seller.ticketCount} ticket{seller.ticketCount !== 1 ? 's' : ''} sold
                      {seller.lastSale ? ` · Last: ${new Date(seller.lastSale).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ' · No sales yet'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: seller.revenue > 0 ? '#22C55E' : 'var(--ink-faint)', fontFamily: 'monospace' }}>₹{seller.revenue.toLocaleString()}</div>
                    <div style={{ fontSize: 9, color: 'var(--ink-faint)', fontWeight: 700, letterSpacing: '0.05em' }}>REVENUE</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-faint)', transition: 'transform 0.2s', transform: expandedSeller === seller.sellerId ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</div>
                </div>
              </div>

              {/* Expanded: individual sales by this seller */}
              {expandedSeller === seller.sellerId && seller.sales.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 8 }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 80px 80px 60px',
                    padding: '6px 12px',
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--ink-faint)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    borderBottom: '1px solid var(--line)',
                    marginBottom: 4,
                  }}>
                    <span>Attendee</span>
                    <span>Email</span>
                    <span>Type</span>
                    <span style={{ textAlign: 'right' }}>Amount</span>
                    <span style={{ textAlign: 'right' }}>Time</span>
                  </div>
                  {seller.sales.map((s: any, i: number) => (
                    <div
                      key={s.orderId || i}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 80px 80px 60px',
                        alignItems: 'center',
                        padding: '8px 12px',
                        background: 'var(--panel)',
                        border: '1px solid var(--line)',
                        borderRadius: 10,
                        fontSize: 11,
                      }}
                    >
                      <span style={{ fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name || '—'}</span>
                      <span style={{ color: 'var(--ink-soft)', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.email || '—'}</span>
                      <span style={{ color: 'var(--ink-soft)', fontSize: 10 }}>{s.gender || s.ticketType || '—'}</span>
                      <span style={{ textAlign: 'right', fontWeight: 700, color: (s.gender || '').toLowerCase().includes('exclusive') ? 'var(--ink-faint)' : '#22C55E' }}>₹{(s.amount || 0).toLocaleString()}</span>
                      <span style={{ textAlign: 'right', color: 'var(--ink-faint)', fontSize: 9 }}>
                        {s.generatedAt ? new Date(s.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {expandedSeller === seller.sellerId && seller.sales.length === 0 && (
                <div style={{ padding: '12px 16px', color: 'var(--ink-faint)', fontSize: 12, textAlign: 'center' }}>
                  No sales recorded yet.
                </div>
              )}
            </div>
          ))}
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
                <div className="pill-toggle" style={{ marginLeft: '6px' }}>
                  <button
                    className={chartMode === 'actual' ? 'active' : ''}
                    onClick={() => setChartMode('actual')}
                  >
                    Actual
                  </button>
                  <button
                    className={chartMode === 'forecast' ? 'active' : ''}
                    onClick={() => setChartMode('forecast')}
                  >
                    Forecast
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
                    <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38D9C4" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#38D9C4" stopOpacity={0} />
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
                    formatter={(val: any) => [`₹${val}`, chartMode === 'actual' ? 'Revenue' : 'Forecast']}
                  />
                  <Area
                    type="monotone"
                    dataKey={chartMode === 'actual' ? 'revenue' : 'forecast'}
                    stroke={chartMode === 'actual' ? '#7C5CFA' : '#38D9C4'}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill={`url(#${chartMode === 'actual' ? 'areaGrad' : 'forecastGrad'})`}
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
                {eventBreakdown.map((item, idx) => (
                  <div className="tier-row" key={idx}>
                    <div className="h">
                      <span style={{ color: 'var(--ink)' }}>{item.name}</span>
                      <span className="muted">{item.count} passes ({item.pct}%)</span>
                    </div>
                    <div className="bar">
                      <div
                        className="fill"
                        style={{ width: `${Math.max(2, item.pct)}%`, background: item.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="right-col">
          {/* Creative Event Overview Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
            {/* Event 1: Dholida Garba Royale Male */}
            <div
              className="card lt-hover-lift"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                setPopupEvent({ name: 'freshers male', top: rect.top + window.scrollY, left: rect.left - 520 })
              }}
              style={{
                cursor: 'pointer',
                background: 'linear-gradient(135deg, rgba(108, 76, 224, 0.12) 0%, rgba(59, 99, 232, 0.03) 100%)',
                border: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '15px' }}>🎉</span>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Dholida Garba Royale (Male)</h4>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--ink-soft)' }}>Male Passes Sold</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#7C5CFA', fontFamily: 'monospace' }}>{maleCount}</div>
                <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--ink-faint)', letterSpacing: '0.05em' }}>SOLD</div>
              </div>
            </div>

            {/* Event 2: Dholida Garba Royale Female */}
            <div
              className="card lt-hover-lift"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                setPopupEvent({ name: 'freshers female', top: rect.top + window.scrollY, left: rect.left - 520 })
              }}
              style={{
                cursor: 'pointer',
                background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.12) 0%, rgba(244, 63, 94, 0.03) 100%)',
                border: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '15px' }}>👩</span>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Dholida Garba Royale (Female)</h4>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--ink-soft)' }}>Female Passes Sold</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#EC4899', fontFamily: 'monospace' }}>{femaleCount}</div>
                <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--ink-faint)', letterSpacing: '0.05em' }}>SOLD</div>
              </div>
            </div>

            {/* Event 3: Aura Genesis */}
            <div
              className="card lt-hover-lift"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                setPopupEvent({ name: 'aura genesis', top: rect.top + window.scrollY, left: rect.left - 520 })
              }}
              style={{
                cursor: 'pointer',
                background: 'linear-gradient(135deg, rgba(56, 217, 196, 0.12) 0%, rgba(59, 130, 246, 0.03) 100%)',
                border: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '15px' }}>✨</span>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Aura Genesis</h4>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--ink-soft)' }}>Electronic Skyline Showcase</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#38D9C4', fontFamily: 'monospace' }}>{auraCount}</div>
                <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--ink-faint)', letterSpacing: '0.05em' }}>SOLD</div>
              </div>
            </div>

            {/* Event 4: FT Lineup Invite */}
            <div
              className="card lt-hover-lift"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                setPopupEvent({ name: 'ft lineup invite', top: rect.top + window.scrollY, left: rect.left - 520 })
              }}
              style={{
                cursor: 'pointer',
                background: 'linear-gradient(135deg, rgba(245, 197, 66, 0.12) 0%, rgba(245, 133, 77, 0.03) 100%)',
                border: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '15px' }}>⭐</span>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>FT Lineup Invite</h4>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--ink-soft)' }}>VIP Exclusive Passes</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#F5B942', fontFamily: 'monospace' }}>{inviteCount}</div>
                <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--ink-faint)', letterSpacing: '0.05em' }}>SOLD</div>
              </div>
            </div>
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
                  {popupEvent.name === 'freshers male' ? '🎉 Dholida Garba Royale (Male)' : popupEvent.name === 'freshers female' ? '👩 Dholida Garba Royale (Female)' : popupEvent.name === 'aura genesis' ? '✨ Aura Genesis' : '⭐ FT Lineup Invite'} — Buyers
                </h3>
                <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '4px' }}>
                  {(() => {
                    const list = popupEvent.name === 'freshers male'
                       ? paidSales.filter(s => !(s.gender || '').toLowerCase().includes('exclusive') && !(s.event || '').toUpperCase().includes('AURA') && (s.gender === 'male' || (s.ticketType || '').toLowerCase().includes('male')))
                       : popupEvent.name === 'freshers female'
                       ? paidSales.filter(s => !(s.gender || '').toLowerCase().includes('exclusive') && !(s.event || '').toUpperCase().includes('AURA') && (s.gender === 'female' || (s.ticketType || '').toLowerCase().includes('female')))
                       : popupEvent.name === 'aura genesis'
                       ? paidSales.filter(s => (s.event || '').toUpperCase().includes('AURA'))
                       : paidSales.filter(s => (s.gender || '').toLowerCase().includes('exclusive') || (s.ticketType || '').toLowerCase().includes('exclusive'))
                    return `${list.length} ticket buyers`
                  })()}
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
                const list = popupEvent.name === 'freshers male'
                  ? paidSales.filter(s => !(s.gender || '').toLowerCase().includes('exclusive') && !(s.event || '').toUpperCase().includes('AURA') && (s.gender === 'male' || (s.ticketType || '').toLowerCase().includes('male')))
                  : popupEvent.name === 'freshers female'
                  ? paidSales.filter(s => !(s.gender || '').toLowerCase().includes('exclusive') && !(s.event || '').toUpperCase().includes('AURA') && (s.gender === 'female' || (s.ticketType || '').toLowerCase().includes('female')))
                  : popupEvent.name === 'aura genesis'
                  ? paidSales.filter(s => (s.event || '').toUpperCase().includes('AURA'))
                  : paidSales.filter(s => (s.gender || '').toLowerCase().includes('exclusive') || (s.ticketType || '').toLowerCase().includes('exclusive'))

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
                        background: popupEvent.name === 'freshers male' ? 'var(--grad-violet)' : popupEvent.name === 'freshers female' ? 'linear-gradient(135deg, #EC4899 0%, #F43F5E 100%)' : popupEvent.name === 'aura genesis' ? 'var(--grad-teal)' : 'var(--grad-gold)',
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
