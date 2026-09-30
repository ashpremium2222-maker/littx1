package com.littx.shadowbyash

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

data class LoginBody(val password: String)
data class LoginResult(val success: Boolean = false, val shadowToken: String? = null, val message: String? = null)
data class PassTier(val id: String? = null, val name: String = "", val price: Double = 0.0)
data class ShadowEvent(val id: String? = null, val name: String = "", val tiers: List<PassTier> = emptyList())
data class PricingResult(val events: List<ShadowEvent> = emptyList())
data class TicketBody(val name: String, val email: String, val phone: String, val gender: String = "", val ticketType: String, val quantity: Int, val event: String, val shadowPaymentStatus: String, val commissionPercentage: Double, val commissionAmount: Double)
data class TicketResult(val success: Boolean = false, val ticketId: String? = null, val message: String? = null)
data class ShadowSale(val orderId: String = "", val ticketId: String? = null, val name: String = "", val email: String = "", val phone: String? = null, val event: String = "", val ticketType: String = "", val quantity: Int = 1, val amount: Double = 0.0, val commissionAmount: Double = 0.0, val commissionPercentage: Double = 0.0, val rateAfterCommission: Double? = null, val status: String = "", val shadowPaymentStatus: String = "paid", val paymentMethod: String? = null, val gender: String? = null, val emailStatus: String? = null, val generatedBy: String? = null, val createdAt: String = "", val generatedAt: String? = null, val disabledAt: String? = null)
data class SalesResult(val shadowRevenue: Double = 0.0, val shadowRevenueAfterCommission: Double = 0.0, val shadowTicketsSold: Int = 0, val sales: List<ShadowSale> = emptyList())
interface ShadowApi {
    @POST("api/shadow/login") suspend fun login(@Body body: LoginBody): LoginResult
    @GET("api/shadow/pricing") suspend fun pricing(@Header("x-shadow-token") token: String): PricingResult
    @GET("api/shadow/sales") suspend fun sales(@Header("x-shadow-token") token: String): SalesResult
    @POST("api/shadow/generate-ticket") suspend fun create(@Header("x-shadow-token") token: String, @Body body: TicketBody): TicketResult
    @POST("api/shadow/tickets/{orderId}/{action}") suspend fun ticketAction(@Header("x-shadow-token") token: String, @Path("orderId", encoded = true) orderId: String, @Path("action") action: String): TicketResult
    @DELETE("api/shadow/tickets/{orderId}") suspend fun delete(@Header("x-shadow-token") token: String, @Path("orderId", encoded = true) orderId: String): TicketResult
}
