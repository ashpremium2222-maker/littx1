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
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
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
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

private val ink = Color(0xFF10182A)
private val muted = Color(0xFF77839A)
private val blue = Color(0xFF477BFF)
private val cyan = Color(0xFF58D8E8)
private val green = Color(0xFF20C997)
private val red = Color(0xFFFF647C)
private val amber = Color(0xFFFFB454)
private val canvas = Color(0xFFF4F6FB)
private val night = Color(0xFF080E1C)
private enum class Screen { HOME, SCAN, HISTORY, MANUAL, DETAIL }

@Composable fun ScannerApp(activity: ComponentActivity) {
    val model = remember { ScannerViewModel(activity.applicationContext) }
    var screen by remember { mutableStateOf(Screen.HOME) }
    var selected by remember { mutableStateOf<ScanEntry?>(null) }
    LaunchedEffect(screen, model.state.authenticated) { if (screen == Screen.HOME && model.state.authenticated) model.refreshStats() }
    MaterialTheme(colorScheme = darkColorScheme(primary = blue, background = canvas, surface = Color.White)) {
        if (!model.state.authenticated) {
            ScannerLogin(model.state.loading, model.state.error, model::login)
            return@MaterialTheme
        }
        model.state.update?.let { update ->
            AlertDialog(onDismissRequest = model::dismissUpdate, title = { Text("Scanner update available") }, text = { Text("Version ${update.version} is ready from the official LITTX release.") }, confirmButton = { TextButton(onClick = { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(update.downloadUrl))); model.dismissUpdate() }) { Text("Download") } }, dismissButton = { TextButton(onClick = model::dismissUpdate) { Text("Later") } })
        }
        val latest = model.state.latest
        when {
            latest != null -> ResultScreen(latest, model.state.error, onNext = { model.clearLatest(); screen = Screen.SCAN }, onDetails = { selected = latest; model.clearLatest(); screen = Screen.DETAIL })
            screen == Screen.HOME -> HomeScreen(model.state, onScan = { screen = Screen.SCAN }, onHistory = { screen = Screen.HISTORY })
            screen == Screen.SCAN -> ScanScreen(model.state.loading, onBack = { screen = Screen.HOME }, onManual = { screen = Screen.MANUAL }, onCode = model::scan)
            screen == Screen.MANUAL -> ManualScreen(onBack = { screen = Screen.SCAN }, onCode = model::scan, loading = model.state.loading)
            screen == Screen.HISTORY -> HistoryScreen(model.state.history, onBack = { screen = Screen.HOME }) { selected = it; screen = Screen.DETAIL }
            screen == Screen.DETAIL && selected != null -> DetailScreen(selected!!, onBack = { screen = Screen.HISTORY })
            else -> HomeScreen(model.state, onScan = { screen = Screen.SCAN }, onHistory = { screen = Screen.HISTORY })
        }
    }
}

@Composable private fun ScannerLogin(loading: Boolean, errorMessage: String?, onLogin: (String) -> Unit) {
    var password by rememberSaveable { mutableStateOf("") }
    Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(night, Color(0xFF14284B), Color(0xFF10172A)))), contentAlignment = Alignment.Center) {
        Column(Modifier.fillMaxWidth().padding(22.dp).clip(RoundedCornerShape(32.dp)).background(Color.White.copy(.96f)).padding(26.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            androidx.compose.foundation.Image(painter = painterResource(com.littx.scanner.nativeapp.R.drawable.scanner_logo), contentDescription = "LITTX Scanner", modifier = Modifier.size(142.dp).clip(RoundedCornerShape(24.dp)))
            Text("EVENT SCANNER", color = blue, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp, modifier = Modifier.padding(top = 20.dp))
            Text("Your gate starts here.", color = ink, fontSize = 25.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))
            Text("Sign in to validate event tickets securely.", color = muted, modifier = Modifier.padding(top = 8.dp, bottom = 20.dp))
            OutlinedTextField(value = password, onValueChange = { password = it }, modifier = Modifier.fillMaxWidth(), singleLine = true, label = { Text("Scanner password") }, visualTransformation = PasswordVisualTransformation(), isError = errorMessage != null, shape = RoundedCornerShape(17.dp), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done))
            if (errorMessage != null) Text(errorMessage, color = Color(0xFFCE344F), fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
            Button(onClick = { onLogin(password) }, enabled = password.isNotBlank() && !loading, modifier = Modifier.fillMaxWidth().padding(top = 14.dp).height(56.dp), shape = RoundedCornerShape(18.dp), colors = ButtonDefaults.buttonColors(containerColor = ink)) { Text(if (loading) "Signing in…" else "Sign in to LITTX", fontWeight = FontWeight.Bold) }
        }
    }
}

