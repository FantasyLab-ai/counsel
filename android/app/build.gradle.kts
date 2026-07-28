plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ai.fantasylab.counsel"
    compileSdk = 34

    defaultConfig {
        // .engine suffix: this is the aurora-core spike APK — the REAL app
        // (Capacitor shell in mobile/) owns the canonical ai.fantasylab.counsel
        applicationId = "ai.fantasylab.counsel.engine"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    // uniffi's Kotlin bindings talk to the Rust cdylib through JNA.
    implementation("net.java.dev.jna:jna:5.14.0@aar")
}
