import { useState } from 'react'

interface QRScansProps {
  sales: any[]
  isPresentation?: boolean
}

export default function QRScans({ sales = [], isPresentation = false }: QRScansProps) {
  const [filterResult, setFilterResult] = useState<string>('all')
  const [search, setSearch] = useState('')

  const scanSales = sales.filter((s) => s.scannedAt || s.status === 'scanned')

  const scans = scanSales.map((s: any, idx: number) => {
    return {
      id: idx + 1,
      time: s.scannedAt ? new Date(s.scannedAt).toLocaleString('en-IN') : '—',
      scanner: s.scannedBy || 'Gate Staff',
      gate: 'Main Gate A',
      result: 'Valid',
      ticketId: s.ticketId || '—',
      attendee: s.name || 'Attendee',
      event: s.event || 'DHOLIDA GARBA ROYALE',
    }
  })

  const validCount = scans.length
  const totalCount = sales.length
  const validPct = totalCount > 0 ? Math.round((validCount / totalCount) * 100) : 100

  const filteredScans = scans.filter((s) => {
    if (filterResult !== 'all' && s.result.toLowerCase() !== filterResult) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        s.ticketId.toLowerCase().includes(q) ||
        s.attendee.toLowerCase().includes(q) ||
        s.scanner.toLowerCase().includes(q)
      )
    }
    return true
  })

  // Strictly for /dashhboard (presentation mode), limit to recent 260 logs
  const displayScans = isPresentation ? filteredScans.slice(0, 260) : filteredScans

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gutter)' }}>
      {/* Reference KPI Stat Tiles */}
      <div className="kpi-row">
        <div className="tile tile-teal">
          <div className="tile-label">SCANS LOGGED</div>
          <div className="tile-value">{validCount}</div>
          <div className="tile-sub">Scanned at gate entry</div>
          <div className="tile-delta">
            <span>📲</span> Live gate scanner
          </div>
        </div>

        <div className="tile tile-gold">
          <div className="tile-label">VALIDATED RATE</div>
          <div className="tile-value">{validPct}%</div>
          <div className="tile-sub">First-time valid QR scans</div>
          <div className="tile-delta">
            <span>✓</span> Gate active
          </div>
        </div>

        <div className="tile tile-orange">
          <div className="tile-label">DUPLICATE / REJECTED</div>
          <div className="tile-value">0</div>
          <div className="tile-sub">Already-scanned attempts</div>
          <div className="tile-delta">
            <span>✓</span> Zero duplicates
          </div>
        </div>

        <div className="tile tile-dark">
          <div className="tile-label">ACTIVE SCANNERS</div>
          <div className="tile-value">1</div>
          <div className="tile-sub">Authorized scanner devices</div>
          <div className="tile-delta up">
            <span>📡</span> Gate Staff
          </div>
        </div>
      </div>

      {/* Reference Filter Bar */}
      <div className="filter-bar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px' }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search scan logs by ticket ID, attendee..."
          />
        </div>

        <select value={filterResult} onChange={(e) => setFilterResult(e.target.value)}>
          <option value="all">All scan results</option>
          <option value="valid">Valid</option>
          <option value="duplicate">Duplicate</option>
        </select>
      </div>

      {/* QR Scan Table Card */}
      <div className="card table-card">
        <div className="table-scroll scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Scan Time</th>
                <th>Ticket ID</th>
                <th>Attendee</th>
                <th>Event</th>
                <th>Gate / Scanner</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {displayScans.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-faint)' }}>
                    No QR scan logs registered yet.
                  </td>
                </tr>
              ) : (
                displayScans.map((s) => (
                  <tr key={s.id}>
                    <td>{s.time}</td>
                    <td>
                      <div className="cell-main">
                        <div className="cell-thumb" style={{ background: 'var(--grad-teal)' }}>
                          📲
                        </div>
                        <div className="cell-title">#{s.ticketId}</div>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{s.attendee}</td>
                    <td>{s.event}</td>
                    <td>{s.scanner} ({s.gate})</td>
                    <td>
                      <span className="badge badge-green">
                        <span className="badge-dot" />
                        {s.result}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
