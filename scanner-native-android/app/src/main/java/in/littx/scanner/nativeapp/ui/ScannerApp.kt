package com.littx.scanner.nativeapp.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.littx.scanner.nativeapp.data.model.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

private val ink = Color(0xFF11151A)
private val muted = Color(0xFF6C7888)
private val blue = Color(0xFF1769E0)
private val green = Color(0xFF18A957)
private val red = Color(0xFFE5484D)
private val orange = Color(0xFFF57C00)
private enum class Screen { HOME, SCAN, HISTORY, MANUAL, DETAIL }

@Composable fun ScannerApp(activity: ComponentActivity) {
    val model = remember { ScannerViewModel(activity.applicationContext) }
    var authenticated by rememberSaveable { mutableStateOf(false) }
    var screen by remember { mutableStateOf(Screen.HOME) }
    var selected by remember { mutableStateOf<ScanEntry?>(null) }
    val latest = model.state.latest
    MaterialTheme(colorScheme = lightColorScheme(primary = blue, background = Color.White, surface = Color.White)) {
        if (!authenticated) {
            ScannerLogin { authenticated = true }
            return@MaterialTheme
        }
        model.state.update?.let { update -> AlertDialog(onDismissRequest = model::dismissUpdate, title = { Text("Scanner update available") }, text = { Text("Version ${update.version} is ready from the official LITTX release.") }, confirmButton = { TextButton(onClick = { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(update.downloadUrl))); model.dismissUpdate() }) { Text("Download") } }, dismissButton = { TextButton(onClick = model::dismissUpdate) { Text("Later") } }) }
        when {
            latest != null -> ResultScreen(latest, model.state.error, onNext = { model.clearLatest(); screen = Screen.SCAN }, onDetails = { selected = latest; model.clearLatest(); screen = Screen.DETAIL })
            screen == Screen.HOME -> HomeScreen(model.state, onScan = { screen = Screen.SCAN }, onHistory = { screen = Screen.HISTORY })
            screen == Screen.SCAN -> ScanScreen(model.state.loading, onBack = { screen = Screen.HOME }, onManual = { screen = Screen.MANUAL }, onCode = model::scan)
            screen == Screen.MANUAL -> ManualScreen(onBack = { screen = Screen.SCAN }, onCode = model::scan)
            screen == Screen.HISTORY -> HistoryScreen(model.state.history, onBack = { screen = Screen.HOME }) { selected = it; screen = Screen.DETAIL }
            screen == Screen.DETAIL && selected != null -> DetailScreen(selected!!, onBack = { screen = Screen.HISTORY })
            else -> HomeScreen(model.state, onScan = { screen = Screen.SCAN }, onHistory = { screen = Screen.HISTORY })
        }
    }
}

