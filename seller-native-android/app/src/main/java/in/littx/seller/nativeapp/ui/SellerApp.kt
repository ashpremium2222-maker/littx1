package in.littx.seller.nativeapp.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import in.littx.seller.nativeapp.BuildConfig
import in.littx.seller.nativeapp.data.model.*

private val partners = listOf("littlane" to "Littlane Entertainment", "nitro" to "Nitro Events", "7th-heaven" to "7th Heaven")

@Composable fun SellerApp(activity: ComponentActivity) {
    val model = remember { SellerViewModel(activity) }
    MaterialTheme {
        model.state.update?.let { update ->
            AlertDialog(
                onDismissRequest = model::dismissUpdate,
                title = { Text("Update available") },
                text = { Text("Version ${update.version} is ready. Download the signed update from the official release?") },
                confirmButton = { TextButton(onClick = { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(update.downloadUrl))); model.dismissUpdate() }) { Text("Update") } },
                dismissButton = { TextButton(onClick = model::dismissUpdate) { Text("Later") } }
            )
        }
        when {
            model.state.loading && model.state.partner == null -> LoadingScreen()
            model.state.partner == null -> LoginScreen(model)
            else -> SellerHome(model)
        }
    }
}
@Composable private fun LoadingScreen() = Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
@Composable private fun LoginScreen(model: SellerViewModel) {
    var partner by remember { mutableStateOf(partners.first().first) }; var password by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Text("LITTX Seller", style = MaterialTheme.typography.headlineMedium); Spacer(Modifier.height(8.dp))
        Text("Native device-bound seller access", style = MaterialTheme.typography.bodyMedium); Spacer(Modifier.height(24.dp))
        if (BuildConfig.SELLER_API_BASE_URL.isBlank()) Text("This build has no production API endpoint. Configure SELLER_API_BASE_URL before distribution.", color = MaterialTheme.colorScheme.error)
        partners.forEach { (id, label) -> Row(verticalAlignment = Alignment.CenterVertically) { RadioButton(partner == id, { partner = id }); Text(label) } }
        OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("Partner password") }, visualTransformation = PasswordVisualTransformation())
        model.state.error?.let { Notice(it, true, model::dismissNotice) }; Spacer(Modifier.height(16.dp))
        Button(onClick = { model.login(partner, password) }, enabled = password.isNotBlank() && !model.state.loading && BuildConfig.SELLER_API_BASE_URL.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text(if (model.state.loading) "Verifying device…" else "Sign in with passkey") }
    }
}
@Composable private fun SellerHome(model: SellerViewModel) {
    var tab by remember { mutableStateOf(0) }
    Scaffold(topBar = { TopAppBar(title = { Text("LITTX Seller · ${model.state.partner?.name}") }, actions = { TextButton({ model.loadConfig() }) { Text("Refresh") }; TextButton({ model.logout() }) { Text("Sign out") } }) }, bottomBar = { NavigationBar { listOf("Issue ticket", "History").forEachIndexed { i, label -> NavigationBarItem(selected = tab == i, onClick = { tab = i; if (i == 1) model.loadSales() }, icon = {}, label = { Text(label) }) } } }) { padding ->
        Column(Modifier.padding(padding).padding(20.dp).fillMaxSize()) {
            model.state.error?.let { Notice(it, true, model::dismissNotice) }; model.state.message?.let { Notice(it, false, model::dismissNotice) }
            if (tab == 0) TicketForm(model, model.state.config) else History(model.state.sales)
        }
    }
}
@Composable private fun TicketForm(model: SellerViewModel, config: SellerConfig?) {
    if (config == null) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Column(horizontalAlignment = Alignment.CenterHorizontally) { Text("Loading seller configuration…"); TextButton({ model.loadConfig() }) { Text("Retry") } } }; return }
    var name by remember { mutableStateOf("") }; var email by remember { mutableStateOf("") }; var phone by remember { mutableStateOf("") }; var passId by remember(config.version) { mutableStateOf(config.passes.first().id) }
    val pass = config.passes.firstOrNull { it.id == passId } ?: config.passes.first()
    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("Generate partner ticket", style = MaterialTheme.typography.headlineSmall); Text(config.event.displayName) }
        item { OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Attendee full name") }) }
        item { OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Attendee email") }) }
        item { OutlinedTextField(phone, { phone = it }, Modifier.fillMaxWidth(), label = { Text("Attendee phone") }) }
        items(config.passes) { option -> FilterChip(selected = pass.id == option.id, onClick = { passId = option.id }, label = { Text("${option.label} · ₹${option.price.toInt()}") }) }
        item { Button(onClick = { model.submitTicket(name, email, phone, pass.id, pass.price, config.event.name) }, enabled = name.isNotBlank() && email.isNotBlank() && !model.state.loading, modifier = Modifier.fillMaxWidth()) { Text(if (model.state.loading) "Submitting…" else "Generate ticket · ₹${pass.price.toInt()}") } }
    }
}
@Composable private fun History(sales: List<Sale>) { LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) { item { Text("Sales history", style = MaterialTheme.typography.headlineSmall) }; if (sales.isEmpty()) item { Text("No sales available.") }; items(sales.size) { i -> val s = sales[i]; ListItem(headlineContent = { Text(s.name ?: "Ticket") }, supportingContent = { Text("${s.ticketType ?: "Pass"} · ${s.status ?: "Unknown"}") }, trailingContent = { Text("₹${s.amount?.toInt() ?: 0}") }); HorizontalDivider() } } }
@Composable private fun Notice(text: String, error: Boolean, dismiss: () -> Unit) { AssistChip(onClick = dismiss, label = { Text(text) }, colors = AssistChipDefaults.assistChipColors(containerColor = if (error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer)) }
