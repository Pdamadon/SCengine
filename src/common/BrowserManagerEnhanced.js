/**
 * BrowserManagerEnhanced - Togglable Browser Backend (HyperBrowser/Chromium)
 * 
 * Seamlessly switches between HyperBrowser cloud sessions and local Chromium
 * Provides intelligent routing based on site requirements and cost optimization
 * 
 * Features:
 * - Automatic backend selection based on site configuration
 * - Session pooling for HyperBrowser efficiency
 * - Fallback support when one backend fails
 * - Cost tracking and optimization
 * 
 * Usage:
 *   const browserManager = new BrowserManagerEnhanced();
 *   const { page, close } = await browserManager.createBrowser('stealth', {
 *     backend: 'auto',  // 'hyperbrowser', 'chromium', or 'auto'
 *     site: 'toasttab.com'
 *   });
 */

const { chromium } = require('playwright-core');
const { Hyperbrowser } = require('@hyperbrowser/sdk');
const { logger } = require('../utils/logger');
const ProxyConfig = require('../config/ProxyConfig');

// Site-specific backend configuration
const SITE_BACKEND_CONFIG = {
  // Force HyperBrowser for Cloudflare-protected sites
  'toasttab.com': { 
    preferred: 'hyperbrowser', 
    reason: 'Cloudflare protection',
    useProxy: true 
  },
  'doordash.com': { 
    preferred: 'hyperbrowser', 
    reason: 'Advanced bot detection',
    useProxy: true 
  },
  'ubereats.com': { 
    preferred: 'hyperbrowser', 
    reason: 'Advanced bot detection',
    useProxy: true 
  },
  
  // Use local Chromium for simpler sites (cost optimization)
  'glasswingshop.com': { 
    preferred: 'chromium', 
    reason: 'Simple site, no protection',
    useProxy: false 
  },
  'macys.com': { 
    preferred: 'chromium', 
    reason: 'Works with headless:false',
    useProxy: true,
    headless: false 
  },
  
  // Auto-detect for unknown sites
  'default': { 
    preferred: 'chromium', 
    reason: 'Try local first for cost savings',
    useProxy: false 
  }
};

class BrowserManagerEnhanced {
  constructor(config = {}) {
    // Configuration
    this.config = {
      enableHyperBrowser: process.env.ENABLE_HYPERBROWSER === 'true',
      hyperBrowserApiKey: process.env.HYPERBROWSER_API_KEY,
      defaultBackend: config.defaultBackend || 'auto',
      maxHyperSessions: config.maxHyperSessions || 10,
      sessionReuseTime: config.sessionReuseTime || 60000, // 1 minute
      costTracking: config.costTracking !== false,
      fallbackEnabled: config.fallbackEnabled !== false
    };
    
    // HyperBrowser client
    this.hyperClient = null;
    if (this.config.enableHyperBrowser && this.config.hyperBrowserApiKey) {
      this.hyperClient = new Hyperbrowser({
        apiKey: this.config.hyperBrowserApiKey
      });
    }
    
    // Session management
    this.hyperSessions = new Map(); // Session pool for reuse
    this.chromiumBrowsers = new Map(); // Local browser instances
    this.sessionStats = {
      hyperbrowser: { created: 0, reused: 0, failed: 0 },
      chromium: { created: 0, failed: 0 }
    };
    
    // Cost tracking
    this.costTracker = {
      sessions: 0,
      minutes: 0,
      dataGB: 0,
      estimatedCost: 0
    };
    
    // Original BrowserManager compatibility
    this.userAgentPool = this.generateUserAgentPool();
    this.viewportPool = this.generateViewportPool();
  }

  /**
   * Create browser with intelligent backend selection
   */
  async createBrowser(profile = 'stealth', options = {}) {
    const backend = this.selectBackend(options);
    const startTime = Date.now();
    
    logger.info(`🌐 Creating browser session`, {
      backend,
      profile,
      site: options.site || 'unknown',
      reason: options.reason || 'auto-selected'
    });
    
    try {
      let result;
      
      if (backend === 'hyperbrowser') {
        result = await this.createHyperBrowserSession(profile, options);
      } else {
        result = await this.createChromiumBrowser(profile, options);
      }
      
      // Add usage tracking
      result.startTime = startTime;
      result.backend = backend;
      
      // Wrap close method to track usage
      const originalClose = result.close;
      result.close = async () => {
        this.trackUsage(backend, startTime);
        await originalClose();
      };
      
      return result;
      
    } catch (error) {
      logger.error(`❌ Failed to create ${backend} browser:`, error);
      
      // Fallback logic
      if (this.config.fallbackEnabled && backend === 'hyperbrowser') {
        logger.info('🔄 Falling back to local Chromium');
        return await this.createChromiumBrowser(profile, options);
      }
      
      throw error;
    }
  }

