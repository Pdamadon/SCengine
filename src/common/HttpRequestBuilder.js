/**
 * HTTP Request Builder - Reusable utility for building realistic HTTP requests
 * 
 * Creates browser-like HTTP headers and configurations to avoid bot detection.
 * Designed for reuse across all HTTP extraction components.
 * 
 * Following CLAUDE.md principles:
 * - Reusable components across the extraction pipeline
 * - Configurable values with sensible defaults
 * - Practical improvements for 40% → 70% success rate goal
 */

const { getHeaderProfile, getConfig } = require('../config/HttpHeaderProfiles');

class HttpRequestBuilder {
  constructor(logger, options = {}) {
    this.logger = logger;
    this.config = {
      // Default configuration
      profile: options.profile || getConfig().headerProfile,
      timeout: options.timeout || 5000,
      maxRetries: options.maxRetries || 1,
      
      // Header customization
      userAgent: options.userAgent || getConfig().userAgent,
      acceptLanguage: options.acceptLanguage || getConfig().acceptLanguage,
      headersOverride: options.headersOverride || {},
      
      // Advanced options
      includeReferer: options.includeReferer !== false, // Default: true
      respectRobots: options.respectRobots !== false,   // Default: true
      ...options
    };

    this.logger.debug('HttpRequestBuilder initialized', {
      profile: this.config.profile,
      timeout: this.config.timeout,
      includeReferer: this.config.includeReferer
    });
  }

  /**
   * Build headers for HTTP request
   * @param {string} url - Target URL for the request
   * @param {Object} options - Request-specific options
   * @returns {Object} Headers object ready for HTTP client
   */
  buildHeaders(url, options = {}) {
    // Start with profile-based headers
    const profile = options.profile || this.config.profile;
    const baseHeaders = getHeaderProfile(profile);

    // Apply individual header overrides
    const headers = {
      ...baseHeaders,
      
      // User-Agent override
      'User-Agent': options.userAgent || 
                   this.config.userAgent || 
                   baseHeaders['User-Agent'],
      
      // Accept-Language override  
      'Accept-Language': options.acceptLanguage || 
                        this.config.acceptLanguage || 
                        baseHeaders['Accept-Language']
    };

    // Add Referer header if enabled and URL is valid
    if ((options.includeReferer !== false && this.config.includeReferer) && url) {
      try {
        const urlObj = new URL(url);
        headers['Referer'] = urlObj.origin;
      } catch (e) {
        this.logger.debug('Could not extract origin for Referer header', { url });
      }
    }

    // Apply configuration overrides
    Object.assign(headers, this.config.headersOverride);
    
    // Apply request-specific overrides
    Object.assign(headers, options.headersOverride || {});
    
    // Apply environment JSON overrides (highest priority)
    Object.assign(headers, getConfig().headersJson);

    return headers;
  }

  /**
   * Build complete request configuration for HTTP client
   * @param {string} url - Target URL
   * @param {Object} options - Request options
   * @returns {Object} Complete request configuration
   */
  buildRequestConfig(url, options = {}) {
    const config = {
      headers: this.buildHeaders(url, options),
      timeout: options.timeout || this.config.timeout,
      
      // Standard options for axios/fetch
      maxContentLength: options.maxContentLength || 3 * 1024 * 1024, // 3MB
      maxRedirects: options.maxRedirects || 3,
      validateStatus: options.validateStatus || ((status) => status >= 200 && status < 400),
      
      // Additional options
      ...options.requestConfig
    };

    return config;
  }

  /**
   * Add request timing jitter to appear more human-like
   * @param {number} baseDelayMs - Base delay in milliseconds
   * @param {number} jitterPercent - Jitter as percentage of base delay (0-100)
   * @returns {number} Jittered delay in milliseconds
   */
  addJitter(baseDelayMs, jitterPercent = 25) {
    const jitter = baseDelayMs * (jitterPercent / 100);
    const randomJitter = (Math.random() - 0.5) * 2 * jitter;
    return Math.max(0, baseDelayMs + randomJitter);
  }

  /**
   * Get retry configuration for failed requests
   * @param {number} attemptNumber - Current attempt number (0-based)
   * @param {Error} lastError - Last error encountered
   * @returns {Object|null} Retry config or null if no retry
   */
  getRetryConfig(attemptNumber, lastError) {
    if (attemptNumber >= this.config.maxRetries) {
      return null; // No more retries
    }

    // Exponential backoff with jitter
    const baseDelay = Math.pow(2, attemptNumber) * 1000; // 1s, 2s, 4s...
    const delay = this.addJitter(baseDelay, 50);

    // Try different profile on retry to avoid fingerprint detection
    const profiles = ['chrome-stable-win', 'chrome-stable-mac', 'firefox-stable'];
    const currentProfile = this.config.profile;
    const nextProfile = profiles[(profiles.indexOf(currentProfile) + 1) % profiles.length];

    return {
      delay,
      profile: nextProfile,
      reason: lastError?.message || 'Unknown error'
    };
  }

  /**
   * Log request attempt for debugging
   * @param {string} url - Request URL
   * @param {number} attemptNumber - Attempt number
   * @param {Object} headers - Request headers (User-Agent will be truncated)
   */
  logRequest(url, attemptNumber = 0, headers = {}) {
    const userAgent = headers['User-Agent'] || 'unknown';
    const truncatedUA = userAgent.length > 50 ? 
      userAgent.substring(0, 47) + '...' : userAgent;

    this.logger.debug('HTTP request attempt', {
      url,
      attempt: attemptNumber + 1,
      userAgent: truncatedUA,
      profile: this.config.profile
    });
  }
}

module.exports = HttpRequestBuilder;