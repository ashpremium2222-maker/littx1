package in.littx.seller.nativeapp.security

import android.content.Context
import androidx.credentials.*
import com.google.gson.JsonParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Native Android FIDO2/WebAuthn client; no browser or WebView is used. */
class PasskeyAuthenticator(private val context: Context) {
    suspend fun complete(optionsJson: String, registration: Boolean): String = withContext(Dispatchers.Main) {
        val manager = CredentialManager.create(context)
        if (registration) {
            val result = manager.createCredential(context, CreatePublicKeyCredentialRequest(optionsJson))
            (result as CreatePublicKeyCredentialResponse).registrationResponseJson
        } else {
            val result = manager.getCredential(context, GetCredentialRequest(listOf(GetPublicKeyCredentialOption(optionsJson))))
            (result.credential as PublicKeyCredential).authenticationResponseJson
        }
    }
    fun json(value: String) = JsonParser.parseString(value).asJsonObject
}
