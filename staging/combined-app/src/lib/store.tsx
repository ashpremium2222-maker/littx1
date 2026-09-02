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

export type TicketType =
  | 'GA Single'
  | 'GA Group of 5'
  | 'GA Group of 10'
  | 'VIP Single'
  | 'VIP Group of 5'
  | 'VIP Group of 10'
export type TicketStatus = 'pending' | 'scanned'

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
  scanTicket: (idOrRaw: string, scannedBy: string) => Promise<{ result: 'success' | 'rejected' | 'not_found'; ticket?: Ticket }>
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
    return localStorage.getItem('ft_admin_key') || sessionStorage.getItem('ft_admin_key') || 'change-me-admin-key'
  }, [])

  const refreshTickets = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/sales?key=${adminKey}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.sales) {
          // Map DB sales to Littix Ticket objects
          const mapped: Ticket[] = data.sales.map((sale: any) => {
            const isScanned = sale.status === 'scanned' || !!sale.scannedAt
            return {
              id: sale.ticketId || sale.orderId,
              event: sale.event || 'DHOLIDA GARBA ROYALE',
              attendee: sale.name,
              email: sale.email,
              phone: sale.phone || '',
              dateLabel: fmtIST(sale.generatedAt),
              venue: 'Pethkar Ground, Kothrud, Pune',
              ticketType: (sale.ticketType as any) || 'GA Single',
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
          'x-admin-key': adminKey
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
        venue: 'Pethkar Ground, Kothrud, Pune',
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

      // Optimistic cache-first verification for instant millisecond response times
      const localTicket = tickets.find(t => t.id === cleanId)
      if (localTicket) {
        if (localTicket.status === 'scanned') {
          // Trigger background sync to log attempt on server, but do not await
          fetch('/api/scan-ticket', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketId: cleanId, scannedBy })
          }).catch(console.error)

          return { result: 'rejected', ticket: localTicket }
        } else {
          // Optimistically mark as scanned in React state to prevent double scans
          const updatedTicket: Ticket = {
            ...localTicket,
            status: 'scanned',
            scannedBy: scannedBy || 'Gate Staff',
            scannedAt: new Date().toLocaleDateString()
          }
          setTickets(prev => prev.map(t => t.id === cleanId ? updatedTicket : t))

          // Commit to server in the background
          fetch('/api/scan-ticket', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketId: cleanId, scannedBy })
          }).catch(console.error)

          return { result: 'success', ticket: updatedTicket }
        }
      }

      try {
        const res = await fetch('/api/scan-ticket', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ticketId: cleanId,
            scannedBy
          })
        })

        if (!res.ok) {
          return { result: 'not_found' }
        }

        const data = await res.json()

                if (data.result === 'success') {
          const t = data.ticket
          // Build a fully-resolved ticket directly from server response
          const resolvedTicket: Ticket = {
            id: t.id,
            event: t.event || 'DHOLIDA GARBA ROYALE',
            attendee: t.attendee || t.name || '—',
            email: t.email || '—',
            phone: t.phone || 'N/A',
            dateLabel: t.generatedAt ? new Date(t.generatedAt).toLocaleString() : 'TBA',
            venue: 'Pethkar Ground, Kothrud, Pune',
            ticketType: (t.ticketType as TicketType) || 'GA Single',
            price: `₹${t.amount || '—'}`,
            qty: t.quantity || 1,
            generatedBy: t.generatedBy || 'LITTX',
            generatedAt: fmtIST(t.generatedAt),
            status: 'scanned',
            scannedBy: t.scannedBy || scannedBy || 'Gate Staff',
            scannedAt: t.scannedAt || fmtIST(new Date())
          }
          await refreshTickets()
          return { result: 'success', ticket: resolvedTicket }
        } else if (data.result === 'rejected') {
          const t = data.ticket
          // Server sends name as attendee field; map all fields correctly
          const matchedTicket: Ticket = {
            id: t.id || t.ticketId || cleanId,
            event: t.event || 'DHOLIDA GARBA ROYALE',
            attendee: t.attendee || t.name || '—',
            email: t.email || '—',
            phone: t.phone || 'N/A',
            dateLabel: fmtIST(t.generatedAt),
            venue: 'Pethkar Ground, Kothrud, Pune',
            ticketType: (t.ticketType as TicketType) || 'GA Single',
            price: `₹${t.amount || '—'}`,
            qty: t.quantity || 1,
            generatedBy: t.generatedBy || 'LITTX',
            generatedAt: fmtIST(t.generatedAt),
            status: (t.status === 'cancelled' ? 'scanned' : 'scanned') as any,
            scannedBy: t.scannedBy || undefined,
            scannedAt: t.scannedAt || undefined,
            // Carry cancelled marker for the UI to detect
            ...(t.status === 'cancelled' ? { _cancelled: true } as any : {})
          }
          // Override with live store data if we have it (most up-to-date)
          const liveTicket = tickets.find(tk => tk.id === (t.id || t.ticketId || cleanId))
          return { result: 'rejected', ticket: liveTicket || matchedTicket, serverTicket: t }

        }
      } catch (err) {
        console.error('Scan api error:', err)
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
