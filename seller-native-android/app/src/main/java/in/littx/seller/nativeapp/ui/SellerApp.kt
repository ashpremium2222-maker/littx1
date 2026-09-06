package com.littx.seller.nativeapp.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.littx.seller.nativeapp.BuildConfig
import com.littx.seller.nativeapp.data.model.*

private val midnight = Color(0xFF07070D)
private val panel = Color(0xFF12121D)
private val lilac = Color(0xFF9D66FF)
private val softText = Color(0xFFB8B4C5)
private data class PartnerVisual(val id: String, val name: String, val mark: String, val line: String)
private val partners = listOf(
    PartnerVisual("littlane", "Littlane Entertainment", "LE", "MUSIC  /  CULTURE  /  BEYOND"),
    PartnerVisual("nitro", "Nitro Events", "N", "ENERGY  /  COMMUNITY  /  ALWAYS ON"),
    PartnerVisual("7th-heaven", "7th Heaven", "7H", "PEOPLE  /  MOMENTS  /  HIGHER")
)
private fun labelStyle() = TextStyle(fontSize = 10.sp, letterSpacing = 3.sp, fontWeight = FontWeight.Medium)

@Composable fun SellerApp(activity: ComponentActivity) {
    val model = remember { SellerViewModel(activity) }
    MaterialTheme(colorScheme = darkColorScheme(primary = lilac, surface = panel, background = midnight)) {
        model.state.update?.let { update -> AlertDialog(onDismissRequest = model::dismissUpdate, title = { Text("Signed update available") }, text = { Text("Version ${update.version} is ready from the official LITTX release.") }, confirmButton = { TextButton(onClick = { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(update.downloadUrl))); model.dismissUpdate() }) { Text("Download") } }, dismissButton = { TextButton(onClick = model::dismissUpdate) { Text("Later") } }) }
        when { model.state.loading && model.state.partner == null -> LoadingScreen(); model.state.partner == null -> LoginScreen(model); else -> SellerHome(model) }
    }
}

@Composable private fun LoadingScreen() = Box(Modifier.fillMaxSize().background(midnight), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = lilac) }

