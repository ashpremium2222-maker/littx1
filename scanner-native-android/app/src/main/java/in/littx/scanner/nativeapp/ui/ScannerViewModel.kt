package com.littx.scanner.nativeapp.ui

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
    val scannerName: String = "Gate Staff",
    val accepted: Int = 0,
    val failed: Int = 0,
    val history: List<ScanEntry> = emptyList(),
    val latest: ScanEntry? = null,
    val update: ScannerUpdate? = null,
    val error: String? = null
)

class ScannerViewModel(context: Context) : ViewModel() {
    private val prefs = context.getSharedPreferences("scanner", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val repository = ScannerRepository()
    var state by mutableStateOf(ScannerState(scannerName = prefs.getString("name", "Gate Staff") ?: "Gate Staff", history = loadHistory()))
        private set

    init { refreshStats(); checkForUpdate() }

    fun scan(raw: String) {
        val ticketId = cleanCode(raw)
        if (ticketId.isBlank() || state.loading) return
        viewModelScope.launch {
            state = state.copy(loading = true, error = null)
            try {
                val response = repository.scan(ticketId, state.scannerName)
                val outcome = when (response.result) {
                    "success" -> ScanOutcome.APPROVED
                    "rejected" -> if (response.ticket?.status == "scanned") ScanOutcome.DUPLICATE else ScanOutcome.INVALID
                    else -> ScanOutcome.INVALID
                }
                val entry = ScanEntry(outcome, response.ticket, ticketId)
                val history = (listOf(entry) + state.history).take(250)
                state = state.copy(loading = false, latest = entry, history = history)
                saveHistory(history)
                refreshStats()
            } catch (e: Exception) {
                val entry = ScanEntry(ScanOutcome.ERROR, null, ticketId)
                val history = (listOf(entry) + state.history).take(250)
                state = state.copy(loading = false, latest = entry, history = history, error = e.message ?: "Could not validate ticket.")
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
