/**
 * ProxyBrowserManager for Residential Proxies
 * Used for Cloudflare-protected sites that block datacenter/ISP proxies
 */

const BrowserManagerBrowserless = require('./BrowserManagerBrowserless');
const { logger } = require('../../../../utils/logger');

class ProxyBrowserManagerResidential extends BrowserManagerBrowserless {
  constructor(options = {}) {
    super(options);
    this.maxRetries = options.maxRetries || 2;
    this.retryOnBlock = options.retryOnBlock !== false;
    
    // Use residential proxy credentials
    this.proxyConfig = {
      username: process.env.BRIGHTDATA_USERNAME,
      password: process.env.BRIGHTDATA_PASSWORD,
      zone: process.env.BRIGHTDATA_ZONE || 'residential_proxy1',
      server: 'brd.superproxy.io',
      port: 33335
    };
    
    if (!this.proxyConfig.username || !this.proxyConfig.password) {
      throw new Error('❌ Residential proxy credentials not configured. Check BRIGHTDATA_USERNAME and BRIGHTDATA_PASSWORD in .env');
    }
  }
  
  /**
   * Create browser with residential proxy
   */
  async createBrowserWithRetry(profile = 'stealth', options = {}) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.info(`🔄 Browser attempt ${attempt}/${this.maxRetries} with residential proxy`);
        
        // Create proxy configuration in Playwright format
        // Don't include auth in URL - pass separately for Playwright
        const proxyServer = `http://${this.proxyConfig.server}:${this.proxyConfig.port}`;
        
        // Configure browser with residential proxy
        // The proxy config goes directly in options, BrowserManager will put it in context
        const browserOptions = {
          ...options,
          proxy: {
            server: proxyServer,
            username: this.proxyConfig.username,
            password: this.proxyConfig.password
          },
          ignoreHTTPSErrors: true
        };
        
        logger.info('🏠 Using residential proxy:', {
          server: `http://${this.proxyConfig.server}:${this.proxyConfig.port}`,
          zone: this.proxyConfig.zone,
          authenticated: true
        });
        
        // Create browser with stealth measures
        const browser = await this.createBrowser(profile, browserOptions);
        
        // Monitor for blocks and CAPTCHAs
        browser.page.on('response', response => {
          const url = response.url();
          const status = response.status();
          
          // Detect blocks
          if (status === 403 || status === 429) {
            browser.isBlocked = true;
            logger.warn(`⚠️ Blocked response detected: ${status} on ${url}`);
          }
          
          // Detect Cloudflare challenges
          if (url.includes('challenge') || response.headers()['cf-mitigated']) {
            browser.hasCaptcha = true;
            logger.warn(`⚠️ Cloudflare challenge detected: ${url}`);
          }
        });
        
        // Skip IP check for residential proxies (often blocked)
        if (!options.skipIPCheck) {
          logger.info('⚠️ Skipping IP check for residential proxy (often blocked by api.ipify.org)');
        }
        
        logger.info('✅ Browser created successfully with residential proxy');
        return browser;
        
      } catch (error) {
        lastError = error;
        logger.warn(`Attempt ${attempt} failed: ${error.message}`);
        
        // Wait before retry with exponential backoff
        if (attempt < this.maxRetries) {
          const waitTime = attempt * 3000; // Longer wait for residential
          logger.info(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // All attempts failed
    throw new Error(`Failed to create browser after ${this.maxRetries} attempts: ${lastError.message}`);
  }
  
  /**
   * Get rotating session for residential proxy
   * Each request gets a new IP
   */
  getRotatingSession() {
    const sessionId = Math.random().toString(36).substring(7);
    return {
      username: `${this.proxyConfig.username}-session-${sessionId}`,
      password: this.proxyConfig.password,
      server: `http://${this.proxyConfig.server}:${this.proxyConfig.port}`
    };
  }
  
  /**
   * Get sticky session for residential proxy
   * Same IP for duration of session
   */
  getStickySession(duration = 10) {
    const sessionId = Date.now();
    return {
      username: `${this.proxyConfig.username}-session-${sessionId}_lifetime-${duration}m`,
      password: this.proxyConfig.password,
      server: `http://${this.proxyConfig.server}:${this.proxyConfig.port}`
    };
  }
}

module.exports = ProxyBrowserManagerResidential;