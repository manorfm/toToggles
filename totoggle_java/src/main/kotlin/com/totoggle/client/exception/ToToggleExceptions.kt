package com.totoggle.client.exception

/**
 * Base exception for all ToToggle client errors.
 */
abstract class ToToggleException(
    message: String,
    cause: Throwable? = null
) : RuntimeException(message, cause)

/**
 * Exception thrown when there's a configuration error.
 */
class ConfigurationException(
    message: String,
    cause: Throwable? = null
) : ToToggleException(message, cause)

/**
 * Exception thrown when there's a network communication error.
 */
class NetworkException(
    message: String,
    cause: Throwable? = null
) : ToToggleException(message, cause)

/**
 * Exception thrown when the server returns an authentication error.
 */
class AuthenticationException(
    message: String,
    cause: Throwable? = null
) : ToToggleException(message, cause)

/**
 * Exception thrown when there's a JSON parsing error.
 */
class ParseException(
    message: String,
    cause: Throwable? = null
) : ToToggleException(message, cause)

/**
 * Exception thrown when a toggle path is not found.
 */
class ToggleNotFoundException(
    val path: String,
    message: String = "Toggle not found: $path"
) : ToToggleException(message)

/**
 * Exception thrown when an activation rule strategy is not found.
 */
class StrategyNotFoundException(
    val ruleType: String,
    message: String = "Activation rule strategy not found: $ruleType"
) : ToToggleException(message)