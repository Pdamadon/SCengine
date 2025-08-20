/**
 * BrowserManager - Centralized Browser Configuration & Anti-Bot Detection
 * 
 * Normalizes Chromium/Playwright configurations across all scraping components
 * Provides consistent anti-bot detection measures for discovery, collection, and extraction
 * 
 * Usage:
 *   const browserManager = new BrowserManager();
 *   const { browser, context, page } = await browserManager.createBrowser('stealth');
 *   // ... use browser
 *   await browserManager.close();
 */

const { chromium } = require('playwright');
const { logger } = require('../utils/logger');
const ProxyConfig = require('../config/ProxyConfig');

class BrowserManager {
  constructor() {
    this.browsers = new Map();
    this.contexts = new Map();
    this.userAgentPool = this.generateUserAgentPool();
    this.viewportPool = this.generateViewportPool();
    
    // Anti-bot detection settings
    this.stealthSettings = {
      navigator: {
        webdriver: false,
        languages: ['en-US', 'en'],
        platform: 'Win32',
        cookieEnabled: true,
        doNotTrack: null,
        hardwareConcurrency: 8,
        maxTouchPoints: 0
      },
      screen: {
        width: 1920,
        height: 1080,
        colorDepth: 24,
        pixelDepth: 24
      },
      permissions: {
        notifications: 'default',
        geolocation: 'prompt',
        camera: 'prompt',
        microphone: 'prompt'
      }
    };
  }

  /**
   * Create browser with specified profile
   * @param {string} profile - Browser profile: 'stealth', 'development', 'testing' 
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} { browser, context, page }
   */
  async createBrowser(profile = 'stealth', options = {}) {
    const config = this.getBrowserConfig(profile, options);
    
    logger.info(`🌐 Creating browser with profile: ${profile}`, {
      userAgent: config.context.userAgent.substring(0, 50) + '...',
      viewport: config.context.viewport,
      headless: config.launch.headless
    });

    try {
      // Launch browser
      const browser = await chromium.launch(config.launch);
      const browserId = `${profile}_${Date.now()}`;
      this.browsers.set(browserId, browser);

      // Create context with stealth measures
      const context = await browser.newContext(config.context);
      this.contexts.set(browserId, context);

      // Apply anti-bot detection measures
      await this.applyStealthMeasures(context, config.stealth);

      // Create page
      const page = await context.newPage();

      // Apply page-level stealth measures
      await this.applyPageStealth(page, config.stealth);

      logger.info(`✅ Browser created successfully: ${browserId}`);

      return {
        browser,
        context,
        page,
        browserId,
        profile,
        close: () => this.closeBrowser(browserId)
      };

    } catch (error) {
      logger.error('❌ Failed to create browser:', error);
      throw error;
    }
  }

