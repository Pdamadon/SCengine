/**
 * Advanced Rate Limiter with Jitter and Adaptive Delays
 * Implements intelligent rate limiting to prevent scraper blocking
 * 
 * Features:
 * - Per-domain rate limiting
 * - Exponential backoff with jitter
 * - 429 status code respect with automatic backoff
 * - Human-like delays (2-10 seconds)
 * - Response time adaptation
 * 
 * Compliance with SCRAPING_REQUIREMENTS.md:
 * - "Rate limiting respect" - Never exceed reasonable request rates
 * - "Human-like delays" - 2-10 seconds between requests
 * - "Respect HTTP status codes" - Honor 429, 503, etc.
 * - "Back off immediately on repeated failures"
 */

const { logger } = require('./logger');

class AdaptiveRateLimiter {
  constructor() {
    // Per-domain rate limiting state
    this.domainStates = new Map();
    
    // Configuration
    this.config = {
      // Default rate limiting (can be overridden per domain)
      defaultDelay: {
        min: 2000,     // 2 seconds minimum (human-like)
        max: 10000,    // 10 seconds maximum
        base: 3000,    // 3 seconds base delay
      },
      
      // Exponential backoff configuration
      backoff: {
        multiplier: 2.0,     // Double delay on failure
        maxMultiplier: 16.0, // Maximum 16x base delay
        jitterFactor: 0.3,   // ±30% jitter
      },
      
      // Response time adaptation
      adaptation: {
        targetResponseTime: 2000, // Target 2s response time
        adaptationFactor: 0.1,    // Gradual adaptation (10%)
        maxAdaptation: 5.0,       // Maximum 5x delay increase
      },
      
      // Failure handling
      failure: {
        consecutiveFailureThreshold: 3,
        backoffResetTime: 300000, // 5 minutes
        rateLimitBackoffTime: 600000, // 10 minutes for 429 errors
      }
    };
  }

  /**
   * Get domain-specific rate limiting state
   */
  getDomainState(domain) {
    if (!this.domainStates.has(domain)) {
      this.domainStates.set(domain, {
        lastRequestTime: 0,
        currentDelay: this.config.defaultDelay.base,
        consecutiveFailures: 0,
        backoffMultiplier: 1.0,
        avgResponseTime: 1000,
        isRateLimited: false,
        rateLimitUntil: 0,
        requestCount: 0,
        successCount: 0,
      });
    }
    return this.domainStates.get(domain);
  }

  /**
   * Calculate next delay with jitter and adaptation
   */
  calculateDelay(domain, responseTime = null, statusCode = 200) {
    const state = this.getDomainState(domain);
    const config = this.config;
    
    // Handle rate limiting (429) response
    if (statusCode === 429) {
      state.isRateLimited = true;
      state.rateLimitUntil = Date.now() + config.failure.rateLimitBackoffTime;
      state.backoffMultiplier = Math.min(
        state.backoffMultiplier * config.backoff.multiplier,
        config.backoff.maxMultiplier
      );
      
      logger.warn('Rate limited by server', {
        domain,
        backoffTime: config.failure.rateLimitBackoffTime,
        currentMultiplier: state.backoffMultiplier
      });
    }
    
    // Handle server errors (503, 502, etc.)
    else if (statusCode >= 500) {
      state.consecutiveFailures++;
      if (state.consecutiveFailures >= config.failure.consecutiveFailureThreshold) {
        state.backoffMultiplier = Math.min(
          state.backoffMultiplier * config.backoff.multiplier,
          config.backoff.maxMultiplier
        );
      }
    }
    
    // Handle successful response
    else if (statusCode >= 200 && statusCode < 300) {
      state.successCount++;
      state.consecutiveFailures = 0;
      
      // Gradual backoff recovery
      if (state.backoffMultiplier > 1.0) {
        state.backoffMultiplier = Math.max(
          state.backoffMultiplier * 0.8, // 20% reduction
          1.0
        );
      }
      
      // Response time adaptation
      if (responseTime !== null) {
        // Exponential moving average
        state.avgResponseTime = state.avgResponseTime * 0.8 + responseTime * 0.2;
        
        // Adapt delay based on response time
        if (state.avgResponseTime > config.adaptation.targetResponseTime) {
          const adaptationFactor = 1.0 + 
            (state.avgResponseTime / config.adaptation.targetResponseTime - 1.0) * 
            config.adaptation.adaptationFactor;
          
          state.currentDelay = Math.min(
            state.currentDelay * adaptationFactor,
            config.defaultDelay.base * config.adaptation.maxAdaptation
          );
        }
      }
    }
    
    // Calculate base delay with backoff
    let delay = state.currentDelay * state.backoffMultiplier;
    
    // Apply jitter (±30% randomization)
    const jitter = 1.0 + (Math.random() - 0.5) * 2 * config.backoff.jitterFactor;
    delay *= jitter;
    
    // Enforce min/max bounds
    delay = Math.max(delay, config.defaultDelay.min);
    delay = Math.min(delay, config.defaultDelay.max);
    
    // If rate limited, use longer backoff
    if (state.isRateLimited && Date.now() < state.rateLimitUntil) {
      delay = Math.max(delay, 30000); // Minimum 30 seconds when rate limited
    } else if (state.isRateLimited) {
      // Reset rate limit flag when time has passed
      state.isRateLimited = false;
    }
    
    return Math.floor(delay);
  }

