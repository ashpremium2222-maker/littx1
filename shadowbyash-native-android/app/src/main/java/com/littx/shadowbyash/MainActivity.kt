@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package com.littx.shadowbyash

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.Canvas
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.window.Dialog
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.littx.shadowbyash.data.*
import kotlinx.coroutines.launch
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.*

private object ShadowTokens {
    val background = Color(0xff080809); val surface = Color(0xff101012); val glass = Color(0x08ffffff); val glassElevated = Color(0x0dffffff)
    val border = Color(0x1affffff); val borderStrong = Color(0x2effffff); val primary = Color(0xfff2f2f4); val text = Color(0xfff4f4f6); val secondary = Color(0xffa7a7ae); val muted = Color(0xff707078)
    // Restrained corners keep the glass surfaces premium without the pill-heavy look.
    val radiusLarge = 20.dp; val radiusInput = 15.dp; val radiusButton = 15.dp
}
private val Ink = ShadowTokens.background; private val Card = ShadowTokens.surface; private val Card2 = Color(0xff1d1d22)
private val TextMain = ShadowTokens.text; private val TextMuted = ShadowTokens.secondary; private val Lime = ShadowTokens.primary
private val api = Retrofit.Builder().baseUrl(BuildConfig.SHADOW_API_BASE_URL).addConverterFactory(GsonConverterFactory.create()).build().create(ShadowApi::class.java)
private fun money(v: Double) = NumberFormat.getCurrencyInstance(Locale("en", "IN")).format(v).replace("₹", "₹")
private fun date(v: String?) = v?.let { runCatching { SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).parse(it)?.let { d -> SimpleDateFormat("dd MMM, hh:mm a", Locale.US).format(d) } }.getOrNull() } ?: "—"

class MainActivity : ComponentActivity() { override fun onCreate(b: Bundle?) { super.onCreate(b); setContent { ShadowApp() } } }

@Composable fun ShadowApp() { MaterialTheme(colorScheme = darkColorScheme(background = ShadowTokens.background, surface = ShadowTokens.surface, primary = ShadowTokens.primary, onPrimary = Ink, onBackground = TextMain, onSurface = TextMain)) { var token by remember { mutableStateOf<String?>(null) }; if (token == null) Login { token = it } else Panel(token!!){ token = null } } }

@Composable private fun GlassCard(modifier: Modifier = Modifier, elevated: Boolean = false, content: @Composable ColumnScope.() -> Unit) { Card(colors = CardDefaults.cardColors(if (elevated) ShadowTokens.glassElevated else ShadowTokens.glass), border = androidx.compose.foundation.BorderStroke(1.dp, ShadowTokens.border), shape = RoundedCornerShape(ShadowTokens.radiusLarge), modifier = modifier, content = content) }
@Composable private fun GlassButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, content: @Composable RowScope.() -> Unit) { Button(onClick, modifier.height(60.dp), enabled = enabled, shape = RoundedCornerShape(ShadowTokens.radiusButton), colors = ButtonDefaults.buttonColors(containerColor = ShadowTokens.primary, contentColor = Ink), content = content) }
@Composable private fun GlassTextField(value: String, onValueChange: (String) -> Unit, label: @Composable (() -> Unit)? = null, placeholder: @Composable (() -> Unit)? = null, leadingIcon: @Composable (() -> Unit)? = null, modifier: Modifier = Modifier) { OutlinedTextField(value, onValueChange, label = label, placeholder = placeholder, leadingIcon = leadingIcon, singleLine = true, shape = RoundedCornerShape(ShadowTokens.radiusInput), modifier = modifier.heightIn(min = 68.dp), colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = ShadowTokens.borderStrong, unfocusedBorderColor = ShadowTokens.border, focusedLabelColor = TextMain, unfocusedLabelColor = TextMuted, cursorColor = TextMain)) }

