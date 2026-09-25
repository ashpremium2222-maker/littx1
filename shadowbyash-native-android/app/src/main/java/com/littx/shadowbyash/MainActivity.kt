package com.littx.shadowbyash
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.littx.shadowbyash.data.*
import kotlinx.coroutines.launch
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

private val bg=Color(0xff09090b); private val fg=Color(0xffe5e7eb); private val muted=Color(0xffa1a1aa)
private val api=Retrofit.Builder().baseUrl(BuildConfig.SHADOW_API_BASE_URL).addConverterFactory(GsonConverterFactory.create()).build().create(ShadowApi::class.java)
class MainActivity:ComponentActivity(){override fun onCreate(b:Bundle?){super.onCreate(b);setContent{App()}}}
@Composable fun App(){var token by remember{mutableStateOf<String?>(null)};if(token==null)Login{token=it}else Home(token!!){token=null}}
@Composable fun Login(ok:(String)->Unit){var pass by remember{mutableStateOf("")};var msg by remember{mutableStateOf("")};val scope=rememberCoroutineScope();Surface(color=bg){Column(Modifier.fillMaxSize().padding(24.dp),horizontalAlignment=Alignment.CenterHorizontally){Spacer(Modifier.height(28.dp));Image(painterResource(R.drawable.shadow_by_ash_logo),null,Modifier.height(260.dp));Text("SHADOW SALES PANEL",color=fg,letterSpacing=4.sp);Spacer(Modifier.height(30.dp));Card{Column(Modifier.padding(24.dp)){Text("Operator access",color=fg,fontSize=28.sp);Text("Sign in to manage ticket sales and customers.",color=muted,modifier=Modifier.padding(vertical=12.dp));OutlinedTextField(pass,{pass=it},label={Text("Access password")},singleLine=true);Button({scope.launch{runCatching{api.login(LoginReq(pass))}.onSuccess{if(it.success&&it.shadowToken!=null)ok(it.shadowToken)else msg=it.message?:"Access denied"}.onFailure{msg="Unable to connect"}}},Modifier.fillMaxWidth().padding(top=16.dp)){Text("AUTHENTICATE  →")};Text(msg,color=Color.Red)}}}}}
@Composable fun Home(token:String,logout:()->Unit){var tab by remember{mutableIntStateOf(0)};var sales by remember{mutableStateOf(SalesRes())};var pricing by remember{mutableStateOf(PricingRes())};val scope=rememberCoroutineScope();LaunchedEffect(Unit){runCatching{sales=api.sales(token);pricing=api.pricing(token)}};Scaffold(containerColor=bg,bottomBar={NavigationBar{listOf("Overview" to Icons.Default.Dashboard,"Issue ticket" to Icons.Default.AddCard,"Sales" to Icons.Default.ReceiptLong).forEachIndexed{ i,p->NavigationBarItem(selected=tab==i,onClick={tab=i},icon={Icon(p.second,p.first)},label={Text(p.first)})}}}){pad->Column(Modifier.padding(pad).fillMaxSize().padding(20.dp)){Row(Modifier.fillMaxWidth(),Arrangement.SpaceBetween){Column{Text("SHADOW",color=fg,fontSize=30.sp,letterSpacing=5.sp);Text("BY ASH  ·  ${if(tab==1)"NEW TICKET" else if(tab==2)"ORDER HISTORY" else "SALES DESK"}",color=muted)};IconButton(logout){Icon(Icons.Default.Logout,"Logout",tint=fg)}};when(tab){0->Overview(sales){tab=1};1->Ticket(token,pricing){scope.launch{sales=api.sales(token)}};2->Sales(sales)}}}}
@Composable fun Overview(s:SalesRes,issue:()->Unit){LazyColumn(verticalArrangement=Arrangement.spacedBy(14.dp)){item{Card{Column(Modifier.padding(24.dp)){Text("YOUR SALES, AT A GLANCE",color=muted,letterSpacing=3.sp);Text("The night starts here.",color=fg,fontSize=32.sp,modifier=Modifier.padding(vertical=14.dp));Button(issue){Text("＋  Issue a ticket")}}}};item{Text("TOTAL REVENUE  ₹${"%.2f".format(s.shadowRevenue)}",color=fg,fontSize=22.sp)};item{Text("AFTER COMMISSION  ₹${"%.2f".format(s.shadowRevenueAfterCommission)}",color=muted,fontSize=18.sp)};items(s.sales.take(5)){Sale(it)}}}
@Composable fun Sale(s:Sale){Card{Column(Modifier.padding(18.dp)){Row(Modifier.fillMaxWidth(),Arrangement.SpaceBetween){Text(s.name,color=fg,fontSize=19.sp);Text("₹${"%.2f".format(s.amount)}",color=fg)};Text("${s.ticketType} · ${s.quantity} ticket",color=muted);Text("Ticket ${s.ticketId}",color=muted);if(s.shadowPaymentStatus=="free_chai_pani")Text("FREE / CHAI PANI",color=fg)}}}
@Composable fun Ticket(token:String,p:PricingRes,refresh:()->Unit){var name by remember{mutableStateOf("")};var email by remember{mutableStateOf("")};var free by remember{mutableStateOf(false)};var commission by remember{mutableStateOf("0%")};var custom by remember{mutableStateOf("")};var done by remember{mutableStateOf<String?>(null)};val scope=rememberCoroutineScope();val event=p.events.firstOrNull();val tier=event?.tiers?.firstOrNull();val rate=if(commission=="Custom")custom.toDoubleOrNull()?:0.0 else commission.dropLast(1).toDoubleOrNull()?:0.0;val total=if(free)0.0 else tier?.price?:0.0;LazyColumn(verticalArrangement=Arrangement.spacedBy(12.dp)){item{Text("CUSTOMER DETAILS",color=muted,letterSpacing=3.sp)};item{OutlinedTextField(name,{name=it},label={Text("Customer name")},modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(email,{email=it},label={Text("Email address")},modifier=Modifier.fillMaxWidth())};item{Text("PAYMENT STATUS",color=muted)};item{Row{FilterChip(!free,{free=false},{Text("Paid")});Spacer(Modifier.width(8.dp));FilterChip(free,{free=true},{Text("Free / Chai Pani")})}};item{Text("COMMISSION",color=muted)};item{Row{listOf("0%","5%","10%","15%","20%","Custom").forEach{v->FilterChip(commission==v,{commission=v},{Text(v)});Spacer(Modifier.width(4.dp))}}};if(commission=="Custom")item{OutlinedTextField(custom,{custom=it},label={Text("Custom percentage")})};item{Text("TOTAL ₹${"%.2f".format(total)}  ·  AFTER COMMISSION ₹${"%.2f".format(total*(1-rate/100))}",color=fg)};item{Button({scope.launch{runCatching{api.ticket(token,TicketReq(name,email,"",tier?.name?:"Ticket",1,event?.name?:"",if(free)"free_chai_pani" else "paid",if(free)0.0 else rate,if(free)0.0 else total*rate/100))}.onSuccess{if(it.success){done=it.ticketId;refresh()}}}},enabled=name.isNotBlank()&&email.isNotBlank(),modifier=Modifier.fillMaxWidth()){Text("CREATE & SEND TICKET 🚀")}};if(done!=null)item{AnimatedVisibility(true,enter=fadeIn()+scaleIn()){Card{Column(Modifier.padding(24.dp),horizontalAlignment=Alignment.CenterHorizontally){Icon(Icons.Default.CheckCircle,"Created",tint=fg,modifier=Modifier.size(64.dp));Text("TICKET CREATED",color=fg);Text(done?:"",color=muted);TextButton({done=null}){Text("Issue another ticket")}}}}}}}
@Composable fun Sales(s:SalesRes){LazyColumn(verticalArrangement=Arrangement.spacedBy(12.dp)){item{Text("ORDER HISTORY",color=muted,letterSpacing=3.sp)};item{Text("Revenue ₹${"%.2f".format(s.shadowRevenue)} · After commission ₹${"%.2f".format(s.shadowRevenueAfterCommission)}",color=fg)};items(s.sales){Sale(it)}}}


