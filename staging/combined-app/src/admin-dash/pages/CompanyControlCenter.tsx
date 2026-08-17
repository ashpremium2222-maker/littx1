import React, { useState, useEffect } from 'react'
import ChangePreviewModal from './ChangePreviewModal'

interface CompanyStats {
  totalOrders: number
  ticketCount: number
  grossRevenue: number
  platformFee: number
  netCompanyRevenue: number
}

interface CompanyData {
  companyId: string
  name: string
  status: 'ACTIVE' | 'SUSPENDED' | 'PAUSED' | 'TRIAL' | 'EXPIRED'
  statusReason?: string
  commercials: {
    feeType: 'PERCENTAGE' | 'FIXED' | 'HYBRID'
    percentageFee: number
    fixedFeePerTicket: number
  }
  razorpayConfig: {
    enabled: boolean
    keyId: string
    keySecret: string
    webhookSecret: string
    mode: 'TEST' | 'LIVE'
    lockedByMaster: boolean
  }
  manualPaymentConfig: {
    enabled: boolean
    allowedMethods: string[]
    approvalWorkflow: 'AUTO' | 'COMPANY_APPROVAL' | 'MASTER_APPROVAL'
    lockedByMaster: boolean
  }
  features: Record<string, { enabled: boolean; lockedByMaster: boolean }>
  prSettings: {
    commissionType: 'PERCENTAGE' | 'FIXED'
    commissionValue: number
  }
  stats?: CompanyStats
}

type TabType =
  | 'general'
  | 'payment'
  | 'razorpay'
  | 'ticketing'
  | 'pr'
  | 'events'
  | 'checkin'
  | 'features'
  | 'commercials'
  | 'emergency'
  | 'permissions'
  | 'audit'