@Composable private fun Login(onLogin: (String) -> Unit) {
    var password by remember { mutableStateOf("") }; var error by remember { mutableStateOf("") }; var busy by remember { mutableStateOf(false) }; val scope = rememberCoroutineScope()
    Surface(color = Ink) { Box(Modifier.fillMaxSize().padding(22.dp), contentAlignment = Alignment.Center) { Card(colors = CardDefaults.cardColors(Card), shape = RoundedCornerShape(ShadowTokens.radiusLarge), modifier = Modifier.fillMaxWidth().widthIn(max = 440.dp)) { Column(Modifier.padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Image(painterResource(R.drawable.shadow_by_ash_logo), "Shadow by Ash", modifier = Modifier.fillMaxWidth().height(210.dp))
        Text("SHADOW", color = TextMain, fontSize = 38.sp, fontWeight = FontWeight.Black, letterSpacing = 7.sp); Text("BY ASH", color = Lime, fontSize = 13.sp, letterSpacing = 5.sp); Spacer(Modifier.height(8.dp)); Text("SALES COMMAND CENTER", color = TextMuted, letterSpacing = 2.sp); Spacer(Modifier.height(28.dp))
        Text("Operator access", color = TextMain, fontSize = 24.sp, fontWeight = FontWeight.Bold, modifier = Modifier.fillMaxWidth()); Text("Create tickets, track revenue, and manage every customer from one place.", color = TextMuted, modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 22.dp))
        GlassTextField(password, { password = it; error = "" }, label = { Text("ACCESS PASSWORD") }, placeholder = { Text("Enter your password") }, modifier = Modifier.fillMaxWidth())
        if (error.isNotBlank()) Text(error, color = Color(0xffff7777), modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
        GlassButton({ busy = true; scope.launch { runCatching { api.login(LoginReq(password)) }.onSuccess { if (it.success && it.shadowToken != null) onLogin(it.shadowToken) else error = it.message ?: "Access denied" }.onFailure { error = "Unable to connect to Shadow server" }; busy = false } }, enabled = password.isNotBlank() && !busy, modifier = Modifier.fillMaxWidth().padding(top = 20.dp)) { Text(if (busy) "AUTHENTICATING…" else "AUTHENTICATE  →", fontWeight = FontWeight.Bold) }
        Spacer(Modifier.height(18.dp)); Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Lock, null, tint = TextMuted, modifier = Modifier.size(14.dp)); Text("  Password protected · server verified", color = TextMuted, fontSize = 12.sp) }
    } } } }
}

class Tab(val label: String) { companion object { val Dashboard=Tab("Overview"); val Create=Tab("Issue ticket"); val Sales=Tab("Sales") } }
private fun tabIcon(t: Tab) = when (t) { Tab.Dashboard -> Icons.Default.Dashboard; Tab.Create -> Icons.Default.AddCard; else -> Icons.Default.ReceiptLong }

@Composable private fun Panel(token: String, logout: () -> Unit) {
    val scope = rememberCoroutineScope(); var tab by remember { mutableStateOf(Tab.Dashboard) }; var sales by remember { mutableStateOf(SalesRes()) }; var pricing by remember { mutableStateOf(PricingRes()) }; var loading by remember { mutableStateOf(true) }; var message by remember { mutableStateOf("") }
    suspend fun refresh() { loading = true; runCatching { sales = api.sales(token); pricing = api.pricing(token) }.onFailure { message = "Could not refresh data" }; loading = false }
    LaunchedEffect(Unit) { refresh() }
    Scaffold(
        containerColor = Ink,
        topBar = {
            TopAppBar(
                title = { Column { Text("SHADOW", color = TextMain, fontSize = 27.sp, fontWeight = FontWeight.Light, letterSpacing = 5.sp); Text("BY ASH  ·  ${tab.label.uppercase()}", color = TextMuted, fontSize = 12.sp, letterSpacing = 2.sp) } },
                actions = { IconButton({ scope.launch { refresh() } }) { Icon(Icons.Default.Refresh, "Refresh", tint = TextMain, modifier = Modifier.size(28.dp)) }; IconButton(logout) { Icon(Icons.Default.Logout, "Logout", tint = TextMain, modifier = Modifier.size(28.dp)) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Ink)
            )
        },
        bottomBar = {
            Box(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 18.dp, vertical = 10.dp)) {
                Surface(color = Color(0xff151518), shape = RoundedCornerShape(24.dp), modifier = Modifier.height(78.dp)) {
                    NavigationBar(containerColor = Color.Transparent, tonalElevation = 0.dp) {
                        listOf(Tab.Dashboard, Tab.Create, Tab.Sales).forEach { t ->
                            NavigationBarItem(
                                selected = tab == t,
                                onClick = { tab = t },
                                icon = { Icon(tabIcon(t), null, modifier = Modifier.size(27.dp)) },
                                label = { Text(t.label) },
                                colors = NavigationBarItemDefaults.colors(selectedIconColor = TextMain, selectedTextColor = TextMain, indicatorColor = Color(0xff303035), unselectedIconColor = TextMuted, unselectedTextColor = TextMuted)
                            )
                        }
                    }
                }
            }
        }
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) { when (tab) { Tab.Dashboard -> Dashboard(sales, loading) { tab = Tab.Create }; Tab.Create -> CreateTicket(token, pricing) { scope.launch { refresh() } }; Tab.Sales -> Orders(sales.sales, pricing.events) }; if (message.isNotBlank()) Text(message, color = TextMuted, modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp)) }
    }
}
@Composable private fun Header(title: String, subtitle: String) { Column(Modifier.padding(bottom = 16.dp)) { Text(title, color = TextMain, fontSize = 25.sp, fontWeight = FontWeight.Bold); Text(subtitle, color = TextMuted, modifier = Modifier.padding(top = 4.dp)) } }
@Composable private fun Welcome() { GlassCard(modifier = Modifier.fillMaxWidth(), elevated = true) { Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 18.dp), verticalAlignment = Alignment.CenterVertically) { Text("Welcome to your Shadow sales desk.", color = TextMain, fontSize = 16.sp, modifier = Modifier.weight(1f)); Icon(Icons.Default.Close, "Dismiss", tint = TextMuted) } } }
@Composable private fun Kpi(label: String, value: String, accent: Color = TextMain, modifier: Modifier = Modifier) { GlassCard(modifier = modifier) { Column(Modifier.padding(16.dp)) { Text(label, color = TextMuted, fontSize = 11.sp, letterSpacing = 1.sp); Text(value, color = accent, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp)) } } }

