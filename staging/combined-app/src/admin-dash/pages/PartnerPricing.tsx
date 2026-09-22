import { FormEvent, useEffect, useState } from 'react'

interface PartnerPricingProps {
  adminKey: string
  mode: 'partners' | 'pricing'
}

type Partner = { userId: string; displayName: string; companyId: string; sellerSlot?: string; active: boolean; managed?: boolean }
type PassTier = { id?: string; name: string; price: number | string; gender?: string }
type EventPricing = { id: string; name: string; tiers: PassTier[] }
const PARTNER_LOGIN_SLOTS = [
  { id: 'partner-slot-1', label: 'Partner Login 1' },
  { id: 'partner-slot-2', label: 'Partner Login 2' },
]
const PASS_CATEGORIES = [
  { id: 'unisex', label: 'Unisex' },
  { id: 'ga', label: 'GA' },
  { id: 'vip', label: 'VIP' },
  { id: 'group', label: 'Group' },
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
]
const slotLabel = (slot?: string) => PARTNER_LOGIN_SLOTS.find(item => item.id === slot)?.label || 'Partner Login'

const headers = (adminKey: string) => ({ 'Content-Type': 'application/json', 'x-auth-token': adminKey, 'x-admin-key': adminKey })

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

  useEffect(() => {
    if (mode !== 'partners' || !partners.length) return
    const activeSlots = new Set(partners.filter(partner => partner.active).map(partner => partner.sellerSlot))
    const firstAvailable = PARTNER_LOGIN_SLOTS.find(slot => !activeSlots.has(slot.id))
    if (firstAvailable && activeSlots.has(form.sellerSlot)) {
      setForm(current => ({ ...current, sellerSlot: firstAvailable.id }))
    }
  }, [mode, partners])

  const partnerForSlot = (slot: string) => partners.find(partner => partner.sellerSlot === slot)
  const activeSlots = new Set(partners.filter(partner => partner.active).map(partner => partner.sellerSlot))
  const selectedSlotOwner = partnerForSlot(form.sellerSlot)

  const createPartner = async (event: FormEvent) => {
    event.preventDefault()
    setNotice('')
    try {
      const response = await fetch('/api/admin/partners', { method: 'POST', headers: headers(adminKey), body: JSON.stringify(form) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Unable to create partner.')
      const nextSlot = PARTNER_LOGIN_SLOTS.find(slot => !partners.some(partner => partner.active && partner.sellerSlot === slot.id))
      setForm({ userId: '', displayName: '', password: '', companyId: 'littlane', sellerSlot: nextSlot?.id || 'partner-slot-1' })
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

  const deletePartner = async (partner: Partner) => {
    const slot = slotLabel(partner.sellerSlot)
    if (!window.confirm(`Delete ${partner.displayName}? This clears ${slot}, logs it out, and removes its passkey. The slot will return to its empty login state.`)) return
    try {
      const response = await fetch(`/api/admin/partners/${encodeURIComponent(partner.userId)}`, {
        method: 'DELETE',
        headers: headers(adminKey),
      })
      const data = await response.json()
      setNotice(data.message || (data.success ? `${slot} was cleared.` : 'Unable to delete partner.'))
      if (data.success) load()
    } catch {
      setNotice('Unable to delete partner.')
    }
  }

  const updateTier = (eventId: string, index: number, patch: Partial<PassTier>) => {
    setEvents(currentEvents => currentEvents.map(event => event.id === eventId
      ? { ...event, tiers: event.tiers.map((tier, currentIndex) => currentIndex === index ? { ...tier, ...patch } : tier) }
      : event
    ))
  }

  const addTier = (eventId: string) => {
    setEvents(currentEvents => currentEvents.map(event => event.id === eventId
      ? { ...event, tiers: [...event.tiers, { id: `pass-${Date.now()}`, name: 'New Pass', price: 0, gender: 'unisex' }] }
      : event
    ))
  }

  const removeTier = (eventId: string, index: number) => {
    setEvents(currentEvents => currentEvents.map(event => {
      if (event.id !== eventId || event.tiers.length <= 1) return event
      return { ...event, tiers: event.tiers.filter((_, currentIndex) => currentIndex !== index) }
    }))
  }

  const validatePricing = (event: EventPricing) => {
    if (!event.tiers.length) return 'Keep at least one pass category.'
    const names = new Set<string>()
    for (const tier of event.tiers) {
      const name = tier.name.trim()
      const price = Number(tier.price)
      if (!name) return 'Every pass category needs a name.'
      if (!Number.isFinite(price) || price < 0) return 'Every pass category needs a valid non-negative rate.'
      const key = name.toLowerCase()
      if (names.has(key)) return 'Pass category names must be unique.'
      names.add(key)
    }
    return ''
  }

  const savePricing = async (event: EventPricing) => {
    const validationError = validatePricing(event)
    if (validationError) {
      setNotice(validationError)
      return
    }
    try {
      const response = await fetch(`/api/admin/pricing/${encodeURIComponent(event.id)}`, {
        method: 'PATCH',
        headers: headers(adminKey),
        body: JSON.stringify({
          tiers: event.tiers.map(tier => ({
            ...tier,
            name: tier.name.trim(),
            price: Number(tier.price),
            gender: tier.gender || 'unisex'
          }))
        })
      })
      const data = await response.json()
      setNotice(data.message || (data.success ? 'Pass categories saved. New tickets use these names and rates immediately.' : 'Unable to save pricing.'))
      if (data.success) {
        window.dispatchEvent(new CustomEvent('littx:pricing-updated'))
        load()
      }
    } catch {
      setNotice('Unable to save pricing.')
    }
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
          <div className="field"><label>Login slot</label><select value={form.sellerSlot} onChange={e => setForm({ ...form, sellerSlot: e.target.value })}>{PARTNER_LOGIN_SLOTS.map(slot => { const owner = partnerForSlot(slot.id); return <option key={slot.id} value={slot.id} disabled={activeSlots.has(slot.id)}>{slot.label}{owner?.active ? ' — in use' : owner ? ' — replaces inactive partner' : ' — available'}</option> })}</select>{selectedSlotOwner && !selectedSlotOwner.active && <small className="muted-sm">Creating this partner will release the inactive {selectedSlotOwner.displayName} account from this login slot.</small>}</div>
          <button className="btn-primary" type="submit" disabled={PARTNER_LOGIN_SLOTS.every(slot => activeSlots.has(slot.id))} style={{ alignSelf: 'end' }}>Create partner</button>
        </form>
      </div>
      <div className="card">
        <div className="card-head"><h3>Partners</h3><button className="btn-secondary" onClick={load}>Refresh</button></div>
        {notice && <p className="muted-sm" style={{ marginTop: 12 }}>{notice}</p>}
        <div className="table-scroll scroll" style={{ marginTop: 14 }}><table className="table"><thead><tr><th>Partner</th><th>Slot</th><th>Company</th><th>Status</th><th /></tr></thead><tbody>{partners.map(partner => <tr key={partner.userId}><td>{partner.displayName}<div className="muted-sm">{partner.userId}</div></td><td>{partner.managed === false ? 'System seller' : slotLabel(partner.sellerSlot)}</td><td>{partner.companyId}</td><td>{partner.active ? 'Active' : 'Inactive'}</td><td>{partner.managed === false ? <span className="muted-sm">Available in /seller</span> : <div style={{ display: 'flex', gap: 8 }}><button className="btn-secondary" onClick={() => togglePartner(partner)}>{partner.active ? 'Deactivate' : 'Activate'}</button><button className="btn-secondary" onClick={() => deletePartner(partner)} style={{ color: 'var(--red)' }}>Delete</button></div>}</td></tr>)}{partners.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>No seller accounts are available.</td></tr>}</tbody></table></div>
      </div>
    </div>
  )

  return <div className="card">
    <div className="card-head">
      <h3>Pass Categories & Rates</h3>
      <span className="muted-sm">These names and rates are stored on the event and used by every new ticket.</span>
    </div>
    {notice && <p className="muted-sm" style={{ marginTop: 12 }}>{notice}</p>}
    <div style={{ display: 'grid', gap: 18, marginTop: 16 }}>
      {events.map(event => (
        <section key={event.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 800 }}>{event.name}</div>
              <div className="muted-sm">{event.tiers.length} pass {event.tiers.length === 1 ? 'category' : 'categories'}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn-secondary" type="button" onClick={() => addTier(event.id)}>+ Add pass</button>
              <button className="btn-primary" type="button" onClick={() => savePricing(event)}>Save changes</button>
            </div>
          </div>
          <div className="table-scroll scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Pass name</th>
                  <th>Category</th>
                  <th>Rate</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {event.tiers.map((tier, index) => (
                  <tr key={`${tier.id || tier.name}-${index}`}>
                    <td>
                      <input
                        value={tier.name}
                        onChange={e => updateTier(event.id, index, { name: e.target.value })}
                        placeholder="GA Single"
                      />
                    </td>
                    <td>
                      <select value={tier.gender || 'unisex'} onChange={e => updateTier(event.id, index, { gender: e.target.value })}>
                        {PASS_CATEGORIES.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tier.price}
                        onChange={e => updateTier(event.id, index, { price: e.target.value })}
                        placeholder="399"
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn-secondary"
                        type="button"
                        disabled={event.tiers.length <= 1}
                        onClick={() => removeTier(event.id, index)}
                        style={{ color: 'var(--red)' }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {events.length === 0 && <div className="muted-sm" style={{ textAlign: 'center', padding: 24 }}>No events found for pricing.</div>}
    </div>
  </div>
}
