import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

// Format any date as IST (UTC+5:30) 12-hour AM/PM — works on server (UTC) and client devices
function fmtIST(date: Date | string | null | undefined): string {
  if (!date) return 'TBA'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return 'TBA'
  // Shift to IST (+5:30)
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const rawH = ist.getUTCHours()
  const ampm = rawH >= 12 ? 'PM' : 'AM'
  const h12 = rawH % 12 === 0 ? 12 : rawH % 12
  const m = ist.getUTCMinutes().toString().padStart(2, '0')
  return `${months[ist.getUTCMonth()]} ${ist.getUTCDate()}, ${h12}:${m} ${ampm}`
}

export type TicketType = string
export type TicketStatus = 'pending' | 'scanned' | 'cancelled'

export interface Ticket {
  id: string
  event: string
  attendee: string
  email: string
  phone?: string
  dateLabel: string
  venue: string
  ticketType: TicketType
  price: string
  qty: number
  admissionCount?: number
  generatedBy: string
  generatedAt: string
  status: TicketStatus
  scannedBy?: string
  scannedAt?: string
}

const THEME_KEY = 'littix-theme-v1'

interface StoreValue {
  tickets: Ticket[]
  dark: boolean
  loading: boolean
  toggleTheme: () => void
  refreshTickets: () => Promise<void>
  addTicket: (input: {
    event: string
    attendee: string
    email: string
    dateLabel: string
    ticketType: TicketType
  }) => Promise<Ticket>
  scanTicket: (idOrRaw: string, scannedBy: string) => Promise<{ result: 'success' | 'rejected' | 'manual_review' | 'not_found' | 'error'; ticket?: Ticket }>
  findTicket: (id: string) => Ticket | undefined
}

const StoreContext = createContext<StoreValue | null>(null)

