import { useState, useEffect, useCallback } from 'react'

interface OrgPanelProps { adminKey: string }

type OrgStatus = 'pending_activation' | 'active' | 'inactive' | 'suspended' | 'revoked' | 'rejected'

interface Organiser {
  userId: string
  displayName: string
  email?: string
  phone?: string
  companyName?: string
  commissionPct?: number
  accountStatus?: OrgStatus
  active?: boolean
  blocked?: boolean
  eventsCount?: number
  ticketsSold?: number
  revenue?: number
  createdAt?: string
}

const statusBadge = (s?: OrgStatus | string, active?: boolean, blocked?: boolean) => {
  if (blocked) return <span className="badge badge-red">BLOCKED</span>
  if (!active && active !== undefined) return <span className="badge badge-dark">INACTIVE</span>
  const map: Record<string, string> = {
    active: 'badge-teal', pending_activation: 'badge-amber', suspended: 'badge-gold',
    revoked: 'badge-red', rejected: 'badge-red', inactive: 'badge-dark',
  }
  const cls = map[String(s || '')] || 'badge-dark'
  return <span className={`badge ${cls}`}>{String(s || 'unknown').replace(/_/g, ' ')}</span>
}

const authH = (key: string) => ({ 'Content-Type': 'application/json', 'x-auth-token': key, 'x-admin-key': key })

