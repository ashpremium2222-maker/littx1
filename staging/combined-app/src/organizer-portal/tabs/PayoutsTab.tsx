import React, { useState, useEffect } from 'react'
import { PayoutSummary, PayoutDetails } from '../types'
import { STAGEWAY_THEME } from '../theme'

export default function PayoutsTab() {
  const [data, setData] = useState<PayoutSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState<PayoutDetails>({
    accountHolder: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    upiId: '',
    status: 'pending_verification',
  })

  const loadPayouts = async () => {
    setLoading(true)
    setError('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const res = await fetch('/api/organizer/payouts', {
        headers: { 'x-auth-token': token },
        cache: 'no-store',
      })
      const result = await res.json()
      if (!res.ok || !result.success) throw new Error(result.message || 'Failed to load payouts.')
      setData(result.payouts)
      if (result.payouts?.payoutDetails) {
        setForm({
          accountHolder: result.payouts.payoutDetails.accountHolder || '',
          bankName: result.payouts.payoutDetails.bankName || '',
          accountNumber: '',
          ifscCode: result.payouts.payoutDetails.ifscCode || '',
          upiId: result.payouts.payoutDetails.upiId || '',
          status: result.payouts.payoutDetails.status || 'pending_verification',
          accountNumberMasked: result.payouts.payoutDetails.accountNumberMasked || '',
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payout details.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPayouts()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const res = await fetch('/api/organizer/payouts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify(form),
      })
      const result = await res.json()
      if (!res.ok || !result.success) throw new Error(result.message || 'Failed to update bank details.')
      setSuccess('Settlement bank details submitted successfully.')
      await loadPayouts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update bank details.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ color: STAGEWAY_THEME.textMuted, padding: 32 }}>Loading payout &amp; settlement records...</div>
  }

  const grossRevenue = data?.grossRevenue || 0
  const platformFee = data?.platformFee || 0
  const netPayout = data?.netPayout || 0
  const feePercentage = data?.feePercentage || 5.0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* FINANCIAL SUMMARY METRICS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <div
          style={{
            background: STAGEWAY_THEME.surface,
            border: `1px solid ${STAGEWAY_THEME.border}`,
            borderRadius: 10,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Gross Verified Revenue
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: STAGEWAY_THEME.primary, marginTop: 8, letterSpacing: '-0.02em' }}>
            ₹{grossRevenue.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, marginTop: 4 }}>
            From {data?.totalOrders || 0} confirmed ticket transactions
          </div>
        </div>

        <div
          style={{
            background: STAGEWAY_THEME.surface,
            border: `1px solid ${STAGEWAY_THEME.border}`,
            borderRadius: 10,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Platform Fee ({feePercentage}%)
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: STAGEWAY_THEME.primary, marginTop: 8, letterSpacing: '-0.02em' }}>
            ₹{platformFee.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, marginTop: 4 }}>
            Direct payment processing, QR tickets, gate scanners
          </div>
        </div>

        <div
          style={{
            background: STAGEWAY_THEME.surface,
            border: `1px solid ${STAGEWAY_THEME.border}`,
            borderRadius: 10,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Estimated Net Payout
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: STAGEWAY_THEME.primary, marginTop: 8, letterSpacing: '-0.02em' }}>
            ₹{netPayout.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, marginTop: 4 }}>
            Calculated post-event net balance for remittance
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 8, padding: '12px 16px', color: '#EF4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      {success && (
        <div role="status" style={{ background: 'rgba(16, 165, 121, 0.12)', border: '1px solid rgba(16, 165, 121, 0.3)', borderRadius: 8, padding: '12px 16px', color: STAGEWAY_THEME.secondary, fontSize: 13 }}>
          {success}
        </div>
      )}

      {/* BANK ACCOUNT & SETTLEMENT DETAILS */}
      <div
        style={{
          background: STAGEWAY_THEME.surface,
          border: `1px solid ${STAGEWAY_THEME.border}`,
          borderRadius: 10,
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: STAGEWAY_THEME.textPrimary, margin: 0 }}>
              Settlement Bank Account
            </h3>
            <div style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, marginTop: 2 }}>
              Bank account for automated NEFT/RTGS disbursements
            </div>
          </div>

          <span
            style={{
              fontSize: 10,
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 600,
              textTransform: 'uppercase',
              padding: '3px 8px',
              borderRadius: 4,
              background: form.status === 'verified' ? 'rgba(16, 165, 121, 0.12)' : 'rgba(217, 119, 6, 0.12)',
              color: form.status === 'verified' ? STAGEWAY_THEME.secondary : STAGEWAY_THEME.warning,
              border: `1px solid ${form.status === 'verified' ? 'rgba(16, 165, 121, 0.3)' : 'rgba(217, 119, 6, 0.3)'}`,
            }}
          >
            &bull; {form.status.replace('_', ' ')}
          </span>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.primary, marginBottom: 6 }}>
              LEGAL ENTITY / BENEFICIARY NAME *
            </label>
            <input
              type="text"
              placeholder="e.g. Stageway Entertainment Pvt Ltd"
              value={form.accountHolder}
              onChange={e => setForm(prev => ({ ...prev, accountHolder: e.target.value }))}
              required
              style={{
                width: '100%',
                background: '#F8FCFA',
                border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                borderRadius: 6,
                padding: '9px 12px',
                color: STAGEWAY_THEME.textPrimary,
                fontSize: 13,
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.primary, marginBottom: 6 }}>
              BANK INSTITUTION NAME
            </label>
            <input
              type="text"
              placeholder="e.g. HDFC Bank, ICICI Bank"
              value={form.bankName}
              onChange={e => setForm(prev => ({ ...prev, bankName: e.target.value }))}
              style={{
                width: '100%',
                background: '#F8FCFA',
                border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                borderRadius: 6,
                padding: '9px 12px',
                color: STAGEWAY_THEME.textPrimary,
                fontSize: 13,
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.primary, marginBottom: 6 }}>
              ACCOUNT NUMBER {form.accountNumberMasked ? `(Current: ${form.accountNumberMasked})` : ''}
            </label>
            <input
              type="text"
              placeholder={form.accountNumberMasked ? 'Enter to update new account number' : 'e.g. 50100234891234'}
              value={form.accountNumber}
              onChange={e => setForm(prev => ({ ...prev, accountNumber: e.target.value }))}
              style={{
                width: '100%',
                background: '#F8FCFA',
                border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                borderRadius: 6,
                padding: '9px 12px',
                color: STAGEWAY_THEME.textPrimary,
                fontSize: 13,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.primary, marginBottom: 6 }}>
              IFSC CODE
            </label>
            <input
              type="text"
              placeholder="e.g. HDFC0001234"
              value={form.ifscCode}
              onChange={e => setForm(prev => ({ ...prev, ifscCode: e.target.value.toUpperCase() }))}
              maxLength={11}
              style={{
                width: '100%',
                background: '#F8FCFA',
                border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                borderRadius: 6,
                padding: '9px 12px',
                color: STAGEWAY_THEME.textPrimary,
                fontSize: 13,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.primary, marginBottom: 6 }}>
              BUSINESS UPI VPA (OPTIONAL FAST SETTLEMENT)
            </label>
            <input
              type="text"
              placeholder="e.g. company@hdfcbank"
              value={form.upiId}
              onChange={e => setForm(prev => ({ ...prev, upiId: e.target.value }))}
              style={{
                width: '100%',
                background: '#F8FCFA',
                border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                borderRadius: 6,
                padding: '9px 12px',
                color: STAGEWAY_THEME.textPrimary,
                fontSize: 13,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                background: STAGEWAY_THEME.primary,
                color: '#FFFFFF',
                border: 'none',
                padding: '10px 22px',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 12,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Updating...' : 'Save Settlement Details'}
            </button>
          </div>
        </form>
      </div>

      {/* DISBURSEMENT TIMELINE */}
      <div
        style={{
          background: STAGEWAY_THEME.light,
          border: `1px solid ${STAGEWAY_THEME.border}`,
          borderRadius: 10,
          padding: 20,
        }}
      >
        <h4 style={{ fontSize: 14, fontWeight: 600, color: STAGEWAY_THEME.textPrimary, margin: '0 0 6px' }}>
          Settlement Policy &amp; Schedule
        </h4>
        <p style={{ fontSize: 13, color: STAGEWAY_THEME.textSecondary, lineHeight: 1.6, margin: 0 }}>
          Stageway processes event payouts within 24-48 hours following event closure. Payout amounts reflect total confirmed admissions minus the standard platform commission fee. Bank verification is required prior to initial release.
        </p>
      </div>
    </div>
  )
}
