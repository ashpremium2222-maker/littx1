package com.littx.seller.nativeapp.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.Canvas
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
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
            item { Spacer(Modifier.height(0.dp)) }
            item { Row(verticalAlignment = Alignment.CenterVertically) { Surface(shape = RoundedCornerShape(50), color = Color(0xFF1E1932).copy(alpha = .8f)) { Text("S E L L E R", Modifier.padding(horizontal = 16.dp, vertical = 7.dp), color = Color(0xFFD3BEFF), fontSize = 11.sp, letterSpacing = 4.sp) }; Text("APP BY ASHTU", color = Color(0xFF9B8DB5), fontSize = 8.sp, letterSpacing = 1.sp, modifier = Modifier.padding(start = 10.dp)) } }
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

@Composable private fun SellerHome(model: SellerViewModel) {
    var tab by rememberSaveable { mutableStateOf(0) }
    Scaffold(
        containerColor = midnight,
        bottomBar = { SellerBottomTabs(tab, { tab = 0 }, { tab = 1; model.loadSales() }) }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            SellerHeader(model.state.partner?.name.orEmpty(), model::loadConfig, model::logout)
            model.state.error?.let { Notice(it, true, model::dismissNotice) }
            model.state.message?.let { Notice(it, false, model::dismissNotice) }
            if (tab == 0) TicketForm(model, model.state.config) else History(model.state.sales, model.state.loading, model::loadSales)
        }
    }
}

@Composable private fun SellerHeader(partnerName: String, refresh: () -> Unit, signOut: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(start = 24.dp, end = 16.dp, top = 16.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        SellerBrandMark(Modifier.padding(end = 10.dp))
        Column(Modifier.padding(start = 8.dp).weight(1f)) { Text("LITTX SELLER", color = Color.White, letterSpacing = 1.sp, fontSize = 15.sp, fontWeight = FontWeight.SemiBold); Text(partnerName, color = softText, fontSize = 13.sp) }
        HeaderAction(Icons.Default.Refresh, "Refresh", refresh)
        Spacer(Modifier.width(8.dp))
        HeaderAction(Icons.Default.Logout, "Sign out", signOut)
    }
}

@Composable private fun SellerBottomTabs(tab: Int, issue: () -> Unit, history: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(midnight)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp).height(82.dp).clip(RoundedCornerShape(23.dp)).background(Color(0xFF151420)).border(1.dp, Color(0xFF373345), RoundedCornerShape(23.dp)).padding(8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BottomTab("Issue ticket", Icons.Default.ConfirmationNumber, tab == 0, Modifier.weight(1f), issue)
            BottomTab("History", Icons.Default.History, tab == 1, Modifier.weight(1f), history)
        }
        Spacer(Modifier.height(12.dp))
    }
}

@Composable private fun SellerBrandMark(modifier: Modifier = Modifier) {
    Canvas(modifier.size(56.dp)) {
        drawCircle(Color(0x553E187D), radius = size.minDimension * .52f, center = Offset(size.width * .5f, size.height * .5f))
        val mark = Path().apply {
            moveTo(size.width * .05f, size.height * .04f)
            lineTo(size.width * .28f, size.height * .04f)
            lineTo(size.width * .72f, size.height * .66f)
            lineTo(size.width * .72f, size.height * .04f)
            lineTo(size.width * .95f, size.height * .04f)
            lineTo(size.width * .95f, size.height * .96f)
            lineTo(size.width * .72f, size.height * .96f)
            lineTo(size.width * .28f, size.height * .34f)
            lineTo(size.width * .28f, size.height * .96f)
            lineTo(size.width * .05f, size.height * .96f)
            close()
        }
        drawPath(mark, Brush.linearGradient(listOf(Color(0xFFD48BFF), Color(0xFF844AFF), Color(0xFF6A39C6))))
    }
}

