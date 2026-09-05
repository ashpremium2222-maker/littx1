package in.littx.seller.nativeapp.data

import in.littx.seller.nativeapp.data.model.*
import retrofit2.http.*

interface SellerApi {
    @POST("api/seller/login-step1") suspend fun loginStepOne(@Body body: LoginStepOneRequest): StepOneResponse
    @POST("api/seller/login-step2") suspend fun loginStepTwo(@Body body: LoginStepTwoRequest): SessionResponse
    @GET("api/seller/verify-session") suspend fun verify(@Header("x-seller-token") token: String): SessionResponse
    @POST("api/seller/logout") suspend fun logout(@Header("x-seller-token") token: String): ApiResponse
    @POST("api/admin/generate-ticket") suspend fun generateTicket(@Header("x-seller-token") token: String, @Body body: TicketRequest): ApiResponse
    @GET("api/seller/sales") suspend fun sales(@Header("x-seller-token") token: String): SalesResponse
    @GET("api/mobile/seller-config") suspend fun mobileConfig(@Header("x-seller-token") token: String): SellerConfigResponse
}
