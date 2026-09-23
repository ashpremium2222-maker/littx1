package com.littx.scanner.nativeapp.data

import com.littx.scanner.nativeapp.data.model.ScanRequest
import com.littx.scanner.nativeapp.data.model.ScanResponse
import com.littx.scanner.nativeapp.data.model.ScanStats
import com.littx.scanner.nativeapp.data.model.ScannerLoginRequest
import com.littx.scanner.nativeapp.data.model.ScannerLoginResponse
import com.littx.scanner.nativeapp.data.model.ScannerSessionResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Header

interface ScannerApi {
    @POST("api/scanner-login") suspend fun login(@Body request: ScannerLoginRequest): ScannerLoginResponse
    @GET("api/scanner-session") suspend fun verifySession(@Header("Authorization") authorization: String): ScannerSessionResponse
    @POST("api/scan-ticket") suspend fun scan(@Header("Authorization") authorization: String, @Body request: ScanRequest): ScanResponse
    @GET("api/scan-stats") suspend fun stats(): ScanStats
}
