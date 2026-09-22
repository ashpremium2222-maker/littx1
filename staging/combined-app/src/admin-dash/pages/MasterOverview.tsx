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
    revenueAfterCommission?: number
    netCompanyRevenue: number
  }
}

interface SellerPartner {
  id: string
  name: string
  active: boolean
  configured: boolean
}

function normalizePartnerKey(value: string) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function saleAmount(sale: any) {
  const amount = Number(sale.customerTotal ?? sale.amount ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

export default function MasterOverview() {
  const [companies, setCompanies] = useState<CompanySummary[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [sellerPartners, setSellerPartners] = useState<SellerPartner[]>([])
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null)
  const [openingPartnerId, setOpeningPartnerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    try {
      const [compRes, salesRes, partnersRes] = await Promise.all([
        fetch('/api/master/companies'),
        fetch('/api/admin/sales'),
        fetch('/api/seller/partners', { cache: 'no-store' })
      ])

      const compData = await compRes.json()
      const salesData = await salesRes.json()
      const partnersData = await partnersRes.json()

      if (compData.success) setCompanies(compData.companies || [])
      if (salesData.success) setSales(salesData.sales || [])
      if (partnersData.success) setSellerPartners(partnersData.partners || [])
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
  const totalRevenueAfterCommission = companies.reduce((sum, c) => sum + (c.stats?.revenueAfterCommission ?? c.stats?.platformFee ?? 0), 0)
  const totalTicketsSold = companies.reduce((sum, c) => sum + (c.stats?.ticketCount || 0), 0)
  const visibleSellerPartners = sellerPartners.filter(partner => partner.active)

  const sellerStats = (partner: SellerPartner) => {
    const partnerKeys = new Set([
      normalizePartnerKey(partner.id),
      normalizePartnerKey(partner.name),
    ])
    const partnerSales = sales.filter(sale => {
      const saleKeys = [
        sale.sellerId,
        sale.generatedBy,
        sale.prUserId,
      ].map(value => normalizePartnerKey(String(value || '')))
      return saleKeys.some(key => partnerKeys.has(key))
    })
    return {
      orders: partnerSales.length,
      tickets: partnerSales.reduce((sum, sale) => sum + (Number(sale.quantity) || 1), 0),
      revenue: partnerSales.reduce((sum, sale) => sum + saleAmount(sale), 0),
    }
  }

  const openSellerPanel = async (partner: SellerPartner) => {
    const token = sessionStorage.getItem('littx_token') || localStorage.getItem('littx_token') || ''
    if (!token) {
      alert('Master admin session expired. Please login again.')
      return
    }

    setOpeningPartnerId(partner.id)
    try {
      const response = await fetch(`/api/master/seller-access/${encodeURIComponent(partner.id)}`, {
        method: 'POST',
        headers: { 'x-auth-token': token }
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        alert(data.message || 'Unable to open seller panel.')
        return
      }
      localStorage.setItem('littx_seller_token', data.token)
      localStorage.setItem('littx_seller_partner', JSON.stringify(data.partner))
      window.open('/seller', '_blank', 'noopener,noreferrer')
    } catch {
      alert('Unable to open seller panel.')
    } finally {
      setOpeningPartnerId(null)
    }
  }

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
          <div className="tile-label">REVENUE AFTER COMMISSION</div>
          <div className="tile-value">₹{totalRevenueAfterCommission.toLocaleString()}</div>
          <div className="tile-sub">Ticket revenue after seller commission</div>
          <div className="tile-delta">
            <span>💰</span> Net After Commission
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
                <th>Revenue After Commission</th>
                <th>Seller Commission</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <React.Fragment key={c.companyId}>
                  <tr
                    onClick={() => setExpandedCompanyId(expandedCompanyId === c.companyId ? null : c.companyId)}
                    style={{ cursor: 'pointer' }}
                  >
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
                    <td style={{ fontWeight: 800, color: 'var(--volt)' }}>₹{(c.stats?.revenueAfterCommission ?? c.stats?.platformFee ?? 0).toLocaleString()}</td>
                    <td style={{ fontWeight: 700, color: 'var(--green)' }}>₹{(c.stats?.netCompanyRevenue || 0).toLocaleString()}</td>
                  </tr>
                  {expandedCompanyId === c.companyId && (
                    <tr>
                      <td colSpan={7} style={{ padding: '0 16px 18px', background: 'rgba(255,255,255,0.015)' }}>
                        <div style={{ border: '1px solid var(--line)', borderRadius: '14px', padding: '14px', marginTop: '10px', background: 'var(--panel-2)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>/seller company access</div>
                              <div className="muted-sm">Master admin can open a partner panel and punch tickets under that company only.</div>
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--ink-faint)', fontFamily: 'monospace' }}>{visibleSellerPartners.length} active</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {visibleSellerPartners.map(partner => {
                              const stats = sellerStats(partner)
                              return (
                                <div
                                  key={partner.id}
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(180px, 1.2fr) 100px 130px 150px',
                                    gap: '12px',
                                    alignItems: 'center',
                                    padding: '10px 12px',
                                    border: '1px solid var(--line)',
                                    borderRadius: '12px',
                                    background: 'var(--panel)'
                                  }}
                                >
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink)' }}>{partner.name}</div>
                                    <div style={{ fontSize: '10px', color: 'var(--ink-faint)', fontFamily: 'monospace' }}>{partner.id}</div>
                                  </div>
                                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>{stats.tickets} tickets</div>
                                  <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink)' }}>₹{stats.revenue.toLocaleString()}</div>
                                  <button
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      openSellerPanel(partner)
                                    }}
                                    disabled={openingPartnerId === partner.id}
                                    className="btn-secondary"
                                    style={{ height: '34px', fontSize: '11px', padding: '0 12px' }}
                                  >
                                    {openingPartnerId === partner.id ? 'Opening…' : '🔎 Open panel'}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