  /**
   * Get browser configuration for profile
   */
  getBrowserConfig(profile, options = {}) {
    // Check for proxy configuration in options or environment variables
    const proxyConfig = this.getProxyConfig(options);
    
    const baseConfig = {
      launch: {
        headless: true,
        args: [
          '--no-first-run',
          '--no-default-browser-check', 
          '--disable-default-apps',
          '--disable-popup-blocking',
          '--disable-translate',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-device-discovery-notifications',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--disable-backgrounding-occluded-windows',
          '--disable-blink-features=AutomationControlled',
          '--exclude-switches=enable-automation',
          '--disable-useragent-freeze',
          '--disable-component-extensions-with-background-pages',
          '--disable-extensions',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-gpu-sandbox',
          // Railway/Docker specific args
          ...(process.env.RAILWAY_ENVIRONMENT ? [
            '--disable-software-rasterizer'
          ] : ['--no-zygote', '--single-process']),
          // Add certificate error handling for proxy
          ...(proxyConfig ? ['--ignore-certificate-errors', '--ignore-certificate-errors-spki-list'] : [])
        ]
      },
      context: {
        viewport: this.getRandomViewport(),
        userAgent: this.getRandomUserAgent(),
        locale: 'en-US',
        timezoneId: 'America/New_York',
        permissions: ['geolocation', 'notifications'],
        ignoreHTTPSErrors: true,  // Ignore SSL certificate errors
        // Add proxy configuration if provided
        ...(proxyConfig ? { proxy: proxyConfig } : {}),
        extraHTTPHeaders: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      },
      stealth: {
        ...this.stealthSettings,
        humanTiming: true,
        randomizeInteractions: true
      }
    };

    // Profile-specific overrides
    switch (profile) {
      case 'stealth':
        return {
          ...baseConfig,
          launch: {
            ...baseConfig.launch,
            headless: false,  // ✅ Run with visible browser to avoid headless detection
            args: [
              ...baseConfig.launch.args,
              '--disable-blink-features=AutomationControlled',
              '--disable-dev-shm-usage',
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-background-timer-throttling',
              '--disable-backgrounding-occluded-windows',
              '--disable-renderer-backgrounding'
            ]
          },
          stealth: {
            ...baseConfig.stealth,
            maxStealthLevel: true
          }
        };

      case 'development':
        return {
          ...baseConfig,
          launch: {
            ...baseConfig.launch,
            headless: false,
            devtools: true
          },
          stealth: {
            ...baseConfig.stealth,
            humanTiming: false,
            randomizeInteractions: false
          }
        };

      case 'testing':
        return {
          ...baseConfig,
          launch: {
            ...baseConfig.launch,
            headless: true
          },
          context: {
            ...baseConfig.context,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          stealth: {
            ...baseConfig.stealth,
            humanTiming: false
          }
        };

      default:
        return baseConfig;
    }
  }

  /**
   * Apply context-level stealth measures
   */
  async applyStealthMeasures(context, stealthConfig) {
    // Override webdriver detection
    await context.addInitScript(() => {
      // Remove webdriver property
      delete navigator.__proto__.webdriver;
      
      // Override navigator properties
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // Override window.chrome
      Object.defineProperty(window, 'chrome', {
        writable: true,
        enumerable: true,
        configurable: false,
        value: {
          runtime: {},
          loadTimes: function() {},
          csi: function() {},
          app: {}
        }
      });

      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          {
            name: 'Chrome PDF Plugin',
            filename: 'internal-pdf-viewer',
            description: 'Portable Document Format'
          },
          {
            name: 'Chrome PDF Viewer', 
            filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
            description: ''
          }
        ],
      });

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });

    logger.debug('✅ Applied context stealth measures');
  }

  /**
   * Apply page-level stealth measures
   */
  async applyPageStealth(page, stealthConfig) {
    try {
      // Use context.addInitScript instead of page.evaluateOnNewDocument
      await page.context().addInitScript((config) => {
        // Override screen properties
        Object.defineProperty(screen, 'width', {
          get: () => config.screen.width
        });
        Object.defineProperty(screen, 'height', {
          get: () => config.screen.height  
        });
        Object.defineProperty(screen, 'colorDepth', {
          get: () => config.screen.colorDepth
        });

        // Override navigator properties
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: () => config.navigator.hardwareConcurrency
        });
        Object.defineProperty(navigator, 'deviceMemory', {
          get: () => 8
        });

        // Mock WebGL for better fingerprinting (safely)
        try {
          if (window.WebGLRenderingContext) {
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
              if (parameter === 37445) return 'Intel Inc.';
              if (parameter === 37446) return 'Intel(R) HD Graphics 630';
              return getParameter.call(this, parameter);
            };
          }
        } catch (e) {
          // Ignore WebGL override errors
        }

        // Add realistic timing (safely)
        try {
          const originalSetTimeout = window.setTimeout;
          window.setTimeout = function(callback, delay) {
            const jitter = Math.random() * 50; // Add 0-50ms random jitter
            return originalSetTimeout(callback, delay + jitter);
          };
        } catch (e) {
          // Ignore timing override errors
        }

      }, stealthConfig);

      logger.debug('✅ Applied page stealth measures');
      
      // Apply resource blocking for speed (unless disabled)
      if (!stealthConfig.skipResourceBlocking) {
        const BrowserOptimizations = require('./BrowserOptimizations');
        await BrowserOptimizations.blockUnnecessaryResources(page);
      }
    } catch (error) {
      logger.debug(`⚠️ Some stealth measures failed: ${error.message}`);
      // Continue without failing - stealth is best-effort
    }
  }

  /**
   * Generate pool of realistic user agents
   */
  generateUserAgentPool() {
    return [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
  }

  /**
   * Get proxy configuration from options or environment variables
   * Supports residential proxies, datacenter proxies, and rotating proxies
   */
  getProxyConfig(options = {}) {
    // Priority: direct proxy config > ProxyConfig class > environment variables
    let proxyConfig = null;

    // Check for direct proxy in options
    if (options.proxy) {
      proxyConfig = options.proxy;
    }
    // Use ProxyConfig class for advanced proxy management
    else if (options.proxyType || process.env.PROXY_TYPE) {
      const proxyOptions = {
        type: options.proxyType || process.env.PROXY_TYPE || 'residential',
        country: options.proxyCountry || process.env.PROXY_COUNTRY,
        city: options.proxyCity || process.env.PROXY_CITY,
        sessionDuration: options.proxySessionDuration || parseInt(process.env.PROXY_SESSION_DURATION) || 10
      };
      
      proxyConfig = ProxyConfig.getProxySettings(proxyOptions);
    }
    // Fallback to simple environment variable configuration
    else if (process.env.PROXY_URL || process.env.RESIDENTIAL_PROXY_URL) {
      proxyConfig = ProxyConfig.getCustomProxyConfig();
    }

    if (proxyConfig) {
      logger.info('🔒 Proxy configured:', {
        server: proxyConfig.server,
        authenticated: !!(proxyConfig.username && proxyConfig.password),
        bypass: proxyConfig.bypass
      });
    }

    return proxyConfig;
  }

  /**
   * Generate pool of realistic viewport sizes
   */
  generateViewportPool() {
    return [
      { width: 1920, height: 1080 }, // Full HD
      { width: 1366, height: 768 },  // Common laptop
      { width: 1536, height: 864 },  // 1.25x scale
      { width: 1440, height: 900 },  // MacBook Pro 
      { width: 1280, height: 720 },  // HD
    ];
  }

  /**
   * Get random user agent from pool
   */
  getRandomUserAgent() {
    return this.userAgentPool[Math.floor(Math.random() * this.userAgentPool.length)];
  }

  /**
   * Get random viewport from pool
   */
  getRandomViewport() {
    return this.viewportPool[Math.floor(Math.random() * this.viewportPool.length)];
  }

  /**
   * Add human-like delays
   * @param {number} baseDelay - Base delay in ms
   * @param {number} variance - Variance percentage (0-1)
   * @returns {Promise<void>}
   */
  async humanDelay(baseDelay = 1000, variance = 0.3) {
    const jitter = (Math.random() - 0.5) * 2 * variance; // -variance to +variance
    const actualDelay = Math.max(100, baseDelay + (baseDelay * jitter));
    
    logger.debug(`💤 Human delay: ${Math.round(actualDelay)}ms`);
    return new Promise(resolve => setTimeout(resolve, actualDelay));
  }

  /**
   * Human-like mouse movement before hover
   */
  async humanHover(page, element, options = {}) {
    try {
      // Get element bounding box
      const box = await element.boundingBox();
      if (!box) return;

      // Add small random offset within element
      const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
      const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);

      // Move mouse in human-like path
      const currentPos = { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 };
      
      // Move in steps to simulate human movement
      const steps = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        const x = currentPos.x + (targetX - currentPos.x) * progress;
        const y = currentPos.y + (targetY - currentPos.y) * progress;
        
        await page.mouse.move(x, y);
        if (i < steps) await this.humanDelay(50, 0.5);
      }

      // Final hover with small delay
      await this.humanDelay(100, 0.3);
      await element.hover(options);
      
      logger.debug(`🎯 Human hover completed`);
    } catch (error) {
      logger.debug(`❌ Human hover failed: ${error.message}`);
      // Fallback to regular hover
      await element.hover(options);
    }
  }

  /**
   * Close specific browser
   */
  async closeBrowser(browserId) {
    try {
      const context = this.contexts.get(browserId);
      const browser = this.browsers.get(browserId);

      if (context) {
        await context.close();
        this.contexts.delete(browserId);
      }

      if (browser) {
        await browser.close();
        this.browsers.delete(browserId);
      }

      logger.debug(`✅ Closed browser: ${browserId}`);
    } catch (error) {
      logger.warn(`Failed to close browser ${browserId}:`, error.message);
    }
  }

  /**
   * Close all browsers
   */
  async closeAll() {
    logger.info(`🔄 Closing ${this.browsers.size} browsers...`);
    
    const closePromises = Array.from(this.browsers.keys()).map(id => 
      this.closeBrowser(id)
    );
    
    await Promise.all(closePromises);
    
    logger.info('✅ All browsers closed');
  }

  /**
   * Get browser statistics
   */
  getStats() {
    return {
      activeBrowsers: this.browsers.size,
      activeContexts: this.contexts.size,
      userAgentPool: this.userAgentPool.length,
      viewportPool: this.viewportPool.length
    };
  }
}

module.exports = BrowserManager;