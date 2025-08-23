/**
 * NavigationMapperBrowserless - Updated NavigationMapper using Browserless.io
 * 
 * This is the production-ready version that integrates BrowserManagerBrowserless
 * for better handling of protected sites with BrightData proxy support.
 */

const { chromium } = require('playwright');
const BrowserManagerBrowserless = require('../../common/BrowserManagerBrowserless');
// Navigation strategies organized by type
const NavigationPatternStrategy = require('./strategies/navigation/NavigationPatternStrategy');
const FallbackLinkStrategy = require('./strategies/navigation/FallbackLinkStrategy');
const MegaMenuStrategy = require('./strategies/navigation/MegaMenuStrategy');
const ProductCatalogCache = require('../../cache/ProductCatalogCache');
const TaxonomyDiscoveryProcessor = require('./processors/TaxonomyDiscoveryProcessor');

// Site-specific configuration for browser settings
const SITE_CONFIG = {
  // Protected sites that need Browserless.io
  'toasttab.com': { 
    allowedHeadless: false,
    preferBrowserless: true,
    useProxy: true,
    autoSolveCaptcha: true
  },
  'doordash.com': { 
    allowedHeadless: false,
    preferBrowserless: true,
    useProxy: true,
    autoSolveCaptcha: true
  },
  'ubereats.com': { 
    allowedHeadless: false,
    preferBrowserless: true,
    useProxy: true,
    autoSolveCaptcha: true
  },
  
  // Sites that work locally with specific settings
  'macys.com': { 
    allowedHeadless: false,
    preferBrowserless: false,
    useProxy: true
  },
  'nordstrom.com': { 
    allowedHeadless: false,
    preferBrowserless: false,
    useProxy: true
  },
  'saks.com': { 
    allowedHeadless: false,
    preferBrowserless: false,
    useProxy: false
  },
  
  // Simple sites that work with local Chromium
  'glasswingshop.com': {
    allowedHeadless: true,
    preferBrowserless: false,
    useProxy: false
  },
  
  // Default configuration
  'default': { 
    allowedHeadless: true,
    preferBrowserless: false,
    useProxy: false
  }
};

class NavigationMapperBrowserless {
  constructor(logger, worldModel) {
    this.logger = logger;
    this.worldModel = worldModel;
    
    // Use BrowserManagerBrowserless instead of original BrowserManager
    this.browserManager = new BrowserManagerBrowserless({
      fallbackToLocal: true,
      enableHybridAutomation: false,
      maxConcurrentSessions: 5
    });
    
    this.useProcessors = true;
    this.isHeadless = null;
    this.currentBackend = null;
  }

  async initialize() {
    await this.initializeForSite(false);
  }

  async initializeForSite(needsNonHeadless = false, domain = null) {
    const normalizedDomain = domain ? domain.toLowerCase().replace(/^www\./, '') : null;
    const config = normalizedDomain ? (SITE_CONFIG[normalizedDomain] || SITE_CONFIG.default) : SITE_CONFIG.default;
    
    const forceHeadless = process.env.HEADLESS_MODE === 'true';
    const disableHeadless = process.env.HEADLESS_MODE === 'false';
    
    this.logger.info('Browser initialization with Browserless.io support:', {
      domain: normalizedDomain || 'not-provided',
      siteConfig: config,
      browserlessEnabled: process.env.USE_BROWSERLESS === 'true'
    });
    
    // Determine headless mode
    let shouldUseHeadless;
    let reason;
    
    if (!config.allowedHeadless || needsNonHeadless) {
      shouldUseHeadless = false;
      reason = !config.allowedHeadless ? 
        `site-specific config - ${normalizedDomain} blocks headless` : 
        'caller requested non-headless';
    } else if (forceHeadless) {
      shouldUseHeadless = true;
      reason = 'global HEADLESS_MODE=true override';
    } else if (disableHeadless) {
      shouldUseHeadless = false;
      reason = 'global HEADLESS_MODE=false override';
    } else {
      shouldUseHeadless = true;
      reason = 'default performance optimization';
    }
    
    this.isHeadless = shouldUseHeadless;
    this.headlessReason = reason;
    this.siteConfig = config;
    
    this.logger.info(`Browser configuration: headless=${shouldUseHeadless}, preferBrowserless=${config.preferBrowserless}`);
    
    // Initialize strategies
    this.strategies = [
      new NavigationPatternStrategy(this.logger, {
        maxCategories: 20,
        enableFullExtraction: true,
        patterns: ['macys-megamenu', 'glasswing-shop', 'universal-fallback'],
        hoverDelay: 3000,
        resetDelay: 300,
        timeout: 90000
      }),
      new FallbackLinkStrategy(this.logger, {
        includeHidden: true,
        maxLinks: 500
      })
    ];
  }

