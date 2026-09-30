package com.littx.shadowbyash

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCard
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.absoluteValue

private val Black = Color(0xFF000000)
private val Panel = Color(0xFF111113)
private val Silver = Color(0xFFE5E7EB)
private val Gray = Color(0xFFA1A1AA)
private val api = Retrofit.Builder().baseUrl(BuildConfig.SHADOW_API_BASE_URL)
    .addConverterFactory(GsonConverterFactory.create()).build().create(ShadowApi::class.java)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); setContent { ShadowApp() } }
}

@Composable private fun ShadowApp() {
    var token by remember { mutableStateOf<String?>(null) }
    MaterialTheme(colorScheme = darkColorScheme(background = Black, surface = Panel, primary = Silver, onPrimary = Black, onSurface = Silver)) {
        if (token == null) LoginScreen(onLogin = { token = it }) else ShadowDesk(token!!, onLogout = { token = null })
    }
}

@Composable private fun LoginScreen(onLogin: (String) -> Unit) {
    var password by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Surface(color = Black, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Image(painterResource(R.drawable.shadow_by_ash_logo), contentDescription = "Shadow by Ash", modifier = Modifier.fillMaxWidth().height(250.dp))
            Text("SHADOW SALES PANEL", color = Silver, letterSpacing = 4.sp)
            Spacer(Modifier.height(24.dp))
            Card(colors = CardDefaults.cardColors(Panel), shape = RoundedCornerShape(26.dp)) {
                Column(Modifier.padding(22.dp)) {
                    Text("Operator access", color = Silver, fontSize = 28.sp)
                    Text("Sign in to manage ticket sales and customers.", color = Gray, modifier = Modifier.padding(top = 8.dp, bottom = 20.dp))
                    OutlinedTextField(password, { password = it }, label = { Text("Access password") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Button(onClick = { scope.launch { busy = true; runCatching { api.login(LoginBody(password)) }.onSuccess { if (it.success && it.shadowToken != null) onLogin(it.shadowToken) else message = it.message ?: "Access denied" }.onFailure { message = "Could not connect to Shadow by Ash." }; busy = false } }, enabled = password.isNotBlank() && !busy, modifier = Modifier.fillMaxWidth().padding(top = 16.dp)) { Text(if (busy) "SIGNING IN…" else "AUTHENTICATE  →") }
                    if (message.isNotBlank()) Text(message, color = Color(0xFFFCA5A5), modifier = Modifier.padding(top = 10.dp))
                }
            }
            Text("AUTHORIZED OPERATORS ONLY", color = Gray, letterSpacing = 3.sp, modifier = Modifier.padding(top = 22.dp))
        }
    }
}

@Composable private fun ShadowDesk(token: String, onLogout: () -> Unit) {
    var tab by remember { mutableIntStateOf(0) }
    var pricing by remember { mutableStateOf(PricingResult()) }
    var sales by remember { mutableStateOf(SalesResult()) }
    var error by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var successTicketCount by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    suspend fun reload() { loading = true; runCatching { pricing = api.pricing(token); sales = api.sales(token) }.onFailure { error = it.message ?: "Could not load data" }; loading = false }
    LaunchedEffect(token) { reload() }
    Box(Modifier.fillMaxSize()) {
      Scaffold(containerColor = Black, bottomBar = {
        NavigationBar(containerColor = Panel) {
            NavigationBarItem(selected = tab == 0, onClick = { tab = 0 }, icon = { Icon(Icons.Default.Dashboard, null) }, label = { Text("Overview") })
            NavigationBarItem(selected = tab == 1, onClick = { tab = 1 }, icon = { Icon(Icons.Default.AddCard, null) }, label = { Text("Issue ticket") })
            NavigationBarItem(selected = tab == 2, onClick = { tab = 2 }, icon = { Icon(Icons.Default.ReceiptLong, null) }, label = { Text("Sales") })
        }
    }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 10.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column { Text("SHADOW", color = Silver, fontSize = 29.sp, letterSpacing = 5.sp); Text("BY ASH  ·  ${listOf("SALES DESK", "NEW TICKET", "ORDER HISTORY")[tab]}", color = Gray, letterSpacing = 2.sp) }
                Row { IconButton(onClick = { scope.launch { reload() } }) { Icon(Icons.Default.Refresh, "Refresh", tint = Silver) }; IconButton(onClick = onLogout) { Icon(Icons.Default.Logout, "Sign out", tint = Silver) } }
            }
            if (error.isNotBlank()) Text(error, color = Color(0xFFFCA5A5), modifier = Modifier.padding(horizontal = 18.dp))
            when (tab) {
                0 -> Overview(sales, loading, onIssue = { tab = 1 }, onSales = { tab = 2 })
                1 -> IssueTicket(token, pricing, onCreated = { count ->
                    if (count == null) scope.launch { reload() } else successTicketCount = count
                })
                else -> SalesScreen(token, sales, onChanged = { scope.launch { reload() } })
            }
        }
      }
      if (successTicketCount > 0) {
          TicketSuccessPopup(successTicketCount) {
              successTicketCount = 0
              scope.launch { reload(); tab = 2 }
          }
      }
    }
}

