import React, { useState } from 'react'
import { OrganizerProfile } from '../types'
import { STAGEWAY_THEME } from '../theme'

interface ProfileTabProps {
  profile: OrganizerProfile
  onSaveProfile: (displayName: string, organizationName: string) => Promise<void>
}

export default function ProfileTab({ profile, onSaveProfile }: ProfileTabProps) {
  const [displayName, setDisplayName] = useState(profile.displayName || '')
  const [organizationName, setOrganizationName] = useState(profile.organizationName || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await onSaveProfile(displayName, organizationName)
      setSuccess('Profile updated successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && (
        <div role="alert" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 8, padding: '12px 16px', color: STAGEWAY_THEME.danger, fontSize: 13 }}>
          {error}
        </div>
      )}

      {success && (
        <div role="status" style={{ background: 'rgba(16, 165, 121, 0.12)', border: '1px solid rgba(16, 165, 121, 0.3)', borderRadius: 8, padding: '12px 16px', color: STAGEWAY_THEME.secondary, fontSize: 13 }}>
          {success}
        </div>
      )}

      <div
        style={{
          background: STAGEWAY_THEME.surface,
          border: `1px solid ${STAGEWAY_THEME.border}`,
          borderRadius: 10,
          padding: 24,
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 4px', color: STAGEWAY_THEME.textPrimary }}>
            Organization Entity Profile
          </h2>
          <p style={{ fontSize: 12, color: STAGEWAY_THEME.textMuted, margin: 0 }}>
            This legal name appears on buyer transaction receipts, ticket passes, and tax invoices.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, marginBottom: 6 }}>
              ORGANIZATION / COMPANY NAME
            </label>
            <input
              type="text"
              value={organizationName}
              onChange={e => setOrganizationName(e.target.value)}
              minLength={2}
              maxLength={160}
              required
              style={{
                width: '100%',
                background: '#F8FCFA',
                border: `1px solid ${STAGEWAY_THEME.borderMedium}`,
                borderRadius: 6,
                padding: '9px 12px',
                color: STAGEWAY_THEME.textPrimary,
                fontSize: 13,
                fontWeight: 500,
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, marginBottom: 6 }}>
              PRIMARY CONTACT NAME
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              minLength={2}
              maxLength={120}
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
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, marginBottom: 6 }}>
              VERIFIED IDENTITY EMAIL
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: STAGEWAY_THEME.light,
                border: `1px solid ${STAGEWAY_THEME.border}`,
                borderRadius: 6,
                padding: '9px 12px',
                color: STAGEWAY_THEME.textMuted,
                fontSize: 13,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              <span>{profile.verifiedEmail || 'No email associated'}</span>
              {profile.emailVerified && (
                <span style={{ fontSize: 10, background: 'rgba(16, 165, 121, 0.12)', color: STAGEWAY_THEME.secondary, padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(16, 165, 121, 0.3)' }}>
                  VERIFIED
                </span>
              )}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: STAGEWAY_THEME.textMuted, marginBottom: 6 }}>
              TENANT COMPANY ID
            </label>
            <div
              style={{
                background: STAGEWAY_THEME.light,
                border: `1px solid ${STAGEWAY_THEME.border}`,
                borderRadius: 6,
                padding: '9px 12px',
                color: STAGEWAY_THEME.textMuted,
                fontSize: 12,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {profile.companyId}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                background: STAGEWAY_THEME.primary,
                color: '#FFFFFF',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 12,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