@Composable private fun BottomTab(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, selected: Boolean, modifier: Modifier, click: () -> Unit) {
    val background = if (selected) Brush.linearGradient(listOf(Color(0xFF32285A), Color(0xFF241B43))) else Brush.linearGradient(listOf(Color.Transparent, Color.Transparent))
    Row(
        modifier.fillMaxHeight().clip(RoundedCornerShape(17.dp)).background(background).clickable(onClick = click).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) { Icon(icon, null, tint = if (selected) Color(0xFFD2BAFF) else softText); Spacer(Modifier.width(8.dp)); Text(label, color = if (selected) Color.White else softText, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal) }
}

@Composable private fun HeaderAction(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, click: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable(onClick = click).padding(5.dp)) {
        Box(Modifier.size(39.dp).border(1.dp, Color(0xFF3B374B), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) { Icon(icon, label, tint = Color(0xFFC9B2FF), modifier = Modifier.size(20.dp)) }
        Text(label, color = Color(0xFFD5D1DD), fontSize = 10.sp, modifier = Modifier.padding(top = 3.dp))
    }
}

@Composable private fun TicketForm(model: SellerViewModel, config: SellerConfig?) {
    if (config == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Column(horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator(color = lilac); Spacer(Modifier.height(12.dp)); Text("Loading seller configuration…", color = softText); TextButton(model::loadConfig) { Text("Retry") } } }
        return
    }
    if (config.passes.isEmpty()) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("No ticket types are currently available.", color = softText) }; return }
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var passId by rememberSaveable(config.version) { mutableStateOf(config.passes.first().id) }
    val pass = config.passes.firstOrNull { it.id == passId } ?: config.passes.first()
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 20.dp), contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { EventHero(config.event) }
        item { Column(Modifier.padding(top = 8.dp)) { Text("G E N E R A T E  T I C K E T", style = labelStyle(), color = Color(0xFFC6A9FF)); Spacer(Modifier.height(8.dp)); Text("Attendee Details", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold); Text("Enter attendee information to generate a partner ticket", color = softText, fontSize = 14.sp) } }
        item { SellerTextField(name, { name = it }, "Attendee full name", Icons.Default.Person) }
        item { SellerTextField(email, { email = it }, "Attendee email", Icons.Default.Email) }
        item { SellerTextField(phone, { phone = it }, "Attendee phone number", Icons.Default.Phone) }
        item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("Select Ticket Type", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 19.sp); Text("Live prices", color = softText, fontSize = 13.sp) } }
        items(config.passes.chunked(2)) { pair ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                pair.forEach { option -> PassCard(option, option.id == pass.id, Modifier.weight(1f)) { passId = option.id } }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
        item { Button(onClick = { model.submitTicket(name, email, phone, pass.id, pass.price, config.event.name) }, enabled = name.isNotBlank() && email.isNotBlank() && phone.isNotBlank() && !model.state.loading, modifier = Modifier.fillMaxWidth().height(62.dp), shape = RoundedCornerShape(20.dp), colors = ButtonDefaults.buttonColors(containerColor = lilac, contentColor = Color(0xFF120B1D), disabledContainerColor = Color(0xFF332B43))) { if (model.state.loading) CircularProgressIndicator(Modifier.size(23.dp), color = Color.White, strokeWidth = 2.dp) else { Icon(Icons.Default.ConfirmationNumber, null); Spacer(Modifier.width(12.dp)); Text("Generate Partner Ticket", fontSize = 17.sp, fontWeight = FontWeight.Bold); Spacer(Modifier.width(8.dp)); Icon(Icons.Default.ArrowForward, null) } } }
    }
}