@Composable private fun Overview(data: SalesResult, loading: Boolean, onIssue: () -> Unit, onSales: () -> Unit) {
    var expandedOrder by remember { mutableStateOf<String?>(null) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { Card(colors = CardDefaults.cardColors(Panel), shape = RoundedCornerShape(26.dp)) { Column(Modifier.padding(24.dp)) { Text("YOUR SALES, AT A GLANCE", color = Gray, letterSpacing = 3.sp); Text("The night starts here.", color = Silver, fontSize = 30.sp, modifier = Modifier.padding(vertical = 12.dp)); Text("Track your Shadow tickets and welcome your next guest.", color = Gray, fontSize = 16.sp); Button(onClick = onIssue, modifier = Modifier.padding(top = 18.dp)) { Text("＋  Create new ticket") } } } }
        item { Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { Metric("₹${money(data.shadowRevenue)}", "TOTAL REVENUE", Modifier.weight(1f)); Metric("₹${money(data.shadowRevenueAfterCommission)}", "AFTER COMMISSION", Modifier.weight(1f)) } }
        item { Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { Metric(data.shadowTicketsSold.toString(), "TICKETS ISSUED", Modifier.weight(1f)); Metric("₹${money(data.sales.filter { isToday(it.generatedAt ?: it.createdAt) && it.disabledAt == null }.sumOf { it.amount })}", "TODAY'S SALES", Modifier.weight(1f)) } }
        item { Text("RECENT ORDERS", color = Gray, letterSpacing = 3.sp, modifier = Modifier.padding(top = 6.dp)); TextButton(onClick = onSales) { Text("See all sales", color = Silver) } }
        if (loading) item { CircularProgressIndicator(color = Silver) }
        items(data.sales.filter { it.disabledAt == null }.take(6), key = { it.orderId }) { sale ->
            SaleCard(sale, expanded = expandedOrder == sale.orderId, onToggle = { expandedOrder = if (expandedOrder == sale.orderId) null else sale.orderId })
        }
    }
}

@Composable private fun Metric(value: String, label: String, modifier: Modifier = Modifier) {
    Card(modifier = modifier, colors = CardDefaults.cardColors(Panel), shape = RoundedCornerShape(22.dp)) { Column(Modifier.padding(16.dp)) { Text(label, color = Gray, fontSize = 11.sp, letterSpacing = 1.sp); Text(value, color = Silver, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp)) } }
}

