import React, { useState } from 'react'

export default function MasterSystemSettings() {
  const [defaultPercentageFee, setDefaultPercentageFee] = useState(5)
  const [defaultFixedFee, setDefaultFixedFee] = useState(0)
  const [razorpayDefault, setRazorpayDefault] = useState(true)
  const [manualDefault, setManualDefault] = useState(true)
  const [prPortalDefault, setPrPortalDefault] = useState(true)
  const [maintenanceMode, setMaintenanceMode] = useState(false)

  const handleSaveSystemDefaults = () => {
    alert('✅ Global LITTX System Defaults saved successfully!')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="card" style={{ background: 'linear-gradient(135deg, #0F0D1A 0%, #0A0912 100%)', border: '1px solid rgba(216,255,63,0.2)' }}>
        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--volt)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          GLOBAL SYSTEM CONFIGURATION
        </div>
        <h2 style={{ margin: '4px 0 0', fontSize: '1.4rem', color: 'var(--ink)' }}>LITTX Platform System Defaults & Security Settings</h2>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="card-head">
          <h3>Default Platform Fee Structure</h3>
          <div className="muted-sm">Inherited by newly created event companies</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="field">
            <label>Default Percentage Commission (%)</label>
            <input
              type="number"
              value={defaultPercentageFee}
              onChange={(e) => setDefaultPercentageFee(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label>Default Fixed Fee per Ticket (₹)</label>
            <input
              type="number"
              value={defaultFixedFee}
              onChange={(e) => setDefaultFixedFee(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="card-head" style={{ marginTop: '10px' }}>
          <h3>Default Feature & Payment Settings for New Tenants</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ background: 'var(--panel-2)', padding: '14px', borderRadius: '10px', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>Razorpay Enabled by Default</span>
            <input type="checkbox" checked={razorpayDefault} onChange={(e) => setRazorpayDefault(e.target.checked)} style={{ accentColor: 'var(--volt)' }} />
          </div>

          <div style={{ background: 'var(--panel-2)', padding: '14px', borderRadius: '10px', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>Manual Payments Enabled by Default</span>
            <input type="checkbox" checked={manualDefault} onChange={(e) => setManualDefault(e.target.checked)} style={{ accentColor: 'var(--volt)' }} />
          </div>

          <div style={{ background: 'var(--panel-2)', padding: '14px', borderRadius: '10px', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>PR Portal Enabled by Default</span>
            <input type="checkbox" checked={prPortalDefault} onChange={(e) => setPrPortalDefault(e.target.checked)} style={{ accentColor: 'var(--volt)' }} />
          </div>

          <div style={{ background: 'rgba(255,107,107,0.1)', padding: '14px', borderRadius: '10px', border: '1px solid rgba(255,107,107,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--red)' }}>Global System Maintenance Mode</span>
            <input type="checkbox" checked={maintenanceMode} onChange={(e) => setMaintenanceMode(e.target.checked)} />
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleSaveSystemDefaults} style={{ marginTop: '10px', alignSelf: 'flex-start' }}>
          ✓ Save Global System Defaults
        </button>
      </div>
    </div>
  )
}
