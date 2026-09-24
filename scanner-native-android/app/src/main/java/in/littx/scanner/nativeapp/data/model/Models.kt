package com.littx.scanner.nativeapp.data.model

data class ScannerLoginRequest(val password: String)
data class ScannerLoginResponse(val success: Boolean = false, val token: String? = null, val scannerName: String? = null, val message: String? = null)
data class ScannerSessionResponse(val success: Boolean = false, val scannerName: String? = null, val expiresAt: Long? = null)
data class ScanRequest(val ticketId: String, val scannedBy: String)
data class ScanStats(val success: Boolean = false, val accepted: Int = 0, val failed: Int = 0)
data class Ticket(val id: String = "", val event: String? = null, val attendee: String? = null, val email: String? = null, val phone: String? = null, val ticketType: String? = null, val quantity: Int? = null, val amount: Double? = null, val generatedAt: String? = null, val status: String? = null, val scannedBy: String? = null, val scannedAt: String? = null)
data class ScanResponse(val result: String = "", val ticket: Ticket? = null, val message: String? = null)
enum class ScanOutcome { APPROVED, INVALID, DUPLICATE, ERROR }
data class ScanEntry(val outcome: ScanOutcome, val ticket: Ticket?, val rawCode: String, val scannedAt: Long = System.currentTimeMillis())