@Composable private fun HomeScreen(state: ScannerState, onScan: () -> Unit, onHistory: () -> Unit) {
    Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFFF8F8FF), Color(0xFFF1F5FF), canvas)))) {
        LazyColumn(contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("LITTX", color = ink, fontSize = 29.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp)
                        Text("EVENT SCANNER", color = muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.8.sp)
                    }
                    Row(Modifier.clip(CircleShape).background(Color.White.copy(.8f)).border(1.dp, Color.White, CircleShape).padding(horizontal = 12.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(7.dp).background(green, CircleShape)); Text("GATE ACTIVE", color = ink, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = .7.sp, modifier = Modifier.padding(start = 7.dp))
                    }
                }
                Row(Modifier.padding(top = 17.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(38.dp).background(Color(0xFFE7ECF8), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Default.Person, null, tint = ink, modifier = Modifier.size(21.dp)) }
                    Column(Modifier.padding(start = 10.dp)) { Text(state.scannerName, color = ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp); Text("Scanner account", color = muted, fontSize = 11.sp) }
                    Spacer(Modifier.weight(1f)); Text("GATE STAFF", color = muted, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                }
            }
            item { ScanHero(onScan) }
            item { ActivityPanel(state) }
            item {
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(21.dp)).background(Color.White).border(1.dp, Color(0xFFE8ECF4), RoundedCornerShape(21.dp)).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(40.dp).background(Color(0xFFFFF2DF), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Default.History, null, tint = amber) }
                    Column(Modifier.weight(1f).padding(start = 12.dp)) { Text("This device", color = ink, fontWeight = FontWeight.SemiBold); Text("${state.history.size} saved scan records", color = muted, fontSize = 12.sp) }
                    TextButton(onClick = onHistory) { Text("History", color = blue, fontWeight = FontWeight.Bold) }
                }
            }
            if (state.statsError) item { SyncStatusHud() }
        }
    }
}

private fun ScannerState.statsValue(value: Int): String = if (statsAvailable) value.toString() else "—"

@Composable private fun ActivityPanel(state: ScannerState) {
    val total = state.accepted + state.failed
    val approvedFraction = if (total > 0) state.accepted.toFloat() / total else 0f
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(27.dp)).background(Brush.linearGradient(listOf(Color(0xFF11172B), Color(0xFF20284A), Color(0xFF191D37)))).padding(19.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("TODAY", color = Color.White, fontWeight = FontWeight.Black, fontSize = 18.sp, letterSpacing = 1.6.sp)
                Text("All scanner activity · India time", color = Color.White.copy(.55f), fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp))
            }
            if (state.statsLoading) CircularProgressIndicator(Modifier.size(18.dp), color = cyan, strokeWidth = 2.dp)
            else Icon(Icons.Default.Timeline, null, tint = Color.White.copy(.62f), modifier = Modifier.size(19.dp))
        }
        Row(Modifier.fillMaxWidth().padding(top = 23.dp), verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text("APPROVED", color = Color(0xFF76E6C4), fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
                Text(state.statsValue(state.accepted), color = Color.White, fontSize = 39.sp, fontWeight = FontWeight.Bold, lineHeight = 43.sp, modifier = Modifier.padding(top = 3.dp))
            }
            Box(Modifier.padding(horizontal = 14.dp, vertical = 8.dp).width(1.dp).height(43.dp).background(Color.White.copy(.14f)))
            Column(Modifier.weight(1f)) {
                Text("DECLINED", color = Color(0xFFFF8FA0), fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
                Text(state.statsValue(state.failed), color = Color.White, fontSize = 39.sp, fontWeight = FontWeight.Bold, lineHeight = 43.sp, modifier = Modifier.padding(top = 3.dp))
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 14.dp).height(5.dp).clip(CircleShape).background(Color.White.copy(.12f))) {
            if (total > 0) {
                if (state.accepted > 0) Box(Modifier.fillMaxHeight().weight(approvedFraction.coerceAtLeast(.015f)).background(green))
                if (state.failed > 0) Box(Modifier.fillMaxHeight().weight((1f - approvedFraction).coerceAtLeast(.015f)).background(red))
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(if (state.statsAvailable) "$total tickets processed" else "Waiting for today’s totals", color = Color.White.copy(.52f), fontSize = 10.sp)
            Text("LIVE DATA", color = Color.White.copy(.38f), fontSize = 8.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
        }
    }
}

@Composable private fun SyncStatusHud() {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Color(0xFFFFF4E9).copy(.88f)).border(1.dp, Color(0xFFF2D6B6), RoundedCornerShape(20.dp)).padding(15.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(36.dp).clip(CircleShape).background(Color(0xFFFFE5C6)), contentAlignment = Alignment.Center) { Icon(Icons.Default.CloudOff, null, tint = Color(0xFFA56521), modifier = Modifier.size(19.dp)) }
        Column(Modifier.padding(start = 11.dp)) {
            Text("SYNC STATUS", color = Color(0xFF88531C), fontSize = 9.sp, fontWeight = FontWeight.Black, letterSpacing = 1.2.sp)
            Text("Today’s totals are unavailable", color = Color(0xFF5D472E), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 3.dp))
        }
    }
}

