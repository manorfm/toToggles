plugins {
    kotlin("jvm") version "2.4.10"
    id("maven-publish")
    id("jacoco")
    id("com.vanniktech.maven.publish") version "0.37.0"
}

group = "io.github.manorfm"
version = "1.0.0"

repositories {
    mavenCentral()
}

dependencies {
    // Kotlin
    implementation("org.jetbrains.kotlin:kotlin-stdlib")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    
    // HTTP Client
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    
    // JSON
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.15.3")
    implementation("com.fasterxml.jackson.core:jackson-core:2.15.3")
    implementation("com.fasterxml.jackson.core:jackson-databind:2.15.3")
    
    // Logging
    implementation("org.slf4j:slf4j-api:2.0.9")
    implementation("ch.qos.logback:logback-classic:1.4.11")
    
    // Testing
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.0")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation("org.mockito.kotlin:mockito-kotlin:5.1.0")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
    testImplementation("org.assertj:assertj-core:3.24.2")
}

tasks.test {
    useJUnitPlatform()
    finalizedBy(tasks.jacocoTestReport)
}

tasks.jacocoTestReport {
    dependsOn(tasks.test)
    reports {
        xml.required.set(true)
        html.required.set(true)
    }
}

jacoco {
    toolVersion = "0.8.11"
}

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
    withSourcesJar()
    withJavadocJar()
}

kotlin {
    jvmToolchain(21)
}

// Publishes to Maven Central via the Sonatype Central Portal. Credentials/signing key come from
// env vars the release workflow sets (ORG_GRADLE_PROJECT_mavenCentralUsername/Password,
// ORG_GRADLE_PROJECT_signingInMemoryKey/KeyPassword) — see .github/workflows/totoggle-java-release.yml.
mavenPublishing {
    coordinates(project.group.toString(), "totoggle_java", project.version.toString())

    pom {
        name.set("ToToggle Java Client")
        description.set("Java/Kotlin client library for ToToggle feature flag service")
        url.set("https://github.com/manorfm/toToggles")

        licenses {
            license {
                name.set("ToToggle License 1.0")
                url.set("https://github.com/manorfm/toToggles/blob/main/LICENSE")
                comments.set("Apache License 2.0, plus a commercial-use attribution clause (see LICENSE).")
            }
        }

        developers {
            developer {
                id.set("manorfm")
                name.set("Manoel Medeiros")
                email.set("manoel.rodrigo@gmail.com")
            }
        }

        scm {
            url.set("https://github.com/manorfm/toToggles")
            connection.set("scm:git:git://github.com/manorfm/toToggles.git")
            developerConnection.set("scm:git:ssh://git@github.com/manorfm/toToggles.git")
        }
    }

    publishToMavenCentral()
    signAllPublications()
}
