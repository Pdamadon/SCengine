/**
 * Anti-Bot Mitigation Service
 * Implements ethical bot detection avoidance following SCRAPING_REQUIREMENTS.md
 * 
 * COMPLIANCE:
 * - Rate limiting respect (1 req/sec default per domain)
 * - Bright Data residential proxy integration
 * - Circuit breaker pattern for proxy failures
 * - Bulkhead isolation to prevent cascading failures
 * - Graceful degradation when anti-bot services fail
 */

import { EventEmitter } from 'events';
import { Logger } from '../../types/common.types';

interface AntiBotOptions {
  defaultDelayMs?: number;
  maxDelayMs?: number;
  minDelayMs?: number;
  brightData?: BrightDataConfig;
  circuitBreaker?: CircuitBreakerConfig;
  userAgentRotation?: boolean;
  maxConsecutiveFailures?: number;
}

interface BrightDataConfig {
  enabled?: boolean;
  endpoint?: string;
  username?: string;
  password?: string;
  port?: number;
  sessionTimeout?: number;
}

interface CircuitBreakerConfig {
  failureThreshold?: number;
  recoveryTimeout?: number;
  monitoringWindow?: number;
}

interface AntiBotState {
  isHealthy: boolean;
  consecutiveFailures: number;
  lastFailure: number | null;
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  circuitBreakerFailures: number;
  circuitBreakerLastFailure: number | null;
}

interface DomainState {
  lastRequest: number;
  requestCount: number;
  consecutiveFailures: number;
  baseDelayMs: number;
  isBlocked: boolean;
  blockTime: number | null;
  lastFailure: number | null;
}

interface ProxyConfig {
  proxy: {
    server: string;
    username: string;
    password: string;
  };
  sessionId: string;
}

interface BrowserConfig {
  userAgent: string;
  viewport: { width: number; height: number };
  headers?: Record<string, string>;
  extraHTTPHeaders?: Record<string, string>;
  proxy?: ProxyConfig['proxy'];
  sessionId?: string;
}

interface HealthStatus {
  isHealthy: boolean;
  circuitBreakerState: string;
  consecutiveFailures: number;
  lastFailure: number | null;
  brightDataEnabled: boolean;
  domainStates: number;
  uptime: number;
}

interface RequestFailureEvent {
  domain: string;
  error: string;
  statusCode: number | null;
  consecutiveFailures: number;
}

interface RateLimitEvent {
  domain: string;
  statusCode: number;
  newDelay: number;
  isBlocked: boolean;
}

class AntiBot extends EventEmitter {
  private logger: Logger;
  private options: Required<AntiBotOptions>;
  private state: AntiBotState;
  private domainStates: Map<string, DomainState> = new Map();
  private userAgents: string[];
  private healthMonitorInterval?: NodeJS.Timeout;