@Composable private fun IssueTicket(token: String, pricing: PricingResult, onCreated: (Int?) -> Unit) {
    var name by remember { mutableStateOf("") }; var email by remember { mutableStateOf("") }; var phone by remember { mutableStateOf("") }
    var eventName by remember { mutableStateOf(pricing.events.firstOrNull()?.name.orEmpty()) }; var tierName by remember { mutableStateOf("") }
    var quantity by remember { mutableIntStateOf(1) }; var payment by remember { mutableStateOf("Paid") }; var commission by remember { mutableStateOf("0%") }
    var customRate by remember { mutableStateOf("") }; var sending by remember { mutableStateOf(false) }; var error by remember { mutableStateOf("") }; var tickets by remember { mutableStateOf<List<String>?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(pricing) { if (eventName.isBlank()) eventName = pricing.events.firstOrNull()?.name.orEmpty(); val ev = pricing.events.find { it.name == eventName }; if (tierName.isBlank()) tierName = ev?.tiers?.firstOrNull()?.name.orEmpty() }
    val event = pricing.events.find { it.name == eventName }; val tier = event?.tiers?.find { it.name == tierName }
    val rate = if (commission == "Custom") customRate.toDoubleOrNull() ?: 0.0 else commission.removeSuffix("%").toDoubleOrNull() ?: 0.0
    val subtotal = if (payment == "Paid") (tier?.price ?: 0.0) * quantity else 0.0
    val invalidRate = rate < 0.0 || rate > 20.0 || (commission == "Custom" && customRate.isBlank())
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 18.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("CUSTOMER DETAILS", color = Gray, letterSpacing = 3.sp) }
        item { TextInput("CUSTOMER NAME", "Full name", name, { name = it }) }
        item { TextInput("EMAIL ADDRESS", "guest@example.com", email, { email = it }, KeyboardType.Email) }
        item { TextInput("PHONE NUMBER · OPTIONAL", "WhatsApp number", phone, { phone = it }, KeyboardType.Phone) }
        item { Text("TICKET DETAILS", color = Gray, letterSpacing = 3.sp, modifier = Modifier.padding(top = 6.dp)) }
        item { ChoiceField("EVENT", eventName, pricing.events.map { it.name }) { eventName = it; tierName = pricing.events.find { ev -> ev.name == it }?.tiers?.firstOrNull()?.name.orEmpty() } }
        item { ChoiceField("PASS TYPE", tierName, event?.tiers?.map { it.name }.orEmpty()) { tierName = it } }
        item { ChoiceField("QUANTITY", quantity.toString(), (1..10).map(Int::toString)) { quantity = it.toInt() } }
        item { ChoiceField("PAYMENT STATUS", payment, listOf("Paid", "Free / Chai Pani")) { payment = it; if (it != "Paid") commission = "0%" } }
        item { ChoiceField("COMMISSION", commission, listOf("0%", "5%", "10%", "15%", "20%", "Custom")) { commission = it } }
        if (commission == "Custom") item { TextInput("CUSTOM COMMISSION (MAX 20%)", "Enter percentage", customRate, { customRate = it.filter { ch -> ch.isDigit() || ch == '.' } }, KeyboardType.Decimal) }
        item { Card(colors = CardDefaults.cardColors(Panel), shape = RoundedCornerShape(16.dp)) { Column(Modifier.padding(16.dp)) { Text("TOTAL  ₹${money(subtotal)}", color = Silver, fontWeight = FontWeight.Bold); Text("AFTER COMMISSION  ₹${money(subtotal * (1 - rate / 100))}", color = Gray, modifier = Modifier.padding(top = 6.dp)); if (quantity > 1) Text("${quantity} individual tickets will be generated and delivered separately.", color = Gray, modifier = Modifier.padding(top = 8.dp)) } } }
        if (error.isNotBlank()) item { Text(error, color = Color(0xFFFCA5A5)) }
        item { Button(onClick = { scope.launch {
            sending = true; error = ""
            val ticketIds = mutableListOf<String>()
            try {
                repeat(quantity) {
                    val unitAmount = if (payment == "Paid") tier?.price ?: 0.0 else 0.0
                    val result = api.create(token, TicketBody(name.trim(), email.trim(), phone.trim(), "", tierName, 1, eventName, if (payment == "Paid") "paid" else "free_chai_pani", if (payment == "Paid") rate else 0.0, if (payment == "Paid") unitAmount * rate / 100.0 else 0.0))
                    if (!result.success) error(result.message ?: "Ticket creation failed.") else ticketIds += result.ticketId ?: "Created"
                }
                tickets = null
                onCreated(ticketIds.size)
            } catch (e: Exception) {
                error = if (ticketIds.isNotEmpty()) "Created ${ticketIds.size} of $quantity tickets. Check the IDs below before retrying. ${e.message ?: "Delivery failed."}" else e.message ?: "Network error while creating tickets."
                if (ticketIds.isNotEmpty()) { tickets = ticketIds; onCreated(null) }
            }
            finally { sending = false }
        } }, enabled = !sending && name.isNotBlank() && email.isNotBlank() && eventName.isNotBlank() && tierName.isNotBlank() && !invalidRate, modifier = Modifier.fillMaxWidth()) { Text(if (sending) "CREATING ${quantity} TICKET${if (quantity > 1) "S" else ""}…" else "CREATE & SEND TICKET${if (quantity > 1) "S" else ""} 🚀") } }
        tickets?.let { ids -> item { AnimatedVisibility(true, enter = fadeIn() + scaleIn()) { Card(colors = CardDefaults.cardColors(Panel), shape = RoundedCornerShape(22.dp)) { Column(Modifier.fillMaxWidth().padding(22.dp), horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.Default.CheckCircle, null, tint = Silver, modifier = Modifier.size(58.dp)); Text("${ids.size} TICKET${if (ids.size == 1) "" else "S"} CREATED", color = Silver, letterSpacing = 2.sp, modifier = Modifier.padding(top = 8.dp)); ids.forEach { Text(it, color = Gray, modifier = Modifier.padding(top = 4.dp)) }; TextButton(onClick = { tickets = null; name = ""; email = ""; phone = "" }) { Text("Issue another ticket", color = Silver) } } } } } }
    }
}

