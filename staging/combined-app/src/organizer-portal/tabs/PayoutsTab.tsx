import React, { useState, useEffect } from 'react'
import { PayoutSummary, PayoutDetails } from '../types'

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
      setSuccess('Settlement bank details submitted successfully!')
      await loadPayouts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update bank details.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ color: 'rgba(245,242,234,0.6)', padding: 32 }}>Loading payout & settlement records…</div>
  }

  const grossRevenue = data?.grossRevenue || 0
  const platformFee = data?.platformFee || 0
  const netPayout = data?.netPayout || 0
  const feePercentage = data?.feePercentage || 5.0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* FINANCIAL SUMMARY CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {/* Gross Revenue */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(216,255,63,0.1), rgba(10,9,18,0.95))',
            border: '1px solid rgba(216,255,63,0.3)',
            borderRadius: 14,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.6)', textTransform: 'uppercase' }}>
            GROSS VERIFIED SALES
          </div>
          <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 28, fontWeight: 800, color: '#D8FF3F', marginTop: 8 }}>
            ₹{grossRevenue.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.5)', marginTop: 6 }}>
            {data?.totalOrders || 0} verified customer ticket transactions
          </div>
        </div>

        {/* Platform Commission Fee */}
        <div
          style={{
            background: 'rgba(20,16,38,0.9)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.6)', textTransform: 'uppercase' }}>
            STAGEWAY PLATFORM FEE ({feePercentage}%)
          </div>
          <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 28, fontWeight: 800, color: 'rgba(245,242,234,0.8)', marginTop: 8 }}>
            ₹{platformFee.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.5)', marginTop: 6 }}>
            Includes ticketing infrastructure, gateway & scanner servers
          </div>
        </div>

        {/* Estimated Net Payout */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(49,231,200,0.15), rgba(10,9,18,0.95))',
            border: '1px solid rgba(49,231,200,0.35)',
            borderRadius: 14,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.6)', textTransform: 'uppercase' }}>
            ESTIMATED NET PAYOUT
          </div>
          <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 28, fontWeight: 900, color: '#31E7C8', marginTop: 8 }}>
            ₹{netPayout.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.5)', marginTop: 6 }}>
            Disbursed next business day following event completion
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ background: 'rgba(255,107,107,0.15)', border: '1px solid #FF6B6B', borderRadius: 10, padding: '12px 16px', color: '#FF6B6B', fontSize: 13 }}>
          {error}
        </div>
      )}

      {success && (
        <div role="status" style={{ background: 'rgba(49,231,200,0.15)', border: '1px solid #31E7C8', borderRadius: 10, padding: '12px 16px', color: '#31E7C8', fontSize: 13 }}>
          {success}
        </div>
      )}

      {/* BANK ACCOUNT & SETTLEMENT DETAILS */}
      <div
        style={{
          background: 'rgba(20,16,38,0.9)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 18, margin: 0 }}>
              Payout Settlement Account
            </h3>
            <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.6)', marginTop: 4 }}>
              Funds are transferred directly via NEFT/RTGS or IMPS to this registered entity
            </div>
          </div>

          <span
            style={{
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 700,
              textTransform: 'uppercase',
              padding: '4px 10px',
              borderRadius: 6,
              background: form.status === 'verified' ? 'rgba(49,231,200,0.15)' : 'rgba(245,185,66,0.15)',
              color: form.status === 'verified' ? '#31E7C8' : '#F5B942',
              border: `1px solid ${form.status === 'verified' ? '#31E7C8' : '#F5B942'}55`,
            }}
          >
            ● {form.status.replace('_', ' ')}
          </span>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 6 }}>
              ACCOUNT HOLDER / LEGAL ENTITY NAME *
            </label>
            <input
              type="text"
              placeholder="e.g. Blue Nile Entertainment Pvt Ltd"
              value={form.accountHolder}
              onChange={e => setForm(prev => ({ ...prev, accountHolder: e.target.value }))}
              required
              style={{
                width: '100%',
                background: 'rgba(10,9,18,0.85)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#F5F2EA',
                fontSize: 13,
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 6 }}>
              BANK NAME
            </label>
            <input
              type="text"
              placeholder="e.g. HDFC Bank, ICICI Bank"
              value={form.bankName}
              onChange={e => setForm(prev => ({ ...prev, bankName: e.target.value }))}
              style={{
                width: '100%',
                background: 'rgba(10,9,18,0.85)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#F5F2EA',
                fontSize: 13,
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 6 }}>
              BANK ACCOUNT NUMBER {form.accountNumberMasked ? `(Current: ${form.accountNumberMasked})` : ''}
            </label>
            <input
              type="text"
              placeholder={form.accountNumberMasked ? 'Enter to update new account number' : 'e.g. 50100234891234'}
              value={form.accountNumber}
              onChange={e => setForm(prev => ({ ...prev, accountNumber: e.target.value }))}
              style={{
                width: '100%',
                background: 'rgba(10,9,18,0.85)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#F5F2EA',
                fontSize: 13,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 6 }}>
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
                background: 'rgba(10,9,18,0.85)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#F5F2EA',
                fontSize: 13,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 6 }}>
              BUSINESS UPI ID (OPTIONAL FAST SETTLEMENT)
            </label>
            <input
              type="text"
              placeholder="e.g. bluenile@hdfcbank"
              value={form.upiId}
              onChange={e => setForm(prev => ({ ...prev, upiId: e.target.value }))}
              style={{
                width: '100%',
                background: 'rgba(10,9,18,0.85)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#F5F2EA',
                fontSize: 13,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                background: '#D8FF3F',
                color: '#0A0912',
                border: 'none',
                padding: '12px 28px',
                borderRadius: 8,
                fontFamily: 'Unbounded, sans-serif',
                fontWeight: 800,
                fontSize: 12,
                cursor: saving ? 'not-allowed' : 'pointer',
                textTransform: 'uppercase',
              }}
            >
              {saving ? 'Updating…' : 'Save Settlement Details'}
            </button>
          </div>
        </form>
      </div>

      {/* SETTLEMENT POLICY & HISTORY */}
      <div
        style={{
          background: 'rgba(20,16,38,0.7)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          padding: 20,
        }}
      >
        <h4 style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 14, margin: '0 0 8px', color: '#D8FF3F' }}>
          ⚡ Next-Day Payout Settlement Policy
        </h4>
        <p style={{ fontSize: 13, color: 'rgba(245,242,234,0.7)', lineHeight: 1.6, margin: 0 }}>
          Stageway automatically initiates payout disbursements within 24 to 48 hours following event closure. Payout amounts reflect total confirmed admissions minus the standard platform commission fee. Bank verification is required prior to initial release.
        </p>
      </div>
    </div>
  )
}
