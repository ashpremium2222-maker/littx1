package in.littx.seller.nativeapp.data.model

import com.google.gson.JsonObject

data class StepOneResponse(val success: Boolean, val isRegistration: Boolean = false, val loginId: String? = null, val options: JsonObject? = null, val message: String? = null)
data class Partner(val id: String, val name: String, val registeredDeviceId: String? = null, val webauthnCredentialId: String? = null)
data class SessionResponse(val success: Boolean, val token: String? = null, val partner: Partner? = null, val message: String? = null)
data class ApiResponse(val success: Boolean, val message: String? = null)
data class Sale(val ticketId: String?, val name: String?, val email: String?, val ticketType: String?, val quantity: Int?, val amount: Double?, val generatedAt: String?, val status: String?)
data class SalesResponse(val success: Boolean, val sales: List<Sale> = emptyList(), val message: String? = null)
data class SellerPass(val id: String, val label: String, val price: Double)
data class SellerEvent(val name: String, val displayName: String)
data class SellerConfig(val version: Int, val event: SellerEvent, val passes: List<SellerPass>, val features: Map<String, Boolean> = emptyMap())
data class SellerConfigResponse(val success: Boolean, val config: SellerConfig? = null, val message: String? = null)
data class LoginStepOneRequest(val partnerId: String, val password: String)
data class LoginStepTwoRequest(val partnerId: String, val loginId: String, val response: JsonObject)
data class TicketRequest(val name: String, val email: String, val phone: String, val gender: String, val ticketType: String, val quantity: Int, val amount: Double, val event: String, val generatedBy: String, val partnerId: String)
