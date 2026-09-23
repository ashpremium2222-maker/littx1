package com.littx.scanner.nativeapp.data

import com.littx.scanner.nativeapp.BuildConfig
import com.littx.scanner.nativeapp.data.model.*
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class ScannerRepository {
    private val api: ScannerApi by lazy {
        require(BuildConfig.SCANNER_API_BASE_URL.startsWith("https://")) { "A secure SCANNER_API_BASE_URL is required." }
        Retrofit.Builder().baseUrl(BuildConfig.SCANNER_API_BASE_URL.trimEnd('/') + "/")
            .client(OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS).build())
            .addConverterFactory(GsonConverterFactory.create()).build().create(ScannerApi::class.java)
    }
    suspend fun login(password: String) = api.login(ScannerLoginRequest(password))
    suspend fun verifySession(token: String) = api.verifySession("Bearer $token")
    suspend fun scan(ticketId: String, scanner: String, token: String) = api.scan("Bearer $token", ScanRequest(ticketId, scanner))
    suspend fun stats() = api.stats()
}