  constructor(logger: Logger, options: AntiBotOptions = {}) {
    super();
    this.logger = logger;
    this.options = {
      // Rate limiting (SCRAPING_REQUIREMENTS: 1 req/sec default)
      defaultDelayMs: options.defaultDelayMs || 2000,
      maxDelayMs: options.maxDelayMs || 10000,
      minDelayMs: options.minDelayMs || 1000,
      
      // Bright Data proxy configuration
      brightData: {
        enabled: options.brightData?.enabled || false,
        endpoint: process.env.BRIGHT_DATA_ENDPOINT || '',
        username: process.env.BRIGHT_DATA_USERNAME || '',
        password: process.env.BRIGHT_DATA_PASSWORD || '',
        port: options.brightData?.port || 22225,
        sessionTimeout: options.brightData?.sessionTimeout || 30000, // 30 seconds per session
      },
      
      // Circuit breaker settings
      circuitBreaker: {
        failureThreshold: options.circuitBreaker?.failureThreshold || 5,
        recoveryTimeout: options.circuitBreaker?.recoveryTimeout || 60000, // 1 minute
        monitoringWindow: options.circuitBreaker?.monitoringWindow || 300000, // 5 minutes
      },
      
      // User agent rotation
      userAgentRotation: options.userAgentRotation !== false,
      maxConsecutiveFailures: options.maxConsecutiveFailures || 3,
    };

    // Component state management
    this.state = {
      isHealthy: true,
      consecutiveFailures: 0,
      lastFailure: null,
      circuitBreakerState: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      circuitBreakerFailures: 0,
      circuitBreakerLastFailure: null,
    };
    
    // Realistic user agent pool (SCRAPING_REQUIREMENTS: realistic browser identification)
    this.userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/120.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];

    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Get appropriate request delay for a domain (SCRAPING_REQUIREMENTS: rate limiting respect)
   */
  async getRequestDelay(domain: string): Promise<number> {
    try {
      // Circuit breaker check
      if (this.state.circuitBreakerState === 'OPEN') {
        throw new Error('AntiBot circuit breaker is OPEN - requests blocked');
      }

      const domainState = this.getDomainState(domain);
      const now = Date.now();
      
      // Calculate delay since last request to this domain
      const timeSinceLastRequest = now - domainState.lastRequest;
      const requiredDelay = this.calculateRequiredDelay(domainState);
      
      if (timeSinceLastRequest < requiredDelay) {
        const additionalDelay = requiredDelay - timeSinceLastRequest;
        
        this.logger.debug('Rate limiting delay calculated', {
          domain,
          timeSinceLastRequest,
          requiredDelay,
          additionalDelay,
        });
        
        return additionalDelay;
      }

      return 0;

    } catch (error) {
      this.logger.error('Error calculating request delay:', error);
      // Graceful degradation: return default delay
      return this.options.defaultDelayMs;
    }
  }

  /**
   * Apply request delay with human-like variation (SCRAPING_REQUIREMENTS: human-like delays)
   */
  async applyDelay(domain: string): Promise<void> {
    try {
      const baseDelay = await this.getRequestDelay(domain);
      
      // Add human-like jitter (±20% variation)
      const jitter = baseDelay * 0.2 * (Math.random() - 0.5);
      const totalDelay = Math.max(baseDelay + jitter, this.options.minDelayMs);
      
      if (totalDelay > 0) {
        this.logger.debug(`Applying anti-bot delay: ${Math.round(totalDelay)}ms for ${domain}`);
        await this.sleep(totalDelay);
      }

      // Update domain state
      const domainState = this.getDomainState(domain);
      domainState.lastRequest = Date.now();
      domainState.requestCount += 1;

    } catch (error) {
      this.logger.error('Error applying request delay:', error);
      // Graceful degradation: apply minimum delay
      await this.sleep(this.options.minDelayMs);
    }
  }

  /**
   * Get random user agent for request rotation
   */
  getRandomUserAgent(): string {
    try {
      if (!this.options.userAgentRotation) {
        return this.userAgents[0]; // Use first one consistently
      }
      
      const randomIndex = Math.floor(Math.random() * this.userAgents.length);
      return this.userAgents[randomIndex];
      
    } catch (error) {
      this.logger.error('Error selecting user agent:', error);
      // Graceful degradation: return default
      return this.userAgents[0];
    }
  }