@Composable private fun LoginScreen(model: SellerViewModel) {
    var partnerId by remember { mutableStateOf(partners.first().id) }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().background(midnight)) {
        LoginBackdrop()
        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 28.dp), contentPadding = PaddingValues(top = 42.dp, bottom = 36.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) { Text("L I T T X", color = Color.White, fontSize = 24.sp, letterSpacing = 8.sp, fontWeight = FontWeight.Light); Column(horizontalAlignment = Alignment.End) { Text("EVENTS", style = labelStyle()); Text("PEOPLE", style = labelStyle()); Text("EXPERIENCES", style = labelStyle()); HorizontalDivider(Modifier.width(36.dp).padding(top = 12.dp), color = Color(0xFF777282)) } } }
            item { Spacer(Modifier.height(40.dp)) }
            item { Surface(shape = RoundedCornerShape(50), color = Color(0xFF1E1932).copy(alpha = .8f)) { Text("S E L L E R", Modifier.padding(horizontal = 16.dp, vertical = 7.dp), color = Color(0xFFD3BEFF), fontSize = 11.sp, letterSpacing = 4.sp) } }
            item { Text("Access\nMore Than\nEvents", color = Color(0xFFF3F0F9), fontSize = 48.sp, lineHeight = 51.sp, fontWeight = FontWeight.Light); Spacer(Modifier.height(20.dp)); Text("NATIVE DEVICE-BOUND\nSELLER ACCESS", style = labelStyle(), color = Color(0xFFC8C2D5)) }
            items(partners) { partner -> PartnerCard(partner, partnerId == partner.id) { partnerId = partner.id } }
            item { Spacer(Modifier.height(10.dp)) }
            item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { Text("Partner password", color = Color(0xFFD9D5E2), fontSize = 16.sp); Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Lock, null, tint = softText, modifier = Modifier.size(17.dp)); Spacer(Modifier.width(7.dp)); Text("Secure Access", color = softText, fontSize = 13.sp) } } }
            item { OutlinedTextField(value = password, onValueChange = { password = it }, modifier = Modifier.fillMaxWidth(), placeholder = { Text("Enter partner password", color = Color(0xFF777381)) }, singleLine = true, visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(), trailingIcon = { IconButton(onClick = { passwordVisible = !passwordVisible }) { Icon(if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility, "Show password", tint = softText) } }, colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = lilac, unfocusedBorderColor = Color(0xFF4A4657), focusedContainerColor = Color(0xFF12121E).copy(alpha = .9f), unfocusedContainerColor = Color(0xFF12121E).copy(alpha = .9f)), shape = RoundedCornerShape(16.dp)) }
            item { model.state.error?.let { Notice(it, true, model::dismissNotice) } }
            item { Button(onClick = { model.login(partnerId, password) }, enabled = password.isNotBlank() && !model.state.loading && BuildConfig.SELLER_API_BASE_URL.isNotBlank(), modifier = Modifier.fillMaxWidth().height(68.dp).shadow(18.dp, RoundedCornerShape(36.dp), ambientColor = lilac, spotColor = lilac), shape = RoundedCornerShape(36.dp), colors = ButtonDefaults.buttonColors(containerColor = lilac, disabledContainerColor = Color(0xFF312A43))) { if (model.state.loading) CircularProgressIndicator(Modifier.size(24.dp), color = Color.White, strokeWidth = 2.dp) else { Text("Sign in with passkey", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f)); Surface(color = Color(0xFF17121F), shape = CircleShape, modifier = Modifier.size(54.dp)) { Box(contentAlignment = Alignment.Center) { Icon(Icons.Default.ArrowForward, null, tint = Color.White, modifier = Modifier.size(28.dp)) } } } } }
            item { Row(Modifier.fillMaxWidth().padding(top = 20.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text("A U T H O R I Z E D\nS E L L E R S  O N L Y", style = labelStyle(), color = Color(0xFF9891A6)); Text("—   L I T T X\n     S E L L E R", style = labelStyle(), color = Color(0xFF9891A6)) } }
        }
    }
}

@Composable private fun PartnerCard(partner: PartnerVisual, selected: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(21.dp)
    Row(Modifier.fillMaxWidth().clip(shape).background(if (selected) Color(0xFF17132A).copy(alpha = .94f) else panel.copy(alpha = .9f)).border(1.dp, if (selected) lilac else Color(0xFF252431), shape).clickable(onClick = onClick).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(64.dp).clip(RoundedCornerShape(15.dp)).background(Color(0xFF181724)).border(1.dp, if (selected) Color(0xFF7045B8) else Color(0xFF2A2937), RoundedCornerShape(15.dp)), contentAlignment = Alignment.Center) { Text(partner.mark, color = if (selected) lilac else Color(0xFF9B97AA), fontWeight = FontWeight.Bold, fontSize = if (partner.mark.length > 1) 23.sp else 31.sp) }
        Column(Modifier.padding(start = 15.dp).weight(1f)) { Text(partner.name, color = Color.White, fontWeight = FontWeight.Medium, fontSize = 18.sp, maxLines = 1, overflow = TextOverflow.Ellipsis); Spacer(Modifier.height(7.dp)); Text(partner.line, style = labelStyle(), color = Color(0xFFAAA4B7)) }
        Box(Modifier.size(34.dp).border(3.dp, if (selected) lilac else Color(0xFF565261), CircleShape), contentAlignment = Alignment.Center) { if (selected) Box(Modifier.size(15.dp).background(lilac, CircleShape)) }
    }
}