@Composable private fun ScanHero(onScan: () -> Unit) {
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(Brush.linearGradient(listOf(Color(0xFF153B8D), Color(0xFF315EEB), Color(0xFF6676FF)))).clickable(onClick = onScan).padding(22.dp)) {
        Box(Modifier.align(Alignment.TopEnd).offset(x = 23.dp, y = (-32).dp).size(130.dp).background(Color.White.copy(.07f), CircleShape))
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(48.dp).clip(RoundedCornerShape(16.dp)).background(Color.White.copy(.16f)), contentAlignment = Alignment.Center) { Icon(Icons.Default.QrCodeScanner, null, tint = Color.White, modifier = Modifier.size(27.dp)) }
                Spacer(Modifier.weight(1f)); Icon(Icons.Default.ArrowOutward, null, tint = Color.White.copy(.85f))
            }
            Text("Scan ticket", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 20.dp))
            Text("Verify entry instantly", color = Color.White.copy(.78f), fontSize = 14.sp, modifier = Modifier.padding(top = 4.dp))
            Row(Modifier.padding(top = 22.dp).clip(CircleShape).background(Color.White).padding(horizontal = 15.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) { Text("OPEN SCANNER", color = Color(0xFF2449B9), fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.sp); Icon(Icons.Default.ArrowForward, null, tint = Color(0xFF2449B9), modifier = Modifier.padding(start = 9.dp).size(15.dp)) }
        }
    }
}

@Composable private fun MetricCard(label: String, value: String, color: Color, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier = Modifier) {
    Column(modifier.clip(RoundedCornerShape(22.dp)).background(Color.White).border(1.dp, Color(0xFFE8ECF4), RoundedCornerShape(22.dp)).padding(15.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) { Icon(icon, null, tint = color, modifier = Modifier.size(19.dp)); Spacer(Modifier.weight(1f)); Box(Modifier.size(6.dp).background(color.copy(.75f), CircleShape)) }
        Text(value, color = ink, fontSize = 29.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 13.dp))
        Text(label, color = muted, fontSize = 12.sp, modifier = Modifier.padding(top = 1.dp))
    }
}

