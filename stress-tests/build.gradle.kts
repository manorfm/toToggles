plugins {
    id("io.gatling.gradle") version "3.10.5"
    scala
    kotlin("jvm") version "1.9.22"
}

repositories {
    mavenCentral()
}

dependencies {
    gatling("io.gatling.highcharts:gatling-charts-highcharts:3.10.5")
    gatling("io.gatling:gatling-test-framework:3.10.5")
    
    // JSON processing
    implementation("com.fasterxml.jackson.core:jackson-core:2.16.1")
    implementation("com.fasterxml.jackson.core:jackson-databind:2.16.1")
    implementation("com.fasterxml.jackson.module:jackson-module-scala_2.13:2.16.1")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.16.1")
    
    // Add Scala Jackson dependency to Gatling classpath
    gatling("com.fasterxml.jackson.module:jackson-module-scala_2.13:2.16.1")
    
    // HTTP client for setup
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}

gatling {
    gatlingVersion = "3.10.5"
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

tasks.register("cleanupTestData") {
    group = "stress-tests"
    description = "Cleanup test data after stress testing"
    doLast {
        println("Cleaning up test data...")
        // Add cleanup logic if needed
    }
}