import java.util.Properties
plugins { id("com.android.application"); id("org.jetbrains.kotlin.android"); id("org.jetbrains.kotlin.plugin.compose") }
android {
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 namespace = "com.littx.shadowbyash"; compileSdk = 35
 defaultConfig { applicationId = "com.littx.shadowbyash"; minSdk = 26; targetSdk = 35; versionCode = 3; versionName = "1.2.0" }
 buildFeatures { compose = true; buildConfig = true }
 val props = Properties().apply { val f = rootProject.file("local.properties"); if (f.exists()) f.inputStream().use { load(it) } }
 buildTypes { release { isMinifyEnabled = false; val store=props.getProperty("SHADOW_SIGNING_STORE_FILE"); val pass=props.getProperty("SHADOW_SIGNING_STORE_PASSWORD"); val alias=props.getProperty("SHADOW_SIGNING_KEY_ALIAS"); val keyPass=props.getProperty("SHADOW_SIGNING_KEY_PASSWORD"); if(store!=null&&pass!=null&&alias!=null&&keyPass!=null) signingConfig=signingConfigs.create("shadowRelease").apply{storeFile=file(store);storePassword=pass;keyAlias=alias;this.keyPassword=keyPass} } }
 buildTypes.all { buildConfigField("String","SHADOW_API_BASE_URL","\"https://www.littx.in/\"") }
}
dependencies { implementation(platform("androidx.compose:compose-bom:2024.12.01")); implementation("androidx.core:core-ktx:1.15.0"); implementation("androidx.activity:activity-compose:1.10.0"); implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7"); implementation("androidx.compose.ui:ui"); implementation("androidx.compose.ui:ui-tooling-preview"); implementation("androidx.compose.material3:material3"); implementation("androidx.compose.material:material-icons-extended"); implementation("androidx.security:security-crypto:1.1.0-alpha06"); implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0"); implementation("com.squareup.retrofit2:retrofit:2.11.0"); implementation("com.squareup.retrofit2:converter-gson:2.11.0"); implementation("com.squareup.okhttp3:logging-interceptor:4.12.0"); debugImplementation("androidx.compose.ui:ui-tooling") }



