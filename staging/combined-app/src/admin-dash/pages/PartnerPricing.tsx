import { FormEvent, useEffect, useState } from 'react'

interface PartnerPricingProps {
  adminKey: string
  mode: 'partners' | 'pricing'
}

type Partner = { userId: string; displayName: string; companyId: string; sellerSlot?: string; active: boolean }
type EventPricing = { id: string; name: string; tiers: Array<{ id?: string; name: string; price: number; gender?: string }> }

const headers = (adminKey: string) => ({ 'Content-Type': 'application/json', 'x-auth-token': adminKey })

export default function PartnerPricing({ adminKey, mode }: PartnerPricingProps) {
  const [partners, setPartners] = useState<Partner[]>([])
  const [events, setEvents] = useState<EventPricing[]>([])
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ userId: '', displayName: '', password: '', companyId: 'littlane', sellerSlot: 'partner-slot-1' })

  const load = async () => {
    setLoading(true)
    try {
      const endpoint = mode === 'partners' ? '/api/admin/partners' : '/api/admin/pricing'
      const response = await fetch(endpoint, { headers: headers(adminKey) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Unable to load data.')
      if (mode === 'partners') setPartners(data.partners || [])
      else setEvents(data.events || [])
    } catch (error: any) {
      setNotice(error.message || 'Unable to load data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [mode, adminKey])

  const createPartner = async (event: FormEvent) => {
    event.preventDefault()
    setNotice('')
    try {
      const response = await fetch('/api/admin/partners', { method: 'POST', headers: headers(adminKey), body: JSON.stringify(form) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Unable to create partner.')
      setForm({ userId: '', displayName: '', password: '', companyId: 'littlane', sellerSlot: 'partner-slot-1' })
      setNotice('Partner created and activated.')
      load()
    } catch (error: any) { setNotice(error.message || 'Unable to create partner.') }
  }

  const togglePartner = async (partner: Partner) => {
    const response = await fetch(`/api/admin/partners/${encodeURIComponent(partner.userId)}`, {
      method: 'PATCH', headers: headers(adminKey), body: JSON.stringify({ active: !partner.active })
    })
    const data = await response.json()
    setNotice(data.message || (data.success ? `Partner ${partner.active ? 'deactivated' : 'activated'}.` : 'Unable to update partner.'))
    if (data.success) load()
  }

  const savePricing = async (event: EventPricing) => {
    const response = await fetch(`/api/admin/pricing/${encodeURIComponent(event.id)}`, {
      method: 'PATCH', headers: headers(adminKey), body: JSON.stringify({ tiers: event.tiers })
    })
    const data = await response.json()
    setNotice(data.message || (data.success ? 'Pricing saved. New tickets use these values immediately.' : 'Unable to save pricing.'))
    if (data.success) load()
  }

  if (loading) return <div className="card">Loading {mode}…</div>

  if (mode === 'partners') return (
    <div style={{ display: 'grid', gap: 'var(--gutter)' }}>
      <div className="card">
        <div className="card-head"><h3>Add Partner</h3><span className="muted-sm">Creates a seller account for a Partner Login slot.</span></div>
        <form onSubmit={createPartner} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
          <div className="field"><label>Identifier</label><input required value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })} placeholder="partner@example.com" /></div>
          <div className="field"><label>Display name</label><input required value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} placeholder="Partner company" /></div>
          <div className="field"><label>Initial password</label><input required minLength={8} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
          <div className="field"><label>Login slot</label><select value={form.sellerSlot} onChange={e => setForm({ ...form, sellerSlot: e.target.value })}><option value="partner-slot-1">Partner Login 1</option><option value="partner-slot-2">Partner Login 2</option></select></div>
          <button className="btn-primary" type="submit" style={{ alignSelf: 'end' }}>Create partner</button>
        </form>
      </div>
      <div className="card">
        <div className="card-head"><h3>Partners</h3><button className="btn-secondary" onClick={load}>Refresh</button></div>
        {notice && <p className="muted-sm" style={{ marginTop: 12 }}>{notice}</p>}
        <div className="table-scroll scroll" style={{ marginTop: 14 }}><table className="table"><thead><tr><th>Partner</th><th>Slot</th><th>Company</th><th>Status</th><th /></tr></thead><tbody>{partners.map(partner => <tr key={partner.userId}><td>{partner.displayName}<div className="muted-sm">{partner.userId}</div></td><td>{partner.sellerSlot || 'Legacy seller'}</td><td>{partner.companyId}</td><td>{partner.active ? 'Active' : 'Inactive'}</td><td><button className="btn-secondary" onClick={() => togglePartner(partner)}>{partner.active ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody></table></div>
      </div>
    </div>
  )

  return <div className="card">
    <div className="card-head"><h3>Centralized Pricing</h3><span className="muted-sm">Amounts are stored with the event and used by the server when tickets are created.</span></div>
    {notice && <p className="muted-sm" style={{ marginTop: 12 }}>{notice}</p>}
    <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>{events.map(event => <div key={event.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}><div style={{ fontWeight: 700, marginBottom: 10 }}>{event.name}</div>{event.tiers.map((tier, index) => <div key={`${tier.id || tier.name}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 12, marginBottom: 8 }}><input value={tier.name} onChange={e => setEvents(events.map(item => item.id === event.id ? { ...item, tiers: item.tiers.map((current, currentIndex) => currentIndex === index ? { ...current, name: e.target.value } : current) } : item))} /><input type="number" min="0" step="0.01" value={tier.price} onChange={e => setEvents(events.map(item => item.id === event.id ? { ...item, tiers: item.tiers.map((current, currentIndex) => currentIndex === index ? { ...current, price: Number(e.target.value) } : current) } : item))} /></div>)}<div style={{ display: 'flex', gap: 10 }}><button className="btn-secondary" onClick={() => setEvents(events.map(item => item.id === event.id ? { ...item, tiers: [...item.tiers, { id: `tier-${Date.now()}`, name: 'New pass', price: 0, gender: 'unisex' }] } : item))}>Add ticket type</button><button className="btn-primary" onClick={() => savePricing(event)}>Save pricing</button></div></div>)}</div>
  </div>
}