@Composable private fun LoginBackdrop() { Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF090910), midnight, Color(0xFF100C1B))))) { Box(Modifier.fillMaxWidth().height(650.dp).background(Brush.radialGradient(listOf(Color(0x4D7042C4), Color.Transparent), center = Offset(720f, 340f), radius = 720f))); Box(Modifier.fillMaxWidth().height(380.dp).padding(start = 240.dp, top = 230.dp).background(Brush.linearGradient(listOf(Color.Transparent, Color(0xAA6B34D0), Color.Transparent)))); Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(180.dp).background(Brush.radialGradient(listOf(Color(0x993B2168), Color.Transparent), radius = 650f))) } }

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun SellerHome(model: SellerViewModel) {
    var tab by remember { mutableStateOf(0) }
    Scaffold(containerColor = midnight, topBar = { TopAppBar(colors = TopAppBarDefaults.topAppBarColors(containerColor = midnight, titleContentColor = Color.White), title = { Column { Text("LITTX SELLER", letterSpacing = 3.sp, fontSize = 15.sp); Text(model.state.partner?.name.orEmpty(), color = softText, fontSize = 12.sp) } }, actions = { TextButton({ model.loadConfig() }) { Text("Refresh") }; TextButton({ model.logout() }) { Text("Sign out") } }) }, bottomBar = { NavigationBar(containerColor = panel) { listOf("Issue ticket", "History").forEachIndexed { i, label -> NavigationBarItem(selected = tab == i, onClick = { tab = i; if (i == 1) model.loadSales() }, icon = { Icon(if (i == 0) Icons.Default.Lock else Icons.Default.Visibility, null) }, label = { Text(label) }) } } }) { padding -> Column(Modifier.padding(padding).padding(20.dp).fillMaxSize()) { model.state.error?.let { Notice(it, true, model::dismissNotice) }; model.state.message?.let { Notice(it, false, model::dismissNotice) }; if (tab == 0) TicketForm(model, model.state.config) else History(model.state.sales) } }
}

@Composable private fun TicketForm(model: SellerViewModel, config: SellerConfig?) { if (config == null) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Column(horizontalAlignment = Alignment.CenterHorizontally) { Text("Loading seller configuration…"); TextButton({ model.loadConfig() }) { Text("Retry") } } }; return }; var name by remember { mutableStateOf("") }; var email by remember { mutableStateOf("") }; var phone by remember { mutableStateOf("") }; var passId by remember(config.version) { mutableStateOf(config.passes.first().id) }; val pass = config.passes.firstOrNull { it.id == passId } ?: config.passes.first(); LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) { item { Text("Generate partner ticket", style = MaterialTheme.typography.headlineSmall, color = Color.White); Text(config.event.displayName, color = softText) }; item { OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Attendee full name") }) }; item { OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Attendee email") }) }; item { OutlinedTextField(phone, { phone = it }, Modifier.fillMaxWidth(), label = { Text("Attendee phone") }) }; items(config.passes) { option -> FilterChip(selected = pass.id == option.id, onClick = { passId = option.id }, label = { Text("${option.label} · ₹${option.price.toInt()}") }) }; item { Button(onClick = { model.submitTicket(name, email, phone, pass.id, pass.price, config.event.name) }, enabled = name.isNotBlank() && email.isNotBlank() && !model.state.loading, modifier = Modifier.fillMaxWidth()) { Text(if (model.state.loading) "Submitting…" else "Generate ticket · ₹${pass.price.toInt()}") } } } }
@Composable private fun History(sales: List<Sale>) { LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) { item { Text("Sales history", style = MaterialTheme.typography.headlineSmall, color = Color.White) }; if (sales.isEmpty()) item { Text("No sales available.", color = softText) }; items(sales.size) { i -> val s = sales[i]; ListItem(headlineContent = { Text(s.name ?: "Ticket", color = Color.White) }, supportingContent = { Text("${s.ticketType ?: "Pass"} · ${s.status ?: "Unknown"}") }, trailingContent = { Text("₹${s.amount?.toInt() ?: 0}") }); HorizontalDivider(color = Color(0xFF282633)) } } }
@Composable private fun Notice(text: String, error: Boolean, dismiss: () -> Unit) { AssistChip(onClick = dismiss, label = { Text(text) }, colors = AssistChipDefaults.assistChipColors(containerColor = if (error) Color(0xFF5B2C39) else Color(0xFF2D3B35), labelColor = Color.White)) }
