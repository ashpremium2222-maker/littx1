import React from 'react'

interface ChangePreviewModalProps {
  companyName: string
  changes: Array<{
    field: string
    category: string
    currentValue: any
    newValue: any
    impact: string
  }>
  reason: string
  setReason: (r: string) => void
  onConfirm: () => void
  onCancel: () => void
}

export default function ChangePreviewModal({
  companyName,
  changes,
  reason,
  setReason,
  onConfirm,
  onCancel
}: ChangePreviewModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onCancel}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '620px',
          padding: 0,
          overflow: 'hidden',
          border: '1px solid rgba(216, 255, 63, 0.3)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.9)'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            background: 'var(--panel-2)',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--volt)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Master Admin Control Confirmation
            </div>
            <h3 style={{ margin: '4px 0 0', fontSize: '1.2rem', color: 'var(--ink)' }}>
              Confirm Settings Changes — {companyName}
            </h3>
          </div>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: '1.4rem' }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', maxHeight: '65vh', overflowY: 'auto' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
            You are modifying <strong>{changes.length} configuration setting(s)</strong> for <strong>{companyName}</strong>. Please review the changes and inherited impact below:
          </div>

          {/* Diff Table */}
          <div style={{ background: 'var(--panel-2)', borderRadius: '12px', border: '1px solid var(--line)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--panel-3)', borderBottom: '1px solid var(--line)', textTransform: 'uppercase', fontSize: '10px', color: 'var(--ink-faint)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Setting / Field</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Current</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>New Value</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--ink)' }}>
                      <div>{c.field}</div>
                      <div style={{ fontSize: '10px', color: 'var(--ink-faint)', fontWeight: 500 }}>{c.impact}</div>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--red)', fontFamily: 'monospace' }}>
                      {String(JSON.stringify(c.currentValue))}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--green)', fontWeight: 700, fontFamily: 'monospace' }}>
                      {String(JSON.stringify(c.newValue))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Reason Input */}
          <div className="field">
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--volt)' }}>
              REASON FOR CHANGE (Recorded in Audit Log)
            </label>
            <input
              type="text"
              placeholder="e.g. Disabling manual payments per commercial contract renewal..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--line)', padding: '10px 14px', borderRadius: '8px', color: 'var(--ink)' }}
            />
          </div>

          {/* Warning banner */}
          <div
            style={{
              background: 'rgba(245, 185, 66, 0.12)',
              border: '1px solid rgba(245, 185, 66, 0.3)',
              color: '#F5B942',
              padding: '12px 16px',
              borderRadius: '10px',
              fontSize: '11.5px',
              lineHeight: 1.4
            }}
          >
            ⚠️ <strong>Inheritance Notice:</strong> Events inheriting company settings will immediately adopt these updated rules. This action will be logged in the permanent Master Admin Audit Trail.
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            background: 'var(--panel-2)',
            borderTop: '1px solid var(--line)',
            display: 'flex',
            justify: 'flex-end',
            gap: '12px'
          }}
        >
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            ✓ Confirm & Apply Changes
          </button>
        </div>
      </div>
    </div>
  )
}
