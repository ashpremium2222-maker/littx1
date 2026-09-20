# LITTX Scanner Native Android

Standalone native Kotlin/Jetpack Compose scanner application. It is a different
Android app from the seller application and does not use a WebView or Capacitor.

## Features

- CameraX + ML Kit QR-code scanning
- Manual ticket-code validation
- Server-authoritative validation using `POST /api/scan-ticket`
- Distinct approved, invalid, and duplicate-ticket results
- On-device history of up to 250 scan attempts
- A camera permission flow and secure HTTPS-only API configuration
- GitHub Release update prompt for later scanner APK releases

## Local build

Copy `local.properties.example` to `local.properties`, add the Android SDK path,
and point `SCANNER_API_BASE_URL` to the HTTPS LITTX API.
Set `SCANNER_UPDATE_REPOSITORY` to the public `owner/repository` that hosts
`scanner-vX.Y.Z` releases.

```powershell
gradle :app:assembleDebug
gradle :app:bundleRelease -PSCANNER_API_BASE_URL=https://www.littx.in/ -PSCANNER_SIGNING_STORE_FILE=C:\secure\scanner-upload.jks -PSCANNER_SIGNING_STORE_PASSWORD=... -PSCANNER_SIGNING_KEY_ALIAS=... -PSCANNER_SIGNING_KEY_PASSWORD=...
```

Release builds deliberately require explicit signing inputs. Keep signing
credentials out of source control and distribute only signed release artifacts.
