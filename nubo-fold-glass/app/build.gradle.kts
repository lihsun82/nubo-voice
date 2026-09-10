plugins {
    id("com.android.application")
}

android {
    namespace = "com.ainubo.foldglass"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.ainubo.foldglass"
        minSdk = 31
        targetSdk = 36
        versionCode = 7
        versionName = "0.7.0"
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
}

dependencies {
    implementation("dev.rikka.shizuku:api:13.1.5")
    implementation("dev.rikka.shizuku:provider:13.1.5")
}
