import React, { useState, useEffect } from 'react'

interface MasterCompaniesTableProps {
  onSelectCompany: (companyId: string, companyName: string) => void
}

export default function MasterCompaniesTable({ onSelectCompany }: MasterCompaniesTableProps) {
  const [companies, setCompanies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCompanies = async () => {
    try {
      const res = await fetch('/api/master/companies')
      const data = await res.json()
      if (data.success) {
        setCompanies(data.companies || [])
      }
    } catch (err) {
      console.error('Failed to fetch companies table:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCompanies()
  }, [])

  if (loading) {
    return <div style={{ padding: '40px', color: 'var(--ink-faint)', textAlign: 'center' }}>Loading Event Companies Directory…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="card" style={{ background: 'linear-gradient(135deg, #0F0D1A 0%, #0A0912 100%)', border: '1px solid rgba(216,255,63,0.2)' }}>
        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--volt)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          PLATFORM TENANTS DIRECTORY
        </div>
        <h2 style={{ margin: '4px 0 0', fontSize: '1.4rem', color: 'var(--ink)' }}>Event Companies Directory & Multi-Tenant Management</h2>
      </div>

      <div className="card table-card">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Status</th>
                <th>Events</th>
                <th>Tickets Sold</th>
                <th>Gross Revenue</th>
                <th>PR Network</th>
                <th>Action / Drill Down</th>
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
                  <td style={{ fontWeight: 700 }}>{c.stats?.totalOrders || 0}</td>
                  <td style={{ fontWeight: 700 }}>{c.stats?.ticketCount || 0}</td>
                  <td style={{ fontWeight: 800, color: 'var(--ink)' }}>₹{(c.stats?.grossRevenue || 0).toLocaleString()}</td>
                  <td>5 Active PRs</td>
                  <td>
                    <button
                      className="btn btn-volt btn-sm"
                      onClick={() => onSelectCompany(c.companyId, c.name)}
                      style={{ fontSize: '11px', padding: '6px 12px' }}
                    >
                      🔍 View Company System
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
