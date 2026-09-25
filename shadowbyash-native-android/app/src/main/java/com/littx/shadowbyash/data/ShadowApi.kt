package com.littx.shadowbyash.data
import retrofit2.http.*
data class LoginReq(val password:String); data class LoginRes(val success:Boolean=false,val shadowToken:String?=null,val message:String?=null)
data class Tier(val name:String="",val price:Double=0.0); data class Event(val name:String="",val tiers:List<Tier> = emptyList())
data class PricingRes(val events:List<Event> = emptyList())
data class Sale(val name:String="",val email:String="",val ticketId:String="",val ticketType:String="",val quantity:Int=1,val amount:Double=0.0,val commissionAmount:Double=0.0,val shadowPaymentStatus:String="paid")
data class SalesRes(val sales:List<Sale> = emptyList(),val shadowRevenue:Double=0.0,val shadowRevenueAfterCommission:Double=0.0)
data class TicketReq(val name:String,val email:String,val phone:String,val ticketType:String,val quantity:Int,val event:String,val shadowPaymentStatus:String,val commissionPercentage:Double,val commissionAmount:Double)
data class TicketRes(val success:Boolean=false,val ticketId:String?=null,val message:String?=null)
interface ShadowApi { @POST("api/shadow/login") suspend fun login(@Body body:LoginReq):LoginRes; @GET("api/shadow/pricing") suspend fun pricing(@Header("x-shadow-token") token:String):PricingRes; @GET("api/shadow/sales") suspend fun sales(@Header("x-shadow-token") token:String):SalesRes; @POST("api/shadow/generate-ticket") suspend fun ticket(@Header("x-shadow-token") token:String,@Body body:TicketReq):TicketRes }