@Composable private fun ScannerLogin(onAuthenticated: () -> Unit) {
    var password by rememberSaveable { mutableStateOf("") }
    var error by rememberSaveable { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFF07100D), Color(0xFF13241E)))), contentAlignment = Alignment.Center) {
        Column(Modifier.fillMaxWidth().padding(28.dp).clip(RoundedCornerShape(28.dp)).background(Color.White.copy(alpha = .96f)).padding(26.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            androidx.compose.foundation.Image(painter = painterResource(com.littx.scanner.nativeapp.R.drawable.scanner_logo), contentDescription = "LITTX Scanner", modifier = Modifier.size(172.dp).clip(RoundedCornerShape(20.dp)))
            Text("Enter the scanner password to continue.", color = muted, modifier = Modifier.padding(top = 20.dp, bottom = 13.dp))
            OutlinedTextField(value = password, onValueChange = { password = it; error = false }, modifier = Modifier.fillMaxWidth(), singleLine = true, label = { Text("Scanner password") }, visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(), isError = error, shape = RoundedCornerShape(16.dp))
            if (error) Text("Invalid scanner password", color = red, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
            Button(onClick = { if (password == "dgr") onAuthenticated() else error = true }, modifier = Modifier.fillMaxWidth().height(56.dp).padding(top = 8.dp), shape = RoundedCornerShape(16.dp), colors = ButtonDefaults.buttonColors(containerColor = ink)) { Text("Launch Scanner", fontWeight = FontWeight.Bold) }
        }
    }
}

@Composable private fun HomeScreen(state: ScannerState, onScan: () -> Unit, onHistory: () -> Unit) {
    Column(Modifier.fillMaxSize().background(Color(0xFFF8FAFC)).padding(24.dp)) {
        Spacer(Modifier.height(38.dp)); Text("LITTX", color = ink, fontSize = 27.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp)
        Spacer(Modifier.height(58.dp)); Text("Scan Tickets\nwith Confidence", color = ink, fontSize = 32.sp, fontWeight = FontWeight.Bold, lineHeight = 39.sp)
        Text("Fast. Secure. Seamless.", color = muted, modifier = Modifier.padding(top = 10.dp))
        Spacer(Modifier.height(30.dp)); Button(onClick = onScan, modifier = Modifier.fillMaxWidth().height(82.dp), shape = RoundedCornerShape(22.dp), colors = ButtonDefaults.buttonColors(containerColor = ink)) {
            Icon(Icons.Default.QrCodeScanner, null, Modifier.size(31.dp)); Spacer(Modifier.width(16.dp)); Text("Scan Ticket", fontSize = 18.sp, fontWeight = FontWeight.Bold); Spacer(Modifier.weight(1f)); Icon(Icons.Default.ChevronRight, null)
        }
        Spacer(Modifier.height(32.dp)); Text("Today’s Summary", color = ink, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(12.dp)); Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White).border(1.dp, Color(0xFFE5EAF0), RoundedCornerShape(18.dp)).padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Summary("Scanned", state.accepted + state.failed, ink); Summary("Approved", state.accepted, green); Summary("Failed", state.failed, red); Summary("Local", state.history.size, orange)
        }
        Spacer(Modifier.weight(1f)); OutlinedButton(onClick = onHistory, modifier = Modifier.fillMaxWidth().height(57.dp), shape = RoundedCornerShape(17.dp)) { Icon(Icons.Default.History, null); Spacer(Modifier.width(9.dp)); Text("Ticket History") }
        Spacer(Modifier.height(18.dp)); Text("Scanner: ${state.scannerName}", Modifier.align(Alignment.CenterHorizontally), color = muted, fontSize = 12.sp)
    }
}
@Composable private fun Summary(label: String, value: Int, color: Color) { Column { Text(value.toString(), color = color, fontSize = 21.sp, fontWeight = FontWeight.Bold); Text(label, color = muted, fontSize = 10.sp) } }

@Composable private fun ScanScreen(loading: Boolean, onBack: () -> Unit, onManual: () -> Unit, onCode: (String) -> Unit) {
    val context = LocalContext.current
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    LaunchedEffect(Unit) { if (!granted) permission.launch(Manifest.permission.CAMERA) }
    Box(Modifier.fillMaxSize().background(Color(0xFF07100D))) {
        if (granted) CameraPreview(onCode) else Column(Modifier.align(Alignment.Center).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.Default.CameraAlt, null, tint = Color.White, modifier = Modifier.size(52.dp)); Text("Camera access is needed to scan tickets.", color = Color.White, modifier = Modifier.padding(16.dp)); Button(onClick = { permission.launch(Manifest.permission.CAMERA) }) { Text("Allow camera") } }
        IconButton(onClick = onBack, modifier = Modifier.padding(20.dp).background(Color.Black.copy(.35f), CircleShape)) { Icon(Icons.Default.Close, "Back", tint = Color.White) }
        Column(Modifier.align(Alignment.TopCenter).padding(top = 88.dp), horizontalAlignment = Alignment.CenterHorizontally) { Text("Position the ticket QR code", color = Color.White, fontWeight = FontWeight.SemiBold); Text("within the frame", color = Color.White) }
        Box(Modifier.align(Alignment.Center).size(270.dp).border(3.dp, if (loading) orange else blue, RoundedCornerShape(28.dp)))
        Column(Modifier.align(Alignment.BottomCenter).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) { if (loading) { CircularProgressIndicator(color = Color.White); Text("Validating ticket…", color = Color.White, modifier = Modifier.padding(top = 10.dp)) }; OutlinedButton(onClick = onManual, colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White), border = BorderStroke(1.dp, Color.White.copy(alpha = .8f)), modifier = Modifier.padding(top = 18.dp)) { Icon(Icons.Default.Keyboard, null); Spacer(Modifier.width(8.dp)); Text("Enter Code Manually") } }
    }
}