  /**
   * Intelligently select backend based on site and configuration
   */
  selectBackend(options) {
    // Explicit backend requested
    if (options.backend && options.backend !== 'auto') {
      return options.backend;
    }
    
    // HyperBrowser not available
    if (!this.hyperClient) {
      return 'chromium';
    }
    
    // Check site-specific configuration
    if (options.site) {
      const domain = this.extractDomain(options.site);
      const siteConfig = SITE_BACKEND_CONFIG[domain] || SITE_BACKEND_CONFIG.default;
      
      // Cost optimization: Use chromium for simple sites during business hours
      if (siteConfig.preferred === 'chromium' && this.isBusinessHours()) {
        return 'chromium';
      }
      
      return siteConfig.preferred;
    }
    
    // Default backend selection
    if (this.config.defaultBackend === 'auto') {
      // Use HyperBrowser for parallel operations (better scaling)
      if (options.parallel || options.scale) {
        return 'hyperbrowser';
      }
      
      // Default to chromium for cost savings
      return 'chromium';
    }
    
    return this.config.defaultBackend;
  }

  /**
   * Create HyperBrowser cloud session
   */
  async createHyperBrowserSession(profile, options) {
    // Check for reusable session
    const reusableSession = this.findReusableSession(options.site);
    if (reusableSession) {
      logger.info('♻️ Reusing existing HyperBrowser session');
      this.sessionStats.hyperbrowser.reused++;
      return reusableSession;
    }
    
    // Create new session
    const sessionConfig = {
      stealth: profile === 'stealth',
      adblock: options.adblock !== false
    };
    
    // Configure proxy strategy
    const siteConfig = this.getSiteConfig(options.site);
    
    // Proxy configuration options:
    // 1. useHyperProxy: Use HyperBrowser's built-in proxy ($10/GB)
    // 2. noProxy: No proxy (for testing or internal sites)
    // 3. If neither, we rely on HyperBrowser's connection (can't inject BrightData)
    
    if (siteConfig.useHyperProxy !== false && (siteConfig.useProxy || options.proxy)) {
      sessionConfig.proxy = true; // Use HyperBrowser's proxy
      logger.info('🔒 Using HyperBrowser built-in proxy ($10/GB)');
    } else if (siteConfig.noProxy || options.noProxy) {
      sessionConfig.proxy = false; // No proxy
      logger.info('⚠️ No proxy configured for HyperBrowser session');
    } else {
      // Note: Cannot use BrightData proxy with HyperBrowser
      // The session runs in their cloud, not locally
      sessionConfig.proxy = true; // Default to HyperBrowser proxy
      logger.info('🔒 Using HyperBrowser proxy (BrightData not available for cloud sessions)');
    }
    
    const session = await this.hyperClient.sessions.create(sessionConfig);
    this.sessionStats.hyperbrowser.created++;
    
    logger.info(`✅ HyperBrowser session created: ${session.id}`);
    
    // Connect Playwright
    const browser = await chromium.connectOverCDP(session.wsEndpoint);
    const context = browser.contexts()[0]; // Use default context
    const page = await context.newPage();
    
    // Apply additional stealth measures if needed
    if (profile === 'stealth') {
      await this.applyHyperBrowserStealth(page);
    }
    
    // Store session for potential reuse
    const sessionData = {
      id: session.id,
      browser,
      context,
      page,
      createdAt: Date.now(),
      site: options.site,
      close: async () => {
        await this.hyperClient.sessions.stop(session.id);
        this.hyperSessions.delete(session.id);
      }
    };
    
    this.hyperSessions.set(session.id, sessionData);
    
    return {
      browser,
      context,
      page,
      sessionId: session.id,
      backend: 'hyperbrowser',
      close: sessionData.close
    };
  }