function loadTheme(): boolean {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (raw) return raw === 'dark'
  } catch {
    // ignore
  }
  return true
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [dark, setDark] = useState<boolean>(loadTheme)
  const [loading, setLoading] = useState<boolean>(false)

  const adminKey = useMemo(() => {
    return sessionStorage.getItem('ft_admin_key') || ''
  }, [])

  const refreshTickets = async () => {
    setLoading(true)
    try {
      const token = sessionStorage.getItem('littx_token') || ''
      const res = await fetch('/api/admin/sales', { headers: { ...(adminKey ? { 'x-admin-key': adminKey } : {}), ...(token ? { 'x-auth-token': token } : {}) } })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.sales) {
          // Map DB sales to Littix Ticket objects
          const mapped: Ticket[] = data.sales.map((sale: any) => {
            const isScanned = sale.status === 'scanned' || !!sale.scannedAt
            return {
              id: sale.ticketId || sale.orderId,
              event: sale.event || 'Event details unavailable',
              attendee: sale.name,
              email: sale.email,
              phone: sale.phone || '',
              dateLabel: fmtIST(sale.generatedAt),
              venue: sale.venue || '',
              ticketType: (sale.ticketType as any) || 'Ticket',
              price: `₹${sale.amount}`,
              qty: sale.quantity || 1,
              generatedBy: 'Admin',
              generatedAt: fmtIST(sale.generatedAt),
              status: isScanned ? 'scanned' : 'pending',
              scannedBy: sale.scannedBy || undefined,
              scannedAt: sale.scannedAt || undefined
            }
          })
          setTickets(mapped)
        }
      }
    } catch (err) {
      console.error('Failed to load tickets from server', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshTickets()
    // Poll every 8 seconds for real-time updates
    const interval = setInterval(refreshTickets, 8000)
    return () => clearInterval(interval)
  }, [adminKey])

  useEffect(() => {
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
  }, [dark])

  const value = useMemo<StoreValue>(() => ({
    tickets,
    dark,
    loading,
    toggleTheme: () => setDark((d) => !d),
    refreshTickets,
    addTicket: async (input) => {
      const res = await fetch('/api/admin/generate-ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminKey ? { 'x-admin-key': adminKey } : {}),
          ...(sessionStorage.getItem('littx_token') ? { 'x-auth-token': sessionStorage.getItem('littx_token') || '' } : {})
        },
        body: JSON.stringify({
          name: input.attendee,
          email: input.email,
          event: input.event,
          ticketType: input.ticketType,
          quantity: 1,
          amount: 0
        })
      })

      if (!res.ok) {
        throw new Error('Failed to generate ticket on server')
      }

      const data = await res.json()
      if (!data.success) {
        throw new Error(data.message || 'Server error generating ticket')
      }

      await refreshTickets()

      return {
        id: data.ticket.id,
        event: data.ticket.event,
        attendee: data.ticket.attendee,
        email: data.ticket.email,
        dateLabel: new Date(data.ticket.generatedAt).toLocaleString(),
        venue: data.ticket.venue || '',
        ticketType: data.ticket.ticketType,
        price: `₹${data.ticket.price}`,
        qty: data.ticket.qty,
        generatedBy: data.ticket.generatedBy,
        generatedAt: new Date(data.ticket.generatedAt).toLocaleString(),
        status: 'pending'
      }
    },
    scanTicket: async (idOrRaw, scannedBy) => {
      const cleanId = idOrRaw.trim()
      try {
        const scannerToken = sessionStorage.getItem('littx_scanner_token')
        const sellerToken = sessionStorage.getItem('littx_seller_token')
        const res = await fetch('/api/scan-ticket', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(scannerToken ? { Authorization: `Bearer ${scannerToken}` } : {}),
            ...(sellerToken ? { 'x-seller-token': sellerToken } : {})
          },
          body: JSON.stringify({
            ticketId: cleanId,
            scannedBy
          })
        })

        if (!res.ok) {
          if (res.status === 401) {
            if (scannerToken) sessionStorage.removeItem('littx_scanner_token')
            if (scannerToken && !sellerToken) window.dispatchEvent(new Event('littx-scanner-auth-expired'))
          }
          return { result: 'error' }
        }

        const data = await res.json()

                if (data.result === 'success') {
          const t = data.ticket
          // Build a fully-resolved ticket directly from server response
          const resolvedTicket: Ticket = {
            id: t.id,
            event: t.event || 'Event details unavailable',
            attendee: t.attendee || t.name || '—',
            email: t.email || '—',
            phone: t.phone || 'N/A',
            dateLabel: t.generatedAt ? new Date(t.generatedAt).toLocaleString() : 'TBA',
            venue: t.venue || '',
            ticketType: (t.ticketType as TicketType) || 'Ticket',
            price: `₹${t.amount || '—'}`,
            qty: t.quantity || 1,
            admissionCount: t.admissionCount || t.scannedAdmissionCount || 1,
            generatedBy: t.generatedBy || 'Stageway',
            generatedAt: fmtIST(t.generatedAt),
            status: 'scanned',
            scannedBy: t.scannedBy || scannedBy || 'Gate Staff',
            scannedAt: t.scannedAt || fmtIST(new Date())
          }
          setTickets(prev => prev.map(ticket => ticket.id === resolvedTicket.id ? resolvedTicket : ticket))
          return { result: 'success', ticket: resolvedTicket }
        } else if (data.result === 'rejected' || data.result === 'manual_review') {
          const t = data.ticket
          // Server sends name as attendee field; map all fields correctly
          const matchedTicket: Ticket = {
            id: t.id || t.ticketId || cleanId,
            event: t.event || 'Event details unavailable',
            attendee: t.attendee || t.name || '—',
            email: t.email || '—',
            phone: t.phone || 'N/A',
            dateLabel: fmtIST(t.generatedAt),
            venue: t.venue || '',
            ticketType: (t.ticketType as TicketType) || 'Ticket',
            price: `₹${t.amount || '—'}`,
            qty: t.quantity || 1,
            generatedBy: t.generatedBy || 'Stageway',
            generatedAt: fmtIST(t.generatedAt),
            status: t.status === 'scanned' || t.status === 'cancelled' ? 'scanned' : 'pending',
            scannedBy: t.scannedBy || undefined,
            scannedAt: t.scannedAt || undefined,
            // Carry cancelled marker for the UI to detect
            ...(t.status === 'cancelled' ? { _cancelled: true } as any : {})
          }
          // Override with live store data if we have it (most up-to-date)
          const liveTicket = tickets.find(tk => tk.id === (t.id || t.ticketId || cleanId))
          return { result: data.result === 'manual_review' ? 'manual_review' : 'rejected', ticket: liveTicket || matchedTicket, serverTicket: t }

        }
      } catch (err) {
        console.error('Scan api error:', err)
        return { result: 'error' }
      }
      return { result: 'not_found' }
    },
    findTicket: (id) => tickets.find((t) => t.id === id),
  }), [tickets, dark, loading, adminKey])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
