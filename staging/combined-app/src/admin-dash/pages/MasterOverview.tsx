import React, { useState, useEffect } from 'react'

interface CompanySummary {
  companyId: string
  name: string
  status: string
  stats?: {
    totalOrders: number
    ticketCount: number
    grossRevenue: number
    platformFee: number
    netCompanyRevenue: number
  }
}

export default function MasterOverview() {
  const [companies, setCompanies] = useState<CompanySummary[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    try {
      const [compRes, salesRes] = await Promise.all([
        fetch('/api/master/companies'),
        fetch('/api/admin/sales')
      ])

      const compData = await compRes.json()
      const salesData = await salesRes.json()

      if (compData.success) setCompanies(compData.companies || [])
      if (salesData.success) setSales(salesData.sales || [])
    } catch (err) {
      console.error('Failed to load master overview data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const activeCompanies = companies.filter(c => c.status === 'ACTIVE').length
  const suspendedCompanies = companies.filter(c => c.status === 'SUSPENDED').length

  const totalGrossRevenue = companies.reduce((sum, c) => sum + (c.stats?.grossRevenue || 0), 0)
  const totalPlatformFees = companies.reduce((sum, c) => sum + (c.stats?.platformFee || 0), 0)
  const totalTicketsSold = companies.reduce((sum, c) => sum + (c.stats?.ticketCount || 0), 0)

  if (loading) {
    return <div style={{ padding: '40px', color: 'var(--ink-faint)', textAlign: 'center' }}>Loading Master Platform Overview…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Master Overview KPI Tiles */}
      <div className="kpi-row">
        <div className="tile tile-violet">
          <div className="tile-label">TOTAL EVENT COMPANIES</div>
          <div className="tile-value">{companies.length}</div>
          <div className="tile-sub">{activeCompanies} active · {suspendedCompanies} suspended</div>
          <div className="tile-delta">
            <span>🏛️</span> Platform Tenants
          </div>
        </div>

        <div className="tile tile-teal">
          <div className="tile-label">PLATFORM GROSS REVENUE</div>
          <div className="tile-value">₹{totalGrossRevenue.toLocaleString()}</div>
          <div className="tile-sub">Across all event companies</div>
          <div className="tile-delta">
            <span>📈</span> Total GMV
          </div>
        </div>

        <div className="tile tile-orange">
          <div className="tile-label">LITTX FEE REVENUE</div>
          <div className="tile-value">₹{totalPlatformFees.toLocaleString()}</div>
          <div className="tile-sub">Platform commission earned</div>
          <div className="tile-delta">
            <span>💰</span> Net Platform Earnings
          </div>
        </div>

        <div className="tile tile-gold">
          <div className="tile-label">TOTAL TICKETS ISSUED</div>
          <div className="tile-value">{totalTicketsSold}</div>
          <div className="tile-sub">Confirmed pass deliveries</div>
          <div className="tile-delta">
            <span>🎟️</span> Platform Total
          </div>
        </div>
      </div>

      {/* Companies Leaderboard */}
      <div className="card table-card">
        <div className="card-head" style={{ padding: '18px 18px 0' }}>
          <h3>Event Companies Performance & Commercial Split</h3>
          <div className="muted-sm">Live revenue & platform fee summary by tenant</div>
        </div>

        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Status</th>
                <th>Orders</th>
                <th>Tickets Sold</th>
                <th>Gross Revenue</th>
                <th>LITTX Platform Fee</th>
                <th>Net Company Payout</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.companyId}>
                  <td style={{ fontWeight: 700, color: 'var(--ink)' }}>
                    <div>{c.name}</div>
                    <div style={{ fontSize: '10px', color: 'var(--ink-faint)', fontFamily: 'monospace' }}>ID: {c.companyId}</div>
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '9.5px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        background: c.status === 'ACTIVE' ? 'rgba(61,220,132,0.12)' : 'rgba(255,107,107,0.12)',
                        color: c.status === 'ACTIVE' ? 'var(--green)' : 'var(--red)',
                        border: `1px solid ${c.status === 'ACTIVE' ? 'rgba(61,220,132,0.25)' : 'rgba(255,107,107,0.25)'}`
                      }}
                    >
                      ● {c.status}
                    </span>
                  </td>
                  <td>{c.stats?.totalOrders || 0}</td>
                  <td style={{ fontWeight: 700 }}>{c.stats?.ticketCount || 0}</td>
                  <td style={{ fontWeight: 800, color: 'var(--ink)' }}>₹{(c.stats?.grossRevenue || 0).toLocaleString()}</td>
                  <td style={{ fontWeight: 800, color: 'var(--volt)' }}>₹{(c.stats?.platformFee || 0).toLocaleString()}</td>
                  <td style={{ fontWeight: 700, color: 'var(--green)' }}>₹{(c.stats?.netCompanyRevenue || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
