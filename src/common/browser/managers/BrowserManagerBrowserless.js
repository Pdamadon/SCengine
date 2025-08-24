/**
 * BrowserManagerBrowserless - Integration with Browserless.io
 * 
 * Browserless.io advantages over HyperBrowser:
 * - Supports custom proxies (BrightData, etc.)
 * - Full Puppeteer/Playwright compatibility
 * - Human-in-the-loop capabilities
 * - CAPTCHA detection and solving
 * - More control over browser configuration
 * 
 * Usage:
 *   const browserManager = new BrowserManagerBrowserless();
 *   const { page, close } = await browserManager.createBrowser('stealth', {
 *     proxy: 'brightdata',  // Uses your BrightData proxy!
 *     site: 'toasttab.com'
 *   });
 */

const { chromium } = require('playwright');
const { logger } = require('../../../utils/logger');
const ProxyConfig = require('../../../config/ProxyConfig');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

class BrowserManagerBrowserless {
  constructor(config = {}) {
    this.config = {
      // Browserless.io configuration
      browserlessToken: process.env.BROWSERLESS_TOKEN,
      browserlessEndpoint: process.env.BROWSERLESS_ENDPOINT || 'wss://production-sfo.browserless.io',
      
      // Feature flags
      useBrowserless: process.env.USE_BROWSERLESS === 'true',
      fallbackToLocal: config.fallbackToLocal !== false,
      enableHybridAutomation: config.enableHybridAutomation || false,
      
      // Performance  
      sessionTimeout: config.sessionTimeout || 60000, // 60 seconds (Browserless max)
      maxConcurrentSessions: config.maxConcurrentSessions || 10
    };

    // Site config resolver - injectable for testing, defaults to BrowserSiteConfig
    this.siteConfigResolver = 
      typeof config.getBrowserConfigForDomain === 'function'
        ? config.getBrowserConfigForDomain
        : (() => {
            try {
              const { getBrowserConfigForDomain } = require('../../../config/BrowserSiteConfig');
              return getBrowserConfigForDomain;
            } catch {
              return () => null;
            }
          })();
    
    // Session management
    this.activeSessions = new Map();
    this.sessionStats = {
      created: 0,
      failed: 0,
      captchasDetected: 0,
      humanInterventions: 0
    };
    
    // Cost tracking (Browserless pricing)
    this.costTracker = {
      minutes: 0,
      dataGB: 0,
      estimatedCost: 0
    };
  }

