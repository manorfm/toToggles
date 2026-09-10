plugins {
    scala
    kotlin("jvm") version "2.4.10"
    id("io.gatling.gradle") version "3.15.1.2"
}

repositories {
    mavenCentral()
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

kotlin {
    jvmToolchain(21)
}

dependencies {
    gatling("io.gatling.highcharts:gatling-charts-highcharts:3.15.1")
    gatling("io.gatling:gatling-test-framework:3.15.1")
    
    // JSON processing
    implementation("com.fasterxml.jackson.core:jackson-core:2.16.1")
    implementation("com.fasterxml.jackson.core:jackson-databind:2.16.1")
    implementation("com.fasterxml.jackson.module:jackson-module-scala_2.13:2.16.1")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.16.1")
    
    // Add Scala Jackson dependency to Gatling classpath
    gatling("com.fasterxml.jackson.module:jackson-module-scala_2.13:2.16.1")
    
    // HTTP client for setup
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // The Java sidecar executes the real SDK through the local composite build.
    implementation("io.github.manorfm:totoggle_java:1.0.0")

    testImplementation("org.junit.jupiter:junit-jupiter:5.10.2")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.assertj:assertj-core:3.25.3")
}

tasks.test {
    useJUnitPlatform()
}

gatling {
    gatlingVersion = "3.15.1"
    includeMainOutput = true
    includeTestOutput = true
    scalaVersion = "2.13.12"
}

tasks.register<JavaExec>("setupTestData") {
    group = "stress-tests"
    description = "Setup test data (applications and toggles) for stress testing"
    classpath = sourceSets.main.get().runtimeClasspath
    mainClass.set("setup.TestDataSetup")
}

tasks.register<JavaExec>("runStressTest") {
    group = "stress-tests"
    description = "Run complete stress test suite"
    dependsOn("setupTestData")
    finalizedBy("gatlingRun")
}

tasks.register<JavaExec>("runJavaSdkSidecar") {
    group = "stress-tests"
    description = "Run the loopback-only Java SDK evaluation sidecar for Gatling"
    classpath = sourceSets.main.get().runtimeClasspath
    mainClass.set("sidecar.java.JavaSdkSidecarMain")
}

tasks.register("cleanupTestData") {
    group = "stress-tests"
    description = "Cleanup test data after stress testing"
    doLast {
        println("Cleaning up test data...")
        // Add cleanup logic if needed
    }
}
