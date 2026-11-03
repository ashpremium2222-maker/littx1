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
          background: 'rgba(20,16,38,0.7)',
          border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: 14,
          padding: 48,
          textAlign: 'center',
          color: 'rgba(245,242,234,0.5)',
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

    // Validate that all categories have names
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
          background: 'rgba(20,16,38,0.7)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          padding: '14px 18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.6)', textTransform: 'uppercase' }}>
            Event:
          </label>
          <select
            value={activeEvent.eventId}
            onChange={e => onSelectEventId(e.target.value)}
            style={{
              background: 'rgba(10,9,18,0.9)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              padding: '8px 14px',
              color: '#F5F2EA',
              fontFamily: 'Unbounded, sans-serif',
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
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 4,
              background: 'rgba(216,255,63,0.12)',
              color: '#D8FF3F',
            }}
          >
            {activeEvent.status}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={addCategory}
            style={{
              background: 'rgba(255,255,255,0.08)',
              color: '#F5F2EA',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 12,
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Add Tier
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: 'rgba(255,107,107,0.15)',
            border: '1px solid #FF6B6B',
            borderRadius: 10,
            padding: '12px 16px',
            color: '#FF6B6B',
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
            background: 'rgba(49,231,200,0.15)',
            border: '1px solid #31E7C8',
            borderRadius: 10,
            padding: '12px 16px',
            color: '#31E7C8',
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
              background: 'rgba(20,16,38,0.6)',
              border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: 14,
              padding: 40,
              textAlign: 'center',
            }}
          >
            <p style={{ color: 'rgba(245,242,234,0.6)', margin: '0 0 16px' }}>
              No ticket tiers created for {activeEvent.name}. Add your first tier (e.g., General Admission, VIP, Group Pass).
            </p>
            <button
              type="button"
              onClick={addCategory}
              style={{
                background: '#D8FF3F',
                color: '#0A0912',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 8,
                fontFamily: 'Unbounded, sans-serif',
                fontWeight: 700,
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
                    background: 'rgba(20,16,38,0.9)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 14,
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  {/* Row 1: Name, Price, Status, Delete */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'center' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
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
                          background: 'rgba(10,9,18,0.8)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 6,
                          padding: '8px 12px',
                          color: '#F5F2EA',
                          fontWeight: 600,
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
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
                          background: 'rgba(10,9,18,0.8)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 6,
                          padding: '8px 12px',
                          color: '#D8FF3F',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 700,
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
                        TOTAL CAPACITY
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="Unlimited if empty"
                        value={cat.totalInventory ?? ''}
                        onChange={e => updateCategory(index, { totalInventory: e.target.value === '' ? null : Number(e.target.value) })}
                        style={{
                          width: '100%',
                          background: 'rgba(10,9,18,0.8)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 6,
                          padding: '8px 12px',
                          color: '#F5F2EA',
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
                        GROUP SIZE (PAX PER QR)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={cat.groupSize}
                        onChange={e => updateCategory(index, { groupSize: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          background: 'rgba(10,9,18,0.8)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 6,
                          padding: '8px 12px',
                          color: '#F5F2EA',
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,242,234,0.5)', marginBottom: 4 }}>
                        STATUS
                      </label>
                      <select
                        value={cat.status}
                        onChange={e => updateCategory(index, { status: e.target.value })}
                        style={{
                          width: '100%',
                          background: 'rgba(10,9,18,0.8)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 6,
                          padding: '8px 12px',
                          color: cat.status === 'active' ? '#31E7C8' : cat.status === 'sold_out' ? '#FF2E7E' : '#F5B942',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 600,
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
                          background: 'rgba(255,107,107,0.1)',
                          color: '#FF6B6B',
                          border: '1px solid rgba(255,107,107,0.3)',
                          borderRadius: 6,
                          padding: '8px 14px',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {/* Row 2: Capacity meter bar if inventory is finite */}
                  {cat.totalInventory !== null && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(245,242,234,0.6)', marginBottom: 4, fontFamily: 'JetBrains Mono, monospace' }}>
                        <span>Capacity: {sold} sold / {total} total</span>
                        <span>{cat.remainingInventory ?? total} remaining ({percentSold}% sold)</span>
                      </div>
                      <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: `${percentSold}%`, height: '100%', background: percentSold > 80 ? '#FF2E7E' : '#D8FF3F', borderRadius: 999 }} />
                      </div>
                    </div>
                  )}

                  {/* Row 3: Description & Inclusions */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                    <div>
                      <input
                        type="text"
                        placeholder="Tier description or notes (e.g. Phase 1 Early Bird access)"
                        value={cat.description || ''}
                        onChange={e => updateCategory(index, { description: e.target.value })}
                        style={{
                          width: '100%',
                          background: 'rgba(10,9,18,0.6)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 6,
                          padding: '6px 10px',
                          fontSize: 12,
                          color: 'rgba(245,242,234,0.8)',
                        }}
                      />
                    </div>
                    <div>
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
                          background: 'rgba(10,9,18,0.6)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 6,
                          padding: '6px 10px',
                          fontSize: 12,
                          color: 'rgba(245,242,234,0.8)',
                        }}
                      />
                    </div>
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
                background: 'rgba(20,16,38,0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 14,
                position: 'sticky',
                bottom: 16,
                zIndex: 10,
              }}
            >
              <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.6)' }}>
                ℹ️ Price updates apply to future orders immediately. Capacity reductions are locked once orders exist.
              </div>
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
                  fontSize: 13,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  boxShadow: '0 4px 20px rgba(216,255,63,0.3)',
                }}
              >
                {saving ? 'Saving Tiers…' : 'Save All Changes'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