@Composable private fun SalesScreen(token: String, data: SalesResult, onChanged: () -> Unit) {
    var selected by remember { mutableStateOf<ShadowSale?>(null) }; var expandedOrder by remember { mutableStateOf<String?>(null) }; var actionError by remember { mutableStateOf("") }; var busyId by remember { mutableStateOf("") }; val scope = rememberCoroutineScope()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("ORDER HISTORY", color = Gray, letterSpacing = 3.sp); Text("₹${money(data.shadowRevenue)} revenue  ·  ₹${money(data.shadowRevenueAfterCommission)} after commission", color = Silver, modifier = Modifier.padding(top = 8.dp)) }
        if (actionError.isNotBlank()) item { Text(actionError, color = Color(0xFFFCA5A5)) }
        items(data.sales, key = { it.orderId }) { sale ->
            SaleCard(sale, expanded = expandedOrder == sale.orderId, onToggle = { expandedOrder = if (expandedOrder == sale.orderId) null else sale.orderId }, onDisable = {
                busyId = sale.orderId; scope.launch { runCatching { api.ticketAction(token, sale.orderId, if (sale.disabledAt == null) "disable" else "enable") }.onSuccess { if (it.success) { actionError = ""; onChanged() } else actionError = it.message ?: "Action failed" }.onFailure { actionError = it.message ?: "Action failed" }; busyId = "" }
            }, onDelete = { selected = sale }, busy = busyId == sale.orderId)
        }
    }
    selected?.let { sale -> AlertDialog(onDismissRequest = { selected = null }, containerColor = Panel, title = { Text("Delete ticket?", color = Silver) }, text = { Text("${sale.ticketId ?: sale.orderId} will be permanently removed, and its ticket link will stop working.", color = Gray) }, confirmButton = { TextButton(onClick = { val target = sale; selected = null; busyId = target.orderId; scope.launch { runCatching { api.delete(token, target.orderId) }.onSuccess { if (it.success) { actionError = ""; onChanged() } else actionError = it.message ?: "Could not delete ticket" }.onFailure { actionError = it.message ?: "Could not delete ticket" }; busyId = "" } }) { Text("Delete permanently", color = Color(0xFFF87171)) } }, dismissButton = { TextButton(onClick = { selected = null }) { Text("Cancel", color = Silver) } }) }
}