@Composable private fun CameraPreview(onCode: (String) -> Unit) {
    val lifecycle = LocalLifecycleOwner.current; val context = LocalContext.current; var lastCode by remember { mutableStateOf("") }; var lastAt by remember { mutableLongStateOf(0L) }
    AndroidView(factory = { viewContext ->
        PreviewView(viewContext).also { preview ->
            val future = ProcessCameraProvider.getInstance(viewContext)
            future.addListener({
                val provider = future.get(); val cameraPreview = androidx.camera.core.Preview.Builder().build().also { it.surfaceProvider = preview.surfaceProvider }
                val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
                val scanner = BarcodeScanning.getClient()
                analysis.setAnalyzer(Executors.newSingleThreadExecutor()) { proxy ->
                    val image = proxy.image; if (image == null) { proxy.close(); return@setAnalyzer }
                    scanner.process(InputImage.fromMediaImage(image, proxy.imageInfo.rotationDegrees)).addOnSuccessListener { codes ->
                        codes.firstOrNull { it.format == Barcode.FORMAT_QR_CODE }?.rawValue?.let { code -> if (code != lastCode || SystemClock.elapsedRealtime() - lastAt > 1800) { lastCode = code; lastAt = SystemClock.elapsedRealtime(); onCode(code) } }
                    }.addOnCompleteListener { proxy.close() }
                }
                provider.unbindAll(); provider.bindToLifecycle(lifecycle, CameraSelector.DEFAULT_BACK_CAMERA, cameraPreview, analysis)
            }, ContextCompat.getMainExecutor(viewContext))
        }
    }, modifier = Modifier.fillMaxSize())
}

@Composable private fun ManualScreen(onBack: () -> Unit, onCode: (String) -> Unit) { var code by remember { mutableStateOf("") }; Column(Modifier.fillMaxSize().background(Color.White).padding(24.dp)) { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Back") }; Spacer(Modifier.height(36.dp)); Text("Enter Ticket Code", color = ink, fontSize = 30.sp, fontWeight = FontWeight.Bold); Text("Type the ticket code manually to validate.", color = muted, modifier = Modifier.padding(top = 8.dp)); Spacer(Modifier.height(28.dp)); OutlinedTextField(value = code, onValueChange = { code = it.uppercase() }, modifier = Modifier.fillMaxWidth(), placeholder = { Text("e.g. NX-84921-X92") }, singleLine = true, shape = RoundedCornerShape(15.dp)); Button(onClick = { onCode(code) }, enabled = code.isNotBlank(), modifier = Modifier.fillMaxWidth().height(58.dp).padding(top = 8.dp), shape = RoundedCornerShape(16.dp), colors = ButtonDefaults.buttonColors(containerColor = ink)) { Text("Validate") } } }

@Composable private fun ResultScreen(entry: ScanEntry, error: String?, onNext: () -> Unit, onDetails: () -> Unit) {
    val approved = entry.outcome == ScanOutcome.APPROVED; val duplicate = entry.outcome == ScanOutcome.DUPLICATE; val color = if (approved) green else if (duplicate) orange else red
    val title = if (approved) "Ticket Valid" else if (duplicate) "Ticket Already Used" else "Invalid Ticket"
    val subtitle = if (approved) "You may proceed" else if (duplicate) "This ticket has been scanned before." else (error ?: "This ticket is not valid or has expired.")
    Column(Modifier.fillMaxSize().background(if (approved) Color(0xFF061C12) else Color(0xFF1D0A0A)).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) { Spacer(Modifier.height(78.dp)); Box(Modifier.size(130.dp).border(3.dp, color, CircleShape), contentAlignment = Alignment.Center) { Icon(if (approved) Icons.Default.Check else Icons.Default.Close, null, tint = color, modifier = Modifier.size(78.dp)) }; Spacer(Modifier.height(28.dp)); Text(title, color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold); Text(subtitle, color = Color.White.copy(.75f), modifier = Modifier.padding(top = 8.dp)); Spacer(Modifier.height(26.dp)); TicketCard(entry, color); Spacer(Modifier.weight(1f)); if (!approved) OutlinedButton(onClick = onDetails, colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White), modifier = Modifier.fillMaxWidth()) { Text("View Details") }; Button(onClick = onNext, modifier = Modifier.fillMaxWidth().height(57.dp).padding(top = 8.dp), colors = ButtonDefaults.buttonColors(containerColor = color), shape = RoundedCornerShape(18.dp)) { Text(if (approved) "Scan Next Ticket" else "Try Again") } }
}
@Composable private fun TicketCard(entry: ScanEntry, color: Color) { val t = entry.ticket; Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Color.White.copy(.08f)).border(1.dp, color.copy(.5f), RoundedCornerShape(20.dp)).padding(18.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) { Text(t?.event ?: "Ticket validation", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp); Line("Ticket ID", t?.id?.ifBlank { entry.rawCode } ?: entry.rawCode); Line("Holder", t?.attendee ?: "—"); Line("Pass", t?.ticketType ?: "—"); Line("Scan time", time(entry.scannedAt)); if (entry.outcome == ScanOutcome.DUPLICATE) Line("Previous scans", "Already scanned") } }
@Composable private fun Line(label: String, value: String) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(label, color = Color.White.copy(.65f), fontSize = 13.sp); Text(value, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis) } }