function formatINR(v: number) {
  return `₹${(Number.isFinite(v) ? v : 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function OrganisersPanel({ adminKey }: OrgPanelProps) {
  const [organisers, setOrganisers] = useState<Organiser[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [search, setSearch] = useState('')
  const [editTarget, setEditTarget] = useState<Organiser | null>(null)
  const [editForm, setEditForm] = useState<Partial<Organiser> & { password?: string }>({})
  const [editSaving, setEditSaving] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ username: '', displayName: '', email: '', password: '', commissionPct: '5' })
  const [creating, setCreating] = useState(false)
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [orgEvents, setOrgEvents] = useState<Record<string, any[]>>({})

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/organizers', { headers: authH(adminKey) })
      const d = await r.json()
      if (d.success && Array.isArray(d.organizers)) setOrganisers(d.organizers)
      else showToast(d.message || 'Failed to load organisers.', 'error')
    } catch { showToast('Network error loading organisers.', 'error') }
    finally { setLoading(false) }
  }, [adminKey])

  useEffect(() => { load() }, [load])

  const dispatchAction = async (userId: string, action: string) => {
    if (!confirm(`Are you sure you want to ${action.replace('_', ' ')} this organiser?`)) return
    setActionPending(userId + ':' + action)
    try {
      const r = await fetch(`/api/admin/organizers/${encodeURIComponent(userId)}/action`, {
        method: 'POST', headers: authH(adminKey), body: JSON.stringify({ action })
      })
      const d = await r.json()
      if (d.success) { showToast(d.message || `${action} done.`); load() }
      else showToast(d.message || `Failed to ${action}.`, 'error')
    } catch { showToast('Network error.', 'error') }
    finally { setActionPending(null) }
  }

  const deleteOrg = async (userId: string, name: string) => {
    if (!confirm(`PERMANENTLY DELETE organiser "${name}" and all their data? This cannot be undone.`)) return
    setActionPending(userId + ':delete')
    try {
      const r = await fetch(`/api/admin/organizers/${encodeURIComponent(userId)}`, {
        method: 'DELETE', headers: authH(adminKey)
      })
      const d = await r.json()
      if (d.success) { showToast('Organiser deleted.'); load() }
      else showToast(d.message || 'Failed to delete.', 'error')
    } catch { showToast('Network error.', 'error') }
    finally { setActionPending(null) }
  }

  const openEdit = (org: Organiser) => { setEditTarget(org); setEditForm({ displayName: org.displayName, email: org.email, phone: org.phone, companyName: org.companyName, commissionPct: org.commissionPct }) }

  const saveEdit = async () => {
    if (!editTarget) return
    setEditSaving(true)
    try {
      const r = await fetch(`/api/admin/organizers/${encodeURIComponent(editTarget.userId)}`, {
        method: 'PATCH', headers: authH(adminKey), body: JSON.stringify(editForm)
      })
      const d = await r.json()
      if (d.success) { showToast('Organiser updated.'); setEditTarget(null); load() }
      else showToast(d.message || 'Update failed.', 'error')
    } catch { showToast('Network error.', 'error') }
    finally { setEditSaving(false) }
  }

  const createOrg = async () => {
    if (!createForm.username || !createForm.displayName || !createForm.password) {
      showToast('Username, display name and password are required.', 'error'); return
    }
    setCreating(true)
    try {
      const r = await fetch('/api/admin/organizers', {
        method: 'POST', headers: authH(adminKey), body: JSON.stringify({
          username: createForm.username, displayName: createForm.displayName,
          email: createForm.email, password: createForm.password,
          commissionPct: parseFloat(createForm.commissionPct) || 5
        })
      })
      const d = await r.json()
      if (d.success) {
        showToast('Organiser created.')
        setCreateOpen(false)
        setCreateForm({ username: '', displayName: '', email: '', password: '', commissionPct: '5' })
        load()
      } else showToast(d.message || 'Failed to create.', 'error')
    } catch { showToast('Network error.', 'error') }
    finally { setCreating(false) }
  }

  const toggleExpand = async (userId: string) => {
    if (expandedId === userId) { setExpandedId(null); return }
    setExpandedId(userId)
    if (!orgEvents[userId]) {
      try {
        const r = await fetch(`/api/admin/events?organizer=${encodeURIComponent(userId)}`, { headers: authH(adminKey) })
        const d = await r.json()
        setOrgEvents(prev => ({ ...prev, [userId]: d.events || [] }))
      } catch { setOrgEvents(prev => ({ ...prev, [userId]: [] })) }
    }
  }

  const filtered = organisers.filter(o => {
    const term = search.toLowerCase()
    return !term || [o.userId, o.displayName, o.email, o.companyName].some(v => String(v || '').toLowerCase().includes(term))
  })

  const pending = filtered.filter(o => o.accountStatus === 'pending_activation')
  const rest = filtered.filter(o => o.accountStatus !== 'pending_activation')

  const renderActions = (org: Organiser) => {
    const busy = (a: string) => actionPending === org.userId + ':' + a
    const s = org.accountStatus
    const isActive = org.active !== false && !org.blocked && s === 'active'
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {s === 'pending_activation' && <>
          <button className="btn-secondary" style={{ color: 'var(--green)', borderColor: 'rgba(16,185,129,0.4)', fontSize: 11, padding: '4px 10px' }}
            disabled={!!actionPending} onClick={() => dispatchAction(org.userId, 'approve')}>
            {busy('approve') ? '…' : 'Approve'}
          </button>
          <button className="btn-secondary" style={{ color: 'var(--red)', borderColor: 'rgba(255,107,107,0.4)', fontSize: 11, padding: '4px 10px' }}
            disabled={!!actionPending} onClick={() => dispatchAction(org.userId, 'reject')}>
            {busy('reject') ? '…' : 'Reject'}
          </button>
        </>}
        {isActive && <>
          <button className="btn-secondary" style={{ color: 'var(--gold)', borderColor: 'rgba(251,191,36,0.4)', fontSize: 11, padding: '4px 10px' }}
            disabled={!!actionPending} onClick={() => dispatchAction(org.userId, 'suspend')}>
            {busy('suspend') ? '…' : 'Suspend'}
          </button>
          <button className="btn-secondary" style={{ color: 'var(--red)', borderColor: 'rgba(255,107,107,0.4)', fontSize: 11, padding: '4px 10px' }}
            disabled={!!actionPending} onClick={() => dispatchAction(org.userId, 'revoke')}>
            {busy('revoke') ? '…' : 'Revoke'}
          </button>
        </>}
        {(s === 'inactive' || s === 'suspended') && <>
          <button className="btn-secondary" style={{ color: 'var(--teal)', borderColor: 'rgba(20,184,166,0.4)', fontSize: 11, padding: '4px 10px' }}
            disabled={!!actionPending} onClick={() => dispatchAction(org.userId, 'activate')}>
            {busy('activate') ? '…' : 'Activate'}
          </button>
        </>}
        {s === 'revoked' && <>
          <button className="btn-secondary" style={{ color: 'var(--teal)', borderColor: 'rgba(20,184,166,0.4)', fontSize: 11, padding: '4px 10px' }}
            disabled={!!actionPending} onClick={() => dispatchAction(org.userId, 'unsuspend')}>
            {busy('unsuspend') ? '…' : 'Reinstate'}
          </button>
        </>}
        <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }}
          onClick={() => openEdit(org)}>Edit</button>
        <button className="btn-secondary" style={{ color: 'var(--red)', borderColor: 'rgba(255,107,107,0.3)', fontSize: 11, padding: '4px 10px' }}
          disabled={busy('delete')} onClick={() => deleteOrg(org.userId, org.displayName)}>
          {busy('delete') ? '…' : 'Delete'}
        </button>
      </div>
    )
  }

  const renderRow = (org: Organiser) => {
    const expanded = expandedId === org.userId
    const events = orgEvents[org.userId] || []
    return (
      <div key={org.userId} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, marginBottom: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 2fr', gap: 12, alignItems: 'center', padding: '14px 18px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{org.displayName}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'monospace' }}>{org.userId}</div>
            {org.email && <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{org.email}</div>}
          </div>
          <div>
            {statusBadge(org.accountStatus, org.active, org.blocked)}
            {org.companyName && <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}>{org.companyName}</div>}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{org.commissionPct ?? 5}%</div>
            <div style={{ fontSize: 10, color: 'var(--ink-faint)' }}>Commission</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700 }}>{org.eventsCount ?? 0}</div>
            <div style={{ fontSize: 10, color: 'var(--ink-faint)' }}>Events</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, color: 'var(--green)' }}>{formatINR(org.revenue ?? 0)}</div>
            <div style={{ fontSize: 10, color: 'var(--ink-faint)' }}>{org.ticketsSold ?? 0} tickets</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
            {renderActions(org)}
            <button onClick={() => toggleExpand(org.userId)}
              style={{ fontSize: 10, color: 'var(--ink-faint)', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', padding: 0 }}>
              {expanded ? '▲ Hide events' : '▼ View events'}
            </button>
          </div>
        </div>
        {expanded && (
          <div style={{ borderTop: '1px solid var(--line)', padding: '12px 18px', background: 'var(--panel-2)' }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, color: 'var(--ink-faint)', textTransform: 'uppercase' }}>Events by {org.displayName}</div>
            {events.length === 0
              ? <div style={{ color: 'var(--ink-faint)', fontSize: 12 }}>No events found.</div>
              : events.map((ev: any) => (
                <div key={ev._id || ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{ev.name}</span>
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ink-faint)' }}>{ev.date || '—'}</span>
                  </div>
                  <span className={`badge ${ev.status === 'published' ? 'badge-teal' : ev.status === 'on_hold' ? 'badge-gold' : 'badge-dark'}`}>
                    {(ev.status || 'draft').replace(/_/g, ' ')}
                  </span>
                </div>
              ))
            }
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gutter)' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 999, padding: '12px 20px', borderRadius: 12, background: toast.type === 'success' ? 'var(--green)' : 'var(--red)', color: '#fff', fontWeight: 600, fontSize: 13 }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="card">
        <div className="card-head">
          <div>
            <h3>Organisers</h3>
            <div className="muted-sm">{organisers.length} registered organiser{organisers.length !== 1 ? 's' : ''} · Full admin control over accounts, events and commissions</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              placeholder="Search organisers…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', fontSize: 13, width: 200 }}
            />
            <button className="btn-primary" onClick={() => setCreateOpen(true)} style={{ fontSize: 13 }}>+ New Organiser</button>
            <button className="btn-secondary" onClick={load} disabled={loading} style={{ fontSize: 13 }}>{loading ? 'Loading…' : 'Refresh'}</button>
          </div>
        </div>
      </div>

      {/* Create Form */}
      {createOpen && (
        <div className="card" style={{ border: '1px solid rgba(16,185,129,0.3)' }}>
          <div className="card-head">
            <h3 style={{ color: 'var(--green)' }}>Create New Organiser</h3>
            <button className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
            {[
              { label: 'Username (login ID)', key: 'username', type: 'text', placeholder: 'e.g. bluenile_org' },
              { label: 'Display Name', key: 'displayName', type: 'text', placeholder: 'e.g. Blue Nile Events' },
              { label: 'Email', key: 'email', type: 'email', placeholder: 'organiser@example.com' },
              { label: 'Password (8+ chars)', key: 'password', type: 'password', placeholder: '••••••••' },
              { label: 'Commission %', key: 'commissionPct', type: 'number', placeholder: '5' },
            ].map(f => (
              <div key={f.key} className="field">
                <label>{f.label}</label>
                <input type={f.type} placeholder={f.placeholder} value={(createForm as any)[f.key]}
                  onChange={e => setCreateForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" onClick={createOrg} disabled={creating}>
              {creating ? 'Creating…' : 'Create Organiser'}
            </button>
          </div>
        </div>
      )}

      {/* Stats Row */}
      {pending.length > 0 && (
        <div className="card" style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.3)' }}>
          <div style={{ fontWeight: 700, color: 'var(--gold)', marginBottom: 6 }}>⚠ {pending.length} Pending Approval{pending.length > 1 ? 's' : ''}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pending.map(renderRow)}
          </div>
        </div>
      )}

      {/* Table Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 2fr', gap: 12, padding: '8px 18px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        <span>Organiser</span><span>Status</span><span style={{ textAlign: 'center' }}>Commission</span><span style={{ textAlign: 'center' }}>Events</span><span style={{ textAlign: 'center' }}>Revenue</span><span>Actions</span>
      </div>

      {/* Organiser Rows */}
      {loading && organisers.length === 0
        ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-faint)' }}>Loading organisers…</div>
        : rest.length === 0 && pending.length === 0
        ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-faint)' }}>No organisers found. Create one above.</div>
        : rest.map(renderRow)
      }

      {/* Edit Modal */}
      {editTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
          <div className="card" style={{ width: 480, maxWidth: '94vw', padding: 24 }}>
            <div className="card-head" style={{ marginBottom: 16 }}>
              <h3>Edit Organiser — {editTarget.displayName}</h3>
              <button className="icon-btn" onClick={() => setEditTarget(null)}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Display Name', key: 'displayName', type: 'text' },
                { label: 'Email', key: 'email', type: 'email' },
                { label: 'Phone', key: 'phone', type: 'text' },
                { label: 'Company Name', key: 'companyName', type: 'text' },
                { label: 'Commission %', key: 'commissionPct', type: 'number' },
                { label: 'New Password (leave blank to keep)', key: 'password', type: 'password' },
              ].map(f => (
                <div key={f.key} className="field">
                  <label>{f.label}</label>
                  <input type={f.type} value={(editForm as any)[f.key] ?? ''}
                    onChange={e => setEditForm(p => ({ ...p, [f.key]: f.key === 'commissionPct' ? parseFloat(e.target.value) || 0 : e.target.value }))} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn-secondary" onClick={() => setEditTarget(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveEdit} disabled={editSaving}>{editSaving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