  /**
   * Get Bright Data proxy configuration (SCRAPING_REQUIREMENTS: proxy rotation)
   */
  getBrightDataProxyConfig(): ProxyConfig | null {
    try {
      if (!this.options.brightData.enabled || 
          !this.options.brightData.endpoint ||
          !this.options.brightData.username ||
          !this.options.brightData.password) {
        
        this.logger.debug('Bright Data proxy not configured or disabled');
        return null;
      }

      // Generate session ID for proxy rotation
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        proxy: {
          server: `${this.options.brightData.endpoint}:${this.options.brightData.port}`,
          username: `${this.options.brightData.username}-session-${sessionId}`,
          password: this.options.brightData.password,
        },
        sessionId,
      };

    } catch (error) {
      this.logger.error('Error configuring Bright Data proxy:', error);
      this.recordFailure('proxy_config_error');
      return null;
    }
  }

  /**
   * Generate complete browser context configuration with anti-bot measures
   */
  async getBrowserConfig(domain: string): Promise<BrowserConfig> {
    try {
      const config: BrowserConfig = {
        userAgent: this.getRandomUserAgent(),
        viewport: { width: 1920, height: 1080 },
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'max-age=0',
        },
        extraHTTPHeaders: {
          'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
        },
      };

      // Add proxy configuration if available
      const proxyConfig = this.getBrightDataProxyConfig();
      if (proxyConfig) {
        config.proxy = proxyConfig.proxy;
        config.sessionId = proxyConfig.sessionId;
        
        this.logger.debug('Bright Data proxy configured', {
          domain,
          sessionId: proxyConfig.sessionId,
        });
      }

      return config;

    } catch (error) {
      this.logger.error('Error generating browser config:', error);
      this.recordFailure('browser_config_error');
      
      // Graceful degradation: return minimal config
      return {
        userAgent: this.userAgents[0],
        viewport: { width: 1920, height: 1080 },
      };
    }
  }

  /**
   * Handle request failure and update anti-bot strategy
   */
  async handleRequestFailure(domain: string, error: Error, statusCode: number | null = null): Promise<void> {
    try {
      const domainState = this.getDomainState(domain);
      domainState.consecutiveFailures += 1;
      domainState.lastFailure = Date.now();
      
      this.logger.warn('Request failure detected', {
        domain,
        error: error.message,
        statusCode,
        consecutiveFailures: domainState.consecutiveFailures,
      });

      // Check for rate limiting (429) or blocking (403, 503)
      if (statusCode === 429 || statusCode === 403 || statusCode === 503) {
        await this.handleRateLimitOrBlock(domain, statusCode);
      }

      // Circuit breaker logic
      this.recordFailure('request_failure');

      this.emit('requestFailure', {
        domain,
        error: error.message,
        statusCode,
        consecutiveFailures: domainState.consecutiveFailures,
      } as RequestFailureEvent);

    } catch (handlingError) {
      this.logger.error('Error handling request failure:', handlingError);
    }
  }

  /**
   * Handle rate limiting or blocking responses (SCRAPING_REQUIREMENTS: respect HTTP status codes)
   */
  async handleRateLimitOrBlock(domain: string, statusCode: number): Promise<void> {
    const domainState = this.getDomainState(domain);
    
    // Increase delays for this domain
    switch (statusCode) {
      case 429: // Too Many Requests
        domainState.baseDelayMs = Math.min(domainState.baseDelayMs * 2, this.options.maxDelayMs);
        this.logger.info(`Rate limit detected for ${domain}, increasing delay to ${domainState.baseDelayMs}ms`);
        break;
        
      case 403: // Forbidden
        domainState.baseDelayMs = Math.min(domainState.baseDelayMs * 3, this.options.maxDelayMs);
        domainState.isBlocked = true;
        domainState.blockTime = Date.now();
        this.logger.warn(`Access blocked for ${domain}, implementing cooldown period`);
        break;
        
      case 503: // Service Unavailable
        domainState.baseDelayMs = Math.min(domainState.baseDelayMs * 1.5, this.options.maxDelayMs);
        this.logger.info(`Service unavailable for ${domain}, backing off`);
        break;
    }

    this.emit('rateLimitOrBlock', {
      domain,
      statusCode,
      newDelay: domainState.baseDelayMs,
      isBlocked: domainState.isBlocked,
    } as RateLimitEvent);
  }

  /**
   * Handle successful request and adjust strategy
   */
  async handleRequestSuccess(domain: string): Promise<void> {
    try {
      const domainState = this.getDomainState(domain);
      
      // Reset failure counters on success
      if (domainState.consecutiveFailures > 0) {
        this.logger.debug(`Request success for ${domain}, resetting failure count`);
        domainState.consecutiveFailures = 0;
        domainState.isBlocked = false;
      }

      // Gradually reduce delays on consistent success
      if (domainState.baseDelayMs > this.options.defaultDelayMs) {
        domainState.baseDelayMs = Math.max(
          domainState.baseDelayMs * 0.9, 
          this.options.defaultDelayMs
        );
      }

      // Reset circuit breaker state on success
      if (this.state.circuitBreakerState === 'HALF_OPEN') {
        this.state.circuitBreakerState = 'CLOSED';
        this.state.circuitBreakerFailures = 0;
        this.logger.info('AntiBot circuit breaker closed after successful request');
      }

    } catch (error) {
      this.logger.error('Error handling request success:', error);
    }
  }

  /**
   * Check if domain is currently blocked and should skip requests
   */
  isDomainBlocked(domain: string): boolean {
    const domainState = this.getDomainState(domain);
    
    if (!domainState.isBlocked) return false;
    
    // Check if cooldown period has passed (15 minutes default)
    const cooldownPeriod = 15 * 60 * 1000;
    const timeSinceBlock = Date.now() - (domainState.blockTime || 0);
    
    if (timeSinceBlock > cooldownPeriod) {
      domainState.isBlocked = false;
      domainState.baseDelayMs = this.options.defaultDelayMs;
      this.logger.info(`Cooldown period ended for ${domain}, resuming requests`);
      return false;
    }
    
    return true;
  }

  /**
   * Get health status for monitoring
   */
  getHealthStatus(): HealthStatus {
    return {
      isHealthy: this.state.isHealthy,
      circuitBreakerState: this.state.circuitBreakerState,
      consecutiveFailures: this.state.consecutiveFailures,
      lastFailure: this.state.lastFailure,
      brightDataEnabled: this.options.brightData.enabled,
      domainStates: this.domainStates.size,
      uptime: process.uptime(),
    };
  }

  /**
   * Private helper methods
   */
  
  private getDomainState(domain: string): DomainState {
    if (!this.domainStates.has(domain)) {
      this.domainStates.set(domain, {
        lastRequest: 0,
        requestCount: 0,
        consecutiveFailures: 0,
        baseDelayMs: this.options.defaultDelayMs,
        isBlocked: false,
        blockTime: null,
        lastFailure: null,
      });
    }
    return this.domainStates.get(domain)!;
  }

  private calculateRequiredDelay(domainState: DomainState): number {
    // Base delay with exponential backoff for failures
    let delay = domainState.baseDelayMs;
    
    if (domainState.consecutiveFailures > 0) {
      delay = Math.min(
        delay * Math.pow(2, domainState.consecutiveFailures),
        this.options.maxDelayMs
      );
    }
    
    return delay;
  }

  private recordFailure(type: string): void {
    this.state.consecutiveFailures += 1;
    this.state.lastFailure = Date.now();
    this.state.circuitBreakerFailures += 1;

    // Circuit breaker logic
    if (this.state.circuitBreakerFailures >= this.options.circuitBreaker.failureThreshold &&
        this.state.circuitBreakerState === 'CLOSED') {
      
      this.state.circuitBreakerState = 'OPEN';
      this.state.circuitBreakerLastFailure = Date.now();
      
      this.logger.error('AntiBot circuit breaker opened due to consecutive failures', {
        failures: this.state.circuitBreakerFailures,
        threshold: this.options.circuitBreaker.failureThreshold,
      });

      // Set recovery timeout
      setTimeout(() => {
        if (this.state.circuitBreakerState === 'OPEN') {
          this.state.circuitBreakerState = 'HALF_OPEN';
          this.logger.info('AntiBot circuit breaker moved to HALF_OPEN state');
        }
      }, this.options.circuitBreaker.recoveryTimeout);
    }
  }

  private startHealthMonitoring(): void {
    this.healthMonitorInterval = setInterval(() => {
      this.checkHealth();
    }, 30000); // Check every 30 seconds
  }

  private checkHealth(): void {
    const now = Date.now();
    
    // Check circuit breaker state
    if (this.state.circuitBreakerState === 'OPEN') {
      this.state.isHealthy = false;
    } else if (this.state.consecutiveFailures > this.options.maxConsecutiveFailures) {
      this.state.isHealthy = false;
    } else {
      this.state.isHealthy = true;
    }

    // Reset failure counters periodically
    if (this.state.lastFailure && 
        now - this.state.lastFailure > this.options.circuitBreaker.monitoringWindow) {
      this.state.consecutiveFailures = 0;
      this.state.circuitBreakerFailures = 0;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.healthMonitorInterval) {
      clearInterval(this.healthMonitorInterval);
    }
    this.removeAllListeners();
  }
}

export default AntiBot;