  /**
   * Create local Chromium browser (original BrowserManager logic)
   */
  async createChromiumBrowser(profile, options) {
    const siteConfig = this.getSiteConfig(options.site);
    
    const launchOptions = {
      headless: siteConfig.headless !== false ? true : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    };
    
    // Add proxy if needed
    let proxyConfig = null;
    if (siteConfig.useProxy && process.env.BRIGHTDATA_USERNAME) {
      proxyConfig = ProxyConfig.getProxyUrl();
      launchOptions.proxy = {
        server: proxyConfig.server,
        username: proxyConfig.username,
        password: proxyConfig.password
      };
    }
    
    const browser = await chromium.launch(launchOptions);
    this.sessionStats.chromium.created++;
    
    const contextOptions = {
      viewport: { width: 1920, height: 1080 },
      userAgent: this.getRandomUserAgent(),
      bypassCSP: true,
      ignoreHTTPSErrors: true
    };
    
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    
    // Apply stealth measures
    if (profile === 'stealth') {
      await this.applyChromiumStealth(page);
    }
    
    const browserId = `chromium_${Date.now()}`;
    this.chromiumBrowsers.set(browserId, browser);
    
    logger.info(`✅ Chromium browser created: ${browserId}`);
    
    return {
      browser,
      context,
      page,
      browserId,
      backend: 'chromium',
      close: async () => {
        await browser.close();
        this.chromiumBrowsers.delete(browserId);
      }
    };
  }

  /**
   * Find reusable HyperBrowser session
   */
  findReusableSession(site) {
    const now = Date.now();
    
    for (const [id, session] of this.hyperSessions.entries()) {
      const age = now - session.createdAt;
      
      // Session too old
      if (age > this.config.sessionReuseTime) {
        continue;
      }
      
      // Same site or generic session
      if (session.site === site || !session.site) {
        return {
          browser: session.browser,
          context: session.context,
          page: session.page,
          sessionId: id,
          backend: 'hyperbrowser',
          close: session.close
        };
      }
    }
    
    return null;
  }

  /**
   * Apply HyperBrowser-specific stealth measures
   */
  async applyHyperBrowserStealth(page) {
    // HyperBrowser already handles most stealth, but we can add extras
    await page.evaluateOnNewDocument(() => {
      // Additional fingerprint randomization
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5].map(() => ({ name: 'Chrome PDF Plugin' }))
      });
    });
  }

  /**
   * Apply Chromium stealth measures (from original BrowserManager)
   */
  async applyChromiumStealth(page) {
    await page.evaluateOnNewDocument(() => {
      // Remove webdriver property
      delete navigator.__proto__.webdriver;
      
      // Mock chrome object
      Object.defineProperty(window, 'chrome', {
        value: {
          runtime: {},
          loadTimes: function() {},
          csi: function() {}
        }
      });
      
      // Mock permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });
  }

  /**
   * Track usage for cost analysis
   */
  trackUsage(backend, startTime) {
    const duration = Date.now() - startTime;
    const minutes = Math.ceil(duration / 60000);
    
    if (backend === 'hyperbrowser') {
      this.costTracker.sessions++;
      this.costTracker.minutes += minutes;
      this.costTracker.estimatedCost = (this.costTracker.minutes / 60) * 0.10;
      
      logger.info(`💰 HyperBrowser usage tracked`, {
        minutes,
        totalSessions: this.costTracker.sessions,
        estimatedCost: `$${this.costTracker.estimatedCost.toFixed(2)}`
      });
    }
  }

  /**
   * Get site-specific configuration
   */
  getSiteConfig(site) {
    if (!site) return SITE_BACKEND_CONFIG.default;
    
    const domain = this.extractDomain(site);
    return SITE_BACKEND_CONFIG[domain] || SITE_BACKEND_CONFIG.default;
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  /**
   * Check if current time is business hours (for cost optimization)
   */
  isBusinessHours() {
    const hour = new Date().getHours();
    return hour >= 9 && hour <= 17;
  }

  /**
   * Get random user agent from pool
   */
  getRandomUserAgent() {
    const agents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
    ];
    return agents[Math.floor(Math.random() * agents.length)];
  }

  /**
   * Generate user agent pool (compatibility)
   */
  generateUserAgentPool() {
    return [this.getRandomUserAgent()];
  }

  /**
   * Generate viewport pool (compatibility)
   */
  generateViewportPool() {
    return [{ width: 1920, height: 1080 }];
  }

  /**
   * Get usage statistics
   */
  getStats() {
    return {
      sessions: this.sessionStats,
      cost: this.costTracker,
      activeHyperSessions: this.hyperSessions.size,
      activeChromiumBrowsers: this.chromiumBrowsers.size
    };
  }

  /**
   * Cleanup all sessions
   */
  async cleanup() {
    logger.info('🧹 Cleaning up all browser sessions');
    
    // Close HyperBrowser sessions
    for (const [id, session] of this.hyperSessions.entries()) {
      await session.close();
    }
    
    // Close Chromium browsers
    for (const [id, browser] of this.chromiumBrowsers.entries()) {
      await browser.close();
    }
    
    // Log final stats
    logger.info('📊 Final session statistics', this.getStats());
  }
}

module.exports = BrowserManagerEnhanced;