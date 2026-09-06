package com.littx.seller.nativeapp.ui

import androidx.activity.ComponentActivity
import androidx.compose.runtime.*
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.littx.seller.nativeapp.data.*
import com.littx.seller.nativeapp.data.model.*
import com.littx.seller.nativeapp.security.PasskeyAuthenticator
import com.littx.seller.nativeapp.update.AppUpdate
import com.littx.seller.nativeapp.update.GitHubUpdateChecker
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class SellerUiState(
    val loading: Boolean = true, val partner: Partner? = null, val error: String? = null,
    val message: String? = null, val sales: List<Sale> = emptyList(), val config: SellerConfig? = null, val update: AppUpdate? = null
)

class SellerViewModel(activity: ComponentActivity) : ViewModel() {
    private val repository = SellerRepository(SecureSessionStore(activity.applicationContext))
    private val passkeys = PasskeyAuthenticator(activity)
    var state by mutableStateOf(SellerUiState())
        private set

    init { restore() }
    private fun restore() = viewModelScope.launch {
        val session = repository.restore()
        state = SellerUiState(loading = false, partner = if (session?.success == true) session.partner else null)
        if (state.partner != null) loadConfig()
        checkForUpdate()
    }
    fun login(partnerId: String, password: String) = viewModelScope.launch {
        state = state.copy(loading = true, error = null, message = null)
        try {
            val step = repository.beginLogin(partnerId, password)
            require(step.success && step.options != null && step.loginId != null) { step.message ?: "Login could not be started." }
            val proof = passkeys.complete(step.options.toString(), step.isRegistration)
            val session = repository.finishLogin(partnerId, step.loginId, passkeys.json(proof))
            if (!session.success || session.partner == null) throw SecurityException(session.message ?: "Device verification failed.")
            state = SellerUiState(loading = false, partner = session.partner)
            loadConfig()
        } catch (e: Exception) {
            state = state.copy(loading = false, error = e.message ?: "Secure sign-in failed.")
        }
    }
    fun submitTicket(name: String, email: String, phone: String, ticketType: String, amount: Double, event: String) = viewModelScope.launch {
        val partner = state.partner ?: return@launch
        state = state.copy(loading = true, error = null, message = null)
        try {
            val response = repository.createTicket(TicketRequest(name, email, phone, ticketType, ticketType, 1, amount, event, partner.name, partner.id))
            state = state.copy(loading = false, message = response.message ?: if (response.success) "Ticket generated and submitted to the server." else "Ticket generation failed.", error = if (response.success) null else response.message)
        } catch (e: Exception) { handleRequestError(e, "Network error.") }
    }
    fun loadSales() = viewModelScope.launch {
        state = state.copy(loading = true, error = null)
        try { val response = repository.sales(); state = state.copy(loading = false, sales = response.sales, error = if (response.success) null else response.message) }
        catch (e: Exception) { handleRequestError(e, "Could not load history.") }
    }
    fun loadConfig() = viewModelScope.launch {
        try {
            val response = repository.config()
            state = state.copy(config = response.config, error = if (response.success) null else response.message)
        } catch (e: Exception) { handleRequestError(e, "Could not refresh seller configuration.") }
    }
    fun checkForUpdate() = viewModelScope.launch {
        val checker = GitHubUpdateChecker()
        val update = withContext(Dispatchers.IO) { runCatching { checker.latest() }.getOrNull() }
        if (update != null && checker.isNewer(update.version)) state = state.copy(update = update)
    }
    fun dismissUpdate() { state = state.copy(update = null) }
    fun logout() = viewModelScope.launch { repository.logout(); state = SellerUiState(loading = false) }
    fun dismissNotice() { state = state.copy(error = null, message = null) }
    private fun handleRequestError(error: Exception, fallback: String) {
        state = if (error is SellerSessionExpiredException) {
            SellerUiState(loading = false, error = error.message)
        } else {
            state.copy(loading = false, error = error.message ?: fallback)
        }
    }
}