export default function CompanyControlCenter() {
  const [companies, setCompanies] = useState<CompanyData[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('littlane')
  const [company, setCompany] = useState<CompanyData | null>(null)
  const [effectiveConfig, setEffectiveConfig] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [activeTab, setActiveTab] = useState<TabType>('general')

  // Draft state for edits
  const [draftConfig, setDraftConfig] = useState<any>({})

  // Modal State
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false)
  const [pendingChanges, setPendingChanges] = useState<any[]>([])
  const [changeReason, setChangeReason] = useState<string>('')

  // Fetch Companies List
  const fetchCompanies = async () => {
    try {
      const res = await fetch('/api/master/companies')
      const data = await res.json()
      if (data.success && data.companies) {
        setCompanies(data.companies)
      }
    } catch (err) {
      console.error('Failed to fetch companies:', err)
    }
  }

  // Fetch Company Detail & Control State
  const fetchCompanyDetails = async (id: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/master/companies/${id}/control-center`)
      const data = await res.json()
      if (data.success) {
        setCompany(data.company)
        setEffectiveConfig(data.effectiveConfig)
        setEvents(data.events || [])
        setAuditLogs(data.auditLogs || [])
        setDraftConfig(data.company)
      }
    } catch (err) {
      console.error('Failed to fetch control center state:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCompanies()
  }, [])

  useEffect(() => {
    if (selectedCompanyId) {
      fetchCompanyDetails(selectedCompanyId)
    }
  }, [selectedCompanyId])

  // Trigger Save with Diff Calculation
  const handleInitiateSave = () => {
    if (!company) return
    const diffs: any[] = []

    // Helper to compare object paths
    const checkDiff = (fieldLabel: string, category: string, curr: any, nextVal: any, impactMsg: string) => {
      if (JSON.stringify(curr) !== JSON.stringify(nextVal)) {
        diffs.push({
          field: fieldLabel,
          category,
          currentValue: curr,
          newValue: nextVal,
          impact: impactMsg
        })
      }
    }

    checkDiff('Company Status', 'GENERAL', company.status, draftConfig.status, 'Blocks or enables all ticket sales for company')
    checkDiff('Razorpay Status', 'PAYMENT', company.razorpayConfig?.enabled, draftConfig.razorpayConfig?.enabled, 'Affects online payment availability across all events')
    checkDiff('Razorpay Lock', 'PAYMENT', company.razorpayConfig?.lockedByMaster, draftConfig.razorpayConfig?.lockedByMaster, 'Prevents company admin from changing online payment setting')
    checkDiff('Manual Payments', 'PAYMENT', company.manualPaymentConfig?.enabled, draftConfig.manualPaymentConfig?.enabled, 'Enables/disables cash payments across company')
    checkDiff('Manual Approval Workflow', 'PAYMENT', company.manualPaymentConfig?.approvalWorkflow, draftConfig.manualPaymentConfig?.approvalWorkflow, 'Changes approval requirement for cash ticket issuance')
    checkDiff('PR Portal Feature', 'FEATURES', company.features?.prPortal?.enabled, draftConfig.features?.prPortal?.enabled, 'Toggles PR login portal access')
    checkDiff('PR Ticket Sales', 'FEATURES', company.features?.prSales?.enabled, draftConfig.features?.prSales?.enabled, 'Blocks PR partners from issuing tickets')
    checkDiff('Platform Fee Type', 'COMMERCIALS', company.commercials?.feeType, draftConfig.commercials?.feeType, 'Changes LITTX platform commission calculation')
    checkDiff('Percentage Fee %', 'COMMERCIALS', company.commercials?.percentageFee, draftConfig.commercials?.percentageFee, 'Updates percentage split on gross sales')
    checkDiff('Fixed Fee ₹', 'COMMERCIALS', company.commercials?.fixedFeePerTicket, draftConfig.commercials?.fixedFeePerTicket, 'Updates fixed per-ticket platform charge')

    if (diffs.length === 0) {
      alert('No configuration changes detected.')
      return
    }

    setPendingChanges(diffs)
    setShowPreviewModal(true)
  }

  // Execute Save API
  const handleConfirmSave = async () => {
    if (!company) return
    try {
      const updates = {
        name: draftConfig.name,
        status: draftConfig.status,
        statusReason: draftConfig.statusReason,
        commercials: draftConfig.commercials,
        razorpayConfig: draftConfig.razorpayConfig,
        manualPaymentConfig: draftConfig.manualPaymentConfig,
        features: draftConfig.features,
        prSettings: draftConfig.prSettings
      }

      const res = await fetch(`/api/master/companies/${selectedCompanyId}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates,
          adminUser: 'LITTX Master Admin',
          reason: changeReason || 'Configuration update via Control Center'
        })
      })

      const data = await res.json()
      if (data.success) {
        setShowPreviewModal(false)
        setChangeReason('')
        fetchCompanyDetails(selectedCompanyId)
        fetchCompanies()
      } else {
        alert(`Error: ${data.message}`)
      }
    } catch (err) {
      alert('Failed to save configuration.')
    }
  }

  // Emergency Trigger
  const handleEmergencyAction = async (action: string, label: string) => {
    if (!confirm(`🚨 EMERGENCY ACTION: Are you sure you want to execute "${label}" for ${company?.name}?`)) return
    try {
      const res = await fetch(`/api/master/companies/${selectedCompanyId}/emergency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          statusReason: `Emergency override triggered: ${label}`,
          adminUser: 'LITTX Master Admin'
        })
      })
      const data = await res.json()
      if (data.success) {
        fetchCompanyDetails(selectedCompanyId)
        fetchCompanies()
      }
    } catch (err) {
      alert('Emergency action failed.')
    }
  }

  if (loading && !company) {
    return <div style={{ padding: '40px', color: 'var(--ink-faint)', textAlign: 'center' }}>Loading Company Control Center…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header & Company Selector */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #15121F 0%, #0A0912 100%)', border: '1px solid rgba(216,255,63,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'var(--volt-dim)', border: '1px solid rgba(216,255,63,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--volt)', fontSize: '1.4rem' }}>
              🏛️
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="badge-pro" style={{ background: 'var(--volt)', color: '#0A0912', fontWeight: 900 }}>LITTX MASTER ADMIN</span>
                <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Platform Governance Center</span>
              </div>
              <h2 style={{ margin: '4px 0 0', fontSize: '1.4rem', color: 'var(--ink)' }}>Company Control & Override Console</h2>
            </div>
          </div>

          {/* Selector & Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase' }}>Select Company</span>
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                style={{
                  background: 'var(--panel-2)',
                  border: '1px solid var(--volt)',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  color: 'var(--volt)',
                  fontWeight: 700,
                  fontSize: '13px',
                  outline: 'none'
                }}
              >
                {companies.map((c) => (
                  <option key={c.companyId} value={c.companyId}>
                    {c.name} ({c.status})
                  </option>
                ))}
              </select>
            </div>

            {company && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase' }}>Status</span>
                <span
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    background: company.status === 'ACTIVE' ? 'rgba(61,220,132,0.15)' : 'rgba(255,107,107,0.15)',
                    color: company.status === 'ACTIVE' ? 'var(--green)' : 'var(--red)',
                    border: `1px solid ${company.status === 'ACTIVE' ? 'rgba(61,220,132,0.3)' : 'rgba(255,107,107,0.3)'}`
                  }}
                >
                  ● {company.status}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Control Tabs Navigation */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', borderBottom: '1px solid var(--line)' }}>
        {[
          { id: 'general', label: 'General' },
          { id: 'payment', label: 'Payment Settings' },
          { id: 'razorpay', label: 'Razorpay Config' },
          { id: 'ticketing', label: 'Ticketing Rules' },
          { id: 'pr', label: 'PR Settings' },
          { id: 'events', label: 'Event Overrides' },
          { id: 'checkin', label: 'Check-in Rules' },
          { id: 'features', label: 'Feature Access' },
          { id: 'commercials', label: 'Platform Fees' },
          { id: 'emergency', label: '🚨 Emergency Controls' },
          { id: 'permissions', label: 'User Roles' },
          { id: 'audit', label: 'Audit Trail' }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as TabType)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              background: activeTab === t.id ? 'var(--volt-dim)' : 'var(--panel-2)',
              color: activeTab === t.id ? 'var(--volt)' : 'var(--ink-soft)',
              boxShadow: activeTab === t.id ? '0 0 10px rgba(216,255,63,0.15)' : 'none'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT SECTIONS */}
      {company && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* TAB 1: GENERAL */}
          {activeTab === 'general' && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card-head">
                <h3>Company General Overview & Status</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="field">
                  <label>Company Name</label>
                  <input
                    value={draftConfig.name || ''}
                    onChange={(e) => setDraftConfig({ ...draftConfig, name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Company Status</label>
                  <select
                    value={draftConfig.status || 'ACTIVE'}
                    onChange={(e) => setDraftConfig({ ...draftConfig, status: e.target.value })}
                  >
                    <option value="ACTIVE">ACTIVE (Normal Operations)</option>
                    <option value="PAUSED">PAUSED (Temporary Hold)</option>
                    <option value="SUSPENDED">SUSPENDED (Master Admin Lock)</option>
                    <option value="TRIAL">TRIAL (Evaluation Mode)</option>
                    <option value="EXPIRED">EXPIRED (Account Ended)</option>
                  </select>
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Status Reason / Notice</label>
                  <input
                    placeholder="Provide reason for suspension or hold..."
                    value={draftConfig.statusReason || ''}
                    onChange={(e) => setDraftConfig({ ...draftConfig, statusReason: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PAYMENT SETTINGS */}
          {activeTab === 'payment' && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card-head">
                <h3>Payment Method Control Center</h3>
                <div className="muted-sm">Configure permitted checkout channels</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Razorpay Master Toggle */}
                <div style={{ background: 'var(--panel-2)', padding: '16px', borderRadius: '12px', border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>Razorpay / Online Payments</div>
                      <div style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>Enable online gateway checkout</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={draftConfig.razorpayConfig?.enabled ?? true}
                      onChange={(e) => setDraftConfig({
                        ...draftConfig,
                        razorpayConfig: { ...draftConfig.razorpayConfig, enabled: e.target.checked }
                      })}
                      style={{ width: '20px', height: '20px', accentColor: 'var(--volt)' }}
                    />
                  </div>
                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={draftConfig.razorpayConfig?.lockedByMaster ?? false}
                      onChange={(e) => setDraftConfig({
                        ...draftConfig,
                        razorpayConfig: { ...draftConfig.razorpayConfig, lockedByMaster: e.target.checked }
                      })}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--volt)', fontWeight: 700 }}>🔒 Lock for Company Admin</span>
                  </div>
                </div>

                {/* Manual Cash Master Toggle */}
                <div style={{ background: 'var(--panel-2)', padding: '16px', borderRadius: '12px', border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>Manual / Cash Payments</div>
                      <div style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>Enable manual cash ticket generation</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={draftConfig.manualPaymentConfig?.enabled ?? true}
                      onChange={(e) => setDraftConfig({
                        ...draftConfig,
                        manualPaymentConfig: { ...draftConfig.manualPaymentConfig, enabled: e.target.checked }
                      })}
                      style={{ width: '20px', height: '20px', accentColor: 'var(--volt)' }}
                    />
                  </div>
                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={draftConfig.manualPaymentConfig?.lockedByMaster ?? false}
                      onChange={(e) => setDraftConfig({
                        ...draftConfig,
                        manualPaymentConfig: { ...draftConfig.manualPaymentConfig, lockedByMaster: e.target.checked }
                      })}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--volt)', fontWeight: 700 }}>🔒 Lock for Company Admin</span>
                  </div>
                </div>
              </div>

              {/* Approval Workflow */}
              <div className="field">
                <label>Manual Cash Approval Requirement</label>
                <select
                  value={draftConfig.manualPaymentConfig?.approvalWorkflow || 'COMPANY_APPROVAL'}
                  onChange={(e) => setDraftConfig({
                    ...draftConfig,
                    manualPaymentConfig: { ...draftConfig.manualPaymentConfig, approvalWorkflow: e.target.value }
                  })}
                >
                  <option value="AUTO">Automatic Approval (Instant Pass Generation)</option>
                  <option value="COMPANY_APPROVAL">Company Admin Approval Required</option>
                  <option value="MASTER_APPROVAL">LITTX Master Admin Approval Required</option>
                </select>
              </div>
            </div>
          )}

          {/* TAB 3: RAZORPAY INTEGRATION */}
          {activeTab === 'razorpay' && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card-head">
                <h3>Company Razorpay Integration Configuration</h3>
                <div className="muted-sm">Manage payment gateway credentials securely</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="field">
                  <label>Razorpay Key ID</label>
                  <input
                    value={draftConfig.razorpayConfig?.keyId || ''}
                    onChange={(e) => setDraftConfig({
                      ...draftConfig,
                      razorpayConfig: { ...draftConfig.razorpayConfig, keyId: e.target.value }
                    })}
                  />
                </div>
                <div className="field">
                  <label>Razorpay Secret Key (Masked)</label>
                  <input
                    type="password"
                    value={draftConfig.razorpayConfig?.keySecret || '••••••••••••••••'}
                    onChange={(e) => setDraftConfig({
                      ...draftConfig,
                      razorpayConfig: { ...draftConfig.razorpayConfig, keySecret: e.target.value }
                    })}
                  />
                </div>
                <div className="field">
                  <label>Environment Mode</label>
                  <select
                    value={draftConfig.razorpayConfig?.mode || 'LIVE'}
                    onChange={(e) => setDraftConfig({
                      ...draftConfig,
                      razorpayConfig: { ...draftConfig.razorpayConfig, mode: e.target.value }
                    })}
                  >
                    <option value="LIVE">LIVE (Real Money Charge)</option>
                    <option value="TEST">TEST (Sandbox Simulation)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Webhook Status</label>
                  <div style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', color: 'var(--green)', fontWeight: 700 }}>
                    ✓ Connected & Active
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PR SETTINGS */}
          {activeTab === 'pr' && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card-head">
                <h3>PR Partner & Commission Controls</h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="field">
                  <label>Commission Type</label>
                  <select
                    value={draftConfig.prSettings?.commissionType || 'PERCENTAGE'}
                    onChange={(e) => setDraftConfig({
                      ...draftConfig,
                      prSettings: { ...draftConfig.prSettings, commissionType: e.target.value }
                    })}
                  >
                    <option value="PERCENTAGE">Percentage of Sale (%)</option>
                    <option value="FIXED">Fixed Amount per Ticket (₹)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Commission Value ({draftConfig.prSettings?.commissionType === 'PERCENTAGE' ? '%' : '₹'})</label>
                  <input
                    type="number"
                    value={draftConfig.prSettings?.commissionValue ?? 10}
                    onChange={(e) => setDraftConfig({
                      ...draftConfig,
                      prSettings: { ...draftConfig.prSettings, commissionValue: parseFloat(e.target.value) || 0 }
                    })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: EVENT OVERRIDES */}
          {activeTab === 'events' && (
            <div className="card table-card">
              <div className="card-head" style={{ padding: '18px 18px 0' }}>
                <h3>Per-Event Payment & Rule Overrides</h3>
                <div className="muted-sm">Event-specific overrides inheriting from company defaults</div>
              </div>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Event Name</th>
                      <th>Date</th>
                      <th>Online Payment</th>
                      <th>Manual Cash</th>
                      <th>PR Sales</th>
                      <th>Effective Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e._id || e.name}>
                        <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{e.name}</td>
                        <td>{e.date || 'TBD'}</td>
                        <td>
                          <span className="badge badge-volt">
                            {e.overrides?.razorpayEnabled ?? draftConfig.razorpayConfig?.enabled ? '✓ Enabled' : '✕ Disabled'}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-volt">
                            {e.overrides?.manualPaymentEnabled ?? draftConfig.manualPaymentConfig?.enabled ? '✓ Enabled' : '✕ Disabled'}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-green">
                            {e.overrides?.prSalesEnabled ?? draftConfig.features?.prSales?.enabled ? '✓ Enabled' : '✕ Disabled'}
                          </span>
                        </td>
                        <td style={{ fontSize: '10.5px', color: 'var(--ink-faint)' }}>
                          {e.overrides ? 'Custom Overrides' : 'Inheriting Company Default'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 8: FEATURE ACCESS */}
          {activeTab === 'features' && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card-head">
                <h3>Feature Access & Lock Matrix</h3>
                <div className="muted-sm">Enable/disable core module features per company</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[
                  { key: 'prPortal', label: 'PR Portal Access' },
                  { key: 'prSales', label: 'PR Partner Ticket Selling' },
                  { key: 'ticketTransfers', label: 'Ticket Transfers' },
                  { key: 'refunds', label: 'Customer Refunds' },
                  { key: 'couponCodes', label: 'Coupon Codes & Discounts' },
                  { key: 'qrCheckIn', label: 'QR Code Check-in' },
                  { key: 'offlineScan', label: 'Offline Gate Scan' },
                  { key: 'allowReEntry', label: 'Allow Re-Entry' }
                ].map((f) => {
                  const feat = draftConfig.features?.[f.key] || { enabled: true, lockedByMaster: false }
                  return (
                    <div key={f.key} style={{ background: 'var(--panel-2)', padding: '14px', borderRadius: '10px', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>{f.label}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                          <input
                            type="checkbox"
                            checked={feat.lockedByMaster}
                            onChange={(e) => setDraftConfig({
                              ...draftConfig,
                              features: {
                                ...draftConfig.features,
                                [f.key]: { ...feat, lockedByMaster: e.target.checked }
                              }
                            })}
                          />
                          <span style={{ fontSize: '10px', color: 'var(--volt)', fontWeight: 700 }}>Master Locked</span>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={feat.enabled}
                        onChange={(e) => setDraftConfig({
                          ...draftConfig,
                          features: {
                            ...draftConfig.features,
                            [f.key]: { ...feat, enabled: e.target.checked }
                          }
                        })}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--volt)' }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 9: COMMERCIALS & PLATFORM FEES */}
          {activeTab === 'commercials' && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card-head">
                <h3>LITTX Platform Commercials & Fee Calculator</h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="field">
                  <label>Fee Calculation Type</label>
                  <select
                    value={draftConfig.commercials?.feeType || 'PERCENTAGE'}
                    onChange={(e) => setDraftConfig({
                      ...draftConfig,
                      commercials: { ...draftConfig.commercials, feeType: e.target.value }
                    })}
                  >
                    <option value="PERCENTAGE">Percentage of Revenue (%)</option>
                    <option value="FIXED">Fixed Fee per Ticket (₹)</option>
                    <option value="HYBRID">Hybrid (% + Fixed Fee)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Percentage Fee (%)</label>
                  <input
                    type="number"
                    value={draftConfig.commercials?.percentageFee ?? 5}
                    onChange={(e) => setDraftConfig({
                      ...draftConfig,
                      commercials: { ...draftConfig.commercials, percentageFee: parseFloat(e.target.value) || 0 }
                    })}
                  />
                </div>
                <div className="field">
                  <label>Fixed Fee per Ticket (₹)</label>
                  <input
                    type="number"
                    value={draftConfig.commercials?.fixedFeePerTicket ?? 0}
                    onChange={(e) => setDraftConfig({
                      ...draftConfig,
                      commercials: { ...draftConfig.commercials, fixedFeePerTicket: parseFloat(e.target.value) || 0 }
                    })}
                  />
                </div>
              </div>

              {/* Commercials Simulation Box */}
              {company.stats && (
                <div style={{ background: 'var(--volt-dim)', border: '1px solid rgba(216,255,63,0.2)', padding: '16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--volt)', fontWeight: 800 }}>COMMERCIAL SPLIT SIMULATION</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '4px' }}>
                      Gross: <strong>₹{company.stats.grossRevenue.toLocaleString()}</strong> ({company.stats.ticketCount} tickets)
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', color: 'var(--volt)', fontWeight: 800 }}>
                      LITTX Platform Fee: ₹{company.stats.platformFee.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-faint)', marginTop: '2px' }}>
                      Company Net: ₹{company.stats.netCompanyRevenue.toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 10: EMERGENCY CONTROLS */}
          {activeTab === 'emergency' && (
            <div className="card" style={{ border: '1px solid rgba(255,107,107,0.3)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card-head">
                <h3 style={{ color: 'var(--red)' }}>🚨 Emergency Overrides & Account Locks</h3>
                <div className="muted-sm">Immediate kill-switches for platform security</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <button
                  className="btn"
                  onClick={() => handleEmergencyAction('SUSPEND_COMPANY', 'Suspend Company Account')}
                  style={{ background: 'rgba(255,107,107,0.15)', color: 'var(--red)', border: '1px solid rgba(255,107,107,0.3)', padding: '14px', fontWeight: 800, borderRadius: '10px' }}
                >
                  ⛔ Suspend Entire Company
                </button>
                <button
                  className="btn"
                  onClick={() => handleEmergencyAction('ACTIVATE_COMPANY', 'Re-Activate Company Account')}
                  style={{ background: 'rgba(61,220,132,0.15)', color: 'var(--green)', border: '1px solid rgba(61,220,132,0.3)', padding: '14px', fontWeight: 800, borderRadius: '10px' }}
                >
                  ✅ Re-Activate Company
                </button>
                <button
                  className="btn"
                  onClick={() => handleEmergencyAction('DISABLE_ONLINE_PAYMENTS', 'Disable Online Payments')}
                  style={{ background: 'var(--panel-2)', color: 'var(--ink)', border: '1px solid var(--line)', padding: '14px', fontWeight: 700, borderRadius: '10px' }}
                >
                  💳 Disable Online Payments
                </button>
                <button
                  className="btn"
                  onClick={() => handleEmergencyAction('DISABLE_PR_SALES', 'Freeze PR Partner Sales')}
                  style={{ background: 'var(--panel-2)', color: 'var(--ink)', border: '1px solid var(--line)', padding: '14px', fontWeight: 700, borderRadius: '10px' }}
                >
                  🛑 Freeze PR Partner Sales
                </button>
              </div>
            </div>
          )}

          {/* TAB 12: AUDIT LOGS */}
          {activeTab === 'audit' && (
            <div className="card table-card">
              <div className="card-head" style={{ padding: '18px 18px 0' }}>
                <h3>Configuration Audit Trail</h3>
                <div className="muted-sm">Permanent record of Master Admin configuration overrides</div>
              </div>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Admin User</th>
                      <th>Field Changed</th>
                      <th>Previous Value</th>
                      <th>New Value</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.logId || log.timestamp}>
                        <td style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                          {new Date(log.timestamp).toLocaleString('en-IN')}
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--volt)' }}>{log.adminUser}</td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{log.fieldChanged}</td>
                        <td style={{ color: 'var(--red)', fontFamily: 'monospace', fontSize: '11px' }}>
                          {JSON.stringify(log.previousValue)}
                        </td>
                        <td style={{ color: 'var(--green)', fontFamily: 'monospace', fontSize: '11px', fontWeight: 700 }}>
                          {JSON.stringify(log.newValue)}
                        </td>
                        <td style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>{log.reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Save Changes Floating Action Bar */}
          <div
            style={{
              position: 'sticky',
              bottom: '20px',
              background: 'var(--panel-2)',
              border: '1px solid var(--volt)',
              padding: '14px 20px',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
              zIndex: 100
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
              Working on <strong>{company.name}</strong> configuration
            </div>
            <button className="btn btn-primary" onClick={handleInitiateSave} style={{ padding: '10px 24px', fontSize: '13px' }}>
              ✓ Save Configuration Changes
            </button>
          </div>

        </div>
      )}

      {/* Confirmation Modal */}
      {showPreviewModal && company && (
        <ChangePreviewModal
          companyName={company.name}
          changes={pendingChanges}
          reason={changeReason}
          setReason={setChangeReason}
          onConfirm={handleConfirmSave}
          onCancel={() => setShowPreviewModal(false)}
        />
      )}
    </div>
  )
}
