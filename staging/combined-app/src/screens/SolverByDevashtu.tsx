import { useEffect, useMemo, useState } from 'react'

type Sale = {
  orderId: string
  ticketId: string
  name?: string
  email?: string
  phone?: string
  event?: string
  ticketType?: string
  gender?: string
  quantity?: number
  status?: string
}

type Pass = { id?: string; name: string; price: number }

export default function SolverByDevashtu() {
  const [sales, setSales] = useState<Sale[]>([])
  const [passes, setPasses] = useState<Pass[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const [salesRes, configRes] = await Promise.all([
        fetch('/api/admin/sales', { headers: { 'x-auth-token': token } }),
        fetch('/api/admin/config', { headers: { 'x-auth-token': token } }),
      ])
      const [salesData, configData] = await Promise.all([salesRes.json(), configRes.json()])
      if (!salesRes.ok || !salesData.success) throw new Error(salesData.message || 'Could not load tickets.')
      setSales((salesData.sales || []).filter((sale: Sale) => sale.ticketId && !['cancelled', 'refunded'].includes(String(sale.status).toLowerCase())))
      setPasses(configData.pricing || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load tickets.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sales
    return sales.filter(s => [s.ticketId, s.orderId, s.name, s.email, s.phone].some(value => String(value || '').toLowerCase().includes(q)))
  }, [sales, query])

  const upgrade = async (sale: Sale) => {
    const ticketType = selected[sale.ticketId]
    if (!ticketType || !sale.ticketId) return
    setBusy(sale.ticketId)
    setNotice('')
    setError('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const response = await fetch(`/api/solver/tickets/${encodeURIComponent(sale.ticketId)}/upgrade`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ ticketType }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Ticket upgrade failed.')
      setNotice(`${sale.ticketId} updated to ${ticketType}.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ticket upgrade failed.')
    } finally {
      setBusy('')
    }
  }

  return <main style={{ minHeight: '100vh', padding: '32px clamp(16px, 4vw, 56px)', background: '#09090d', color: '#f4f2fa', fontFamily: 'Inter, system-ui, sans-serif' }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 24 }}>
      <div><div style={{ color: '#a78bfa', fontSize: 12, letterSpacing: 2, fontWeight: 800 }}>MASTER ADMIN TOOL</div><h1 style={{ margin: '8px 0', fontSize: 30 }}>Ticket Solver</h1><p style={{ margin: 0, color: '#9c9aa8' }}>Find issued tickets and change their pass type.</p></div>
      <button onClick={() => { window.location.href = '/admin' }} style={buttonStyle}>Back to admin</button>
    </header>
    <section style={{ background: '#111116', border: '1px solid #24232c', borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search ticket, order, attendee, email, or phone" style={{ ...inputStyle, flex: 1 }} /><button onClick={() => void load()} style={buttonStyle}>Refresh</button></div>
      {error && <p role="alert" style={{ color: '#ff7777' }}>{error}</p>}{notice && <p role="status" style={{ color: '#55dda0' }}>{notice}</p>}
      {loading ? <p style={{ color: '#aaa' }}>Loading tickets…</p> : <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 800 }}><thead><tr>{['Ticket / Attendee', 'Event', 'Current pass', 'Status', 'Upgrade pass', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead><tbody>{filtered.map(sale => <tr key={sale.ticketId}>
        <td style={tdStyle}><strong>{sale.ticketId}</strong><div style={{ color: '#aaa', marginTop: 4 }}>{sale.name || '—'} · {sale.email || '—'}</div></td><td style={tdStyle}>{sale.event || '—'}</td><td style={tdStyle}>{sale.ticketType || sale.gender || 'General'}</td><td style={tdStyle}>{sale.status || '—'}</td>
        <td style={tdStyle}><select value={selected[sale.ticketId] || ''} onChange={e => setSelected({ ...selected, [sale.ticketId]: e.target.value })} style={inputStyle}><option value="">Select pass</option>{passes.map(p => <option key={p.id || p.name} value={p.name}>{p.name} · ₹{p.price}</option>)}</select></td><td style={tdStyle}><button disabled={!selected[sale.ticketId] || busy === sale.ticketId} onClick={() => void upgrade(sale)} style={{ ...buttonStyle, opacity: !selected[sale.ticketId] ? .5 : 1 }}>{busy === sale.ticketId ? 'Saving…' : 'Upgrade'}</button></td>
      </tr>)}</tbody></table>{!filtered.length && <p style={{ color: '#aaa', padding: 12 }}>No tickets found.</p>}</div>}
    </section>
    <p style={{ color: '#777', fontSize: 12, marginTop: 14 }}>Pass type changes update the ticket record. Existing downloaded PDF files are not regenerated by this tool.</p>
  </main>
}

const inputStyle: React.CSSProperties = { background: '#19191f', border: '1px solid #30303a', borderRadius: 9, color: '#f4f2fa', padding: '11px 12px' }
const buttonStyle: React.CSSProperties = { background: '#6552e8', border: 0, borderRadius: 9, color: 'white', padding: '11px 16px', fontWeight: 700, cursor: 'pointer' }
const thStyle: React.CSSProperties = { color: '#888694', textAlign: 'left', fontSize: 11, padding: 12, borderBottom: '1px solid #292832' }
const tdStyle: React.CSSProperties = { padding: 12, borderBottom: '1px solid #222129', verticalAlign: 'middle' }