  /**
   * Backward compatibility: mapSiteNavigation -> extractNavigation
   * @deprecated Use extractNavigation() directly
   */
  async mapSiteNavigation(url) {
    this.logger.warn('mapSiteNavigation() is deprecated. Use extractNavigation() directly.');
    return this.extractNavigation(url);
  }

  /**
   * Backward compatibility: mapSiteTaxonomy -> extractNavigation
   * Returns navigation structure without product data
   */
  async mapSiteTaxonomy(url) {
    this.logger.info('mapSiteTaxonomy() called - using extractNavigation for navigation discovery');
    const result = await this.extractNavigation(url);
    
    // Filter out any product data to return only navigation taxonomy
    if (result && result.navigation) {
      return {
        ...result,
        navigation: result.navigation.map(nav => ({
          ...nav,
          products: undefined, // Remove product data if present
          subcategories: nav.subcategories?.map(sub => ({
            ...sub,
            products: undefined
          }))
        }))
      };
    }
    
    return result;
  }

  /**
   * Backward compatibility: close() -> cleanup()
   */
  async close() {
    return this.cleanup();
  }

  /**
   * Close any popups/modals on the page
   * Copied from NavigationMapper for compatibility
   */
  async closeAnyPopups(page) {
    try {
      const modalCloseSelectors = [
        // Aria labels
        'button[aria-label*="close"]:visible',
        'button[aria-label*="Close"]:visible',
        'button[aria-label*="dismiss"]:visible',
        
        // Modal/popup close buttons
        '[class*="modal"] button[class*="close"]:visible',
        '[class*="popup"] button[class*="close"]:visible',
        '[class*="overlay"] button[class*="close"]:visible',
        '.modal button.close:visible',
        '.popup button.close:visible',
        
        // Text-based close buttons
        'button:has-text("No Thanks"):visible',
        'button:has-text("Close"):visible',
        'button:has-text("X"):visible',
        'button:has-text("×"):visible',
        'button:has-text("Dismiss"):visible',
        'button:has-text("Maybe Later"):visible',
        
        // Cookie/privacy banners
        'button[class*="accept-cookies"]:visible',
        'button[class*="cookie-accept"]:visible',
        'button:has-text("Accept"):visible',
        'button:has-text("I Agree"):visible',
        'button:has-text("Got It"):visible',
        
        // Email signup dismissals
        'button[class*="decline"]:visible',
        '[class*="email-signup"] button[class*="close"]:visible',
        '[class*="newsletter"] button[class*="close"]:visible',
        
        // Generic close icons
        'button.close:visible',
        'a.close:visible',
        '[class*="close-button"]:visible',
        '[class*="close-icon"]:visible',
        '[class*="dialog"] button[class*="close"]:visible',
        '[role="dialog"] button[aria-label*="close"]:visible'
      ];
      
      let closedCount = 0;
      
      // Try to close multiple popups/overlays
      for (const selector of modalCloseSelectors) {
        try {
          const closeButtons = await page.locator(selector).all();
          for (const button of closeButtons) {
            try {
              if (await button.isVisible({ timeout: 100 })) {
                await button.click();
                closedCount++;
                await page.waitForTimeout(200); // Small delay between closes
              }
            } catch (e) {
              // Skip if can't click
            }
          }
        } catch (e) {
          // Try next selector
        }
      }
      
      // Also try to click outside any modal/overlay to dismiss
      if (closedCount === 0) {
        try {
          // Click on body to dismiss any click-outside dismissable overlays
          await page.locator('body').click({ position: { x: 10, y: 10 }, timeout: 500 });
        } catch (e) {
          // Ignore if can't click
        }
      }
      
      if (closedCount > 0) {
        this.logger.info(`Closed ${closedCount} popup(s)/modal(s)`);
        await page.waitForTimeout(1000); // Wait for animations
      }
      
      return closedCount;
    } catch (error) {
      this.logger.debug('Error closing popups (non-critical):', error.message);
      return 0;
    }
  }

