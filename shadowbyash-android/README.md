# Shadow by Ash Android

Native Android client for `/shadowbyash`. The source, logo, Gradle wrapper, and release build configuration live in this directory.

Features include the black and silver sales desk, authenticated login, live events and pass prices, customer name/email/phone, quantity, Paid or Free / Chai Pani, percentage or custom commission, revenue totals, India-time order timestamps, and ticket history. Selecting a quantity creates that many individual one-ticket orders and sends each ticket separately. Sales history supports disabling/enabling or permanently deleting a ticket.

Build locally with `./gradlew :app:assembleRelease`. The signing key is kept outside Git and read from `local.properties`. GitHub Actions builds a debug APK and stores it as an artifact on project changes.