@Composable private fun ScanScreen(loading: Boolean, onBack: () -> Unit, onManual: () -> Unit, onCode: (String) -> Unit) {
    val context = LocalContext.current
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    LaunchedEffect(Unit) { if (!granted) permission.launch(Manifest.permission.CAMERA) }
    val pulse by rememberInfiniteTransition(label = "scanner glow").animateFloat(0.45f, 1f, infiniteRepeatable(tween(1300), RepeatMode.Reverse), label = "glow")
    Box(Modifier.fillMaxSize().background(night)) {
        if (granted) CameraPreview(onCode) else Column(Modifier.align(Alignment.Center).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Default.CameraAlt, null, tint = cyan, modifier = Modifier.size(48.dp)); Text("Camera access is needed to scan tickets.", color = Color.White, modifier = Modifier.padding(16.dp)); Button(onClick = { permission.launch(Manifest.permission.CAMERA) }, colors = ButtonDefaults.buttonColors(containerColor = blue)) { Text("Allow camera") }
        }
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Color.Black.copy(.48f), Color.Transparent, Color.Black.copy(.58f)))) )
        IconButton(onClick = onBack, modifier = Modifier.padding(start = 18.dp, top = 18.dp).size(46.dp).background(Color.Black.copy(.42f), CircleShape)) { Icon(Icons.Default.Close, "Back", tint = Color.White) }
        Column(Modifier.align(Alignment.TopCenter).padding(top = 30.dp), horizontalAlignment = Alignment.CenterHorizontally) { Text("LITTX", color = Color.White, fontWeight = FontWeight.Black, letterSpacing = 2.sp, fontSize = 18.sp); Text(if (loading) "VALIDATING" else "READY TO SCAN", color = cyan, fontSize = 9.sp, letterSpacing = 1.6.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 3.dp)) }
        Box(Modifier.align(Alignment.Center).size(286.dp).scale(.985f + pulse * .015f)) {
            val scanLine by rememberInfiniteTransition(label = "scan line").animateFloat(0f, 1f, infiniteRepeatable(tween(1900), RepeatMode.Reverse), label = "scan line position")
            Canvas(Modifier.matchParentSize()) {
                val corner = 42.dp.toPx()
                val stroke = 3.dp.toPx()
                val width = size.width
                val height = size.height
                val tone = if (loading) Color.White else cyan
                drawLine(tone, androidx.compose.ui.geometry.Offset(0f, corner), androidx.compose.ui.geometry.Offset(0f, 0f), stroke, cap = StrokeCap.Round)
                drawLine(tone, androidx.compose.ui.geometry.Offset(0f, 0f), androidx.compose.ui.geometry.Offset(corner, 0f), stroke, cap = StrokeCap.Round)
                drawLine(tone, androidx.compose.ui.geometry.Offset(width - corner, 0f), androidx.compose.ui.geometry.Offset(width, 0f), stroke, cap = StrokeCap.Round)
                drawLine(tone, androidx.compose.ui.geometry.Offset(width, 0f), androidx.compose.ui.geometry.Offset(width, corner), stroke, cap = StrokeCap.Round)
                drawLine(tone, androidx.compose.ui.geometry.Offset(0f, height - corner), androidx.compose.ui.geometry.Offset(0f, height), stroke, cap = StrokeCap.Round)
                drawLine(tone, androidx.compose.ui.geometry.Offset(0f, height), androidx.compose.ui.geometry.Offset(corner, height), stroke, cap = StrokeCap.Round)
                drawLine(tone, androidx.compose.ui.geometry.Offset(width - corner, height), androidx.compose.ui.geometry.Offset(width, height), stroke, cap = StrokeCap.Round)
                drawLine(tone, androidx.compose.ui.geometry.Offset(width, height - corner), androidx.compose.ui.geometry.Offset(width, height), stroke, cap = StrokeCap.Round)
            }
            Box(Modifier.align(Alignment.TopStart).offset(x = 0.dp, y = (scanLine * 282).dp).fillMaxWidth().height(2.dp).background(Brush.horizontalGradient(listOf(Color.Transparent, cyan.copy(.5f), Color.White, cyan.copy(.5f), Color.Transparent))))
        }
        Column(Modifier.align(Alignment.Center).padding(top = 192.dp).clip(RoundedCornerShape(18.dp)).background(Color.Black.copy(.42f)).border(1.dp, Color.White.copy(.12f), RoundedCornerShape(18.dp)).padding(horizontal = 17.dp, vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("POSITION QR CODE", color = Color.White, fontWeight = FontWeight.Black, fontSize = 9.sp, letterSpacing = 1.4.sp)
            Text("Align the ticket inside the frame", color = Color.White.copy(.72f), fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
        }
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(horizontal = 24.dp, vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            if (loading) Row(verticalAlignment = Alignment.CenterVertically) { CircularProgressIndicator(Modifier.size(18.dp), color = cyan, strokeWidth = 2.dp); Text("Validating ticket…", color = Color.White, modifier = Modifier.padding(start = 10.dp)) }
            Row(Modifier.fillMaxWidth().padding(top = 15.dp).height(56.dp).clip(RoundedCornerShape(18.dp)).background(Color.White.copy(.11f)).border(1.dp, Color.White.copy(.28f), RoundedCornerShape(18.dp)).clickable(onClick = onManual).padding(horizontal = 17.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Keyboard, null, tint = Color.White); Text("Enter code manually", color = Color.White, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 10.dp).weight(1f)); Icon(Icons.Default.ArrowForward, null, tint = Color.White.copy(.76f), modifier = Modifier.size(18.dp))
            }
        }
    }
}