  /**
   * Initialize BrowserQL session for human-in-the-loop or debug viewing
   * Uses BQL's GraphQL API to create a session with liveURL support
   */
  async initBQLSession(url, options = {}) {
    const timeout = options.timeout || this.config.sessionTimeout || 60000;
    const queryParams = new URLSearchParams({
      token: this.config.browserlessToken,
      timeout
    });

    // Add proxy if specified
    if (options.proxy) {
      const proxyConfig = this.getProxyConfiguration(options);
      if (proxyConfig) {
        queryParams.append('proxy', proxyConfig.server || 'residential');
        if (proxyConfig.country) queryParams.append('proxyCountry', proxyConfig.country);
        if (proxyConfig.username) queryParams.append('proxyUsername', proxyConfig.username);
        if (proxyConfig.password) queryParams.append('proxyPassword', proxyConfig.password);
      }
    }

    // Add stealth mode
    if (options.stealth !== false) {
      queryParams.append('stealth', 'true');
    }

    // Force headful mode for debugging/HITL
    if (options.debug || options.humanInTheLoop) {
      queryParams.append('headless', 'false');
    }

    // BQL mutation to initialize session and get reconnect endpoint
    const bqlMutation = `
      mutation InitSession($url: String!) {
        goto(url: $url, waitUntil: networkIdle) {
          status
          url
        }
        reconnect(timeout: 30000) {
          browserWSEndpoint
        }
      }
    `;

    const endpoint = `https://production-sfo.browserless.io/chromium/bql?${queryParams.toString()}`;
    
    try {
      logger.info('🚀 Initializing BQL session for:', url);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ 
          query: bqlMutation, 
          variables: { url } 
        })
      });

      if (!response.ok) {
        throw new Error(`BQL initialization failed: ${await response.text()}`);
      }

      const { data, errors } = await response.json();
      
      if (errors) {
        throw new Error(`BQL errors: ${JSON.stringify(errors)}`);
      }

      const wsEndpoint = data.reconnect.browserWSEndpoint;
      const wsURL = `${wsEndpoint}?${queryParams.toString()}`;
      
      logger.info('✅ BQL session initialized, WebSocket endpoint ready');
      
      return { 
        wsURL, 
        wsEndpoint,
        sessionId: `bql_${Date.now()}`
      };
    } catch (error) {
      logger.error('BQL initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get liveURL from CDP session for real-time browser viewing
   */
  async getLiveURL(page) {
    try {
      const cdpSession = await page.context().newCDPSession(page);
      const { liveURL } = await cdpSession.send('Browserless.liveURL');
      
      if (liveURL) {
        logger.info('🔍 LIVE DEBUG VIEW AVAILABLE:');
        logger.info(`   👉 Open this URL in your browser: ${liveURL}`);
        logger.info('   📺 Watch the automation in real-time!');
        logger.info('   🔗 Share this URL with others (no token needed)');
        
        // Auto-open if enabled
        if (process.env.AUTO_OPEN_DEBUG === 'true') {
          this.autoOpenURL(liveURL);
        }
        
        return { liveURL, cdpSession };
      }
    } catch (error) {
      logger.warn('Could not get liveURL (this is OK for non-BQL sessions):', error.message);
    }
    
    return { liveURL: null, cdpSession: null };
  }

  /**
   * Auto-open URL in default browser
   */
  autoOpenURL(url) {
    const { exec } = require('child_process');
    const platform = process.platform;
    let command;
    
    if (platform === 'darwin') {
      command = `open "${url}"`;
    } else if (platform === 'win32') {
      command = `start "" "${url}"`;
    } else {
      command = `xdg-open "${url}" 2>/dev/null || sensible-browser "${url}" 2>/dev/null`;
    }
    
    exec(command, (error) => {
      if (!error) {
        logger.info('🚀 Debug URL automatically opened in your browser!');
      } else {
        logger.warn('Could not auto-open URL:', error.message);
      }
    });
  }

  /**
   * Create browser with Browserless.io or local fallback
   */
  async createBrowser(profile = 'stealth', options = {}) {
    const startTime = Date.now();
    
    // Merge site configuration with options
    options = this.mergeOptionsWithSiteConfig(options);
    
    // Determine if we should use Browserless
    const shouldUseBrowserless = this.shouldUseBrowserless(options);
    
    if (shouldUseBrowserless && this.config.browserlessToken) {
      try {
        return await this.createBrowserlessSession(profile, options);
      } catch (error) {
        logger.error('Browserless.io failed:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        if (this.config.fallbackToLocal) {
          logger.info('Falling back to local Chromium');
          return await this.createLocalBrowser(profile, options);
        }
        throw error;
      }
    }
    
    return await this.createLocalBrowser(profile, options);
  }

  /**
   * Create Browserless.io session with BrightData proxy support
   */
  async createBrowserlessSession(profile, options) {
    const sessionId = `browserless_${Date.now()}`;
    
    logger.info('🌐 Creating Browserless.io session', {
      profile,
      site: options.site,
      proxy: options.proxy || 'none'
    });
    
    let browser, page, cdp, context;
    let liveURL = null;
    let bqlSession = null;
    
    // Check if we should use BQL for debug/HITL capabilities
    let useBQL = (options.debug || process.env.BROWSERLESS_DEBUG === 'true' || 
                  options.humanInTheLoop || options.useBQL);
    
    if (useBQL && options.site) {
      try {
        // Initialize BQL session first to navigate to the site
        logger.info('🎯 Using BQL for enhanced debug/HITL capabilities');
        bqlSession = await this.initBQLSession(options.site, {
          ...options,
          debug: options.debug || process.env.BROWSERLESS_DEBUG === 'true'
        });
        
        // Connect Playwright to the BQL session
        browser = await chromium.connectOverCDP(bqlSession.wsURL);
        logger.info('✅ Connected to BQL session via Playwright');
        
        // Session is already navigated to the site via BQL
        sessionId = bqlSession.sessionId;
      } catch (bqlError) {
        logger.warn('BQL initialization failed, falling back to direct connection:', bqlError.message);
        // Fall back to regular connection
        useBQL = false;
      }
    }
    
    // Regular connection if not using BQL
    if (!useBQL || !browser) {
      // Build connection URL (without proxy params - those go in context)
      const wsUrl = this.buildBrowserlessUrl(options);
      
      // Connect to Browserless using Playwright CDP
      try {
        logger.info('Attempting Browserless connection:', {
          url: wsUrl.replace(this.config.browserlessToken, 'TOKEN_HIDDEN'),
          hasToken: !!this.config.browserlessToken
        });
        browser = await chromium.connectOverCDP(wsUrl);
        logger.info('Successfully connected to Browserless.io');
      } catch (connectError) {
        logger.error('Failed to connect to Browserless:', connectError.message);
        throw connectError;
      }
    }
    
    // Create context with proxy configuration if needed
    const contextOptions = {
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      // BrightData certificate is available at: certificates/brightdata-ca.crt
      // To properly use it, install with: sudo security add-trusted-cert -d -r trustAsRoot -k /Library/Keychains/System.keychain brightdata-ca.crt
      // For now, we'll ignore HTTPS errors until certificate is properly installed system-wide
      ignoreHTTPSErrors: true,
      bypassCSP: true
    };
    
    // Add proxy configuration to context (per Browserless docs)
    if (options.proxy) {
      const proxyConfig = this.getProxyConfiguration(options);
      if (proxyConfig) {
        contextOptions.proxy = {
          server: proxyConfig.server,
          username: proxyConfig.username,
          password: proxyConfig.password
        };
        logger.info('🔐 Configured proxy in context:', {
          server: proxyConfig.server,
          type: options.proxy
        });
      }
    }
    
    context = await browser.newContext(contextOptions);
    page = await context.newPage();
    
    // CDP session is optional - not all features may be available via Browserless
    try {
      cdp = await context.newCDPSession(page);
      logger.info('CDP session created successfully');
      
      // Get liveURL if using BQL or debug mode
      if (useBQL || options.debug || process.env.BROWSERLESS_DEBUG === 'true') {
        try {
          const liveResult = await this.getLiveURL(page);
          if (liveResult.liveURL) {
            liveURL = liveResult.liveURL;
            // Keep the CDP session for potential HITL events
            if (liveResult.cdpSession) {
              cdp = liveResult.cdpSession;
            }
          }
        } catch (e) {
          // Live URL might not be available in all plans
          logger.debug('Could not get liveURL:', e.message);
        }
      }
      
      // Enable hybrid automation if requested
      if (this.config.enableHybridAutomation && options.humanInLoop) {
        await this.setupHybridAutomation(cdp, page, options);
      }
      
      // Enhanced CAPTCHA detection and handling
      if (cdp) {
        cdp.on('Browserless.captchaFound', async (data) => {
          const captchaInfo = {
            type: data?.captchaType || 'unknown',
            siteKey: data?.siteKey,
            pageUrl: page.url(),
            timestamp: new Date().toISOString()
          };
          
          logger.warn('🔒 CAPTCHA detected!', captchaInfo);
          this.sessionStats.captchasDetected++;
          
          // Store CAPTCHA event for analytics
          if (!this.captchaEvents) this.captchaEvents = [];
          this.captchaEvents.push({
            ...captchaInfo,
            sessionId,
            site: options.site
          });
          
          // Handle CAPTCHA based on configuration
          if (options.humanInTheLoop || useBQL) {
            // Human will solve via liveURL
            logger.info('👤 CAPTCHA requires human intervention');
            logger.info(`   Use liveURL to solve: ${liveURL}`);
            
            // Wait for human to solve
            if (cdp) {
              await new Promise((resolve) => {
                cdp.once('Browserless.liveComplete', resolve);
              });
            }
          } else if (options.autoSolveCaptcha) {
            // Attempt automatic solving
            try {
              logger.info('🤖 Attempting automatic CAPTCHA solve...');
              const result = await cdp.send('Browserless.solveCaptcha');
              
              if (result.solved) {
                logger.info('✅ CAPTCHA solved automatically');
                this.sessionStats.captchasSolved = (this.sessionStats.captchasSolved || 0) + 1;
              } else {
                logger.warn('❌ CAPTCHA solve failed', result.error);
                this.sessionStats.captchasFailed = (this.sessionStats.captchasFailed || 0) + 1;
              }
            } catch (solveError) {
              logger.error('CAPTCHA solve error:', solveError);
              this.sessionStats.captchasFailed = (this.sessionStats.captchasFailed || 0) + 1;
            }
          } else if (options.onCaptcha) {
            // Custom handler
            await options.onCaptcha(page, cdp, captchaInfo);
          } else {
            logger.warn('⚠️ CAPTCHA detected but no handler configured');
          }
        });
        
        // Listen for session completion (human finished interaction)
        cdp.on('Browserless.liveComplete', () => {
          logger.info('✅ Live session completed');
          this.sessionStats.humanInterventions++;
        });
      }
    } catch (cdpError) {
      logger.info('CDP session not available (this is normal for Browserless):', cdpError.message);
      cdp = null;
      // Continue without CDP features - page operations will still work
    }
    
    // Apply stealth measures (optional - may not work with all Browserless configurations)
    if (profile === 'stealth') {
      try {
        await this.applyStealthMeasures(page);
        logger.info('Stealth measures applied');
      } catch (stealthError) {
        logger.warn('Could not apply stealth measures (this is OK):', stealthError.message);
      }
    }
    
    // Track session
    this.activeSessions.set(sessionId, {
      browser,
      page,
      cdp,
      startTime: Date.now(),
      site: options.site
    });
    
    this.sessionStats.created++;
    
    logger.info('✅ Browserless session ready:', { 
      sessionId, 
      backend: 'browserless',
      liveURL: liveURL || 'Not available (upgrade to BQL for live viewing)'
    });
    
    return {
      browser,
      page,
      cdp,
      context,
      sessionId,
      backend: 'browserless',
      liveURL,  // Include liveURL for debugging/HITL
      close: async () => {
        await this.closeSession(sessionId);
      }
    };
  }

  /**
   * Build Browserless.io WebSocket URL
   */
  buildBrowserlessUrl(options) {
    const params = new URLSearchParams({
      token: this.config.browserlessToken
    });
    
    // Add timeout
    if (options.timeout || this.config.sessionTimeout) {
      params.append('timeout', options.timeout || this.config.sessionTimeout);
    }
    
    // DEBUGGING: Force headful mode to see the browser
    const debugMode = options.debug || process.env.BROWSERLESS_DEBUG === 'true';
    if (debugMode) {
      params.append('headless', 'false');  // Show browser window
      logger.info('🖥️ Debug mode: Browser will be visible');
    } else if (options.headless !== false) {
      params.append('headless', 'true');
    }
    
    // Block ads for performance
    if (options.blockAds !== false) {
      params.append('blockAds', 'true');
    }
    
    // Stealth mode
    if (options.stealth !== false) {
      params.append('stealth', 'true');
    }
    
    return `${this.config.browserlessEndpoint}?${params.toString()}`;
  }

  /**
   * Get proxy configuration based on options
   */
  getProxyConfiguration(options) {
    const proxyType = options.proxy;
    
    if (proxyType === 'brightdata' || proxyType === true) {
      // Use BrightData configuration from ProxyConfig
      return ProxyConfig.getProxySettings({
        type: options.proxyType || 'residential',
        country: options.country,
        city: options.city
      });
    } else if (proxyType === 'custom' && options.proxyConfig) {
      // Use custom proxy configuration
      return options.proxyConfig;
    } else if (typeof proxyType === 'object') {
      // Direct proxy configuration object
      return proxyType;
    }
    
    return null;
  }

  /**
   * Setup hybrid automation (human-in-the-loop)
   */
  async setupHybridAutomation(cdp, page, options) {
    const liveUrlOptions = {
      quality: options.streamQuality || 50,
      timeout: options.liveTimeout || 2 * 60 * 1000, // 2 minutes
      resizable: options.resizable !== false,
      interactable: options.interactable !== false
    };
    
    // Create live URL for human intervention
    const { liveURL } = await cdp.send('Browserless.liveURL', liveUrlOptions);
    
    logger.info('👤 Hybrid automation enabled', {
      liveURL,
      timeout: liveUrlOptions.timeout
    });
    
    // Notify about live URL
    if (options.onLiveUrl) {
      await options.onLiveUrl(liveURL);
    }
    
    // Track human intervention
    cdp.on('Browserless.liveComplete', () => {
      logger.info('✅ Human intervention completed');
      this.sessionStats.humanInterventions++;
    });
    
    return liveURL;
  }

  /**
   * Solve CAPTCHA using Browserless.io's built-in solver
   */
  async solveCaptcha(cdp) {
    logger.info('🤖 Attempting automatic CAPTCHA solving');
    
    try {
      const { solved, error } = await cdp.send('Browserless.solveCaptcha', {
        appearTimeout: 20000
      });
      
      if (solved) {
        logger.info('✅ CAPTCHA solved automatically');
      } else {
        logger.error('❌ CAPTCHA solving failed:', error);
      }
      
      return { solved, error };
    } catch (error) {
      logger.error('CAPTCHA solving error:', error);
      return { solved: false, error: error.message };
    }
  }

  /**
   * Apply stealth measures to avoid detection
   */
  async applyStealthMeasures(page) {
    // Browserless.io already includes stealth patches, but we can add more
    // In Playwright, use addInitScript instead of evaluateOnNewDocument
    await page.addInitScript(() => {
      // Additional fingerprint randomization
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5].map(() => ({ 
          name: 'Chrome PDF Plugin',
          filename: 'internal-pdf-viewer',
          description: 'Portable Document Format'
        }))
      });
      
      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });
    });
  }

  /**
   * Create local Chromium browser (fallback)
   */
  async createLocalBrowser(profile, options) {
    const { chromium } = require('playwright');
    
    const launchOptions = {
      headless: options.headless !== false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    };
    
    // Add BrightData proxy for local browser
    if (options.proxy) {
      const proxyConfig = this.getProxyConfiguration(options);
      if (proxyConfig) {
        launchOptions.proxy = proxyConfig;
      }
    }
    
    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    const page = await context.newPage();
    
    return {
      browser,
      page,
      context,
      backend: 'local',
      close: async () => {
        await browser.close();
      }
    };
  }

  /**
   * Merge site configuration with options (site config fills gaps, options override)
   */
  mergeOptionsWithSiteConfig(options) {
    const siteCfg = options.siteConfig || (options.site ? this.siteConfigResolver(options.site) : null);
    if (!siteCfg) return options;

    const merged = { ...options };

    // Proxy
    if (siteCfg.useProxy && merged.proxy == null) {
      merged.proxy = 'brightdata';
    }

    // Headless
    if (siteCfg.allowedHeadless === false && merged.headless == null) {
      merged.headless = false;
    }

    // Backend preference
    if (merged.backend == null && siteCfg.preferBrowserless === true) {
      merged.backend = 'browserless';
    }

    // CAPTCHA solving
    if (merged.autoSolveCaptcha == null && siteCfg.autoSolveCaptcha != null) {
      merged.autoSolveCaptcha = siteCfg.autoSolveCaptcha;
    }

    return merged;
  }

  /**
   * Determine if we should use Browserless.io
   */
  shouldUseBrowserless(options) {
    // Get site configuration
    const siteCfg = options.siteConfig || (options.site ? this.siteConfigResolver(options.site) : null);
    
    // Explicit backend selection always wins
    if (options.backend === 'browserless') return true;
    if (options.backend === 'local') return false;
    
    // Token presence required for Browserless
    if (!this.config.browserlessToken) {
      logger.warn('Browserless token not configured, using local browser');
      return false;
    }
    
    // Site-config-driven decisions
    if (siteCfg) {
      if (siteCfg.preferBrowserless) return true;
      if (siteCfg.autoSolveCaptcha) return true;
    }
    
    // Option-driven decisions
    if (options.humanInLoop) return true;
    if (options.autoSolveCaptcha) return true;
    
    // Fallback to global configuration
    return this.config.useBrowserless;
  }

  /**
   * Close session and track usage
   */
  async closeSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    
    const duration = Date.now() - session.startTime;
    const minutes = Math.ceil(duration / 60000);
    
    // Track costs (Browserless.io pricing varies by plan)
    this.costTracker.minutes += minutes;
    this.costTracker.estimatedCost = this.calculateCost();
    
    logger.info('💰 Session closed', {
      sessionId,
      duration: `${minutes} minutes`,
      estimatedCost: `$${this.costTracker.estimatedCost.toFixed(4)}`
    });
    
    // Close browser
    if (session.browser) {
      await session.browser.close();
    }
    
    this.activeSessions.delete(sessionId);
  }

  /**
   * Calculate estimated cost based on usage
   */
  calculateCost() {
    // Browserless.io pricing (example - check current pricing)
    // Dedicated plan: ~$250/month for unlimited
    // Usage-based: ~$0.01 per minute
    const costPerMinute = 0.01;
    return this.costTracker.minutes * costPerMinute;
  }

  /**
   * Get usage statistics
   */
  getStats() {
    return {
      sessions: this.sessionStats,
      cost: this.costTracker,
      activeSessions: this.activeSessions.size,
      captchas: this.getCaptchaStats()
    };
  }
  
  /**
   * Get CAPTCHA analytics
   */
  getCaptchaStats() {
    const stats = {
      detected: this.sessionStats.captchasDetected || 0,
      solved: this.sessionStats.captchasSolved || 0,
      failed: this.sessionStats.captchasFailed || 0,
      humanInterventions: this.sessionStats.humanInterventions || 0,
      successRate: 0,
      recentEvents: []
    };
    
    // Calculate success rate
    if (stats.detected > 0) {
      stats.successRate = ((stats.solved / stats.detected) * 100).toFixed(2) + '%';
    }
    
    // Get last 5 CAPTCHA events
    if (this.captchaEvents && this.captchaEvents.length > 0) {
      stats.recentEvents = this.captchaEvents.slice(-5).reverse();
    }
    
    return stats;
  }
  
  /**
   * Save CAPTCHA events to database (for long-term analytics)
   */
  async saveCaptchaEvents() {
    if (!this.captchaEvents || this.captchaEvents.length === 0) {
      return;
    }
    
    try {
      // TODO: Implement MongoDB save when needed
      // const db = await getMongoConnection();
      // await db.collection('captcha_events').insertMany(this.captchaEvents);
      
      logger.info(`📊 Would save ${this.captchaEvents.length} CAPTCHA events to database`);
      
      // Clear events after saving
      this.captchaEvents = [];
    } catch (error) {
      logger.error('Failed to save CAPTCHA events:', error);
    }
  }
}

module.exports = BrowserManagerBrowserless;