import React, { useState } from 'react'

interface SearchResult {
  type: string
  title: string
  subtitle: string
  companyId: string
  entityId: string
}

export default function MasterGlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async (val: string) => {
    setQuery(val)
    if (val.trim().length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/master/global-search?q=${encodeURIComponent(val)}`)
      const data = await res.json()
      if (data.success) {
        setResults(data.results || [])
      }
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="card" style={{ background: 'linear-gradient(135deg, #0F0D1A 0%, #0A0912 100%)', border: '1px solid rgba(216,255,63,0.3)' }}>
        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--volt)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
          UNIVERSAL PLATFORM SEARCH
        </div>
        <h2 style={{ margin: '0 0 14px', fontSize: '1.3rem', color: 'var(--ink)' }}>
          Search Across Companies, Events, Users, PRs, Tickets & Attendees
        </h2>

        <div className="field" style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Type ticket ID (e.g. LTX98231), customer email, phone, event or company name..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            style={{
              padding: '14px 18px',
              fontSize: '14px',
              borderRadius: '12px',
              border: '1px solid var(--volt)',
              background: 'var(--panel-2)',
              color: 'var(--ink)'
            }}
            autoFocus
          />
        </div>
      </div>

      {/* Results Card */}
      <div className="card table-card">
        <div className="card-head" style={{ padding: '18px 18px 0' }}>
          <h3>Search Results ({results.length})</h3>
        </div>

        {loading ? (
          <div style={{ padding: '40px', color: 'var(--ink-faint)', textAlign: 'center' }}>Searching LITTX platform database…</div>
        ) : results.length === 0 ? (
          <div style={{ padding: '40px', color: 'var(--ink-faint)', textAlign: 'center' }}>
            {query.length < 2 ? 'Type at least 2 characters to search across all companies and events.' : 'No matching entities found.'}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Entity Title / Name</th>
                  <th>Details / Meta</th>
                  <th>Company Tenant</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '9.5px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          background: 'var(--volt-dim)',
                          color: 'var(--volt)',
                          border: '1px solid rgba(216,255,63,0.2)'
                        }}
                      >
                        {r.type}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.title}</td>
                    <td style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>{r.subtitle}</td>
                    <td style={{ fontWeight: 700, color: 'var(--volt)' }}>{r.companyId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
