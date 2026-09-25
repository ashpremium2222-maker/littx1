import { useCallback, useEffect, useMemo, useState } from 'react'

interface DashboardSale {
  saleKey: string
  orderId: string
  ticketId: string
  sellerId: string
  sellerName: string
  companyId: string
  companyName: string
  attendee: string
  passName: string
  quantity: number
  grossRevenue: number
  soldAt: string | null
  included: boolean
}

interface Props {
  adminKey: string
}

interface CompanyDirectoryEntry {
  companyId: string
  name: string
  status: string
  stats?: { eventCount?: number; ticketCount?: number; grossRevenue?: number; activePRs?: number }
}

const formatINR = (amount: number) => `₹${(Number(amount) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

export default function DashboardSaleVisibility({ adminKey }: Props) {
  const [sales, setSales] = useState<DashboardSale[]>([])
  const [directory, setDirectory] = useState<CompanyDirectoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [selectedSaleKeys, setSelectedSaleKeys] = useState<string[]>([])
  const headers = { 'x-auth-token': adminKey, 'x-admin-key': adminKey }

  const companyGroups = useMemo(() => {
    const groups = new Map<string, { companyId: string; companyName: string; sales: DashboardSale[] }>()
    directory.forEach(company => groups.set(company.companyId, { companyId: company.companyId, companyName: company.name, sales: [] }))
    sales.forEach(sale => {
      const group = groups.get(sale.companyId) || { companyId: sale.companyId, companyName: sale.companyName, sales: [] }
      group.sales.push(sale)
      groups.set(sale.companyId, group)
    })
    return [...groups.values()].sort((a, b) => a.companyName.localeCompare(b.companyName))
  }, [sales, directory])

  const activeCompany = companyGroups.find(group => group.companyId === selectedCompanyId) || null
  const selectedSales = activeCompany?.sales.filter(sale => selectedSaleKeys.includes(sale.saleKey)) || []
  const allSelected = Boolean(activeCompany?.sales.length && selectedSales.length === activeCompany.sales.length)

  const load = useCallback(async () => {
    setLoading(true)
    setNotice('')
    try {
      const [response, companyResponse] = await Promise.all([
        fetch('/api/admin/dashboard-sale-visibility', { headers: { ...headers }, cache: 'no-store' }),
        fetch('/api/master/companies', { headers: { ...headers }, cache: 'no-store' }),
      ])
      const [data, companyData] = await Promise.all([response.json(), companyResponse.json()])
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not load ticket sales.')
      if (companyResponse.ok && companyData.success) setDirectory(companyData.companies || [])
      setSales(data.sales || [])
      setSelectedSaleKeys([])
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load ticket sales.')
    } finally {
      setLoading(false)
    }
  }, [adminKey])

  useEffect(() => { void load() }, [load])

  const setAllSelected = (checked: boolean) => {
    if (!activeCompany) return
    setSelectedSaleKeys(checked ? activeCompany.sales.map(sale => sale.saleKey) : [])
  }

  const toggleSelected = (saleKey: string) => {
    setSelectedSaleKeys(current => current.includes(saleKey)
      ? current.filter(key => key !== saleKey)
      : [...current, saleKey])
  }

  const updateSelected = async (included: boolean) => {
    if (saving || selectedSales.length === 0) return
    const keys = selectedSales.map(sale => sale.saleKey)
    const previous = sales
    setSaving(true)
    setNotice('')
    setSales(current => current.map(sale => keys.includes(sale.saleKey) ? { ...sale, included } : sale))
    setSelectedSaleKeys([])
    try {
      const response = await fetch('/api/admin/dashboard-sale-visibility/bulk', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleKeys: keys, included }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not update selected ticket sales.')
      const updatedByKey = new Map((data.sales as DashboardSale[]).map(sale => [sale.saleKey, sale]))
      setSales(current => current.map(sale => updatedByKey.get(sale.saleKey) || sale))
      setNotice(`${keys.length} sale${keys.length === 1 ? '' : 's'} ${included ? 'shown on' : 'hidden from'} the dashboard.`)
    } catch (error) {
      setSales(previous)
      setNotice(error instanceof Error ? error.message : 'Could not update selected ticket sales.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Dashboard Ticket Sales</h2>
          <div className="muted-sm">Choose a company, then manage which sales appear in dashboard totals.</div>
        </div>
        <button className="btn-secondary" type="button" onClick={() => void load()} disabled={loading || saving}>Refresh</button>
      </div>

      {notice && <p className="muted-sm" role="status" style={{ margin: '12px 18px 0' }}>{notice}</p>}

      {activeCompany ? (
        <div style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn-secondary" type="button" onClick={() => { setSelectedCompanyId(null); setSelectedSaleKeys([]) }} aria-label="Back to companies">← Companies</button>
              <div>
                <h3 style={{ margin: 0 }}>{activeCompany.companyName}</h3>
                <div className="muted-sm" style={{ marginTop: 3 }}>{activeCompany.sales.length} sales · {activeCompany.sales.reduce((sum, sale) => sum + sale.quantity, 0)} tickets</div>
              </div>
            </div>
              <button className="btn-secondary" type="button" disabled={saving || activeCompany.sales.length === 0} onClick={() => setAllSelected(!allSelected)}>
              {allSelected ? 'Clear selection' : 'Select all'}
            </button>
          </div>

          {selectedSaleKeys.length > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', padding: '11px 12px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
            <strong style={{ marginRight: 'auto', fontSize: 13 }}>{selectedSaleKeys.length} selected</strong>
            <button className="btn-secondary" type="button" disabled={saving || selectedSales.every(sale => !sale.included)} onClick={() => void updateSelected(false)}>
              {saving ? 'Updating…' : '🙈 Hide from dashboard'}
            </button>
            <button className="btn-secondary" type="button" disabled={saving || selectedSales.every(sale => sale.included)} onClick={() => void updateSelected(true)}>
              {saving ? 'Updating…' : '👁️ Show on dashboard'}
            </button>
          </div>}

          <div className="table-scroll scroll">
            <table className="table">
              <thead><tr>
                <th aria-label="Select sale" />
                <th>Attendee / ticket</th>
                <th>Pass</th>
                <th>Quantity</th>
                <th>Sale amount</th>
                <th>Dashboard</th>
              </tr></thead>
              <tbody>
                {activeCompany.sales.map(sale => (
                  <tr key={sale.saleKey}>
                    <td><input type="checkbox" aria-label={`Select sale for ${sale.attendee}`} checked={selectedSaleKeys.includes(sale.saleKey)} disabled={saving} onChange={() => toggleSelected(sale.saleKey)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} /></td>
                    <td><div style={{ fontWeight: 650 }}>{sale.attendee}</div><div className="muted-sm">{sale.ticketId || sale.orderId}</div></td>
                    <td>{sale.passName}</td>
                    <td>{sale.quantity}</td>
                    <td>{formatINR(sale.grossRevenue)}</td>
                    <td><span className={`badge badge-${sale.included ? 'green' : 'amber'}`}>{sale.included ? 'Shown' : 'Hidden'}</span></td>
                  </tr>
                ))}
                {activeCompany.sales.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>No ticket sales for this company.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="table-scroll scroll" style={{ marginTop: 14 }}>
          {loading && companyGroups.length === 0 ? <div className="muted-sm" style={{ padding: 22, textAlign: 'center' }}>Loading companies…</div> : companyGroups.length === 0 ? <div className="muted-sm" style={{ padding: 22, textAlign: 'center' }}>No companies available.</div> : <table className="table">
            <thead><tr><th>Company Name</th><th>Status</th><th>Events</th><th>Tickets Sold</th><th>Gross Revenue</th><th>PR Network</th><th>Action / Drill Down</th></tr></thead>
            <tbody>{companyGroups.map(group => {
              const company = directory.find(item => item.companyId === group.companyId)
              const stats = company?.stats
              const actualTickets = stats?.ticketCount ?? group.sales.reduce((sum, sale) => sum + sale.quantity, 0)
              const actualRevenue = stats?.grossRevenue ?? group.sales.reduce((sum, sale) => sum + sale.grossRevenue, 0)
              return <tr key={group.companyId}>
                <td style={{ fontWeight: 700, color: 'var(--ink)' }}><div>{group.companyName}</div><div className="muted-sm" style={{ fontFamily: 'monospace' }}>ID: {group.companyId}</div></td>
                <td><span className={`badge badge-${company?.status === 'ACTIVE' || !company ? 'green' : 'amber'}`}>{company?.status || 'ACTIVE'}</span></td>
                <td>{stats?.eventCount ?? '—'}</td>
                <td style={{ fontWeight: 700 }}>{actualTickets}</td>
                <td style={{ fontWeight: 750 }}>{formatINR(actualRevenue)}</td>
                <td>{stats?.activePRs ?? '—'} Active PRs</td>
                <td><button className="btn-secondary" type="button" onClick={() => { setSelectedSaleKeys([]); setSelectedCompanyId(group.companyId) }}>🔍 View Company Sales</button></td>
              </tr>
            })}</tbody>
          </table>}
        </div>
      )}
    </section>
  )
}
