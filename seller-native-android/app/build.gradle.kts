import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use(::load)
}
fun configured(name: String): String =
    (providers.gradleProperty(name).orNull ?: System.getenv(name) ?: localProperties.getProperty(name) ?: "")
val signingStore = configured("SELLER_SIGNING_STORE_FILE")
val signingStorePassword = configured("SELLER_SIGNING_STORE_PASSWORD")
val signingKeyAlias = configured("SELLER_SIGNING_KEY_ALIAS")
val signingKeyPassword = configured("SELLER_SIGNING_KEY_PASSWORD")
val hasReleaseSigning = listOf(signingStore, signingStorePassword, signingKeyAlias, signingKeyPassword).all { it.isNotBlank() }

android {
    namespace = "com.littx.seller.nativeapp"
    compileSdk = 35

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.littx.seller.nativeapp"
        minSdk = 26
        targetSdk = 35
        versionCode = configured("SELLER_VERSION_CODE").toIntOrNull() ?: 1
        versionName = configured("SELLER_VERSION_NAME").ifBlank { "1.0.0" }
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "SELLER_API_BASE_URL", "\"${configured("SELLER_API_BASE_URL").trimEnd('/')}\"")
        buildConfigField("String", "SELLER_UPDATE_REPOSITORY", "\"${configured("SELLER_UPDATE_REPOSITORY").trim()}\"")
    }
    buildFeatures { compose = true; buildConfig = true }
    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = rootProject.file(signingStore)
                storePassword = signingStorePassword
                keyAlias = signingKeyAlias
                keyPassword = signingKeyPassword
            }
        }
    }
    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            buildConfigField("boolean", "ALLOW_RUNTIME_ENDPOINT_OVERRIDE", "true")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("boolean", "ALLOW_RUNTIME_ENDPOINT_OVERRIDE", "false")
            if (hasReleaseSigning) signingConfig = signingConfigs.getByName("release")
        }
    }
}

kotlin {
    jvmToolchain(17)
}

tasks.configureEach {
    if (name.contains("Release", ignoreCase = true)) {
        doFirst {
            check(hasReleaseSigning) { "Refusing unsigned/debug-key release output. Supply protected SELLER_SIGNING_* values." }
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.navigation:navigation-compose:2.8.5")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
}