@Composable private fun HistoryScreen(history: List<ScanEntry>, onBack: () -> Unit, onSelect: (ScanEntry) -> Unit) { var filter by remember { mutableStateOf<ScanOutcome?>(null) }; val visible = history.filter { filter == null || it.outcome == filter }; Column(Modifier.fillMaxSize().background(Color(0xFFF8FAFC))) { Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Back") }; Column(Modifier.padding(start = 5.dp)) { Text("Ticket History", color = ink, fontSize = 25.sp, fontWeight = FontWeight.Bold); Text("Scans on this device", color = muted, fontSize = 13.sp) } }; Row(Modifier.padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) { FilterChip(selected = filter == null, onClick = { filter = null }, label = { Text("All") }); FilterChip(selected = filter == ScanOutcome.APPROVED, onClick = { filter = ScanOutcome.APPROVED }, label = { Text("Approved") }); FilterChip(selected = filter != null && filter != ScanOutcome.APPROVED, onClick = { filter = ScanOutcome.INVALID }, label = { Text("Failed") }) }; LazyColumn(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) { items(visible) { entry -> HistoryCard(entry) { onSelect(entry) } } } } }
@Composable private fun HistoryCard(entry: ScanEntry, click: () -> Unit) { val color = when(entry.outcome) { ScanOutcome.APPROVED -> green; ScanOutcome.DUPLICATE -> orange; else -> red }; Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(17.dp)).background(Color.White).clickable(onClick = click).padding(14.dp), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(38.dp).background(color.copy(.13f), CircleShape), contentAlignment = Alignment.Center) { Icon(if(entry.outcome == ScanOutcome.APPROVED) Icons.Default.Check else Icons.Default.PriorityHigh, null, tint = color) }; Column(Modifier.padding(start = 12.dp).weight(1f)) { Text(entry.ticket?.attendee ?: entry.rawCode, color = ink, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis); Text(entry.ticket?.event ?: time(entry.scannedAt), color = muted, fontSize = 12.sp) }; Text(entry.outcome.name.lowercase().replaceFirstChar { it.titlecase() }, color = color, fontSize = 11.sp, fontWeight = FontWeight.Bold) } }
@Composable private fun DetailScreen(entry: ScanEntry, onBack: () -> Unit) { Column(Modifier.fillMaxSize().background(Color.White).padding(22.dp)) { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Back") }; Text("Ticket Details", color = ink, fontSize = 26.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 22.dp)); Spacer(Modifier.height(25.dp)); TicketDetail(entry) } }
@Composable private fun TicketDetail(entry: ScanEntry) { val t = entry.ticket; Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(21.dp)).background(Color(0xFFF8FAFC)).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) { Text(if(entry.outcome == ScanOutcome.APPROVED) "APPROVED" else entry.outcome.name, color = if(entry.outcome == ScanOutcome.APPROVED) green else orange, fontWeight = FontWeight.Black); Text(t?.event ?: "Unknown ticket", color = ink, fontSize = 22.sp, fontWeight = FontWeight.Bold); LineLight("Ticket ID", t?.id?.ifBlank { entry.rawCode } ?: entry.rawCode); LineLight("Ticket holder", t?.attendee ?: "—"); LineLight("Ticket type", t?.ticketType ?: "—"); LineLight("Scanned", time(entry.scannedAt)); LineLight("Scanner", t?.scannedBy ?: "This device") } }
@Composable private fun LineLight(label: String, value: String) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(label, color = muted); Text(value, color = ink, fontWeight = FontWeight.SemiBold) } }
private fun time(value: Long) = SimpleDateFormat("dd MMM • h:mm a", Locale.getDefault()).format(Date(value))