  /**
   * Extract navigation with Browserless.io support for protected sites
   */
  async extractNavigation(url, options = {}) {
    if (!url) {
      throw new Error('URL is required for navigation extraction');
    }

    const startTime = Date.now();
    const tracker = {
      url,
      strategies: [],
      startTime,
      errors: []
    };

    try {
      // Parse domain from URL
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      const domain = urlObj.hostname.replace(/^www\./, '');
      
      // Initialize for this specific site
      await this.initializeForSite(false, domain);
      
      // Create browser with site-specific configuration
      const browserOptions = {
        site: url,
        headless: this.isHeadless,
        backend: this.siteConfig.preferBrowserless ? 'browserless' : 'auto',
        proxy: this.siteConfig.useProxy ? 'brightdata' : false,
        proxyType: 'residential',
        autoSolveCaptcha: this.siteConfig.autoSolveCaptcha || false,
        humanInLoop: options.requiresHumanAuth || false,
        onCaptcha: async (page, cdp) => {
          this.logger.warn('CAPTCHA detected on', url);
          tracker.captchaDetected = true;
        },
        onLiveUrl: (liveUrl) => {
          this.logger.info('Human intervention available at:', liveUrl);
          tracker.humanInterventionUrl = liveUrl;
        }
      };
      
      const { page, close, backend, cdp } = await this.browserManager.createBrowser('stealth', browserOptions);
      this.currentBackend = backend;
      
      this.logger.info(`Using ${backend} backend for ${url}`);
      tracker.backend = backend;
      
      try {
        // Navigate to the URL with retry logic for protected sites
        const maxNavigationAttempts = this.siteConfig.preferBrowserless ? 3 : 1;
        let navigationSuccess = false;
        let lastError;
        
        for (let attempt = 1; attempt <= maxNavigationAttempts; attempt++) {
          try {
            await page.goto(url, { 
              waitUntil: 'networkidle',  // Playwright uses 'networkidle' not 'networkidle2'
              timeout: 30000 
            });
            
            // Check if we hit a CAPTCHA or protection page
            const isBlocked = await this.checkIfBlocked(page);
            if (isBlocked) {
              this.logger.warn(`Attempt ${attempt}: Site protection detected`);
              
              if (this.siteConfig.autoSolveCaptcha && cdp) {
                this.logger.info('Waiting for automatic CAPTCHA solving...');
                await page.waitForTimeout(10000); // Give time for auto-solve
                
                // Check if we're past the CAPTCHA
                const stillBlocked = await this.checkIfBlocked(page);
                if (!stillBlocked) {
                  navigationSuccess = true;
                  break;
                }
              }
              
              if (attempt < maxNavigationAttempts) {
                await page.waitForTimeout(3000);
                continue;
              }
            } else {
              navigationSuccess = true;
              break;
            }
          } catch (error) {
            lastError = error;
            this.logger.warn(`Navigation attempt ${attempt} failed:`, error.message);
          }
        }
        
        if (!navigationSuccess) {
          throw lastError || new Error('Failed to navigate past site protection');
        }
        
        // Extract navigation using strategies
        let result = null;
        
        for (const strategy of this.strategies) {
          const strategyName = strategy.constructor.name;
          this.logger.info(`Attempting ${strategyName} for ${url}`);
          
          const strategyTracker = {
            name: strategyName,
            startTime: Date.now(),
            success: false
          };
          
          try {
            result = await strategy.execute(page, url);
            
            if (result && result.navigation && result.navigation.length > 0) {
              strategyTracker.success = true;
              strategyTracker.itemCount = result.navigation.length;
              strategyTracker.duration = Date.now() - strategyTracker.startTime;
              
              this.logger.info(`✅ ${strategyName} succeeded:`, {
                items: result.navigation.length,
                duration: `${strategyTracker.duration}ms`
              });
              
              tracker.strategies.push(strategyTracker);
              break;
            }
          } catch (error) {
            strategyTracker.error = error.message;
            strategyTracker.duration = Date.now() - strategyTracker.startTime;
            tracker.strategies.push(strategyTracker);
            
            this.logger.warn(`${strategyName} failed:`, error.message);
          }
        }
        
        // Process results if we have them
        if (result && result.navigation && result.navigation.length > 0) {
          if (this.useProcessors) {
            const processor = new TaxonomyDiscoveryProcessor(this.logger);
            result = await processor.processNavigationData(result);
          }
          
          tracker.success = true;
          tracker.itemCount = result.navigation.length;
          tracker.duration = Date.now() - startTime;
          
          // Cache the results
          if (result.navigation.length > 10) {
            const cache = new ProductCatalogCache();
            await cache.storeTaxonomy(url, result);
            this.logger.info(`Cached ${result.navigation.length} navigation items for ${url}`);
          }
          
          return result;
        } else {
          throw new Error('No navigation items extracted from any strategy');
        }
        
      } finally {
        await close();
        
        // Log session stats
        const stats = this.browserManager.getStats();
        this.logger.info('Session statistics:', {
          backend,
          captchasDetected: stats.sessions.captchasDetected,
          estimatedCost: `$${stats.cost.estimatedCost.toFixed(4)}`
        });
      }
      
    } catch (error) {
      tracker.success = false;
      tracker.error = error.message;
      tracker.duration = Date.now() - startTime;
      
      this.logger.error('Navigation extraction failed:', error);
      throw error;
      
    } finally {
      // Log extraction summary
      this.logger.info('Extraction summary:', {
        url,
        backend: tracker.backend,
        success: tracker.success,
        duration: `${tracker.duration}ms`,
        strategies: tracker.strategies
      });
    }
  }

