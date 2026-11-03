import React, { useState, useEffect } from 'react'
import { OrganizerCategory, OrganizerEvent } from '../types'

interface TicketTiersTabProps {
  events: OrganizerEvent[]
  selectedEventId: string | null
  onSelectEventId: (id: string) => void
  onSaveTiers: (eventId: string, categories: OrganizerCategory[]) => Promise<void>
}

export default function TicketTiersTab({
  events,
  selectedEventId,
  onSelectEventId,
  onSaveTiers,
}: TicketTiersTabProps) {
  const activeEvent = events.find(e => e.eventId === selectedEventId) || events[0] || null
  const [categories, setCategories] = useState<OrganizerCategory[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (activeEvent) {
      setCategories(activeEvent.ticketCategories.map(c => ({ ...c })))
      setError('')
      setSuccess('')
    }
  }, [activeEvent?.eventId])

  if (!activeEvent) {
    return (
      <div
        style={{
          background: '#14161C',
          border: '1px dashed #282C36',
          borderRadius: 10,
          padding: 48,
          textAlign: 'center',
          color: '#555962',
        }}
      >
        No events found. Please create an event draft first to configure ticket categories.
      </div>
    )
  }

  const addCategory = () => {
    const newCategory: OrganizerCategory = {
      id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: '',
      description: '',
      price: 999,
      currency: 'INR',
      totalInventory: 100,
      remainingInventory: 100,
      groupSize: 1,
      status: 'active',
      maxPerCustomer: 10,
      inclusions: [],
    }
    setCategories(prev => [...prev, newCategory])
  }

  const updateCategory = (index: number, updates: Partial<OrganizerCategory>) => {
    setCategories(prev => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)))
  }

  const removeCategory = (index: number) => {
    const target = categories[index]
    if (window.confirm(`Remove category "${target.name || 'Untitled'}"? If tickets have already been ordered for this category, the platform server may reject the removal.`)) {
      setCategories(prev => prev.filter((_, i) => i !== index))
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const emptyName = categories.some(c => !c.name.trim())
    if (emptyName) {
      setError('All ticket categories must have a name.')
      return
    }

    setSaving(true)
    try {
      await onSaveTiers(activeEvent.eventId, categories)
      setSuccess('Ticket categories and inventory saved successfully!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save categories.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* EVENT SELECTOR HEADER */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          background: '#14161C',
          border: '1px solid #20232B',
          borderRadius: 10,
          padding: '14px 18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', textTransform: 'uppercase' }}>
            Event:
          </label>
          <select
            value={activeEvent.eventId}
            onChange={e => onSelectEventId(e.target.value)}
            style={{
              background: '#0E1013',
              border: '1px solid #282C36',
              borderRadius: 6,
              padding: '8px 12px',
              color: '#EDEDEF',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              minWidth: 260,
            }}
          >
            {events.map(e => (
              <option key={e.eventId} value={e.eventId}>
                {e.name} ({e.city || 'India'})
              </option>
            ))}
          </select>
          <span
            style={{
              fontSize: 10,
              fontFamily: 'JetBrains Mono, monospace',
              textTransform: 'uppercase',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(255,255,255,0.05)',
              color: '#8B909A',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {activeEvent.status}
          </span>
        </div>

        <button
          type="button"
          onClick={addCategory}
          style={{
            background: 'rgba(255,255,255,0.06)',
            color: '#EDEDEF',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            padding: '7px 14px',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          + Add Category Tier
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 8,
            padding: '12px 16px',
            color: '#EF4444',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: 8,
            padding: '12px 16px',
            color: '#10B981',
            fontSize: 13,
          }}
        >
          {success}
        </div>
      )}

      {/* CATEGORIES FORM */}
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {categories.length === 0 ? (
          <div
            style={{
              background: '#14161C',
              border: '1px dashed #282C36',
              borderRadius: 10,
              padding: 40,
              textAlign: 'center',
            }}
          >
            <p style={{ color: '#8B909A', margin: '0 0 16px', fontSize: 13 }}>
              No ticket tiers created for {activeEvent.name}.
            </p>
            <button
              type="button"
              onClick={addCategory}
              style={{
                background: '#EDEDEF',
                color: '#0B0C0E',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              + Create First Ticket Tier
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {categories.map((cat, index) => {
              const total = cat.totalInventory ?? 0
              const rem = cat.remainingInventory ?? total
              const sold = total > 0 ? Math.max(0, total - rem) : 0
              const percentSold = total > 0 ? Math.min(100, Math.round((sold / total) * 100)) : 0

              return (
                <div
                  key={cat.id || index}
                  style={{
                    background: '#14161C',
                    border: '1px solid #20232B',
                    borderRadius: 10,
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  {/* Grid Fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'center' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                        TIER NAME
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Early Bird, VIP Table"
                        value={cat.name}
                        onChange={e => updateCategory(index, { name: e.target.value })}
                        required
                        style={{
                          width: '100%',
                          background: '#0E1013',
                          border: '1px solid #282C36',
                          borderRadius: 6,
                          padding: '8px 12px',
                          color: '#EDEDEF',
                          fontWeight: 500,
                          fontSize: 13,
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                        PRICE ({cat.currency || 'INR'})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={cat.price}
                        onChange={e => updateCategory(index, { price: Number(e.target.value) })}
                        required
                        style={{
                          width: '100%',
                          background: '#0E1013',
                          border: '1px solid #282C36',
                          borderRadius: 6,
                          padding: '8px 12px',
                          color: '#EDEDEF',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 600,
                          fontSize: 13,
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                        TOTAL CAPACITY
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="Unlimited"
                        value={cat.totalInventory ?? ''}
                        onChange={e => updateCategory(index, { totalInventory: e.target.value === '' ? null : Number(e.target.value) })}
                        style={{
                          width: '100%',
                          background: '#0E1013',
                          border: '1px solid #282C36',
                          borderRadius: 6,
                          padding: '8px 12px',
                          color: '#EDEDEF',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 13,
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                        ADMISSIONS / QR
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={cat.groupSize}
                        onChange={e => updateCategory(index, { groupSize: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          background: '#0E1013',
                          border: '1px solid #282C36',
                          borderRadius: 6,
                          padding: '8px 12px',
                          color: '#EDEDEF',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 13,
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8B909A', marginBottom: 4 }}>
                        STATUS
                      </label>
                      <select
                        value={cat.status}
                        onChange={e => updateCategory(index, { status: e.target.value })}
                        style={{
                          width: '100%',
                          background: '#0E1013',
                          border: '1px solid #282C36',
                          borderRadius: 6,
                          padding: '8px 12px',
                          color: cat.status === 'active' ? '#10B981' : cat.status === 'sold_out' ? '#EF4444' : '#F59E0B',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 500,
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        <option value="active">Active (On Sale)</option>
                        <option value="paused">Paused</option>
                        <option value="sold_out">Sold Out</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 18 }}>
                      <button
                        type="button"
                        onClick={() => removeCategory(index)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.08)',
                          color: '#EF4444',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          borderRadius: 6,
                          padding: '7px 12px',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {/* Capacity Bar */}
                  {cat.totalInventory !== null && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8B909A', marginBottom: 4, fontFamily: 'JetBrains Mono, monospace' }}>
                        <span>Capacity: {sold} sold / {total} total</span>
                        <span>{cat.remainingInventory ?? total} remaining ({percentSold}% sold)</span>
                      </div>
                      <div style={{ height: 4, background: '#1E2026', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: `${percentSold}%`, height: '100%', background: percentSold > 80 ? '#F59E0B' : '#10B981', borderRadius: 999 }} />
                      </div>
                    </div>
                  )}

                  {/* Description & Inclusions */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                    <input
                      type="text"
                      placeholder="Tier notes / timing (e.g. Entry valid before 11 PM)"
                      value={cat.description || ''}
                      onChange={e => updateCategory(index, { description: e.target.value })}
                      style={{
                        width: '100%',
                        background: '#0E1013',
                        border: '1px solid #1E2026',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 12,
                        color: '#8B909A',
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Inclusions (comma separated, e.g. Free Welcome Drink, VIP Lounge)"
                      value={(cat.inclusions || []).join(', ')}
                      onChange={e =>
                        updateCategory(index, {
                          inclusions: e.target.value
                            .split(',')
                            .map(s => s.trim())
                            .filter(Boolean),
                        })
                      }
                      style={{
                        width: '100%',
                        background: '#0E1013',
                        border: '1px solid #1E2026',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 12,
                        color: '#8B909A',
                      }}
                    />
                  </div>
                </div>
              )
            })}

            {/* Bottom Save Bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                background: '#14161C',
                border: '1px solid #20232B',
                borderRadius: 10,
                position: 'sticky',
                bottom: 16,
                zIndex: 10,
              }}
            >
              <div style={{ fontSize: 12, color: '#8B909A' }}>
                Price updates apply to future customer orders. Existing orders remain locked.
              </div>
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: '#EDEDEF',
                  color: '#0B0C0E',
                  border: 'none',
                  padding: '10px 24px',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