@Composable private fun Dashboard(s: SalesRes, loading: Boolean, create: () -> Unit) { val tickets = s.sales.sumOf { it.quantity }; val today = s.sales.filter { it.createdAt?.startsWith(SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())) == true }.sumOf { it.amount }; LazyColumn(contentPadding = PaddingValues(start = 20.dp, top = 20.dp, end = 20.dp, bottom = 118.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) { item { Welcome() }; item { Header("Good evening, Shadow.", "A live view of your ticket desk and event revenue.") }; item { Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) { Kpi("TOTAL REVENUE", money(s.shadowRevenue), Lime, Modifier.weight(1f)); Kpi("AFTER COMMISSION", money(s.shadowRevenueAfterCommission), Color(0xffd7d7dc), Modifier.weight(1f)) } }; item { Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) { Kpi("TICKETS ISSUED", tickets.toString(), TextMain, Modifier.weight(1f)); Kpi("TODAY'S SALES", money(today), TextMain, Modifier.weight(1f)) } }; item { Button(create, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Lime, contentColor = Ink)) { Icon(Icons.Default.Add, null); Spacer(Modifier.width(8.dp)); Text("CREATE NEW TICKET", fontWeight = FontWeight.Bold) } }; item { Text("RECENT ORDERS", color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(top = 8.dp)) }; if (loading) item { LinearProgressIndicator(modifier = Modifier.fillMaxWidth(), color = Lime) }; items(s.sales.take(5)) { OrderCard(it, compact = true) } } }

@Composable private fun Dropdown(label: String, value: String, options: List<String>, onSelect: (String) -> Unit) { var open by remember { mutableStateOf(false) }; Column { Text(label, color = TextMuted, fontSize = 11.sp, letterSpacing = 1.sp); Box { OutlinedButton({ open = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 68.dp), shape = RoundedCornerShape(ShadowTokens.radiusInput), border = androidx.compose.foundation.BorderStroke(1.dp, ShadowTokens.border), colors = ButtonDefaults.outlinedButtonColors(contentColor = TextMain)) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(value.ifBlank { "Select" }); Icon(Icons.Default.ExpandMore, null) } }; DropdownMenu(open, { open = false }) { options.forEach { DropdownMenuItem(text = { Text(it) }, onClick = { onSelect(it); open = false }) } } } } }
@Composable private fun Field(label: String, value: String, hint: String, onChange: (String) -> Unit, required: Boolean = false) { GlassTextField(value, onChange, label = { Text(if (required) "$label *" else label) }, placeholder = { Text(hint) }, modifier = Modifier.fillMaxWidth()) }

