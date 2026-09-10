package simulations

import io.gatling.core.Predef._
import io.gatling.http.Predef._

import scala.concurrent.duration._

/**
 * Exercises the real Go, Node and Java SDKs through local-only sidecars.
 *
 * The feeder is intentionally external to this class: the setup process owns the catalogue and
 * its expected decisions, while this simulation owns concurrent transport and assertions. This
 * keeps load cases deterministic and prevents Gatling source from containing credentials.
 */
class SdkContextStressSimulation extends Simulation {
  private val goBaseUrl = System.getProperty("sdk.go.url", "http://127.0.0.1:19091")
  private val nodeBaseUrl = System.getProperty("sdk.node.url", "http://127.0.0.1:19092")
  private val javaBaseUrl = System.getProperty("sdk.java.url", "http://127.0.0.1:19093")
  private val users = Integer.getInteger("sdk.users", 90).intValue
  private val duration = Integer.getInteger("sdk.test.duration", 120).seconds
  private val rampUp = Integer.getInteger("sdk.ramp.up.duration", 15).seconds
  private val pauseDuration = Integer.getInteger("sdk.think.time.ms", 20).millis
  private val p95Limit = Integer.getInteger("sdk.p95.limit.ms", 750).intValue

  private val scenarioFeeder = jsonFile("sdk-stress-scenarios.json").circular

  private def protocol(baseUrl: String) = http
    .baseUrl(baseUrl)
    .acceptHeader("application/json")
    .contentTypeHeader("application/json")
    .userAgentHeader("ToToggle-Gatling-SDK-Stress/1.0.0")

  private val verifyDecision = exec { session =>
    val expected = session("expectedActive").as[Boolean]
    val actual = session("active").as[Boolean]
    if (actual == expected) session else session.markAsFailed
  }

  private def sdkScenario(sdkName: String) = scenario(s"$sdkName SDK contextual evaluation")
    .feed(scenarioFeeder)
    .during(duration) {
      exec(
        http(s"$sdkName evaluate $${name}")
          .post("/evaluate")
          .header("Forwarded", "$${forwarded}")
          .header("CF-IPCountry", "$${country}")
          .body(StringBody("$${body}")).asJson
          .check(status.is(200))
          .check(jsonPath("$.active").ofType[Boolean].saveAs("active"))
      )
        .exec(verifyDecision)
        .pause(pauseDuration)
    }

  setUp(
    sdkScenario("Go").inject(rampUsers(users / 3) during rampUp).protocols(protocol(goBaseUrl)),
    sdkScenario("Node").inject(rampUsers(users / 3) during rampUp).protocols(protocol(nodeBaseUrl)),
    sdkScenario("Java").inject(rampUsers(users - (2 * (users / 3))) during rampUp).protocols(protocol(javaBaseUrl))
  ).assertions(
    global.successfulRequests.percent.gt(99.0),
    global.responseTime.percentile3.lt(p95Limit),
    global.responseTime.max.lt(p95Limit * 4),
    forAll.failedRequests.count.is(0)
  )
}