  /**
   * Check if page is blocked by CAPTCHA or protection
   */
  async checkIfBlocked(page) {
    // Common CAPTCHA and protection selectors
    const protectionSelectors = [
      '.cf-turnstile',           // Cloudflare Turnstile
      '.g-recaptcha',            // Google reCAPTCHA
      '#px-captcha',             // PerimeterX
      '.challenge-form',         // Cloudflare challenge
      '[data-testid="captcha"]', // Generic CAPTCHA
      '.ddos-protection'         // DDoS protection
    ];
    
    for (const selector of protectionSelectors) {
      const element = await page.$(selector);
      if (element) {
        this.logger.warn(`Protection detected: ${selector}`);
        return true;
      }
    }
    
    // Check page title for common protection messages
    const title = await page.title();
    const protectionTitles = [
      'just a moment',
      'please wait',
      'checking your browser',
      'access denied',
      'attention required'
    ];
    
    if (protectionTitles.some(t => title.toLowerCase().includes(t))) {
      this.logger.warn(`Protection detected in title: ${title}`);
      return true;
    }
    
    return false;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    // Get final statistics before cleanup
    const stats = this.browserManager.getStats();
    this.logger.info('Final Browserless.io statistics:', {
      totalSessions: stats.sessions.created,
      failedSessions: stats.sessions.failed,
      captchasDetected: stats.sessions.captchasDetected,
      humanInterventions: stats.sessions.humanInterventions,
      totalCost: `$${stats.cost.estimatedCost.toFixed(2)}`
    });
  }
}

module.exports = NavigationMapperBrowserless;