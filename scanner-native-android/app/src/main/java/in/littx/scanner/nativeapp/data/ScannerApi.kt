package com.littx.scanner.nativeapp.data

import com.littx.scanner.nativeapp.data.model.ScanRequest
import com.littx.scanner.nativeapp.data.model.ScanResponse
import com.littx.scanner.nativeapp.data.model.ScanStats
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface ScannerApi {
    @POST("api/scan-ticket") suspend fun scan(@Body request: ScanRequest): ScanResponse
    @GET("api/scan-stats") suspend fun stats(): ScanStats
}
