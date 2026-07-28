import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Datos de la firma de publicación. Viven FUERA del repositorio (key.properties
// está en .gitignore) porque quien tenga esa clave puede publicar
// actualizaciones en nombre de la app.
val propsFirma = Properties()
val archivoFirma = rootProject.file("key.properties")
if (archivoFirma.exists()) {
    propsFirma.load(FileInputStream(archivoFirma))
}

android {
    namespace = "com.jamzsoftware.metaagente_movil"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        // Requerido por flutter_local_notifications (APIs de java.time en Android viejo).
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.jamzsoftware.metaagente_movil"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (archivoFirma.exists()) {
                storeFile = file(propsFirma["storeFile"] as String)
                storePassword = propsFirma["storePassword"] as String
                keyAlias = propsFirma["keyAlias"] as String
                keyPassword = propsFirma["keyPassword"] as String
            }
        }
    }

    buildTypes {
        release {
            // Firma REAL de publicación. Con la clave de depuración la app no se
            // podía actualizar (habría que desinstalarla) ni publicar.
            signingConfig = if (archivoFirma.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