@Composable private fun CameraPreview(onCode: (String) -> Unit) {
    val lifecycle = LocalLifecycleOwner.current
    val context = LocalContext.current
    val executor = remember { Executors.newSingleThreadExecutor() }
    val scanner = remember { BarcodeScanning.getClient() }
    val busy = remember { AtomicBoolean(false) }
    val active = remember { AtomicBoolean(true) }
    val lastCode = remember { AtomicReference("") }
    val lastAt = remember { AtomicLong(0L) }
    val latestOnCode by rememberUpdatedState(onCode)
    var cameraProvider by remember { mutableStateOf<ProcessCameraProvider?>(null) }
    DisposableEffect(lifecycle, scanner, executor) {
        onDispose { active.set(false); cameraProvider?.unbindAll(); scanner.close(); executor.shutdown() }
    }
    AndroidView(factory = { viewContext ->
        PreviewView(viewContext).also { preview ->
            val future = ProcessCameraProvider.getInstance(viewContext)
            future.addListener({
                if (!active.get()) return@addListener
                val provider = future.get(); cameraProvider = provider
                val cameraPreview = androidx.camera.core.Preview.Builder().build().also { it.surfaceProvider = preview.surfaceProvider }
                val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
                analysis.setAnalyzer(executor) { proxy ->
                    val image = proxy.image
                    if (image == null) { proxy.close(); return@setAnalyzer }
                    if (!active.get() || !busy.compareAndSet(false, true)) { proxy.close(); return@setAnalyzer }
                    scanner.process(InputImage.fromMediaImage(image, proxy.imageInfo.rotationDegrees)).addOnSuccessListener { codes ->
                        codes.firstOrNull { it.format == Barcode.FORMAT_QR_CODE }?.rawValue?.let { code ->
                            val now = SystemClock.elapsedRealtime()
                            if (code != lastCode.get() || now - lastAt.get() > 1800) { lastCode.set(code); lastAt.set(now); latestOnCode(code) }
                        }
                    }.addOnCompleteListener { proxy.close(); busy.set(false) }
                }
                provider.unbindAll(); provider.bindToLifecycle(lifecycle, CameraSelector.DEFAULT_BACK_CAMERA, cameraPreview, analysis)
            }, ContextCompat.getMainExecutor(viewContext))
        }
    }, modifier = Modifier.fillMaxSize())
}

@Composable private fun ManualScreen(onBack: () -> Unit, onCode: (String) -> Unit, loading: Boolean) {
    var code by rememberSaveable { mutableStateOf("") }
    Column(Modifier.fillMaxSize().background(canvas).padding(22.dp)) {
        IconButton(onClick = onBack, modifier = Modifier.background(Color.White, CircleShape)) { Icon(Icons.Default.ArrowBack, "Back", tint = ink) }
        Text("LITTX", color = blue, fontWeight = FontWeight.Black, letterSpacing = 2.sp, fontSize = 12.sp, modifier = Modifier.padding(top = 42.dp))
        Text("Enter ticket code", color = ink, fontSize = 29.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp))
        Text("Type the ticket code manually to validate.", color = muted, modifier = Modifier.padding(top = 8.dp))
        OutlinedTextField(value = code, onValueChange = { code = it.uppercase() }, modifier = Modifier.fillMaxWidth().padding(top = 27.dp), placeholder = { Text("e.g. NX-84921-X92") }, singleLine = true, shape = RoundedCornerShape(19.dp), keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Done), leadingIcon = { Icon(Icons.Default.ConfirmationNumber, null, tint = blue) })
        Button(onClick = { onCode(code.trim()) }, enabled = code.isNotBlank() && !loading, modifier = Modifier.fillMaxWidth().padding(top = 13.dp).height(57.dp), shape = RoundedCornerShape(18.dp), colors = ButtonDefaults.buttonColors(containerColor = ink)) { if (loading) CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp) else Text("Validate ticket", fontWeight = FontWeight.Bold) }
        Spacer(Modifier.weight(1f))
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(17.dp)).background(Color.White).padding(14.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.VerifiedUser, null, tint = green); Text("Validation is confirmed securely by LITTX.", color = muted, fontSize = 12.sp, modifier = Modifier.padding(start = 10.dp)) }
    }
}

