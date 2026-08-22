import { useState, useEffect } from 'react'

function formatDuration(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const parts = [];
  if (hrs) parts.push(`${hrs}h`);
  if (mins) parts.push(`${mins}m`);
  if (secs || (!hrs && !mins)) parts.push(`${secs}s`);
  return parts.join(' ');
}

type SettingsTab = 'profile' | 'smtp' | 'payments' | 'roles' | 'audit' | 'seller-locks'

const OUTLET_MAP: Record<string, { name: string; emoji: string }> = {
  littlane:    { name: 'LITTLANE',    emoji: '🏟️' },
  nitro:       { name: 'NITRO',       emoji: '⚡' },
  '7th-heaven':{ name: '7TH HEAVEN', emoji: '🌟' },
}

interface SettingsProps {
  adminKey: string
  testMode?: boolean
}

export default function Settings({ adminKey }: SettingsProps) {
  const [tab, setTab] = useState<SettingsTab>('seller-locks')
  const [wiping, setWiping] = useState(false)
  const [sessions, setSessions] = useState<any[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)

  const [partnerLocks, setPartnerLocks] = useState<any[]>([])
  const [loadingPartners, setLoadingPartners] = useState(false)

  const [sellerSessions, setSellerSessions] = useState<any[]>([])
  const [loadingSellerSessions, setLoadingSellerSessions] = useState(false)
  const [kickingId, setKickingId] = useState<string | null>(null)
  const [blockingId, setBlockingId] = useState<string | null>(null)
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([])

  // Notification toggle states
  const [notifs, setNotifs] = useState({
    orders: true,
    refunds: true,
    inventory: false,
    weekly: true,
    gateScan: true,
  })

  const toggleNotif = (key: keyof typeof notifs) => {
    setNotifs((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const loadSessions = async () => {
    setLoadingSessions(true)
    try {
      // Load ALL active sessions for ALL roles (unified UserSession store)
      const res = await fetch('/api/master/sessions', {
        headers: { 'x-master-token': 'littx-master-2026' }
      })
      const data = await res.json()
      if (data.success) {
        setSessions(data.sessions)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingSessions(false)
    }
  }

  const loadPartnerLocks = async () => {
    setLoadingPartners(true)
    try {
      const res = await fetch('/api/master/partner-locks', {
        headers: { 'x-master-token': 'littx-master-2026' }
      })
      const data = await res.json()
      if (data.success) {
        setPartnerLocks(data.locks || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingPartners(false)
    }
  }

  const loadSellerSessions = async () => {
    setLoadingSellerSessions(true)
    try {
      const res = await fetch('/api/master/partner-locks', {
        headers: { 'x-master-token': 'littx-master-2026' }
      })
      const data = await res.json()
      if (data.success) {
        setSellerSessions(data.locks || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingSellerSessions(false)
    }
  }

  const forceLogoutSeller = async (partnerId: string, name: string) => {
    if (!confirm(`Force logout ${name}? They will be kicked immediately. Their device lock stays — only the session token is cleared.`)) return
    setKickingId(partnerId)
    try {
      const res = await fetch(`/api/master/reset-partner-lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-master-token': 'littx-master-2026' },
        body: JSON.stringify({ partnerId, sessionOnly: true })
      })
      const data = await res.json()
      alert(data.message || (data.success ? 'Logged out.' : 'Failed.'))
      loadSellerSessions()
      loadSessions()
    } catch {
      alert('Error forcing logout.')
    } finally {
      setKickingId(null)
    }
  }

  const blockSeller = async (partnerId: string, name: string) => {
    if (!confirm(`BLOCK ${name}? They will be logged out and CANNOT log in again until you approve. Are you sure?`)) return
    setBlockingId(partnerId)
    try {
      const res = await fetch(`/api/master/block-partner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-master-token': 'littx-master-2026' },
        body: JSON.stringify({ partnerId })
      })
      const data = await res.json()
      alert(data.message || (data.success ? 'Blocked.' : 'Failed.'))
      loadSellerSessions()
      loadSessions()
      loadPendingApprovals()
    } catch {
      alert('Error blocking seller.')
    } finally {
      setBlockingId(null)
    }
  }

  const unblockSeller = async (partnerId: string, name: string) => {
    if (!confirm(`APPROVE & UNBLOCK ${name}? They will be able to log in again.`)) return
    try {
      const res = await fetch(`/api/master/unblock-partner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-master-token': 'littx-master-2026' },
        body: JSON.stringify({ partnerId })
      })
      const data = await res.json()
      alert(data.message || (data.success ? 'Unblocked.' : 'Failed.'))
      loadSellerSessions()
      loadSessions()
      loadPendingApprovals()
    } catch {
      alert('Error unblocking seller.')
    }
  }

  const changePartnerPassword = async (partnerId: string, name: string) => {
    const newPassword = prompt(`Enter new password for ${name}:`)
    if (!newPassword || !newPassword.trim()) return
    try {
      const res = await fetch(`/api/master/change-partner-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-master-token': 'littx-master-2026' },
        body: JSON.stringify({ partnerId, newPassword: newPassword.trim() })
      })
      const data = await res.json()
      alert(data.message || (data.success ? 'Password updated.' : 'Failed.'))
      loadPartnerLocks()
    } catch {
      alert('Error updating password.')
    }
  }

  const loadPendingApprovals = async () => {
    try {
      const res = await fetch('/api/master/pending-approvals', {
        headers: { 'x-master-token': 'littx-master-2026' }
      })
      const data = await res.json()
      if (data.success) setPendingApprovals(data.pending || [])
    } catch (err) {
      console.error(err)
    }
  }

  // Auto-load & REAL-TIME LIVE POLLING when Active Sessions tab is shown
  useEffect(() => {
    if (tab === 'seller-locks') {
      const pollAll = () => {
        loadSessions()
        loadPartnerLocks()
        loadSellerSessions()
        loadPendingApprovals()
      }
      pollAll()
      const interval = setInterval(pollAll, 2500) // Fast real-time live sync
      return () => clearInterval(interval)
    }
  }, [tab])

  const handleResetPartnerLock = async (partnerId: string, name: string) => {
    if (!confirm(`Reset permanent device lock for ${name}? The next successful login from ANY device will set the new bound IP.`)) return
    try {
      const res = await fetch('/api/master/reset-partner-lock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-master-token': 'littx-master-2026'
        },
        body: JSON.stringify({ partnerId })
      })
      const data = await res.json()
      if (data.success) {
        alert(data.message)
        loadPartnerLocks()
      } else {
        alert(data.message || 'Failed to reset device lock.')
      }
    } catch (err) {
      alert('Error resetting partner device lock.')
    }
  }

  const unlockSeller = async (userId: string) => {
    if (!confirm(`Are you sure you want to kick and unlock ${userId}?`)) return
    try {
      // Generalized endpoint — works for all roles, not just legacy 3 sellers
      const res = await fetch(`/api/master/sessions/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { 'x-master-token': 'littx-master-2026' }
      })
      const data = await res.json()
      if (data.success) {
        alert(data.message)
        loadSessions()
        loadSellerSessions()
      } else {
        alert(data.message || 'Failed to unlock')
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleWipe = async () => {
    if (
      !window.confirm(
        'WARNING: This will permanently delete all ticket sales and reset revenue stats to ₹0. Are you sure?'
      )
    ) {
      return
    }
    setWiping(true)
    try {
      const res = await fetch(`/api/admin/danger-wipe-test-data?key=${adminKey}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (data.success) {
        alert(data.message)
        window.location.reload()
      } else {
        alert('Wipe failed: ' + data.message)
      }
    } catch (err) {
      alert('Error executing wipe command.')
    } finally {
      setWiping(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gutter)' }}>
      {/* Sub Navigation Bar */}
      <div className="filter-bar">
        <div className="pill-toggle">
          {(
            [
              { id: 'seller-locks', label: 'Active Sessions' },
              { id: 'profile', label: 'Profile & Workspace' },
              { id: 'smtp', label: 'SMTP Config' },
              { id: 'payments', label: 'Payment Gateways' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => {
                setTab(t.id as SettingsTab)
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'seller-locks' && (
        <>
          <div className="card">
            <div className="card-head">
              <h3>Active Sessions — All Roles</h3>
              <div className="muted-sm">All logged-in users are locked to one device (IP). Kick & Unlock to allow login from a different device.</div>
            </div>
            <div style={{ marginTop: '16px' }}>
              <button className="btn-secondary" onClick={loadSessions} disabled={loadingSessions}>
                {loadingSessions ? 'Refreshing...' : 'Refresh Sessions'}
              </button>
            </div>
            <div className="table-scroll scroll" style={{ marginTop: '20px' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Display Name</th>
                    <th>Role</th>
                    <th>Locked IP Address</th>
                    <th>Login Time</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-faint)' }}>
                        No active sessions. Click Refresh Sessions to load.
                      </td>
                    </tr>
                  ) : (
                    sessions.map((s, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.userId || s.sellerId}</td>
                        <td>{s.displayName || s.userId || s.sellerId}</td>
                        <td>
                          <span className={`badge ${
                            s.role === 'master_admin' ? 'badge-violet' :
                            s.role === 'company_admin' ? 'badge-teal' :
                            s.role === 'seller' ? 'badge-gold' :
                            s.role === 'pr' ? 'badge-amber' : 'badge-dark'
                          }`}>
                            {s.role || 'seller'}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-teal"><span className="badge-dot" />{s.lockedIp}</span>
                        </td>
                        <td>{new Date(s.loginAt).toLocaleString()}</td>
                        <td>
                          <button
                            onClick={() => unlockSeller(s.userId || s.sellerId)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: '1px solid rgba(255,107,107,0.3)',
                              backgroundColor: 'rgba(255,107,107,0.12)',
                              color: 'var(--red)',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Kick &amp; Unlock
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── SELLER DEVICES LIVE STATUS CARD ── */}
          <div className="card" style={{ marginTop: '24px' }}>
            <div className="card-head">
              <h3>🏪 /seller — Outlet Device Sessions</h3>
              <div className="muted-sm">
                Live status of all 3 outlet devices. Force Logout kicks the session immediately — device hardware lock stays intact.
              </div>
            </div>
            <div style={{ marginTop: '16px' }}>
              <button className="btn-secondary" onClick={loadSellerSessions} disabled={loadingSellerSessions}>
                {loadingSellerSessions ? 'Refreshing...' : '↻ Refresh'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginTop: '20px' }}>
              {(['littlane', 'nitro', '7th-heaven'] as const).map((pid) => {
                const outlet = OUTLET_MAP[pid]
                const lock = sellerSessions.find((l: any) => l.partnerId?.toLowerCase() === pid.toLowerCase())
                const activeSession = sessions.find((s: any) => {
                  const u = String(s.userId || s.sellerId || '').toLowerCase()
                  const p = pid.toLowerCase()
                  return (
                    u === p ||
                    u === `partner:${p}` ||
                    u === `partner-${p}` ||
                    s.partnerId?.toLowerCase() === p ||
                    s.sellerId?.toLowerCase() === p
                  )
                })
                const isLoggedIn = !!activeSession
                const onlineDurationMs = isLoggedIn && activeSession?.loginAt ? Date.now() - new Date(activeSession.loginAt).getTime() : 0
                const hasDevice = !!(lock?.webauthnCredentialId)

                return (
                  <div key={pid} style={{
                    background: 'var(--surface)',
                    border: `1px solid ${isLoggedIn ? 'rgba(100,220,150,0.25)' : 'rgba(255,255,255,0.07)'}`,
                    borderRadius: '16px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '22px' }}>{outlet.emoji}</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '14px' }}>{outlet.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--ink-faint)', fontFamily: 'monospace' }}>{pid}</div>
                        </div>
                      </div>
                      <span className={`badge ${isLoggedIn ? 'badge-teal' : 'badge-dark'}`}>
                        {isLoggedIn ? <><span className="badge-dot" />ONLINE</> : 'OFFLINE'}
                      </span>
                    </div>

                    {/* Device Lock Status */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--ink-faint)' }}>Hardware Lock</span>
                        <span className={`badge ${hasDevice ? 'badge-violet' : 'badge-dark'}`} style={{ fontSize: '10px' }}>
                          {hasDevice ? `🔐 ${lock.registeredDeviceId || 'Passkey Bound'}` : 'Not Bound'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--ink-faint)' }}>Device Name</span>
                        <span style={{ fontWeight: 600, fontSize: '12px' }}>
                          {lock?.deviceName || (hasDevice ? 'Unknown Device' : '—')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--ink-faint)' }}>Bound IP</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                          {activeSession?.lockedIp || lock?.boundIp || '—'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--ink-faint)' }}>Last Seen</span>
                        <div style={{ textAlign: 'right', fontSize: '11px' }}>
                          <div>{activeSession?.loginAt ? new Date(activeSession.loginAt).toLocaleString() : (lock?.lastSeenAt ? new Date(lock.lastSeenAt).toLocaleString() : '—')}</div>
                          {isLoggedIn && onlineDurationMs > 0 && (
                            <div style={{ color: 'var(--ink-faint)', fontSize: '10px' }}>
                              Online for {formatDuration(onlineDurationMs)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--ink-faint)' }}>Bound Since</span>
                        <span style={{ fontSize: '11px' }}>
                          {lock?.boundAt ? new Date(lock.boundAt).toLocaleString() : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    {lock?.blocked ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                        <div style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid rgba(255,60,60,0.4)', backgroundColor: 'rgba(255,60,60,0.1)', color: '#ff5555', fontWeight: 700, fontSize: '13px', textAlign: 'center' }}>
                          🚫 BLOCKED {lock.blockedAt ? `at ${new Date(lock.blockedAt).toLocaleTimeString()}` : ''}
                        </div>
                        <button
                          onClick={() => unblockSeller(pid, outlet.name)}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: '1px solid rgba(100,220,150,0.35)',
                            backgroundColor: 'rgba(100,220,150,0.12)',
                            color: '#64dc96',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer',
                            width: '100%',
                          }}
                        >
                          ✅ Approve & Unblock
                        </button>
                        <button
                          onClick={() => changePartnerPassword(pid, outlet.name)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            color: 'var(--ink)',
                            fontWeight: 600,
                            fontSize: '11px',
                            cursor: 'pointer',
                            width: '100%',
                          }}
                        >
                          🔑 Change Password
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            disabled={!isLoggedIn || kickingId === pid}
                            onClick={() => forceLogoutSeller(pid, outlet.name)}
                            style={{
                              flex: 1,
                              padding: '8px 10px',
                              borderRadius: '8px',
                              border: isLoggedIn ? '1px solid rgba(255,200,50,0.35)' : '1px solid rgba(255,255,255,0.08)',
                              backgroundColor: isLoggedIn ? 'rgba(255,200,50,0.12)' : 'rgba(255,255,255,0.04)',
                              color: isLoggedIn ? '#ffc832' : 'var(--ink-faint)',
                              fontWeight: 700,
                              fontSize: '12px',
                              cursor: isLoggedIn ? 'pointer' : 'not-allowed',
                            }}
                          >
                            {kickingId === pid ? '⏳...' : '⏏ Logout'}
                          </button>
                          <button
                            disabled={blockingId === pid}
                            onClick={() => blockSeller(pid, outlet.name)}
                            style={{
                              flex: 1,
                              padding: '8px 10px',
                              borderRadius: '8px',
                              border: '1px solid rgba(255,60,60,0.35)',
                              backgroundColor: 'rgba(255,60,60,0.12)',
                              color: '#ff5555',
                              fontWeight: 700,
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            {blockingId === pid ? '⏳...' : '🚫 Block'}
                          </button>
                        </div>
                        <button
                          onClick={() => changePartnerPassword(pid, outlet.name)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            color: 'var(--ink)',
                            fontWeight: 600,
                            fontSize: '11px',
                            cursor: 'pointer',
                            width: '100%',
                          }}
                        >
                          🔑 Change Password
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── PENDING APPROVAL REQUESTS ── */}
          {pendingApprovals.length > 0 && (
            <div className="card" style={{ marginTop: '24px', border: '1px solid rgba(255,200,50,0.3)' }}>
              <div className="card-head">
                <h3>⚠️ Pending Login &amp; Registration Approvals</h3>
                <div className="muted-sm">
                  These sellers require your explicit approval before they can register a device or log in.
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginTop: '16px' }}>
                {pendingApprovals.map((p: any) => {
                  const outlet = OUTLET_MAP[p.partnerId] || { name: p.partnerId, emoji: '🏪' }
                  const isReg = p.approvalType === 'registration'
                  return (
                    <div key={p.partnerId} style={{
                      background: isReg ? 'rgba(100,220,150,0.05)' : 'rgba(255,200,50,0.06)',
                      border: isReg ? '1px solid rgba(100,220,150,0.2)' : '1px solid rgba(255,200,50,0.2)',
                      borderRadius: '16px',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '22px' }}>{outlet.emoji}</span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '14px' }}>{outlet.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--ink-faint)', fontFamily: 'monospace' }}>{p.partnerId}</div>
                          </div>
                        </div>
                        <span className={`badge ${isReg ? 'badge-teal' : 'badge-amber'}`}>
                          {isReg ? '🔑 NEW DEVICE' : '🚫 RE-LOGIN'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {!isReg && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--ink-faint)' }}>Blocked At</span>
                            <span style={{ color: '#ff5555', fontWeight: 600 }}>{p.blockedAt ? new Date(p.blockedAt).toLocaleString() : '—'}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--ink-faint)' }}>Request Time</span>
                          <span>{p.pendingApprovalAt ? new Date(p.pendingApprovalAt).toLocaleString() : '—'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--ink-faint)' }}>From IP</span>
                          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{p.pendingApprovalIp || '—'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--ink-faint)' }}>Device</span>
                          <span>{p.pendingApprovalDevice || '—'}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <button
                          onClick={() => unblockSeller(p.partnerId, outlet.name)}
                          style={{
                            flex: 1,
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: isReg ? '1px solid rgba(100,220,150,0.35)' : '1px solid rgba(255,200,50,0.35)',
                            backgroundColor: isReg ? 'rgba(100,220,150,0.12)' : 'rgba(255,200,50,0.12)',
                            color: isReg ? '#64dc96' : '#ffc832',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          {isReg ? '✅ Approve Reg' : '✅ Approve Login'}
                        </button>
                        <button
                          onClick={() => alert(`${p.partnerId} remains blocked.`)}
                          style={{
                            flex: 1,
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255,60,60,0.35)',
                            backgroundColor: 'rgba(255,60,60,0.12)',
                            color: '#ff5555',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          ❌ Deny
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Partner Device Locks Card */}
          <div className="card" style={{ marginTop: '24px' }}>
            <div className="card-head">
              <h3>Seller Portal Partner Device Locks (/seller)</h3>
              <div className="muted-sm">
                Strict single-device lock: Once a partner logs in from a device/IP, it is permanently bound. Admin reset is the ONLY way to unbind.
              </div>
            </div>
            <div style={{ marginTop: '16px' }}>
              <button className="btn-secondary" onClick={loadPartnerLocks} disabled={loadingPartners}>
                {loadingPartners ? 'Refreshing Locks...' : 'Refresh Partner Locks'}
              </button>
            </div>
            <div className="table-scroll scroll" style={{ marginTop: '20px' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Partner Name</th>
                    <th>Partner ID</th>
                    <th>WebAuthn Passkey Credential</th>
                    <th>Bound IP Address</th>
                    <th>Bound Timestamp</th>
                    <th>Session Version</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {partnerLocks.length === 0 ? (
                    [
                      { partnerId: 'littlane', name: 'Littlane Entertainment' },
                      { partnerId: 'nitro', name: 'Nitro Events' },
                      { partnerId: '7th-heaven', name: '7th Heaven' }
                    ].map((p) => (
                      <tr key={p.partnerId}>
                        <td style={{ fontWeight: 'bold' }}>{p.name}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.partnerId}</td>
                        <td><span className="badge badge-dark">Passkey Unbound</span></td>
                        <td><span className="badge badge-dark">Not Bound (First Login Pending)</span></td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--ink-faint)' }}>N/A</td>
                        <td>1</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => handleResetPartnerLock(p.partnerId, p.name)}
                              className="btn-secondary"
                              style={{ fontSize: '11px', padding: '4px 10px' }}
                            >
                              Reset Lock
                            </button>
                            <button
                              onClick={() => changePartnerPassword(p.partnerId, p.name)}
                              className="btn-secondary"
                              style={{ fontSize: '11px', padding: '4px 10px' }}
                            >
                              Change Password
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    partnerLocks.map((p, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 'bold', color: 'var(--ink)' }}>{p.name}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--ink-faint)' }}>{p.partnerId}</td>
                        <td>
                          {p.webauthnCredentialId ? (
                            <span className="badge badge-violet" style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                              🔐 {p.registeredDeviceId || 'Passkey Bound'}
                            </span>
                          ) : (
                            <span className="badge badge-dark">Passkey Unbound</span>
                          )}
                        </td>
                        <td>
                          {p.boundIp ? (
                            <span className="badge badge-teal"><span className="badge-dot" />🔒 {p.boundIp}</span>
                          ) : (
                            <span className="badge badge-dark">Not Bound</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--ink-faint)' }}>
                          {p.boundAt ? new Date(p.boundAt).toLocaleString() : 'N/A'}
                        </td>
                        <td style={{ fontWeight: 'bold' }}>v{p.sessionVersion || 1}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                              onClick={() => handleResetPartnerLock(p.partnerId, p.name)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid rgba(216,255,63,0.3)',
                                backgroundColor: 'rgba(216,255,63,0.12)',
                                color: 'var(--volt)',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Reset Device Lock
                            </button>
                            <button
                              onClick={() => changePartnerPassword(p.partnerId, p.name)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                backgroundColor: 'rgba(255,255,255,0.05)',
                                color: 'var(--ink)',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              🔑 Change Password
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'profile' && (
        <div className="set-row">
          {/* Wide Left Column */}
          <div className="set-col wide">
            {/* Profile Information Card */}
            <div className="card">
              <div className="card-head">
                <h3>Profile Information</h3>
                <div className="muted-sm">Update your account details</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                <div
                  className="tb-avatar-sm"
                  style={{ width: '60px', height: '60px', fontSize: '20px', background: 'var(--grad-violet)' }}
                >
                  AT
                </div>
                <div>
                  <button className="btn-secondary">Change photo</button>
                  <div style={{ fontSize: '11px', color: 'var(--ink-faint)', marginTop: '4px' }}>
                    JPG, GIF or PNG. Max size 2MB.
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="field">
                  <label>First Name</label>
                  <input defaultValue="Atharva" />
                </div>
                <div className="field">
                  <label>Last Name</label>
                  <input defaultValue="Rathod" />
                </div>
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label>Email Address</label>
                  <input defaultValue="atharva@littx.in" />
                </div>
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label>Bio / Role</label>
                  <textarea rows={3} defaultValue="Lead Admin & Operations Lead for LITTX." />
                </div>
              </div>
            </div>

            {/* Workspace Settings Card */}
            <div className="card">
              <div className="card-head">
                <h3>Workspace Settings</h3>
                <div className="muted-sm">Configure event platform defaults</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="field">
                  <label>Workspace Name</label>
                  <input defaultValue="LITTX Pune Operations" />
                </div>
                <div className="field">
                  <label>Timezone</label>
                  <select defaultValue="Asia/Kolkata">
                    <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
                    <option value="UTC">UTC / GMT</option>
                  </select>
                </div>
                <div className="field">
                  <label>Default Currency</label>
                  <select defaultValue="INR">
                    <option value="INR">INR (₹ — Indian Rupee)</option>
                    <option value="USD">USD ($ — US Dollar)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Support Email</label>
                  <input defaultValue="littxent@gmail.com" />
                </div>
              </div>
            </div>
          </div>

          {/* Side Right Column */}
          <div className="set-col side">
            {/* Current Plan Card */}
            <div className="plan-card">
              <div className="p">CURRENT PLAN</div>
              <div className="n">Enterprise · Live Ops</div>
              <p style={{ fontSize: '11.5px', opacity: 0.85, margin: '0 0 16px', lineHeight: 1.4 }}>
                Instant QR validation, manual cash payment tracking, & unlimited pass generation.
              </p>
              <button
                className="btn-secondary"
                style={{ width: '100%', background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff' }}
              >
                Manage Billing
              </button>
            </div>

            {/* Notifications Preferences */}
            <div className="card">
              <div className="card-head">
                <h3>Notifications</h3>
              </div>

              <div className="toggle-row">
                <div>
                  <div className="t">New Order Alerts</div>
                  <div className="s">Push notification on every booking</div>
                </div>
                <div
                  className={`switch ${notifs.orders ? 'on' : ''}`}
                  onClick={() => toggleNotif('orders')}
                />
              </div>

              <div className="toggle-row">
                <div>
                  <div className="t">Refund Requests</div>
                  <div className="s">Notify finance channel</div>
                </div>
                <div
                  className={`switch ${notifs.refunds ? 'on' : ''}`}
                  onClick={() => toggleNotif('refunds')}
                />
              </div>

              <div className="toggle-row">
                <div>
                  <div className="t">Weekly Digest</div>
                  <div className="s">Sunday summary email</div>
                </div>
                <div
                  className={`switch ${notifs.weekly ? 'on' : ''}`}
                  onClick={() => toggleNotif('weekly')}
                />
              </div>

              <div className="toggle-row">
                <div>
                  <div className="t">Gate Scan Anomalies</div>
                  <div className="s">Duplicate scan spikes</div>
                </div>
                <div
                  className={`switch ${notifs.gateScan ? 'on' : ''}`}
                  onClick={() => toggleNotif('gateScan')}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn-secondary">Cancel</button>
              <button className="btn-primary" onClick={() => alert('Settings saved successfully!')}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'smtp' && (
        <div className="card">
          <div className="card-head">
            <h3>📧 Email Delivery — Brevo / SMTP Configuration</h3>
            <div className="muted-sm">All tickets booked via /seller, customer app, or PR portal will be sent directly through your Brevo account.</div>
          </div>

          <div style={{ background: 'rgba(216,255,63,0.06)', border: '1px solid rgba(216,255,63,0.2)', padding: '16px', borderRadius: '12px', marginBottom: '20px', fontSize: '13px' }}>
            <strong style={{ color: 'var(--volt)' }}>⚡ Recommended: Brevo REST API (Port 443)</strong>
            <p style={{ margin: '6px 0 0', color: 'var(--ink-faint)', fontSize: '12px', lineHeight: 1.5 }}>
              Using Brevo API Key operates over standard HTTPS (Port 443) which bypasses ISP SMTP port blocks and ensures 100% instant ticket delivery.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
            <div className="field">
              <label>Brevo API Key (xkeysib-...)</label>
              <input type="password" placeholder="xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" defaultValue={process.env.BREVO_API_KEY || ''} />
              <div style={{ fontSize: '11px', color: 'var(--ink-faint)', marginTop: '4px' }}>
                Get this key from Brevo Dashboard → <strong>SMTP &amp; API</strong> → <strong>API Keys</strong>.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="field">
                <label>Sender Name</label>
                <input defaultValue="LITTX Events" />
              </div>
              <div className="field">
                <label>Sender Email (Verified in Brevo)</label>
                <input defaultValue="events@littx.com" placeholder="events@yourdomain.com" />
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px', marginTop: '10px' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '14px' }}>Alternative: Brevo SMTP Relay</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="field">
                <label>SMTP Host</label>
                <input defaultValue="smtp-relay.brevo.com" />
              </div>
              <div className="field">
                <label>SMTP Port</label>
                <input defaultValue="587" />
              </div>
              <div className="field">
                <label>SMTP Login Email</label>
                <input defaultValue="littxent@gmail.com" />
              </div>
              <div className="field">
                <label>SMTP Key (xsmtpsib-...)</label>
                <input type="password" placeholder="xsmtpsib-..." />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button className="btn-primary" onClick={() => alert('Brevo configuration saved! All ticket emails will send via Brevo.')}>
              Save Brevo Settings
            </button>
            <button className="btn-secondary" onClick={() => {
              const email = prompt('Enter email address to send test ticket:');
              if (email) {
                fetch(`/api/test-email?to=${encodeURIComponent(email)}`)
                  .then(r => r.json())
                  .then(d => alert(d.message || (d.success ? 'Test ticket email sent successfully via Brevo!' : 'Error sending email.')))
                  .catch(() => alert('Failed to send test email.'));
              }
            }}>
              🧪 Send Test Ticket Email
            </button>
          </div>
        </div>
      )}

      {tab === 'payments' && (
        <div className="card">
          <div className="card-head">
            <h3>Payment Method</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'var(--volt-dim)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(216,255,63,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--volt)' }}>💵 Manual / Cash Only</div>
                <span className="badge badge-volt"><span className="badge-dot" />Active</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>All transactions are collected manually. No payment gateway is configured. Tickets are issued after admin approval.</div>
            </div>
          </div>
        </div>
      )}


    </div>
  )
}