@Composable private fun TicketSuccess(onFinished: () -> Unit) {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) { progress.animateTo(1f, tween(900)); kotlinx.coroutines.delay(1550); onFinished() }
    Dialog(onDismissRequest = onFinished) {
        GlassCard(modifier = Modifier.fillMaxWidth(), elevated = true) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 28.dp, vertical = 30.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Canvas(Modifier.size(108.dp)) {
                    val center = androidx.compose.ui.geometry.Offset(size.width / 2f, size.height / 2f)
                    val radius = size.minDimension * .39f
                    drawCircle(Color(0xffd9d9df).copy(alpha = .08f), radius = radius + 12.dp.toPx(), center = center)
                    drawCircle(Color(0xffd9d9df).copy(alpha = .18f), radius = radius, center = center, style = Stroke(width = 1.5.dp.toPx()))
                    drawArc(Color(0xfff2f2f4), -90f, 360f * progress.value, false, topLeft = androidx.compose.ui.geometry.Offset(center.x - radius, center.y - radius), size = androidx.compose.ui.geometry.Size(radius * 2, radius * 2), style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round))
                    val p = progress.value
                    val start = androidx.compose.ui.geometry.Offset(center.x - radius * .42f, center.y + radius * .02f)
                    val bend = androidx.compose.ui.geometry.Offset(center.x - radius * .08f, center.y + radius * .34f)
                    val end = androidx.compose.ui.geometry.Offset(center.x + radius * .48f, center.y - radius * .3f)
                    if (p > .42f) {
                        val first = ((p - .42f) / .58f).coerceIn(0f, 1f)
                        drawLine(Color(0xfffafafd), start, bend, strokeWidth = 4.dp.toPx(), cap = StrokeCap.Round)
                        drawLine(Color(0xfffafafd), bend, androidx.compose.ui.geometry.Offset(bend.x + (end.x - bend.x) * first, bend.y + (end.y - bend.y) * first), strokeWidth = 4.dp.toPx(), cap = StrokeCap.Round)
                    } else if (p > .12f) {
                        val first = ((p - .12f) / .30f).coerceIn(0f, 1f)
                        drawLine(Color(0xfffafafd), start, androidx.compose.ui.geometry.Offset(start.x + (bend.x - start.x) * first, start.y + (bend.y - start.y) * first), strokeWidth = 4.dp.toPx(), cap = StrokeCap.Round)
                    }
                }
                Text("TICKET SENT", color = TextMain, fontSize = 17.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.4.sp, modifier = Modifier.padding(top = 20.dp))
                Text("Ticket created and delivery queued", color = TextMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 7.dp))
            }
        }
    }
}