@Composable private fun SaleCard(
    sale: ShadowSale,
    expanded: Boolean = false,
    onToggle: () -> Unit = {},
    onDisable: (() -> Unit)? = null,
    onDelete: (() -> Unit)? = null,
    busy: Boolean = false
) {
    val paymentLabel = when {
        sale.disabledAt != null -> "DISABLED"
        sale.shadowPaymentStatus == "free_chai_pani" -> "FREE / CHAI PANI"
        else -> "PAID"
    }
    Card(
        onClick = onToggle,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Panel),
        border = BorderStroke(1.dp, Gray.copy(alpha = 0.22f)),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            Modifier.fillMaxWidth().animateContentSize(tween(240)).padding(horizontal = 13.dp, vertical = 11.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(sale.name.ifBlank { "Guest" }, color = Silver, fontSize = 16.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(10.dp))
                Text("₹${money(sale.amount)}", color = Silver, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("${sale.ticketType.ifBlank { "Pass" }}  ·  ${sale.quantity} ${if (sale.quantity == 1) "ticket" else "tickets"}", color = Gray, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                Text(paymentLabel, color = Silver.copy(alpha = 0.88f), fontSize = 10.sp, letterSpacing = 0.8.sp, maxLines = 1)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("${sale.ticketId ?: sale.orderId}", color = Gray, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                Text(formatIndiaTime(sale.generatedAt ?: sale.createdAt), color = Gray, fontSize = 11.sp, maxLines = 1)
            }
            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically(animationSpec = tween(240)) + fadeIn(animationSpec = tween(190)),
                exit = shrinkVertically(animationSpec = tween(210)) + fadeOut(animationSpec = tween(160))
            ) {
                Column(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                    HorizontalDivider(color = Gray.copy(alpha = 0.2f))
                    Spacer(Modifier.height(8.dp))
                    SaleDetail("Full email", sale.email.ifBlank { "—" })
                    SaleDetail("Phone number", sale.phone?.takeIf { it.isNotBlank() } ?: "—")
                    SaleDetail("Event name", sale.event.ifBlank { "—" })
                    SaleDetail("Full pass type", sale.ticketType.ifBlank { "—" })
                    SaleDetail("Quantity", sale.quantity.toString())
                    SaleDetail("Ticket ID", sale.ticketId ?: sale.orderId)
                    SaleDetail("Issue date / time", formatIndiaTime(sale.generatedAt ?: sale.createdAt))
                    SaleDetail("Payment", if (sale.shadowPaymentStatus == "free_chai_pani") "Free / Chai Pani" else "Paid")
                    SaleDetail("Ticket status", if (sale.disabledAt != null) "Disabled" else sale.status.ifBlank { "Ticket generated" })
                    SaleDetail("Amount", "₹${money(sale.amount)}")
                    SaleDetail("Commission", "${sale.commissionPercentage}% · ₹${money(sale.commissionAmount)}")
                    SaleDetail("After commission", "₹${money(sale.rateAfterCommission ?: (sale.amount - sale.commissionAmount))}")
                    sale.paymentMethod?.takeIf { it.isNotBlank() }?.let { SaleDetail("Payment method", it) }
                    sale.gender?.takeIf { it.isNotBlank() }?.let { SaleDetail("Pass note", it) }
                    sale.emailStatus?.takeIf { it.isNotBlank() }?.let { SaleDetail("Email delivery", it) }
                    sale.generatedBy?.takeIf { it.isNotBlank() }?.let { SaleDetail("Issued by", it) }
                    SaleDetail("Order ID", sale.orderId)
                    if (onDisable != null && onDelete != null) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
                            TextButton(onClick = onDisable, enabled = !busy) { Text(if (sale.disabledAt == null) "Disable" else "Enable", color = Silver) }
                            TextButton(onClick = onDelete, enabled = !busy) { Icon(Icons.Default.Delete, null, tint = Silver); Text("Delete", color = Silver) }
                        }
                    }
                }
            }
        }
    }
}

