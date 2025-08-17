package com.totoggle.client.http

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.KotlinModule
import com.fasterxml.jackson.module.kotlin.readValue
import com.totoggle.client.config.ToToggleConfig
import com.totoggle.client.exception.AuthenticationException
import com.totoggle.client.exception.NetworkException
import com.totoggle.client.exception.ParseException
import com.totoggle.client.model.ServerResponse
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import org.slf4j.LoggerFactory
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * HTTP client for communicating with the ToToggle server.
 * Handles authentication, requests, and response parsing.
 */
class HttpClient(private val config: ToToggleConfig) {
    
    private val logger = LoggerFactory.getLogger(HttpClient::class.java)
    private val objectMapper = ObjectMapper().registerModule(KotlinModule.Builder().build())
    private val httpClient: OkHttpClient
    
    init {
        val loggingInterceptor = HttpLoggingInterceptor { message ->
            when (config.logLevel) {
                com.totoggle.client.config.LogLevel.TRACE,
                com.totoggle.client.config.LogLevel.DEBUG -> logger.debug("HTTP: {}", message)
                else -> { /* No logging */ }
            }
        }
        
        loggingInterceptor.level = when (config.logLevel) {
            com.totoggle.client.config.LogLevel.TRACE -> HttpLoggingInterceptor.Level.BODY
            com.totoggle.client.config.LogLevel.DEBUG -> HttpLoggingInterceptor.Level.HEADERS
            else -> HttpLoggingInterceptor.Level.NONE
        }
        
        httpClient = OkHttpClient.Builder()
            .connectTimeout(config.connectionTimeout.toMillis(), TimeUnit.MILLISECONDS)
            .readTimeout(config.readTimeout.toMillis(), TimeUnit.MILLISECONDS)
            .addInterceptor(loggingInterceptor)
            .build()
        
        logger.info("HTTP client initialized for application: {}", config.applicationName)
    }
    
    /**
     * Fetches toggles from the ToToggle server.
     * 
     * @return Server response containing application and toggles data
     * @throws NetworkException if there's a network communication error
     * @throws AuthenticationException if authentication fails
     * @throws ParseException if the response cannot be parsed
     */
    fun fetchToggles(): ServerResponse {
        logger.debug("Fetching toggles from server: {}", config.getApiUrl())
        
        val request = Request.Builder()
            .url(config.getApiUrl())
            .addHeader("X-API-Key", config.secretKey)
            .addHeader("User-Agent", "ToToggle-Java-Client/1.0.0 (${config.applicationName})")
            .get()
            .build()
        
        return try {
            httpClient.newCall(request).execute().use { response ->
                handleResponse(response)
            }
        } catch (e: IOException) {
            logger.error("Network error while fetching toggles", e)
            throw NetworkException("Failed to fetch toggles from server", e)
        }
    }
    
    /**
     * Handles the HTTP response and parses it into a ServerResponse.
     */
    private fun handleResponse(response: Response): ServerResponse {
        logger.debug("Received response: status={}, contentLength={}", response.code, response.body?.contentLength())
        
        when (response.code) {
            200 -> {
                val responseBody = response.body?.string()
                    ?: throw ParseException("Empty response body")
                
                if (responseBody.isBlank()) {
                    throw ParseException("Empty response body")
                }
                
                logger.debug("Response body length: {} characters", responseBody.length)
                
                return try {
                    objectMapper.readValue<ServerResponse>(responseBody)
                } catch (e: Exception) {
                    logger.error("Failed to parse server response", e)
                    throw ParseException("Failed to parse server response", e)
                }
            }
            
            401 -> {
                logger.error("Authentication failed - invalid secret key")
                throw AuthenticationException("Invalid secret key")
            }
            
            404 -> {
                logger.error("API endpoint not found")
                throw NetworkException("API endpoint not found: ${config.getApiUrl()}")
            }
            
            in 500..599 -> {
                logger.error("Server error: {}", response.code)
                throw NetworkException("Server error: ${response.code}")
            }
            
            else -> {
                logger.error("Unexpected response code: {}", response.code)
                throw NetworkException("Unexpected response code: ${response.code}")
            }
        }
    }
    
    /**
     * Closes the HTTP client and releases resources.
     */
    fun close() {
        httpClient.dispatcher.executorService.shutdown()
        httpClient.connectionPool.evictAll()
        logger.debug("HTTP client closed")
    }
}