  /**
   * Wait for appropriate delay before next request
   */
  async waitForNextRequest(domain, responseTime = null, statusCode = 200) {
    const state = this.getDomainState(domain);
    const delay = this.calculateDelay(domain, responseTime, statusCode);
    
    // Calculate time since last request
    const timeSinceLastRequest = Date.now() - state.lastRequestTime;
    const actualDelay = Math.max(0, delay - timeSinceLastRequest);
    
    if (actualDelay > 0) {
      logger.debug('Rate limiting delay', {
        domain,
        delay: actualDelay,
        statusCode,
        responseTime,
        backoffMultiplier: state.backoffMultiplier,
        consecutiveFailures: state.consecutiveFailures,
        avgResponseTime: Math.round(state.avgResponseTime),
        isRateLimited: state.isRateLimited
      });
      
      await this.sleep(actualDelay);
    }
    
    state.lastRequestTime = Date.now();
    state.requestCount++;
  }

  /**
   * Sleep for specified milliseconds
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Configure domain-specific rate limits
   */
  configureDomain(domain, options = {}) {
    const state = this.getDomainState(domain);
    
    if (options.baseDelay) {
      state.currentDelay = options.baseDelay;
    }
    
    if (options.minDelay || options.maxDelay) {
      // Store domain-specific config (extend as needed)
      this.domainConfigs = this.domainConfigs || new Map();
      this.domainConfigs.set(domain, {
        minDelay: options.minDelay || this.config.defaultDelay.min,
        maxDelay: options.maxDelay || this.config.defaultDelay.max,
        baseDelay: options.baseDelay || this.config.defaultDelay.base,
      });
    }
    
    logger.info('Domain rate limiting configured', {
      domain,
      baseDelay: state.currentDelay,
      minDelay: options.minDelay,
      maxDelay: options.maxDelay
    });
  }

  /**
   * Get rate limiting statistics
   */
  getStats(domain = null) {
    if (domain) {
      const state = this.getDomainState(domain);
      return {
        domain,
        requestCount: state.requestCount,
        successCount: state.successCount,
        successRate: state.requestCount > 0 ? 
          (state.successCount / state.requestCount * 100).toFixed(1) + '%' : '0%',
        currentDelay: state.currentDelay,
        backoffMultiplier: state.backoffMultiplier.toFixed(2),
        avgResponseTime: Math.round(state.avgResponseTime),
        consecutiveFailures: state.consecutiveFailures,
        isRateLimited: state.isRateLimited,
        rateLimitUntil: state.isRateLimited ? new Date(state.rateLimitUntil).toISOString() : null
      };
    }
    
    // Return stats for all domains
    const allStats = {};
    for (const [domain, state] of this.domainStates) {
      allStats[domain] = this.getStats(domain);
    }
    return allStats;
  }

  /**
   * Reset rate limiting state for a domain
   */
  resetDomain(domain) {
    if (this.domainStates.has(domain)) {
      this.domainStates.delete(domain);
      logger.info('Rate limiting state reset for domain', { domain });
    }
  }

  /**
   * Check if domain is currently rate limited
   */
  isRateLimited(domain) {
    const state = this.getDomainState(domain);
    return state.isRateLimited && Date.now() < state.rateLimitUntil;
  }

  /**
   * Get recommended delay for a domain without updating state
   */
  getRecommendedDelay(domain) {
    const state = this.getDomainState(domain);
    return this.calculateDelay(domain);
  }
}

// Create singleton instance
const rateLimiter = new AdaptiveRateLimiter();

// Helper functions for easy usage
const createDomainRateLimiter = (domain) => {
  return {
    wait: async (responseTime, statusCode) => {
      await rateLimiter.waitForNextRequest(domain, responseTime, statusCode);
    },
    configure: (options) => {
      rateLimiter.configureDomain(domain, options);
    },
    getStats: () => rateLimiter.getStats(domain),
    isRateLimited: () => rateLimiter.isRateLimited(domain),
    reset: () => rateLimiter.resetDomain(domain),
  };
};

module.exports = {
  AdaptiveRateLimiter,
  rateLimiter,
  createDomainRateLimiter,
};