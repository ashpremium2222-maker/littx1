import { useState } from 'react'

type SettingsTab = 'profile' | 'smtp' | 'payments' | 'roles' | 'audit' | 'seller-locks'

interface SettingsProps {
  adminKey: string
  testMode?: boolean
}

export default function Settings({ adminKey }: SettingsProps) {
  const [tab, setTab] = useState<SettingsTab>('seller-locks')
  const [wiping, setWiping] = useState(false)
  const [sessions, setSessions] = useState<any[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)

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
                if (t.id === 'seller-locks') loadSessions()
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'seller-locks' && (
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
            <h3>SMTP Mail Configuration</h3>
            <div className="muted-sm">Configure outbound email delivery</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
            <div className="field">
              <label>SMTP Host</label>
              <input defaultValue="smtp.gmail.com" />
            </div>
            <div className="field">
              <label>SMTP Port</label>
              <input defaultValue="465" />
            </div>
            <div className="field">
              <label>User Email</label>
              <input defaultValue="littxent@gmail.com" />
            </div>
            <div className="field">
              <label>App Password</label>
              <input type="password" defaultValue="••••••••••••••••" />
            </div>
          </div>

          <button className="btn-primary" onClick={() => alert('SMTP test email sent!')}>
            Test SMTP Connection
          </button>
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