@Composable private fun SaleDetail(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
        Text(label, color = Gray, fontSize = 12.sp, modifier = Modifier.weight(0.85f))
        Text(value, color = Silver, fontSize = 12.sp, modifier = Modifier.weight(1.15f))
    }
}

@Composable private fun TicketSuccessPopup(ticketCount: Int, onFinished: () -> Unit) {
    var popupVisible by remember { mutableStateOf(false) }
    var checkVisible by remember { mutableStateOf(false) }
    var shineStarted by remember { mutableStateOf(false) }
    var fadingOut by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (popupVisible) 1f else 0.88f, tween(220), label = "successScale")
    val entranceAlpha by animateFloatAsState(if (popupVisible) 1f else 0f, tween(220), label = "successEntrance")
    val fadeAlpha by animateFloatAsState(if (fadingOut) 0f else 1f, tween(160), label = "successFade")
    val shine by animateFloatAsState(if (shineStarted) 1.35f else -0.35f, tween(330, easing = LinearEasing), label = "successShine")

    LaunchedEffect(Unit) {
        popupVisible = true
        delay(220)
        checkVisible = true
        delay(180)
        shineStarted = true
        delay(300)
        fadingOut = true
        delay(160)
        onFinished()
    }

    Box(
        Modifier.fillMaxSize().background(Black.copy(alpha = 0.82f * entranceAlpha * fadeAlpha)),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(0.78f).graphicsLayer { scaleX = scale; scaleY = scale; this.alpha = entranceAlpha * fadeAlpha },
            colors = CardDefaults.cardColors(containerColor = Color(0xFF151517)),
            border = BorderStroke(1.dp, Silver.copy(alpha = 0.24f)),
            shape = RoundedCornerShape(24.dp)
        ) {
            Column(
                Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 22.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Canvas(Modifier.size(82.dp)) {
                    val checkPath = Path().apply {
                        moveTo(size.width * 0.23f, size.height * 0.52f)
                        lineTo(size.width * 0.43f, size.height * 0.70f)
                        lineTo(size.width * 0.78f, size.height * 0.31f)
                    }
                    drawCircle(color = Silver.copy(alpha = 0.07f), radius = size.minDimension * 0.47f)
                    drawCircle(color = Silver.copy(alpha = 0.22f), radius = size.minDimension * 0.47f, style = Stroke(width = 1.dp.toPx()))
                    if (checkVisible) {
                        drawPath(checkPath, color = Silver.copy(alpha = 0.16f), style = Stroke(width = 12.dp.toPx(), cap = androidx.compose.ui.graphics.StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
                        drawPath(
                            checkPath,
                            brush = Brush.linearGradient(listOf(Color.White, Color(0xFF90949A), Color(0xFFF4F4F5)), start = androidx.compose.ui.geometry.Offset(0f, 0f), end = androidx.compose.ui.geometry.Offset(size.width, size.height)),
                            style = Stroke(width = 7.dp.toPx(), cap = androidx.compose.ui.graphics.StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round)
                        )
                    }
                    if (shineStarted) {
                        val sweepX = size.width * shine
                        val sweepWidth = 22.dp.toPx()
                        clipRect(left = (sweepX - sweepWidth).coerceIn(0f, size.width), right = (sweepX + sweepWidth).coerceIn(0f, size.width), top = 0f, bottom = size.height) {
                            drawRect(
                                brush = Brush.horizontalGradient(listOf(Color.Transparent, Color.White.copy(alpha = 0.52f * (1f - (shine - 0.5f).absoluteValue.coerceAtMost(1f))), Color.Transparent), startX = sweepX - sweepWidth, endX = sweepX + sweepWidth),
                                size = size
                            )
                        }
                    }
                }
                Text("TICKET${if (ticketCount == 1) "" else "S"} CREATED", color = Silver, letterSpacing = 2.sp, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp))
                Text("Added to Sales", color = Gray, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
            }
        }
    }
}

