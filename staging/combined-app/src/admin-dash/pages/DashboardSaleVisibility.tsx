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

const formatINR = (amount: number) => `₹${(Number(amount) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

export default function DashboardSaleVisibility({ adminKey }: Props) {
  const [sales, setSales] = useState<DashboardSale[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(() => new Set())
  const headers = { 'x-auth-token': adminKey, 'x-admin-key': adminKey }
  const companyGroups = useMemo(() => {
    const groups = new Map<string, { companyId: string; companyName: string; sales: DashboardSale[] }>()
    sales.forEach(sale => {
      const group = groups.get(sale.companyId) || { companyId: sale.companyId, companyName: sale.companyName, sales: [] }
      group.sales.push(sale)
      groups.set(sale.companyId, group)
    })
    return [...groups.values()].sort((a, b) => a.companyName.localeCompare(b.companyName))
  }, [sales])

  const load = useCallback(async () => {
    setLoading(true)
    setNotice('')
    try {
      const response = await fetch('/api/admin/dashboard-sale-visibility', { headers: { ...headers } })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not load ticket sales.')
      setSales(data.sales || [])
      setExpandedCompanies(new Set())
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load ticket sales.')
    } finally {
      setLoading(false)
    }
  }, [adminKey])

  useEffect(() => { void load() }, [load])

  const toggle = async (sale: DashboardSale) => {
    setSavingKey(sale.saleKey)
    setNotice('')
    try {
      const response = await fetch(`/api/admin/dashboard-sale-visibility/${encodeURIComponent(sale.saleKey)}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ included: !sale.included }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not update this ticket sale.')
      setSales(current => current.map(item => item.saleKey === sale.saleKey ? { ...item, included: data.sale.included } : item))
      setNotice(`${sale.sellerName}: this sale is now ${data.sale.included ? 'included in' : 'excluded from'} dashboard totals.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update this ticket sale.')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Dashboard Ticket Sales</h2>
          <div className="muted-sm">Open an event company to review its sales. Excluding a sale removes only its tickets and revenue from /dashboard totals.</div>
        </div>
        <button className="btn-secondary" type="button" onClick={() => void load()} disabled={loading}>Refresh</button>
      </div>
      {notice && <p className="muted-sm" role="status" style={{ marginTop: 12 }}>{notice}</p>}
      <div className="table-scroll scroll" style={{ marginTop: 16 }}>
        <table className="table">
          <thead><tr><th>Event company / seller</th><th>Attendee / order</th><th>Pass</th><th>Quantity</th><th>Sale amount</th><th>Dashboard</th><th>Action</th></tr></thead>
          {companyGroups.map(group => {
              const expanded = expandedCompanies.has(group.companyId)
              const includedSales = group.sales.filter(sale => sale.included)
              const includedQuantity = includedSales.reduce((total, sale) => total + sale.quantity, 0)
              const includedRevenue = includedSales.reduce((total, sale) => total + sale.grossRevenue, 0)
              return (
                <tbody key={group.companyId}>
                  <tr>
                    <td colSpan={2}>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setExpandedCompanies(current => {
                          const next = new Set(current)
                          if (next.has(group.companyId)) next.delete(group.companyId)
                          else next.add(group.companyId)
                          return next
                        })}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 10, border: 0, padding: 0, background: 'none', color: 'var(--ink)', font: 'inherit', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 140ms ease' }}><path d="m9 18 6-6-6-6" /></svg>
                        <span>{group.companyName}<span className="muted-sm" style={{ display: 'block', fontWeight: 400 }}>{group.companyId}</span></span>
                      </button>
                    </td>
                    <td>{group.sales.length} sales</td>
                    <td>{includedQuantity} included</td>
                    <td>{formatINR(includedRevenue)} included</td>
                    <td>{includedSales.length} included</td>
                    <td className="muted-sm">{expanded ? 'Collapse' : 'View sales'}</td>
                  </tr>
                  {expanded && group.sales.map(sale => (
                    <tr key={sale.saleKey}>
                      <td>{sale.sellerName}<div className="muted-sm">ID: {sale.sellerId}</div></td>
                      <td>{sale.attendee}<div className="muted-sm">{sale.orderId || sale.ticketId}</div></td>
                      <td>{sale.passName}</td>
                      <td>{sale.quantity}</td>
                      <td>{formatINR(sale.grossRevenue)}</td>
                      <td><span className={`badge badge-${sale.included ? 'green' : 'amber'}`}>{sale.included ? 'Included' : 'Excluded'}</span></td>
                      <td>
                        <button className="btn-secondary" type="button" onClick={() => void toggle(sale)} disabled={savingKey === sale.saleKey}>
                          {savingKey === sale.saleKey ? 'Saving…' : sale.included ? '🙈 Exclude sale' : '👁️ Include sale'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              )
            })}
          {!loading && sales.length === 0 && <tbody><tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>No completed ticket sales yet.</td></tr></tbody>}
          {loading && sales.length === 0 && <tbody><tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>Loading ticket sales…</td></tr></tbody>}
        </table>
      </div>
    </section>
  )
}
