package com.littx.seller.nativeapp.data

import com.littx.seller.nativeapp.BuildConfig
import com.littx.seller.nativeapp.data.model.*
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class SellerRepository(private val store: SecureSessionStore) {
    private val api: SellerApi by lazy {
        val configured = BuildConfig.SELLER_API_BASE_URL
        require(configured.startsWith("https://")) { "A production seller API must be configured with an HTTPS URL." }
        val logger = HttpLoggingInterceptor().apply { level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE }
        val client = OkHttpClient.Builder().addInterceptor(logger).connectTimeout(15, TimeUnit.SECONDS).readTimeout(25, TimeUnit.SECONDS).build()
        Retrofit.Builder().baseUrl("${configured.trimEnd('/')}/").client(client).addConverterFactory(GsonConverterFactory.create()).build().create(SellerApi::class.java)
    }
    suspend fun beginLogin(partnerId: String, password: String) = api.loginStepOne(LoginStepOneRequest(partnerId, password))
    suspend fun finishLogin(partnerId: String, loginId: String, response: com.google.gson.JsonObject): SessionResponse {
        val result = api.loginStepTwo(LoginStepTwoRequest(partnerId, loginId, response))
        if (result.success && result.token != null && result.partner != null) store.save(result.token, result.partner)
        return result
    }
    suspend fun restore(): SessionResponse? {
        val token = store.token() ?: return null
        return try { api.verify(token).also { if (!it.success) store.clear() } } catch (_: Exception) { null }
    }
    suspend fun createTicket(request: TicketRequest): ApiResponse = api.generateTicket(requireToken(), request)
    suspend fun sales(): SalesResponse = api.sales(requireToken())
    suspend fun config(): SellerConfigResponse = api.mobileConfig(requireToken())
    suspend fun logout() { val token = store.token(); if (token != null) runCatching { api.logout(token) }; store.clear() }
    fun cachedPartner() = store.partner()
    private fun requireToken() = store.token() ?: throw SecurityException("Your secure session has expired. Please sign in again.")
}
