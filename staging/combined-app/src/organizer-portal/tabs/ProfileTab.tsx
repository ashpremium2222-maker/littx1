import React, { useState } from 'react'
import { OrganizerProfile } from '../types'

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
        <div role="alert" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 8, padding: '12px 16px', color: '#EF4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      {success && (
        <div role="status" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 8, padding: '12px 16px', color: '#10B981', fontSize: 13 }}>
          {success}
        </div>
      )}

      <div
        style={{
          background: '#14161C',
          border: '1px solid #20232B',
          borderRadius: 10,
          padding: 24,
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 4px', color: '#EDEDEF' }}>
            Organization Entity Profile
          </h2>
          <p style={{ fontSize: 12, color: '#8B909A', margin: 0 }}>
            This legal name appears on buyer transaction receipts, ticket passes, and tax invoices.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 6 }}>
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
                background: '#0E1013',
                border: '1px solid #282C36',
                borderRadius: 6,
                padding: '9px 12px',
                color: '#EDEDEF',
                fontSize: 13,
                fontWeight: 500,
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 6 }}>
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
                background: '#0E1013',
                border: '1px solid #282C36',
                borderRadius: 6,
                padding: '9px 12px',
                color: '#EDEDEF',
                fontSize: 13,
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 6 }}>
              VERIFIED IDENTITY EMAIL
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: '#0E1013',
                border: '1px solid #1C1F26',
                borderRadius: 6,
                padding: '9px 12px',
                color: '#8B909A',
                fontSize: 13,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              <span>{profile.verifiedEmail || 'No email associated'}</span>
              {profile.emailVerified && (
                <span style={{ fontSize: 10, background: 'rgba(16, 185, 129, 0.1)', color: '#10B981', padding: '1px 6px', borderRadius: 4 }}>
                  VERIFIED
                </span>
              )}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 6 }}>
              TENANT COMPANY ID
            </label>
            <div
              style={{
                background: '#0E1013',
                border: '1px solid #1C1F26',
                borderRadius: 6,
                padding: '9px 12px',
                color: '#555962',
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
                background: '#EDEDEF',
                color: '#0B0C0E',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 12,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