@Composable private fun ResultScreen(entry: ScanEntry, error: String?, onNext: () -> Unit, onDetails: () -> Unit) {
    val approved = entry.outcome == ScanOutcome.APPROVED
    val duplicate = entry.outcome == ScanOutcome.DUPLICATE
    val color = if (approved) green else if (duplicate) amber else red
    val title = when { approved -> "ENTRY APPROVED"; duplicate -> "ALREADY SCANNED"; else -> "ENTRY DENIED" }
    val subtitle = when { approved -> "Ticket verified. Allow entry."; duplicate -> "This ticket has already been used."; entry.outcome == ScanOutcome.ERROR -> error ?: "Couldn't validate this ticket."; else -> error ?: "This ticket isn't valid or has expired." }
    val scale by animateFloatAsState(if (approved) 1f else .96f, tween(320), label = "result")
    Column(Modifier.fillMaxSize().background(if (approved) Color(0xFF061D1C) else Color(0xFF1E101A)).padding(22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(54.dp)); Text("LITTX", color = Color.White.copy(.75f), fontSize = 13.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp)
        Box(Modifier.padding(top = 34.dp).size(128.dp).scale(scale).clip(CircleShape).background(color.copy(.13f)).border(2.dp, color.copy(.7f), CircleShape), contentAlignment = Alignment.Center) { Icon(if (approved) Icons.Default.Check else Icons.Default.Close, null, tint = color, modifier = Modifier.size(69.dp)) }
        Text(title, color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Black, letterSpacing = .5.sp, modifier = Modifier.padding(top = 24.dp))
        Text(subtitle, color = Color.White.copy(.73f), fontSize = 14.sp, modifier = Modifier.padding(top = 7.dp))
        TicketCard(entry, color, Modifier.padding(top = 23.dp))
        Spacer(Modifier.weight(1f))
        if (!approved) TextButton(onClick = onDetails, modifier = Modifier.fillMaxWidth()) { Text("View scan details", color = Color.White.copy(.8f)) }
        Button(onClick = onNext, modifier = Modifier.fillMaxWidth().height(59.dp), colors = ButtonDefaults.buttonColors(containerColor = color), shape = RoundedCornerShape(19.dp)) { Text(if (approved) "Scan next ticket" else "Scan again", color = Color(0xFF10182A), fontWeight = FontWeight.Black) }
    }
}

@Composable private fun TicketCard(entry: ScanEntry, color: Color, modifier: Modifier = Modifier) {
    val ticket = entry.ticket
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(23.dp)).background(Color.White.copy(.08f)).border(1.dp, Color.White.copy(.15f), RoundedCornerShape(23.dp)).padding(18.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
        Text(ticket?.event ?: "Ticket validation", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
        Line("Ticket code", ticket?.id?.ifBlank { entry.rawCode } ?: entry.rawCode)
        Line("Holder", ticket?.attendee ?: "—")
        Line("Ticket type", ticket?.ticketType ?: "—")
        Line("Scan time", time(entry.scannedAt))
        Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(7.dp).background(color, CircleShape)); Text(entry.outcome.name.replace('_', ' '), color = color, fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.sp, modifier = Modifier.padding(start = 7.dp)) }
    }
}
@Composable private fun Line(label: String, value: String) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { Text(label, color = Color.White.copy(.58f), fontSize = 12.sp); Text(value, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 190.dp)) } }

