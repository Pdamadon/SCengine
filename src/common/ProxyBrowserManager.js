/**
 * ProxyBrowserManager - Extension of BrowserManager with auto-retry and IP rotation
 * 
 * Handles CAPTCHA/blocks by automatically rotating IPs
 */

const BrowserManager = require('./BrowserManager');
const ProxyConfig = require('../config/proxy');
const { logger } = require('../utils/logger');

class ProxyBrowserManager extends BrowserManager {
  constructor(options = {}) {
    super(options);
    this.retryOnBlock = options.retryOnBlock !== false;
    this.maxRetries = options.maxRetries || 3;
    this.currentSessionId = null;
  }
  
  /**
   * Create browser with automatic proxy and retry logic
   */
  async createBrowserWithRetry(profile = 'stealth', options = {}) {
    // Always enforce proxy
    ProxyConfig.enforceProxy();
    
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Get fresh proxy config for each attempt
        const proxyConfig = attempt === 1 
          ? ProxyConfig.brightdata.getStickySession() // Try sticky first
          : ProxyConfig.brightdata.getRotatingSession(); // Rotate on retry
        
        logger.info(`🔄 Browser attempt ${attempt}/${this.maxRetries}`);
        
        // Create browser with proxy
        const browser = await this.createBrowser(profile, {
          ...options,
          proxy: proxyConfig
        });
        
        // Add CAPTCHA/block detection
        browser.page.on('response', response => {
          const status = response.status();
          const url = response.url();
          
          // Detect blocks
          if (status === 403 || status === 429) {
            browser.isBlocked = true;
            logger.warn(`⚠️ Blocked response detected: ${status} on ${url}`);
          }
          
          // Detect CAPTCHA pages
          if (url.includes('captcha') || url.includes('challenge')) {
            browser.hasCaptcha = true;
            logger.warn(`⚠️ CAPTCHA detected: ${url}`);
          }
        });
        
        // Test the connection (unless explicitly skipped)
        if (!options.skipIPCheck) {
          await this.testConnection(browser.page);
        } else {
          logger.info('⚠️ Skipping IP check as requested');
        }
        
        logger.info('✅ Browser created successfully with proxy');
        return browser;
        
      } catch (error) {
        lastError = error;
        logger.warn(`Attempt ${attempt} failed: ${error.message}`);
        
        // Wait before retry
        if (attempt < this.maxRetries) {
          const waitTime = attempt * 2000; // Progressive backoff
          logger.info(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    throw new Error(`Failed to create browser after ${this.maxRetries} attempts: ${lastError.message}`);
  }
  
  /**
   * Navigate with automatic retry on block
   */
  async navigateWithRetry(page, url, options = {}) {
    const maxAttempts = options.maxRetries || this.maxRetries;
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.debug(`🎯 Navigation attempt ${attempt}/${maxAttempts} to ${url}`);
        
        // Navigate
        const response = await page.goto(url, {
          waitUntil: options.waitUntil || 'domcontentloaded',
          timeout: options.timeout || 30000
        });
        
        // Check for blocks
        if (response.status() === 403 || response.status() === 429) {
          throw new Error(`Blocked with status ${response.status()}`);
        }
        
        // Check for CAPTCHA
        const content = await page.content();
        if (content.includes('captcha') || content.includes('challenge')) {
          throw new Error('CAPTCHA detected on page');
        }
        
        // Success!
        logger.debug(`✅ Navigation successful`);
        return response;
        
      } catch (error) {
        lastError = error;
        logger.warn(`Navigation attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < maxAttempts) {
          // Need to recreate browser with new IP
          logger.info('🔄 Rotating IP for new attempt...');
          
          // Close current browser
          const currentBrowser = this.browsers.find(b => b.page === page);
          if (currentBrowser) {
            await this.closeBrowser(currentBrowser);
          }
          
          // Create new browser with fresh IP
          const newBrowser = await this.createBrowserWithRetry('stealth', options);
          page = newBrowser.page;
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    throw new Error(`Navigation failed after ${maxAttempts} attempts: ${lastError.message}`);
  }
  
  /**
   * Test connection with IP check
   */
  async testConnection(page) {
    try {
      await page.goto('https://api.ipify.org?format=json', { 
        timeout: 10000,
        waitUntil: 'domcontentloaded'
      });
      
      const response = await page.textContent('body');
      const { ip } = JSON.parse(response);
      
      logger.debug(`🌐 Proxy IP: ${ip}`);
      return ip;
      
    } catch (error) {
      throw new Error(`Proxy connection test failed: ${error.message}`);
    }
  }
  
  /**
   * Execute function with automatic retry on block
   */
  async executeWithRetry(fn, options = {}) {
    return ProxyConfig.withRetry(async (proxyConfig) => {
      const browser = await this.createBrowser('stealth', {
        ...options,
        proxy: proxyConfig
      });
      
      try {
        return await fn(browser.page);
      } finally {
        await this.closeBrowser(browser);
      }
    }, options.maxRetries || this.maxRetries);
  }
}

module.exports = ProxyBrowserManager;