@Composable private fun CreateTicket(token: String, p: PricingRes, done: () -> Unit) { var name by remember { mutableStateOf("") }; var email by remember { mutableStateOf("") }; var phone by remember { mutableStateOf("") }; var gender by remember { mutableStateOf("General") }; var event by remember { mutableStateOf(p.events.firstOrNull()) }; var tier by remember { mutableStateOf(event?.tiers?.firstOrNull()) }; var qty by remember { mutableStateOf("1") }; var payment by remember { mutableStateOf("Paid") }; var commission by remember { mutableStateOf("0%") }; var custom by remember { mutableStateOf("") }; var busy by remember { mutableStateOf(false) }; var feedback by remember { mutableStateOf("") }; var showSuccess by remember { mutableStateOf(false) }; val scope = rememberCoroutineScope(); val quantity = qty.toIntOrNull()?.coerceIn(1, 20) ?: 1; val rate = if (commission == "Custom") custom.toDoubleOrNull() ?: 0.0 else commission.dropLast(1).toDoubleOrNull() ?: 0.0; val official = (tier?.price ?: 0.0) * quantity; val total = if (payment == "Free / Chai Pani") 0.0 else official; val commissionAmount = if (payment == "Free / Chai Pani") 0.0 else official * rate / 100
    if (showSuccess) TicketSuccess { showSuccess = false }
    LaunchedEffect(p.events) { if (event == null) { event = p.events.firstOrNull(); tier = event?.tiers?.firstOrNull() } }
    LazyColumn(contentPadding = PaddingValues(start = 20.dp, top = 20.dp, end = 20.dp, bottom = 118.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { item { Welcome() }; item { Header("Create a ticket", "Issue a ticket and send delivery to the customer.") }; item { Text("CUSTOMER DETAILS", color = Lime, fontSize = 12.sp, letterSpacing = 2.sp) }; item { Field("Customer name", name, "Full name", { name = it }, true) }; item { Field("Email address", email, "guest@example.com", { email = it }, true) }; item { Field("Phone number", phone, "+91…", { phone = it }) }; item { Dropdown("Gender / pass label", gender, listOf("General", "Male", "Female", "Couple")) { gender = it } }; item { Text("TICKET DETAILS", color = Lime, fontSize = 12.sp, letterSpacing = 2.sp, modifier = Modifier.padding(top = 8.dp)) }; item { Dropdown("Event", event?.name ?: "No events", p.events.map { it.name }) { v -> event = p.events.find { it.name == v }; tier = event?.tiers?.firstOrNull() } }; item { Dropdown("Pass type", tier?.name ?: "No tiers", event?.tiers?.map { it.name } ?: emptyList()) { v -> tier = event?.tiers?.find { it.name == v } } }; item { Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { Box(Modifier.weight(1f)) { Dropdown("Quantity", qty, (1..10).map { it.toString() }) { qty = it } }; Box(Modifier.weight(1f)) { Dropdown("Payment", payment, listOf("Paid", "Free / Chai Pani")) { payment = it } } } }; item { Dropdown("Commission", commission, listOf("0%", "5%", "10%", "15%", "20%", "Custom")) { commission = it } }; if (commission == "Custom") item { Field("Custom commission %", custom, "Up to 20", { custom = it }) }; item { Card(colors = CardDefaults.cardColors(Card2)) { Row(Modifier.fillMaxWidth().padding(18.dp), horizontalArrangement = Arrangement.SpaceBetween) { Column { Text("TOTAL", color = TextMuted, fontSize = 11.sp); Text(money(total), color = TextMain, fontSize = 24.sp, fontWeight = FontWeight.Bold) }; Column(horizontalAlignment = Alignment.End) { Text("AFTER COMMISSION", color = TextMuted, fontSize = 11.sp); Text(money(total - commissionAmount), color = TextMain, fontSize = 20.sp, fontWeight = FontWeight.Bold) } } } }; if (feedback.isNotBlank()) item { Text(feedback, color = if (feedback.startsWith("✓")) TextMain else Color(0xffff7777) ) }; item { Button({ if (name.isBlank() || email.isBlank()) { feedback = "Name and email are required"; return@Button }; if (rate > 20) { feedback = "Commission cannot exceed 20%"; return@Button }; busy = true; scope.launch { runCatching { api.ticket(token, TicketReq(name, email, phone, gender, tier?.name ?: "", quantity, event?.name ?: "", if (payment == "Paid") "paid" else "free_chai_pani", rate, commissionAmount, total)) }.onSuccess { if (it.success) { feedback = "✓ Ticket ${it.ticketId ?: "created"} and delivery queued"; name = ""; email = ""; phone = ""; showSuccess = true; done() } else feedback = it.message ?: "Ticket failed" }.onFailure { feedback = "Network error creating ticket" }; busy = false } }, enabled = !busy && event != null && tier != null, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Lime, contentColor = Ink)) { Text(if (busy) "CREATING…" else "CREATE & SEND TICKET", fontWeight = FontWeight.Bold) } } }
}

@Composable private fun SearchBox(value: String, onChange: (String) -> Unit, hint: String) { GlassTextField(value, onChange, placeholder = { Text(hint) }, leadingIcon = { Icon(Icons.Default.Search, null) }, modifier = Modifier.fillMaxWidth()) }
@Composable private fun OrderCard(s: Sale, compact: Boolean = false, resend: (() -> Unit)? = null) { GlassCard(modifier = Modifier.fillMaxWidth()) { Column(Modifier.padding(if (compact) 15.dp else 18.dp)) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Column(Modifier.weight(1f)) { Text(s.name.ifBlank { "Unnamed customer" }, color = TextMain, fontWeight = FontWeight.Bold, fontSize = 17.sp); Text(s.email, color = TextMuted, fontSize = 12.sp) }; Text(money(s.amount), color = Lime, fontWeight = FontWeight.Bold, fontSize = 17.sp) }; Spacer(Modifier.height(8.dp)); Text("${s.event.ifBlank { "Shadow event" }} · ${s.ticketType.ifBlank { "General" }} · ${s.quantity} ticket(s)", color = TextMuted, fontSize = 12.sp); Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { Text("${s.ticketId.ifBlank { s.orderId }}  ·  ${date(s.createdAt)}", color = TextMuted, fontSize = 11.sp); Row(verticalAlignment = Alignment.CenterVertically) { Surface(color = if (s.shadowPaymentStatus == "free_chai_pani") Color(0xff2b2b30) else Color(0xff2b2b30), shape = RoundedCornerShape(20.dp)) { Text(if (s.shadowPaymentStatus == "free_chai_pani") "FREE" else "PAID", color = if (s.shadowPaymentStatus == "free_chai_pani") Color(0xffd7d7dc) else Color(0xffd7d7dc), fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp)) }; if (resend != null) { IconButton(resend, modifier = Modifier.size(32.dp)) { Icon(Icons.Default.Send, "Resend", tint = TextMuted, modifier = Modifier.size(16.dp)) } } } } } } }

