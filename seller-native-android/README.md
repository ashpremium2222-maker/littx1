# LITTX Seller Native Android

This is a standalone Kotlin/Jetpack Compose Android application. It does not contain a WebView, Capacitor, React, browser runtime, or dynamically executed code. It does not modify `staging/`, the existing seller web portal, the existing API, or the database.

## What it currently connects to

The app uses the existing seller endpoints:

- `POST /api/seller/login-step1` and `POST /api/seller/login-step2`
- `GET /api/seller/verify-session`
- `POST /api/seller/logout`
- `POST /api/admin/generate-ticket`
- `GET /api/seller/sales`
- `GET /api/mobile/seller-config` (native-only, authenticated remote configuration)

Login uses Android Credential Manager/FIDO2 passkeys natively. Its registration and assertion JSON are submitted to the existing SimpleWebAuthn server endpoints; no browser is opened. This preserves the server’s existing passkey/device enrollment authority. Existing web passkeys must be re-enrolled on Android, because WebAuthn credentials are authenticator- and relying-party-bound; use the current admin **reset passkey** action only for the intended seller.

Before enabling Android passkeys, host an Android Digital Asset Links document at `https://<WEBAUTHN_RP_ID>/.well-known/assetlinks.json`. It must name `in.littx.seller.nativeapp` and the SHA-256 fingerprint of the **release signing certificate**. This is a deployment prerequisite, not a client-side bypass; the existing server must continue validating its configured WebAuthn origin and relying-party ID.

## Build locally

Install Android Studio with Android SDK Platform 35 and JDK 17. Copy `local.properties.example` to `local.properties` and set the HTTPS API URL. `local.properties` is intentionally ignored.

Open this folder in Android Studio and run the `app` configuration, or use a locally installed Gradle 8.11+:

```powershell
gradle :app:assembleDebug
gradle :app:bundleRelease -PSELLER_API_BASE_URL=https://seller-api.example.com/ -PSELLER_SIGNING_STORE_FILE=C:\secure\seller-upload.jks -PSELLER_SIGNING_STORE_PASSWORD=... -PSELLER_SIGNING_KEY_ALIAS=... -PSELLER_SIGNING_KEY_PASSWORD=...
```

Also set `SELLER_UPDATE_REPOSITORY=owner/repository` when you want the in-app GitHub Release update prompt.

The release task deliberately fails unless all signing values are supplied. Store those values in protected CI secrets, not command history or Git. Do not distribute debug builds.

## Security boundaries

- Production endpoints must be HTTPS; cleartext traffic is rejected by both manifest and networking initialization.
- Tokens are stored only in `EncryptedSharedPreferences`, protected by an Android Keystore master key. Passwords are never persisted.
- API base URL is compile-time configuration. A real production build must set `SELLER_API_BASE_URL`; it is not an app setting and cannot be redirected at runtime.
- Authentication and ticket issuance are server-confirmed. A local success message is shown only after a successful server response.
- Backups are disabled. Release builds enable R8/resource shrinking and omit network request logging.

Certificate pinning is deliberately not hardcoded until the production API hostname and backup pin are provided. Incorrect pins would create an outage and could weaken rotation safety. Add a primary and backup SPKI pin in the release CI configuration before production rollout.

## Release and updates

Use Google Play App Signing and Play In-App Updates for public distribution. CI should inject the upload keystore and passwords from a protected secret manager, increment `versionCode`, create an AAB, and upload it to an internal track before wider rollout. No signing key, password, API secret, database credential, or production token belongs in Git.

For a private distribution, publish only an APK signed by the same release key and use a server-delivered, signed update manifest containing version, SHA-256, mandatory flag, and download URL. Android still verifies the signer during installation. Never download or execute code from the manifest.

For GitHub Releases, set `SELLER_UPDATE_REPOSITORY` to the public `owner/repository` path. The app compares the latest `seller-vX.Y.Z` release, displays an update prompt, and opens the official APK asset only after the seller chooses **Update**. Android rejects an APK that is not signed with the same app certificate. Never put a GitHub access token inside the APK.

Backend/configuration updates can be made without an app release only when supplied by authenticated server APIs. Kotlin/UI/security changes require a new signed APK/AAB.

## Instant seller content changes

Edit `staging/server/config/seller-mobile.json`, commit and deploy the backend. The native app fetches this protected configuration at sign-in and when the seller taps **Refresh**. This controls the displayed event, pass list, prices, and feature flags. The ticket-generation API remains the source of truth and independently validates ticket types/prices, so a changed app configuration cannot change the charged amount by itself.

## Required production hardening before release

The existing server currently accepts browser-style bearer sessions. Before production rollout, add a versioned native mobile auth contract with short-lived access tokens, rotating refresh tokens, token hashes at rest, device-key binding, replay-resistant challenges, and server-side revocation. This app intentionally does not change those endpoints so the current system remains unaffected.
