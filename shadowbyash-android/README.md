# Shadow by Ash Android

Native Android client for `/shadowbyash`. The source, logo, Gradle wrapper, and release build configuration live in this directory.

Features include the black and silver sales desk, authenticated login, live events and pass prices, customer name/email/phone, quantity, Paid or Free / Chai Pani, percentage or custom commission, revenue totals, India-time order timestamps, and ticket history. Selecting a quantity creates that many individual one-ticket orders and sends each ticket separately. Sales history supports disabling/enabling or permanently deleting a ticket.

Build locally with `gradlew.bat :app:assembleRelease` on Windows or `bash ./gradlew :app:assembleRelease` on Linux/macOS. The signing key is kept outside Git and read from `local.properties`. GitHub Actions builds a debug APK and stores it as an artifact on project changes.

Tagged signed releases use the same persistent key. Configure repository Actions secrets `SHADOW_SIGNING_KEYSTORE_BASE64`, `SHADOW_SIGNING_STORE_PASSWORD`, `SHADOW_SIGNING_KEY_ALIAS`, and `SHADOW_SIGNING_KEY_PASSWORD` before using the release workflow.
