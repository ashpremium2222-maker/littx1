package com.littx.scanner.nativeapp.ui

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.littx.scanner.nativeapp.data.ScannerRepository
import com.littx.scanner.nativeapp.data.model.*
import com.littx.scanner.nativeapp.update.GitHubUpdateChecker
import com.littx.scanner.nativeapp.update.ScannerUpdate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class ScannerState(
    val loading: Boolean = false,
    val sessionConnecting: Boolean = false,
    val authenticated: Boolean = false,
    val scannerName: String = "Gate Staff",
    val accepted: Int = 0,
    val failed: Int = 0,
    val statsLoading: Boolean = false,
    val statsAvailable: Boolean = false,
    val statsError: Boolean = false,
    val history: List<ScanEntry> = emptyList(),
    val latest: ScanEntry? = null,
    val update: ScannerUpdate? = null,
    val error: String? = null
)

class ScannerViewModel(context: Context) : ViewModel() {
    private val legacyPrefs = context.getSharedPreferences("scanner", Context.MODE_PRIVATE)
    private val prefs = EncryptedSharedPreferences.create(
        context.applicationContext,
        "scanner_secure",
        MasterKey.Builder(context.applicationContext).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    init {
        val migration = prefs.edit()
        if (!prefs.contains("name")) legacyPrefs.getString("name", null)?.let { migration.putString("name", it) }
        if (!prefs.contains("history")) legacyPrefs.getString("history", null)?.let { migration.putString("history", it) }
        if (migration.commit() && legacyPrefs.all.isNotEmpty()) legacyPrefs.edit().clear().commit()
    }
    private val gson = Gson()
    private val repository = ScannerRepository()
    var state by mutableStateOf(ScannerState(authenticated = !prefs.getString("token", null).isNullOrBlank(), scannerName = prefs.getString("name", "Gate Staff") ?: "Gate Staff", history = loadHistory()))
        private set

    init {
        checkForUpdate()
        if (!prefs.getString("token", null).isNullOrBlank()) verifySession()
    }

    fun retrySession(password: String) = openAppSession(password)

    private fun openAppSession(password: String) {
        if (state.sessionConnecting) return
        viewModelScope.launch {
            state = state.copy(sessionConnecting = true, error = null)
            try {
                val response = repository.openAppSession(password)
                val token = response.token
                if (!response.success || token.isNullOrBlank()) {
                    throw IllegalStateException(response.message ?: "Scanner service is unavailable.")
                }
                prefs.edit().putString("token", token).apply()
                val name = response.scannerName ?: "Gate Staff"
                prefs.edit().putString("name", name).apply()
                state = state.copy(sessionConnecting = false, authenticated = true, scannerName = name, error = null)
            } catch (e: Exception) {
                state = state.copy(
                    sessionConnecting = false,
                    authenticated = false,
                    error = e.message?.takeIf { it.isNotBlank() } ?: "Unable to reach scanner service. Check your connection and retry."
                )
            }
        }
    }

    private fun verifySession() = viewModelScope.launch {
        val token = prefs.getString("token", null) ?: return@launch
        runCatching { repository.verifySession(token) }
            .onSuccess { response ->
                if (response.success) {
                    state = state.copy(authenticated = true, scannerName = response.scannerName ?: state.scannerName)
                } else {
                    prefs.edit().remove("token").apply()
                    state = state.copy(authenticated = false)
                }
            }
            .onFailure { error ->
                if (error is retrofit2.HttpException && error.code() == 401) {
                    prefs.edit().remove("token").apply()
                    state = state.copy(authenticated = false)
                }
                // Keep a cached session during network/server errors; each scan still requires server confirmation.
            }
    }

    fun scan(raw: String) {
        val ticketId = cleanCode(raw)
        if (ticketId.isBlank() || state.loading) return
        viewModelScope.launch {
            state = state.copy(loading = true, error = null)
            try {
                val token = prefs.getString("token", null) ?: throw IllegalStateException("Scanner session expired. Log in again.")
                val response = repository.scan(ticketId, state.scannerName, token)
                val outcome = when (response.result) {
                    "success" -> ScanOutcome.APPROVED
                    "rejected" -> if (response.ticket?.status == "scanned") ScanOutcome.DUPLICATE else ScanOutcome.INVALID
                    else -> ScanOutcome.INVALID
                }
                val entry = ScanEntry(outcome, response.ticket, ticketId)
                val history = (listOf(entry) + state.history).take(250)
                state = state.copy(loading = false, latest = entry, history = history)
                saveHistory(history)
            } catch (e: Exception) {
                val expired = e is retrofit2.HttpException && e.code() == 401
                if (expired) prefs.edit().remove("token").apply()
                val entry = ScanEntry(ScanOutcome.ERROR, null, ticketId)
                val history = (listOf(entry) + state.history).take(250)
                state = state.copy(loading = false, authenticated = state.authenticated && !expired, latest = entry, history = history, error = if (expired) "Scanner session expired. Log in again." else e.message ?: "Could not validate ticket.")
                saveHistory(history)
            }
        }
    }

    fun refreshStats() = viewModelScope.launch {
        if (state.statsLoading) return@launch
        state = state.copy(statsLoading = true, statsError = false)
        val token = prefs.getString("token", null)
        if (token.isNullOrBlank()) {
            state = state.copy(statsLoading = false, statsError = true)
            return@launch
        }
        runCatching { repository.stats(token) }.onSuccess { stats ->
            if (stats.success) state = state.copy(accepted = stats.accepted, failed = stats.failed, statsLoading = false, statsAvailable = true, statsError = false)
            else state = state.copy(statsLoading = false, statsError = true)
        }.onFailure {
            state = state.copy(statsLoading = false, statsError = true)
        }
    }
    fun logout() = viewModelScope.launch {
        val token = prefs.getString("token", null)
        if (!token.isNullOrBlank()) runCatching { repository.logout(token) }
        prefs.edit().remove("token").apply()
        state = state.copy(authenticated = false, latest = null, error = null)
    }
    fun setScannerName(name: String) { if (name.isNotBlank()) { prefs.edit().putString("name", name.trim()).apply(); state = state.copy(scannerName = name.trim()) } }
    fun clearLatest() { state = state.copy(latest = null, error = null) }
    fun dismissUpdate() { state = state.copy(update = null) }
    private fun checkForUpdate() = viewModelScope.launch {
        val checker = GitHubUpdateChecker()
        val update = withContext(Dispatchers.IO) { runCatching { checker.latest() }.getOrNull() }
        if (update != null && checker.isNewer(update.version)) state = state.copy(update = update)
    }
    // Ticket QR payloads predate the native app and appear in more than one
    // format. Keep this in sync with the website scanner's cleanScannedTicketId.
    private fun cleanCode(raw: String): String {
        val value = raw.trim().replace(Regex("^LITTIX:", RegexOption.IGNORE_CASE), "").removePrefix("#")
        Regex("/view/([^/?#]+)", RegexOption.IGNORE_CASE).find(value)?.groupValues?.getOrNull(1)?.let {
            return java.net.URLDecoder.decode(it, Charsets.UTF_8.name()).removePrefix("#")
        }
        Regex("(?:ticketId|ticket|id)=([^&#]+)", RegexOption.IGNORE_CASE).find(value)?.groupValues?.getOrNull(1)?.let {
            return java.net.URLDecoder.decode(it, Charsets.UTF_8.name()).removePrefix("#")
        }
        return value.substringBefore('?').substringBefore('#').trim()
    }
    private fun loadHistory(): List<ScanEntry> = runCatching {
        val type = object : TypeToken<List<ScanEntry>>() {}.type
        gson.fromJson<List<ScanEntry>>(prefs.getString("history", "[]"), type) ?: emptyList()
    }.getOrDefault(emptyList())
    private fun saveHistory(history: List<ScanEntry>) { prefs.edit().putString("history", gson.toJson(history)).apply() }
}
