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
        versionCode = 2
        versionName = "0.2.0"
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
