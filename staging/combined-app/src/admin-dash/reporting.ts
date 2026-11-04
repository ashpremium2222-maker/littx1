const CONFIRMED_LEGACY_STATUSES = new Set(['paid', 'ticket_generated', 'emailed', 'email_failed', 'scanned'])

export function isConfirmedSale(sale: any) {
  const status = String(sale?.status || '').toLowerCase()
  if (!CONFIRMED_LEGACY_STATUSES.has(status) || ['cancelled', 'canceled'].includes(status)) return false
  const approval = sale?.approvalStatus == null ? '' : String(sale.approvalStatus).toUpperCase()
  if (['PENDING', 'REJECTED'].includes(approval) || sale?.deliveryStatus === 'PENDING_APPROVAL' || sale?.deliveryStatus === 'BLOCKED') return false
  if (sale?.paymentStatus === 'paid') return true
  if (sale?.paymentStatus != null && sale.paymentStatus !== '') return false
  const offline = ['offline_seller', 'offline_pr'].includes(String(sale?.source || '').toLowerCase())
    || ['cash', 'manual'].includes(String(sale?.paymentMethod || '').toLowerCase())
  return offline && sale?.paymentId === 'manual'
    && ['NOT_REQUIRED', 'APPROVED', ''].includes(approval)
    && Boolean(sale?.sellerId || sale?.prUserId || sale?.generatedBy || sale?.issuedByAdmin)
}

export function customerTotal(sale: any) {
  const value = Number(sale?.customerTotal ?? sale?.amount ?? 0)
  return Number.isFinite(value) ? value : 0
}