@Composable private fun Orders(sales: List<Sale>, events: List<Event>) { var q by remember { mutableStateOf("") }; var event by remember { mutableStateOf("All events") }; var status by remember { mutableStateOf("All statuses") }; val filtered = sales.filter { (q.isBlank() || listOf(it.orderId, it.ticketId, it.name, it.email, it.phone ?: "").any { x -> x.contains(q, true) }) && (event == "All events" || it.event == event) && (status == "All statuses" || (status == "Free" && it.shadowPaymentStatus == "free_chai_pani") || (status == "Paid" && it.shadowPaymentStatus != "free_chai_pani")) }; LazyColumn(contentPadding = PaddingValues(start = 20.dp, top = 20.dp, end = 20.dp, bottom = 118.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { item { Welcome() }; item { SearchBox(q, { q = it }, "Search guest, email or ticket ID") }; item { Text("${filtered.size} ORDERS  ·  ${money(filtered.sumOf { it.amount })} REVENUE", color = TextMuted, letterSpacing = 2.sp, fontSize = 12.sp) }; item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Box(Modifier.weight(1f)) { Dropdown("Event", event, listOf("All events") + events.map { it.name }) { event = it } }; Box(Modifier.weight(1f)) { Dropdown("Status", status, listOf("All statuses", "Paid", "Free")) { status = it } } } }; if (filtered.isEmpty()) item { Empty("No matching orders yet") }; items(filtered) { OrderCard(it) } } }

@Composable private fun Customers(sales: List<Sale>) { var q by remember { mutableStateOf("") }; val customers = sales.groupBy { it.email.lowercase().ifBlank { it.name.lowercase() } }.map { (_, rows) -> val first = rows.first(); Triple(first, rows.size, rows.sumOf { it.quantity }) }.filter { q.isBlank() || it.first.name.contains(q, true) || it.first.email.contains(q, true) || (it.first.phone ?: "").contains(q) }; LazyColumn(contentPadding = PaddingValues(start = 20.dp, top = 20.dp, end = 20.dp, bottom = 118.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { item { Header("Customer directory", "${customers.size} unique customers from Shadow sales") }; item { SearchBox(q, { q = it }, "Search customer name, email or phone") }; if (customers.isEmpty()) item { Empty("No customers found") }; items(customers) { (c, orders, tickets) -> Card(colors = CardDefaults.cardColors(Card)) { Column(Modifier.padding(18.dp)) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(c.name, color = TextMain, fontWeight = FontWeight.Bold, fontSize = 17.sp); Text(money(c.amount), color = Lime, fontWeight = FontWeight.Bold) }; Text(c.email, color = TextMuted, fontSize = 12.sp); Text(c.phone ?: "Phone not provided", color = TextMuted, fontSize = 12.sp); Spacer(Modifier.height(10.dp)); Text("$orders order(s)  ·  $tickets ticket(s)  ·  Last purchase ${date(c.createdAt)}", color = TextMuted, fontSize = 12.sp) } } } } }

