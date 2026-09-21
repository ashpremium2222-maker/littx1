package com.littx.scanner.nativeapp.update

import com.littx.scanner.nativeapp.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class ScannerUpdate(val version: String, val downloadUrl: String)

class GitHubUpdateChecker {
    private val client = OkHttpClient.Builder().callTimeout(10, TimeUnit.SECONDS).build()
    fun latest(): ScannerUpdate? {
        val repository = BuildConfig.SCANNER_UPDATE_REPOSITORY
        if (!repository.matches(Regex("[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"))) return null
        val request = Request.Builder().url("https://api.github.com/repos/$repository/releases/latest")
            .header("Accept", "application/vnd.github+json").header("User-Agent", "Littx-Scanner-Android").build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return null
            val json = JSONObject(response.body?.string() ?: return null)
            val tag = json.optString("tag_name")
            if (!tag.startsWith("scanner-v")) return null
            val asset = (0 until (json.optJSONArray("assets")?.length() ?: 0)).map { json.getJSONArray("assets").getJSONObject(it) }
                .firstOrNull { it.optString("name").endsWith(".apk") } ?: return null
            return ScannerUpdate(tag.removePrefix("scanner-v"), asset.getString("browser_download_url"))
        }
    }
    fun isNewer(remote: String): Boolean {
        fun parts(value: String) = Regex("\\d+").findAll(value).map { it.value.toInt() }.toList()
        val local = parts(BuildConfig.VERSION_NAME); val latest = parts(remote)
        for (i in 0 until maxOf(local.size, latest.size)) { val a = local.getOrElse(i) { 0 }; val b = latest.getOrElse(i) { 0 }; if (a != b) return b > a }
        return false
    }
}