@Composable private fun EventHero(event: SellerEvent) {
    Box(Modifier.fillMaxWidth().height(230.dp).clip(RoundedCornerShape(23.dp)).border(1.dp, Color(0xFF4A3D60), RoundedCornerShape(23.dp)).background(Color(0xFF11111A))) {
        ConcertBackdrop()
        Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(listOf(Color(0xE60A0910), Color(0x9A0A0910), Color(0x250A0910)))))
        Box(Modifier.align(Alignment.TopEnd).size(180.dp).background(Brush.radialGradient(listOf(Color(0xFF8E42FF).copy(alpha = .35f), Color.Transparent))))
        Column(Modifier.align(Alignment.BottomStart).padding(22.dp)) {
            Surface(color = Color(0xFF1B1730), shape = RoundedCornerShape(8.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF514071))) { Text("LIVE EVENT", Modifier.padding(horizontal = 10.dp, vertical = 5.dp), style = labelStyle(), color = Color(0xFFD5BFFF)) }
            Spacer(Modifier.height(12.dp)); Text(event.displayName.ifBlank { event.name }.uppercase(), color = Color.White, fontWeight = FontWeight.Black, fontSize = 23.sp, lineHeight = 26.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(8.dp)); Text("MUSIC  •  CULTURE  •  PEOPLE  •  TOGETHER", color = Color(0xFFD6CCEA), fontSize = 8.sp, letterSpacing = 2.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text("LITTX", Modifier.align(Alignment.TopEnd).padding(18.dp), color = Color(0xFFCFB9FF), style = labelStyle())
    }
}

@Composable private fun ConcertBackdrop() {
    Canvas(Modifier.fillMaxSize()) {
        drawRect(Brush.linearGradient(listOf(Color(0xFF0C0A16), Color(0xFF1E1034), Color(0xFF080910))))
        drawCircle(Brush.radialGradient(listOf(Color(0xCC934DFF), Color.Transparent)), radius = size.width * .56f, center = Offset(size.width * .72f, size.height * .12f))
        drawCircle(Brush.radialGradient(listOf(Color(0x886B32D1), Color.Transparent)), radius = size.width * .48f, center = Offset(size.width * .16f, size.height * .62f))
        drawLine(Color(0x55C7A1FF), Offset(size.width * .70f, 0f), Offset(size.width * .40f, size.height), strokeWidth = 3.dp.toPx())
        drawLine(Color(0x55F19DFF), Offset(size.width * .88f, 0f), Offset(size.width * .56f, size.height), strokeWidth = 2.dp.toPx())
        val crowd = Path().apply {
            moveTo(0f, size.height)
            lineTo(0f, size.height * .81f)
            for (index in 0..16) {
                val x = size.width * index / 16f
                val peak = size.height * (.73f + (index % 4) * .035f)
                lineTo(x + size.width / 32f, peak)
                lineTo(x + size.width / 16f, size.height * .82f)
            }
            lineTo(size.width, size.height)
            close()
        }
        drawPath(crowd, Color(0xE3080911))
    }
}

@Composable private fun SellerTextField(value: String, change: (String) -> Unit, hint: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    OutlinedTextField(value = value, onValueChange = change, modifier = Modifier.fillMaxWidth(), placeholder = { Text(hint, color = Color(0xFF9993A8)) }, singleLine = true, leadingIcon = { Icon(icon, null, tint = Color(0xFFC5AAFF)) }, shape = RoundedCornerShape(16.dp), colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = lilac, unfocusedBorderColor = Color(0xFF464153), focusedContainerColor = Color(0xFF12111B), unfocusedContainerColor = Color(0xFF12111B), focusedTextColor = Color.White, unfocusedTextColor = Color.White))
}

