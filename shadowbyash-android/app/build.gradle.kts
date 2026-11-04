import java.util.Properties
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}
android {
    namespace = "com.littx.shadowbyash"
    compileSdk = 35
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    defaultConfig {
        applicationId = "com.littx.shadowbyash"
        minSdk = 26
        targetSdk = 35
        versionCode = 7
        versionName = "1.4.2"
        buildConfigField("String", "SHADOW_API_BASE_URL", "\"https://www.littx.in/\"")
    }
    buildFeatures { compose = true; buildConfig = true }
    val signingProps = Properties().apply {
        val file = rootProject.file("local.properties")
        if (file.exists()) file.inputStream().use { load(it) }
    }
    val storePath = signingProps.getProperty("SHADOW_SIGNING_STORE_FILE")
    val signingPassword = signingProps.getProperty("SHADOW_SIGNING_STORE_PASSWORD")
    val signingAlias = signingProps.getProperty("SHADOW_SIGNING_KEY_ALIAS")
    val keyPassword = signingProps.getProperty("SHADOW_SIGNING_KEY_PASSWORD")
    val releaseSigning = if (storePath != null && signingPassword != null && signingAlias != null && keyPassword != null) {
        signingConfigs.create("release").apply {
            storeFile = file(storePath)
            storePassword = signingPassword
            keyAlias = signingAlias
            this.keyPassword = keyPassword
        }
    } else null
    buildTypes { release { isMinifyEnabled = false; if (releaseSigning != null) signingConfig = releaseSigning } }
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
