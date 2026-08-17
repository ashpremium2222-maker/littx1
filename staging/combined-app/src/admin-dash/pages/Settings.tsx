import { useState } from 'react'

type SettingsTab = 'profile' | 'smtp' | 'payments' | 'branding' | 'roles' | 'audit'

interface SettingsProps {
  adminKey: string
  testMode?: boolean
}

export default function Settings({ adminKey }: SettingsProps) {
  const [tab, setTab] = useState<SettingsTab>('profile')
  const [wiping, setWiping] = useState(false)

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
              { id: 'profile', label: 'Profile & Workspace' },
              { id: 'smtp', label: 'SMTP Config' },
              { id: 'payments', label: 'Payment Gateways' },
              { id: 'roles', label: 'Roles & Audit' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

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

      {tab === 'roles' && (
        <div className="card">
          <div className="card-head">
            <h3>Danger Zone & Data Reset</h3>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '16px' }}>
            Wiping test data permanently removes mock bookings and resets financial statistics.
          </p>
          <button
            onClick={handleWipe}
            disabled={wiping}
            style={{
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              backgroundColor: 'var(--red)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: wiping ? 'not-allowed' : 'pointer',
              opacity: wiping ? 0.6 : 1,
            }}
          >
            {wiping ? 'Wiping...' : '⚠️ Danger Wipe Test Data'}
          </button>
        </div>
      )}
    </div>
  )
}
