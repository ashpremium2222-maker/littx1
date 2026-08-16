import { useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'

interface Sale {
  orderId: string
  name: string
  email: string
  amount: number
  quantity: number
  status: string
  gender?: string
  ticketId?: string
  createdAt: string
  paidAt?: string
  scannedAt?: string
  emailStatus?: string
}

interface Props {
  sales: Sale[]
}

const COLORS = ['#7C5CFA', '#38D9C4', '#F5B942', '#FF6B6B', '#5B8DEF']

export default function Analytics({ sales = [] }: Props) {
  const [activeMetric, setActiveMetric] = useState<'Revenue' | 'Orders' | 'Tickets'>('Revenue')
  const [activePeriod, setActivePeriod] = useState<'Today' | '7D'>('7D')

  const paid = sales.filter((s) =>
    ['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'].includes(s.status)
  )

  const chartData = []
  const now = new Date()

  if (activePeriod === '7D') {
    const dayMap = new Map<string, { revenue: number; orders: number; tickets: number }>()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = d.toLocaleDateString('en-IN', { weekday: 'short' })
      dayMap.set(key, { revenue: 0, orders: 0, tickets: 0 })
    }
    paid.forEach((s) => {
      const d = new Date(s.paidAt || s.createdAt)
      const key = d.toLocaleDateString('en-IN', { weekday: 'short' })
      if (dayMap.has(key)) {
        const cur = dayMap.get(key)!
        cur.revenue += s.amount || 0
        cur.orders += 1
        cur.tickets += s.quantity || 1
      }
    })
    chartData.push(...Array.from(dayMap.entries()).map(([time, v]) => ({ time, ...v })))
  } else {
    const todayStr = now.toDateString()
    const blocks = ['12am', '3am', '6am', '9am', '12pm', '3pm', '6pm', '9pm']
    const blockMap = new Map<string, { revenue: number; orders: number; tickets: number }>()
    blocks.forEach((b) => blockMap.set(b, { revenue: 0, orders: 0, tickets: 0 }))

    paid.forEach((s) => {
      const d = new Date(s.paidAt || s.createdAt)
      if (d.toDateString() === todayStr) {
        const hour = d.getHours()
        const blockIndex = Math.floor(hour / 3)
        const key = blocks[blockIndex]
        if (blockMap.has(key)) {
          const cur = blockMap.get(key)!
          cur.revenue += s.amount || 0
          cur.orders += 1
          cur.tickets += s.quantity || 1
        }
      }
    })
    chartData.push(...Array.from(blockMap.entries()).map(([time, v]) => ({ time, ...v })))
  }

  const activeColor =
    activeMetric === 'Revenue' ? '#7C5CFA' : activeMetric === 'Orders' ? '#38D9C4' : '#F5B942'
  const activeKey = activeMetric.toLowerCase() as 'revenue' | 'orders' | 'tickets'

  // Ticket type breakdown
  const typeCount: Record<string, number> = {}
  paid.forEach((s) => {
    const type =
      s.gender === 'male'
        ? 'Male Pass'
        : s.gender === 'female'
        ? 'Female Pass'
        : String(s.gender || '').toLowerCase().includes('exclusive')
        ? 'VIP Invite'
        : 'General'
    typeCount[type] = (typeCount[type] || 0) + 1
  })
  const total = Object.values(typeCount).reduce((a, b) => a + b, 0) || 1
  const ticketTypes = Object.entries(typeCount).map(([name, count], i) => ({
    name,
    value: Math.round((count / total) * 100),
    color: COLORS[i % COLORS.length],
  }))

  const totalRevenue = paid.reduce((a, s) => a + (s.amount || 0), 0)
  const totalOrders = sales.length
  const scanned = sales.filter((s) => s.scannedAt || s.status === 'scanned').length
  const emailDelivered = sales.filter((s) => s.emailStatus === 'sent').length
  const avgOrderValue = paid.length > 0 ? Math.round(totalRevenue / paid.length) : 0
  const scanRate = paid.length > 0 ? ((scanned / paid.length) * 100).toFixed(1) : '0.0'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gutter)' }}>
      {/* Reference KPI Stat Tiles */}
      <div className="kpi-row">
        <div className="tile tile-orange">
          <div className="tile-label">TOTAL REVENUE</div>
          <div className="tile-value">₹{totalRevenue.toLocaleString()}</div>
          <div className="tile-sub">From {paid.length} paid transactions</div>
          <div className="tile-delta">
            <span>↑</span> ₹{avgOrderValue.toLocaleString()} AOV
          </div>
        </div>

        <div className="tile tile-teal">
          <div className="tile-label">PAID PASSES</div>
          <div className="tile-value">{paid.length}</div>
          <div className="tile-sub">Out of {totalOrders} total orders</div>
          <div className="tile-delta">
            <span>🎟</span> Confirmed booking
          </div>
        </div>

        <div className="tile tile-gold">
          <div className="tile-label">QR SCAN RATE</div>
          <div className="tile-value">{scanRate}%</div>
          <div className="tile-sub">{scanned} passes validated</div>
          <div className="tile-delta">
            <span>✓</span> Gate validated
          </div>
        </div>

        <div className="tile tile-dark">
          <div className="tile-label">EMAILS DELIVERED</div>
          <div className="tile-value">{emailDelivered}</div>
          <div className="tile-sub">Sent via SMTP</div>
          <div className="tile-delta up">
            <span>↑</span> 100% active
          </div>
        </div>
      </div>

      {/* Main Chart Row */}
      <div className="main-row">
        <div className="left-col">
          <div className="card chart-card">
            <div className="card-head">
              <div>
                <h3>Analytics Trend</h3>
                <div className="muted-sm">Performance metrics breakdown</div>
              </div>

              <div className="card-head-actions">
                <div className="pill-toggle">
                  {(['Revenue', 'Orders', 'Tickets'] as const).map((m) => (
                    <button
                      key={m}
                      className={activeMetric === m ? 'active' : ''}
                      onClick={() => setActiveMetric(m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                <div className="pill-toggle" style={{ marginLeft: '6px' }}>
                  {(['Today', '7D'] as const).map((p) => (
                    <button
                      key={p}
                      className={activePeriod === p ? 'active' : ''}
                      onClick={() => setActivePeriod(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ height: '260px', width: '100%', marginTop: '10px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="metricGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={activeColor} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={activeColor} stopOpacity={0} />
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
                    tickFormatter={(v) => (activeMetric === 'Revenue' ? `₹${v}` : v)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#181A24',
                      borderColor: 'rgba(255,255,255,0.08)',
                      borderRadius: '10px',
                      color: '#F5F4F8',
                      fontSize: '12px',
                    }}
                    formatter={(val: any) => [
                      activeMetric === 'Revenue' ? `₹${val}` : val,
                      activeMetric,
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey={activeKey}
                    stroke={activeColor}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#metricGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="right-col">
          <div className="card">
            <div className="card-head">
              <h3>Pass Category Share</h3>
            </div>

            <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ticketTypes}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {ticketTypes.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#181A24',
                      borderColor: 'rgba(255,255,255,0.08)',
                      borderRadius: '10px',
                      color: '#F5F4F8',
                      fontSize: '12px',
                    }}
                    formatter={(val: any) => [`${val}%`, 'Share']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
              {ticketTypes.map((t, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    color: 'var(--ink-soft)',
                    background: 'var(--panel-2)',
                    padding: '4px 10px',
                    borderRadius: '99px',
                    border: '1px solid var(--line)',
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: t.color,
                    }}
                  />
                  {t.name}: <b>{t.value}%</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
