package com.littx.seller.nativeapp.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.littx.seller.nativeapp.data.model.Partner

class SecureSessionStore(context: Context) {
    private val prefs = EncryptedSharedPreferences.create(
        context, "seller_session", MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    fun token(): String? = prefs.getString("access_token", null)
    fun partner(): Partner? {
        val id = prefs.getString("partner_id", null) ?: return null
        return Partner(id, prefs.getString("partner_name", "Seller") ?: "Seller")
    }
    fun save(token: String, partner: Partner) = prefs.edit().putString("access_token", token).putString("partner_id", partner.id).putString("partner_name", partner.name).apply()
    fun clear() = prefs.edit().clear().apply()
}