@Composable private fun HistoryScreen(history: List<ScanEntry>, onBack: () -> Unit, onSelect: (ScanEntry) -> Unit) {
    var filter by rememberSaveable { mutableStateOf("All") }
    val visible = history.filter { filter == "All" || if (filter == "Approved") it.outcome == ScanOutcome.APPROVED else it.outcome != ScanOutcome.APPROVED }
    Column(Modifier.fillMaxSize().background(canvas)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 15.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Back", tint = ink) }; Column(Modifier.padding(start = 4.dp)) { Text("LITTX", color = blue, fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.6.sp); Text("Ticket history", color = ink, fontSize = 22.sp, fontWeight = FontWeight.Bold); Text("Scans saved on this device", color = muted, fontSize = 12.sp) } }
        Row(Modifier.padding(horizontal = 20.dp).clip(RoundedCornerShape(15.dp)).background(Color(0xFFE8ECF4)).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            listOf("All", "Approved", "Failed").forEach { choice ->
                val selected = filter == choice
                Box(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(if (selected) Color.White else Color.Transparent).clickable { filter = choice }.padding(vertical = 10.dp), contentAlignment = Alignment.Center) { Text(choice, color = if (selected) ink else muted, fontSize = 12.sp, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium) }
            }
        }
        if (visible.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(30.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(74.dp).background(Color.White, CircleShape), contentAlignment = Alignment.Center) { Icon(if (history.isEmpty()) Icons.Default.QrCodeScanner else Icons.Default.FilterList, null, tint = blue, modifier = Modifier.size(32.dp)) }
                Text(if (history.isEmpty()) "No scans yet" else "No matching scans", color = ink, fontWeight = FontWeight.Bold, fontSize = 20.sp, modifier = Modifier.padding(top = 16.dp))
                Text(if (history.isEmpty()) "Scanned tickets will appear here on this device." else "Choose another filter to see scan records.", color = muted, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp))
            }
        } else LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) { items(visible) { entry -> HistoryCard(entry) { onSelect(entry) } } }
    }
}

@Composable private fun HistoryCard(entry: ScanEntry, click: () -> Unit) {
    val color = when (entry.outcome) { ScanOutcome.APPROVED -> green; ScanOutcome.DUPLICATE -> amber; else -> red }
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(19.dp)).background(Color.White).border(1.dp, Color(0xFFE8ECF4), RoundedCornerShape(19.dp)).clickable(onClick = click).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(40.dp).background(color.copy(.13f), CircleShape), contentAlignment = Alignment.Center) { Icon(if (entry.outcome == ScanOutcome.APPROVED) Icons.Default.Check else Icons.Default.PriorityHigh, null, tint = color, modifier = Modifier.size(20.dp)) }
        Column(Modifier.padding(start = 12.dp).weight(1f)) {
            Text(entry.ticket?.attendee ?: entry.rawCode, color = ink, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${entry.ticket?.ticketType ?: "Ticket"} · ${time(entry.scannedAt)}", color = muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(if (entry.outcome == ScanOutcome.APPROVED) "APPROVED" else "FAILED", color = color, fontSize = 9.sp, fontWeight = FontWeight.Black, letterSpacing = .5.sp)
    }
}

@Composable private fun DetailScreen(entry: ScanEntry, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize().background(canvas).padding(22.dp)) {
        IconButton(onClick = onBack, modifier = Modifier.background(Color.White, CircleShape)) { Icon(Icons.Default.ArrowBack, "Back", tint = ink) }
        Text("LITTX · SCAN RECORD", color = blue, fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.6.sp, modifier = Modifier.padding(top = 34.dp))
        Text("Ticket details", color = ink, fontSize = 28.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))
        TicketDetail(entry)
    }
}
@Composable private fun TicketDetail(entry: ScanEntry) {
    val ticket = entry.ticket
    Column(Modifier.fillMaxWidth().padding(top = 22.dp).clip(RoundedCornerShape(23.dp)).background(Color.White).border(1.dp, Color(0xFFE8ECF4), RoundedCornerShape(23.dp)).padding(19.dp), verticalArrangement = Arrangement.spacedBy(17.dp)) {
        val color = if (entry.outcome == ScanOutcome.APPROVED) green else red
        Text(entry.outcome.name.replace('_', ' '), color = color, fontWeight = FontWeight.Black, letterSpacing = 1.sp)
        Text(ticket?.event ?: "Ticket validation", color = ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        LineLight("Ticket code", ticket?.id?.ifBlank { entry.rawCode } ?: entry.rawCode)
        LineLight("Ticket holder", ticket?.attendee ?: "—")
        LineLight("Ticket type", ticket?.ticketType ?: "—")
        LineLight("Ticket status", ticket?.status ?: entry.outcome.name.lowercase())
        LineLight("Scanned", time(entry.scannedAt))
        LineLight("Scanner", ticket?.scannedBy ?: "This device")
    }
}
@Composable private fun LineLight(label: String, value: String) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { Text(label, color = muted, fontSize = 12.sp); Text(value, color = ink, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 185.dp)) } }
private fun time(value: Long) = SimpleDateFormat("dd MMM · h:mm a", Locale.getDefault()).format(Date(value))
