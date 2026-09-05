package com.littx.seller.nativeapp.update

import com.littx.seller.nativeapp.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class AppUpdate(val version: String, val downloadUrl: String)

class GitHubUpdateChecker {
    private val client = OkHttpClient.Builder().callTimeout(10, TimeUnit.SECONDS).build()
    fun latest(): AppUpdate? {
        val repository = BuildConfig.SELLER_UPDATE_REPOSITORY
        if (!repository.matches(Regex("[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"))) return null
        val request = Request.Builder().url("https://api.github.com/repos/$repository/releases/latest")
            .header("Accept", "application/vnd.github+json").header("User-Agent", "Littx-Seller-Android").build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return null
            val json = JSONObject(response.body?.string() ?: return null)
            val version = json.optString("tag_name").removePrefix("seller-v").removePrefix("v")
            val assets = json.optJSONArray("assets") ?: return null
            val apk = (0 until assets.length()).map { assets.getJSONObject(it) }.firstOrNull { it.optString("name").endsWith(".apk") } ?: return null
            return AppUpdate(version, apk.getString("browser_download_url"))
        }
    }
    fun isNewer(remote: String): Boolean {
        fun parts(value: String) = Regex("\\d+").findAll(value).map { it.value.toInt() }.toList()
        val local = parts(BuildConfig.VERSION_NAME); val latest = parts(remote)
        for (index in 0 until maxOf(local.size, latest.size)) {
            val a = local.getOrElse(index) { 0 }; val b = latest.getOrElse(index) { 0 }
            if (a != b) return b > a
        }
        return false
    }
}