@Composable private fun PassCard(pass: SellerPass, selected: Boolean, modifier: Modifier, click: () -> Unit) {
    val border = if (selected) lilac else Color(0xFF464152)
    val cardBackground = if (selected) Brush.linearGradient(listOf(Color(0xFF38205E), Color(0xFF211735), Color(0xFF161420))) else Brush.linearGradient(listOf(Color(0xFF15151F), Color(0xFF0F1017)))
    Row(modifier.heightIn(min = 124.dp).clip(RoundedCornerShape(18.dp)).background(cardBackground).border(if (selected) 2.dp else 1.dp, border, RoundedCornerShape(18.dp)).clickable(onClick = click).padding(13.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(29.dp).clip(RoundedCornerShape(8.dp)).background(if (selected) Brush.linearGradient(listOf(Color(0xFFB675FF), Color(0xFF7650DD))) else Brush.linearGradient(listOf(Color(0xFF292637), Color(0xFF201E2B)))), contentAlignment = Alignment.Center) { Icon(Icons.Default.ConfirmationNumber, null, tint = if (selected) Color.White else Color(0xFFCCB4FF), modifier = Modifier.size(17.dp)) }
                if (selected) Text(" SELECTED", color = Color(0xFFD8C4FF), fontSize = 8.sp, letterSpacing = 1.sp, modifier = Modifier.padding(start = 6.dp))
            }
            Spacer(Modifier.height(8.dp)); Text(pass.label, color = Color.White, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis); Text(passDescription(pass.label), color = softText, fontSize = 12.sp, maxLines = 1); Spacer(Modifier.height(3.dp)); Text("₹${pass.price.toInt()}", color = Color(0xFFC99EFF), fontSize = 21.sp, fontWeight = FontWeight.Bold)
        }
        Box(Modifier.size(24.dp).border(2.dp, if (selected) Color(0xFFB87BFF) else Color(0xFF817A91), CircleShape), contentAlignment = Alignment.Center) { if (selected) Icon(Icons.Default.Check, null, tint = Color(0xFFE2D2FF), modifier = Modifier.size(16.dp)) }
    }
}

private fun passDescription(label: String): String {
    val lower = label.lowercase()
    val group = Regex("group\\s+of\\s+(\\d+)").find(lower)?.groupValues?.getOrNull(1)
    return when { group != null -> "For $group people"; "vip" in lower -> "VIP Access"; else -> "General Access" }
}

@Composable private fun History(sales: List<Sale>, loading: Boolean, refresh: () -> Unit) {
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 20.dp), contentPadding = PaddingValues(top = 10.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text("Sales History", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold); Text("Tickets issued from this seller account", color = softText, fontSize = 14.sp) }; IconButton(refresh) { Icon(Icons.Default.Refresh, "Refresh sales", tint = Color(0xFFC5AAFF)) } } }
        if (loading) item { LinearProgressIndicator(Modifier.fillMaxWidth(), color = lilac, trackColor = panel) }
        if (!loading && sales.isEmpty()) item { Surface(Modifier.fillMaxWidth().padding(top = 34.dp), color = panel, shape = RoundedCornerShape(20.dp)) { Column(Modifier.padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.Default.History, null, tint = softText, modifier = Modifier.size(36.dp)); Spacer(Modifier.height(10.dp)); Text("No tickets issued yet", color = Color.White, fontWeight = FontWeight.SemiBold); Text("Issued tickets will appear here.", color = softText) } } }
        items(sales) { sale -> SaleCard(sale) }
    }
}

@Composable private fun SaleCard(sale: Sale) { Surface(color = panel, shape = RoundedCornerShape(17.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF2F2D3B))) { Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(42.dp).background(Color(0xFF241A40), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) { Icon(Icons.Default.ConfirmationNumber, null, tint = Color(0xFFC8A9FF)) }; Column(Modifier.padding(start = 13.dp).weight(1f)) { Text(sale.name ?: "Ticket", color = Color.White, fontWeight = FontWeight.SemiBold); Text("${sale.ticketType ?: "Pass"}  •  ${sale.status ?: "Issued"}", color = softText, fontSize = 13.sp) }; Text("₹${sale.amount?.toInt() ?: 0}", color = Color(0xFFC8A9FF), fontWeight = FontWeight.Bold, fontSize = 18.sp) } } }
@Composable private fun Notice(text: String, error: Boolean, dismiss: () -> Unit) { AssistChip(onClick = dismiss, label = { Text(text) }, colors = AssistChipDefaults.assistChipColors(containerColor = if (error) Color(0xFF5B2C39) else Color(0xFF2D3B35), labelColor = Color.White)) }