@Composable private fun TextInput(label: String, hint: String, value: String, onValue: (String) -> Unit, keyboard: KeyboardType = KeyboardType.Text) {
    val shape = RoundedCornerShape(15.dp)
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    Column {
        Text(label, color = Gray, fontSize = 11.sp, letterSpacing = 1.5.sp, modifier = Modifier.padding(bottom = 6.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onValue,
            placeholder = { Text(hint, color = Gray.copy(alpha = 0.72f)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = keyboard),
            interactionSource = interaction,
            shape = shape,
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Silver,
                unfocusedTextColor = Silver,
                focusedContainerColor = Panel,
                unfocusedContainerColor = Panel,
                focusedBorderColor = Silver.copy(alpha = 0.72f),
                unfocusedBorderColor = Gray.copy(alpha = 0.32f),
                cursorColor = Silver,
                focusedPlaceholderColor = Gray.copy(alpha = 0.72f),
                unfocusedPlaceholderColor = Gray.copy(alpha = 0.72f)
            ),
            modifier = Modifier.fillMaxWidth().heightIn(min = 58.dp).graphicsLayer {
                shadowElevation = if (focused) 7.dp.toPx() else 0f
                this.shape = shape
                clip = false
                ambientShadowColor = Silver.copy(alpha = if (focused) 0.14f else 0f)
                spotShadowColor = Silver.copy(alpha = if (focused) 0.18f else 0f)
            }
        )
    }
}

@Composable private fun ChoiceField(label: String, value: String, options: List<String>, onPick: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(15.dp)
    Column {
        Text(label, color = Gray, fontSize = 11.sp, letterSpacing = 1.5.sp, modifier = Modifier.padding(bottom = 6.dp))
        Box {
            OutlinedButton(
                onClick = { expanded = true },
                enabled = options.isNotEmpty(),
                modifier = Modifier.fillMaxWidth().heightIn(min = 58.dp).graphicsLayer {
                    shadowElevation = if (expanded) 7.dp.toPx() else 0f
                    this.shape = shape
                    clip = false
                    ambientShadowColor = Silver.copy(alpha = if (expanded) 0.14f else 0f)
                    spotShadowColor = Silver.copy(alpha = if (expanded) 0.18f else 0f)
                },
                shape = shape,
                border = BorderStroke(if (expanded) 1.5.dp else 1.dp, if (expanded) Silver.copy(alpha = 0.72f) else Gray.copy(alpha = 0.32f)),
                colors = ButtonDefaults.outlinedButtonColors(containerColor = Panel, contentColor = Silver, disabledContainerColor = Panel, disabledContentColor = Gray)
            ) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(value.ifBlank { "Select $label" }, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(if (expanded) "⌃" else "⌄", color = Silver)
                }
            }
            DropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false },
                modifier = Modifier.background(Panel, RoundedCornerShape(14.dp)).border(1.dp, Gray.copy(alpha = 0.3f), RoundedCornerShape(14.dp))
            ) {
                options.forEach { option ->
                    DropdownMenuItem(text = { Text(option, color = Silver) }, onClick = { onPick(option); expanded = false })
                }
            }
        }
    }
}

private fun money(amount: Double) = String.format(Locale.US, "%,.2f", amount)
private fun formatIndiaTime(value: String): String = try { DateTimeFormatter.ofPattern("dd MMM, hh:mm a", Locale.ENGLISH).withZone(ZoneId.of("Asia/Kolkata")).format(Instant.parse(value)) } catch (_: Exception) { value }
private fun isToday(value: String): Boolean = try { Instant.parse(value).atZone(ZoneId.of("Asia/Kolkata")).toLocalDate() == java.time.LocalDate.now(ZoneId.of("Asia/Kolkata")) } catch (_: Exception) { false }