@Composable private fun Events(events: List<Event>, sales: List<Sale>) { LazyColumn(contentPadding = PaddingValues(start = 20.dp, top = 20.dp, end = 20.dp, bottom = 118.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { item { Header("Events & pricing", "Live catalogue from the seller pricing system.") }; if (events.isEmpty()) item { Empty("No events configured") }; items(events) { e -> Card(colors = CardDefaults.cardColors(Card)) { Column(Modifier.padding(18.dp)) { Text("${e.icon ?: "🎟️"}  ${e.name}", color = TextMain, fontWeight = FontWeight.Bold, fontSize = 18.sp); Text(e.tagline ?: e.venue ?: "Live event", color = TextMuted, modifier = Modifier.padding(top = 4.dp, bottom = 12.dp)); e.tiers.forEach { t -> Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text(t.name, color = TextMuted); Text(if (t.price > 0) money(t.price) else "FREE", color = TextMain, fontWeight = FontWeight.Bold) } }; HorizontalDivider(color = Color.White.copy(.08f), modifier = Modifier.padding(vertical = 8.dp)); Text("${sales.filter { it.event == e.name }.sumOf { it.quantity }} Shadow tickets sold", color = Color(0xffd7d7dc), fontSize = 12.sp) } } } } }

@Composable private fun Reports(sales: List<Sale>) { val revenue = sales.sumOf { it.amount }; val tickets = sales.sumOf { it.quantity }; val customers = sales.map { it.email.lowercase().ifBlank { it.name.lowercase() } }.distinct().size; val passes = sales.groupBy { it.ticketType.ifBlank { "General" } }.mapValues { it.value.sumOf { s -> s.quantity } }.toList().sortedByDescending { it.second }; LazyColumn(contentPadding = PaddingValues(start = 20.dp, top = 20.dp, end = 20.dp, bottom = 118.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { item { Header("Sales reports", "A compact performance view for Shadow by Ash.") }; item { Kpi("AVG ORDER VALUE", if (sales.isEmpty()) money(0.0) else money(revenue / sales.size), Lime, Modifier.fillMaxWidth()) }; item { Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) { Kpi("TOTAL REVENUE", money(revenue), TextMain, Modifier.weight(1f)); Kpi("UNIQUE CUSTOMERS", customers.toString(), TextMain, Modifier.weight(1f)) } }; item { Kpi("TOTAL TICKETS ISSUED", tickets.toString(), TextMain, Modifier.fillMaxWidth()) }; item { Text("PASS SALES BREAKDOWN", color = Lime, letterSpacing = 2.sp, modifier = Modifier.padding(top = 10.dp)) }; if (passes.isEmpty()) item { Empty("No pass sales yet") }; itemsIndexed(passes) { i, (pass, count) -> Card(colors = CardDefaults.cardColors(Card)) { Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text("${i + 1}.  $pass", color = TextMain, fontWeight = FontWeight.Bold); Text("$count tickets  ·  ${if (tickets == 0) 0 else count * 100 / tickets}%", color = TextMuted) } } } } }

@Composable private fun Settings(token: String, logout: () -> Unit) { LazyColumn(contentPadding = PaddingValues(start = 20.dp, top = 20.dp, end = 20.dp, bottom = 118.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { item { Header("Settings & security", "Your Shadow panel session and data boundaries.") }; item { Setting("Operator authentication", "Password protected and server verified", "ACTIVE") }; item { Setting("Database isolation", "Shadow sales are tagged source = shadow", "ISOLATED") }; item { Setting("Session state", "Token is held in this app session", "ENCRYPTED") }; item { Button(logout, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Color(0xff3b2024), contentColor = Color(0xffff9b9b))) { Icon(Icons.Default.Logout, null); Spacer(Modifier.width(8.dp)); Text("TERMINATE SESSION") } } } }
@Composable private fun Setting(title: String, body: String, badge: String) { Card(colors = CardDefaults.cardColors(Card)) { Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text(title, color = TextMain, fontWeight = FontWeight.Bold); Text(body, color = TextMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 5.dp)) }; Surface(color = Color(0xff2b2b30), shape = RoundedCornerShape(20.dp)) { Text(badge, color = Color(0xffd7d7dc), fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp)) } } } }
@Composable private fun Empty(text: String) { Card(colors = CardDefaults.cardColors(Card), modifier = Modifier.fillMaxWidth()) { Column(Modifier.fillMaxWidth().padding(30.dp), horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.Default.Inbox, null, tint = TextMuted, modifier = Modifier.size(30.dp)); Text(text, color = TextMuted, modifier = Modifier.padding(top = 10.dp)) } } }












