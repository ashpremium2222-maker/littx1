# Shadow by Ash Android

Source is kept in this folder so future updates do not lose the project. The Compose UI mirrors the Shadow sales desk: dark cards, logo login, Overview, Issue ticket, and Sales tabs.

The ticket screen supports Paid and Free / Chai Pani, commissions of 0%, 5%, 10%, 15%, 20%, or a custom percentage, and shows the net amount. A silver animated check confirms each generated ticket.

## Build

`./gradlew :app:assembleDebug`

The GitHub Actions workflow builds and uploads a debug APK on changes to this folder. Release signing uses the existing local keystore through ignored `local.properties` keys (`shadow.storeFile`, `shadow.storePassword`, `shadow.keyAlias`, `shadow.keyPassword`).
