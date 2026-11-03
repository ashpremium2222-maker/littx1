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
      setSuccess('Profile updated successfully!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 840, display: 'flex', flexDirection: 'column', gap: 20 }}>
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

      <div
        style={{
          background: 'rgba(20,16,38,0.9)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          padding: 24,
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 18, margin: '0 0 6px', color: '#F5F2EA' }}>
            Organizer Brand Profile
          </h2>
          <p style={{ fontSize: 12, color: 'rgba(245,242,234,0.6)', margin: 0 }}>
            Your organization name appears on event listings, buyer confirmation emails, and digital QR ticket passes.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 6 }}>
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
                background: 'rgba(10,9,18,0.85)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#F5F2EA',
                fontSize: 14,
                fontWeight: 600,
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 6 }}>
              CONTACT REPRESENTATIVE NAME
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
                background: 'rgba(10,9,18,0.85)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#F5F2EA',
                fontSize: 14,
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 6 }}>
              VERIFIED CONTACT EMAIL
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'rgba(10,9,18,0.5)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: '10px 14px',
                color: 'rgba(245,242,234,0.7)',
                fontSize: 13,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              <span>{profile.verifiedEmail || 'No email associated'}</span>
              {profile.emailVerified && (
                <span style={{ fontSize: 10, background: 'rgba(49,231,200,0.15)', color: '#31E7C8', padding: '2px 6px', borderRadius: 4 }}>
                  VERIFIED
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(245,242,234,0.4)', marginTop: 4 }}>
              Contact email is locked for account security. Changing it requires platform re-verification.
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 6 }}>
              COMPANY IDENTIFIER
            </label>
            <div
              style={{
                background: 'rgba(10,9,18,0.5)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: '10px 14px',
                color: 'rgba(245,242,234,0.5)',
                fontSize: 12,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {profile.companyId}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                background: '#D8FF3F',
                color: '#0A0912',
                border: 'none',
                padding: '12px 24px',
                borderRadius: 8,
                fontFamily: 'Unbounded, sans-serif',
                fontWeight: 700,
                fontSize: 12,
                cursor: saving ? 'not-allowed' : 'pointer',
                textTransform: 'uppercase',
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
