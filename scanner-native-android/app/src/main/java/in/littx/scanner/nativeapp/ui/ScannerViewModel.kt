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
    val authenticated: Boolean = false,
    val scannerName: String = "Gate Staff",
    val accepted: Int = 0,
    val failed: Int = 0,
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

    init { checkForUpdate(); verifySession() }

    fun login(password: String) {
        if (password.isBlank() || state.loading) return
        viewModelScope.launch {
            state = state.copy(loading = true, error = null)
            try {
                val response = repository.login(password)
                val token = response.token
                if (!response.success || token.isNullOrBlank()) throw IllegalStateException(response.message ?: "Unable to log in.")
                prefs.edit().putString("token", token).apply()
                val name = response.scannerName ?: "Gate Staff"
                prefs.edit().putString("name", name).apply()
                state = state.copy(loading = false, authenticated = true, scannerName = name, error = null)
            } catch (e: Exception) {
                state = state.copy(loading = false, authenticated = false, error = e.message ?: "Unable to log in.")
            }
        }
    }

    private fun verifySession() = viewModelScope.launch {
        val token = prefs.getString("token", null) ?: return@launch
        runCatching { repository.verifySession(token) }
            .onSuccess { response ->
                if (!response.success) prefs.edit().remove("token").apply()
                state = state.copy(authenticated = response.success, scannerName = response.scannerName ?: state.scannerName)
            }
            .onFailure {
                // Preserve the cached session while the server is unreachable; each scan still requires server confirmation.
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
        runCatching { repository.stats() }.getOrNull()?.takeIf { it.success }?.let { stats ->
            state = state.copy(accepted = stats.accepted, failed = stats.failed)
        }
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
