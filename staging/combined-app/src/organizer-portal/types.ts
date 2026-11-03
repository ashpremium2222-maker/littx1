export interface OrganizerCategory {
  id: string
  name: string
  description?: string
  price: number
  currency?: string
  totalInventory: number | null
  remainingInventory: number | null
  groupSize: number
  status: 'active' | 'paused' | 'sold_out' | string
  maxPerCustomer?: number
  salesStartAt?: string | null
  salesEndAt?: string | null
  inclusions?: string[]
}

export interface OrganizerOrder {
  orderId: string
  ticketId: string | null
  ticketType: string
  quantity: number
  admissions: number
  status: string
  paymentStatus: string | null
  approvalStatus: string | null
  channel: 'online' | 'offline'
  sellerId: string | null
  sellerName: string | null
  amount: number | null
  currency: string
  scannedAt: string | null
  scannedAdmissions: number
  createdAt: string | null
}

export interface ScanItem {
  ticketId: string
  result: 'accepted' | 'duplicate' | 'rejected' | string
  admissionCount: number
  timestamp: string
}

export interface OrganizerEvent {
  eventId: string
  name: string
  slug?: string | null
  images?: string[]
  status: 'draft' | 'pending_review' | 'published' | 'active' | 'ended' | 'archived' | string
  city: string
  venue: string
  description: string
  startsAt: string | null
  endsAt?: string | null
  ticketCategories: OrganizerCategory[]
  sales: {
    orders: number
    confirmedOrders: number
    ticketsIssued: number
    admissions: number
    online: { admissions: number; verifiedRevenue?: number; orders?: number }
    offline: { admissions: number; verifiedRevenue?: number; orders?: number }
    verifiedRevenue: number | null
    verifiedRevenueCurrency?: string | null
    verifiedRevenueByCurrency?: Record<string, number>
    pending: number
    pendingAmount: number | null
    pendingAmountCurrency?: string | null
    pendingAmountByCurrency?: Record<string, number>
    cancelled: number
    expired: number
    unverified: number
    unverifiedAmount: number | null
    unverifiedAmountCurrency?: string | null
    unverifiedAmountByCurrency?: Record<string, number>
    refundRequests: number
    refundApprovals: number
    refundRejections: number
  }
  scans: {
    accepted: number
    duplicate: number
    admissions: number
    recent: ScanItem[]
  }
  refundRequests: Array<{
    orderId: string
    ticketId: string | null
    amount: number
    currency: string
    reason: string
    requestedAt: string | null
  }>
  activity: Array<{
    actor: string
    action: string
    fieldChanged?: string
    timestamp: string | null
  }>
  orders: OrganizerOrder[]
}

export interface OrganizerProfile {
  displayName: string
  organizationName: string
  verifiedEmail: string | null
  emailVerified: boolean
  companyId: string
}

export interface PayoutDetails {
  accountHolder: string
  bankName: string
  accountNumber?: string
  accountNumberMasked?: string
  ifscCode: string
  upiId: string
  status: 'pending_verification' | 'submitted' | 'verified' | string
  updatedAt?: string
}

export interface PayoutSummary {
  grossRevenue: number
  platformFee: number
  feePercentage: number
  netPayout: number
  currency: string
  totalOrders: number
  payoutDetails: PayoutDetails
  settlementHistory: Array<{
    settlementId: string
    amount: number
    currency: string
    status: 'paid' | 'processing' | 'failed' | string
    date: string
    referenceNumber?: string
  }>
}

export type OrganizerTab =
  | 'overview'
  | 'events'
  | 'tiers'
  | 'sales'
  | 'scans'
  | 'team'
  | 'payouts'
  | 'profile'
