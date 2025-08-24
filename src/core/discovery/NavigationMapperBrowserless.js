/**
 * NavigationMapperBrowserless - Updated NavigationMapper using Browserless.io
 * 
 * This is the production-ready version that integrates BrowserManagerBrowserless
 * for better handling of protected sites with BrightData proxy support.
 */

const { chromium } = require('playwright');
const BrowserManagerBrowserless = require('../../common/browser/managers/BrowserManagerBrowserless');
// Navigation strategies organized by type
const NavigationPatternStrategy = require('./strategies/navigation/NavigationPatternStrategy');
const FallbackLinkStrategy = require('./strategies/navigation/FallbackLinkStrategy');
const MegaMenuStrategy = require('./strategies/navigation/MegaMenuStrategy');
const ProductCatalogCache = require('../../cache/ProductCatalogCache');
const RedisCacheManager = require('../../cache/RedisCacheManager');
const TaxonomyDiscoveryProcessor = require('./processors/TaxonomyDiscoveryProcessor');
const { getBrowserConfigForDomain } = require('../../config/BrowserSiteConfig');

class NavigationMapperBrowserless {
  constructor(logger, worldModel) {
    this.logger = logger;
    this.worldModel = worldModel;
    
    // Initialize cache system (following SelectorLearningCache pattern)
    this.cache = RedisCacheManager.getInstance(logger);
    
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
    
    const forceHeadless = process.env.HEADLESS_MODE === 'true';
    const disableHeadless = process.env.HEADLESS_MODE === 'false';
    
    this.logger.info('Browser initialization with Browserless.io support:', {
      domain: normalizedDomain || 'not-provided',
      browserlessEnabled: process.env.USE_BROWSERLESS === 'true'
    });
    
    // Determine headless mode (BrowserManagerBrowserless will handle site-specific overrides)
    if (forceHeadless) {
      this.isHeadless = true;
      this.logger.info('HEADLESS_MODE=true: Forcing headless mode');
    } else if (disableHeadless) {
      this.isHeadless = false;
      this.logger.info('HEADLESS_MODE=false: Forcing non-headless mode');
    } else {
      // Default headless behavior (BrowserManagerBrowserless will override per site config)
      this.isHeadless = !needsNonHeadless;
      this.logger.info(`Using headless=${this.isHeadless} for ${normalizedDomain || 'unknown'} (BrowserManagerBrowserless will handle site-specific overrides)`);
    }
    
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
   * Execute all strategies in parallel and return the best result
   * Implementation of user's optimization strategy for improved success rates
   */
  async executeStrategiesInParallel(page, url, tracker) {
    this.logger.info(`🚀 Executing ${this.strategies.length} strategies in parallel for ${url}`);
    
    // Launch all strategies concurrently with timeout protection
    const strategyPromises = this.strategies.map(async (strategy) => {
      const strategyName = strategy.constructor.name;
      const strategyTracker = {
        name: strategyName,
        startTime: Date.now(),
        success: false
      };

      try {
        this.logger.debug(`Starting ${strategyName}...`);
        
        // Add timeout protection for each strategy (90 seconds max)
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Strategy timeout')), 90000);
        });
        
        const result = await Promise.race([
          strategy.execute(page, url),
          timeoutPromise
        ]);
        
        if (result && result.navigation && result.navigation.length > 0) {
          strategyTracker.success = true;
          strategyTracker.itemCount = result.navigation.length;
          strategyTracker.duration = Date.now() - strategyTracker.startTime;
          strategyTracker.confidence = result.confidence || 0.5;
          
          this.logger.info(`✅ ${strategyName} succeeded:`, {
            items: result.navigation.length,
            duration: `${strategyTracker.duration}ms`,
            confidence: strategyTracker.confidence
          });
          
          return { result, tracker: strategyTracker };
        } else {
          strategyTracker.error = 'No navigation items extracted';
          strategyTracker.duration = Date.now() - strategyTracker.startTime;
          return { result: null, tracker: strategyTracker };
        }
        
      } catch (error) {
        strategyTracker.error = error.message;
        strategyTracker.duration = Date.now() - strategyTracker.startTime;
        
        this.logger.warn(`${strategyName} failed:`, error.message);
        return { result: null, tracker: strategyTracker };
      }
    });

    try {
      // Wait for all strategies to complete (or timeout individually)
      const allResults = await Promise.allSettled(strategyPromises);
      
      // Process results and collect successful extractions
      const successfulResults = [];
      
      for (const promiseResult of allResults) {
        if (promiseResult.status === 'fulfilled' && promiseResult.value) {
          const { result, tracker: strategyTracker } = promiseResult.value;
          tracker.strategies.push(strategyTracker);
          
          if (result && result.navigation && result.navigation.length > 0) {
            successfulResults.push({ result, tracker: strategyTracker });
          }
        } else if (promiseResult.status === 'rejected') {
          this.logger.warn('Strategy promise rejected:', promiseResult.reason);
        }
      }

      // Select the best result based on multiple criteria
      if (successfulResults.length > 0) {
        const bestResult = this.selectBestResult(successfulResults);
        
        this.logger.info(`🎯 Selected best result from ${successfulResults.length} successful strategies:`, {
          chosenStrategy: bestResult.tracker.name,
          itemCount: bestResult.result.navigation.length,
          confidence: bestResult.tracker.confidence,
          duration: bestResult.tracker.duration
        });
        
        return bestResult.result;
      } else {
        this.logger.warn('❌ No strategies succeeded in parallel execution');
        return null;
      }
      
    } catch (error) {
      this.logger.error('Parallel strategy execution failed:', error);
      return null;
    }
  }

  /**
   * Select the best result from multiple successful extractions
   * Uses confidence, item count, and performance metrics
   */
  selectBestResult(results) {
    return results.reduce((best, current) => {
      const bestScore = this.calculateResultScore(best);
      const currentScore = this.calculateResultScore(current);
      
      return currentScore > bestScore ? current : best;
    });
  }

  /**
   * Calculate a score for ranking extraction results
   * Higher scores are better
   */
  calculateResultScore({ result, tracker }) {
    let score = 0;
    
    // Primary: Number of navigation items found (more is better up to a point)
    const itemCount = result.navigation.length;
    score += Math.min(itemCount * 2, 100); // Cap at 100 points
    
    // Secondary: Confidence score from strategy
    const confidence = tracker.confidence || 0.5;
    score += confidence * 50; // Up to 50 points
    
    // Tertiary: Prefer NavigationPatternStrategy (proven 95% accuracy)
    if (tracker.name === 'NavigationPatternStrategy') {
      score += 25; // Bonus points for proven strategy
    }
    
    // Performance penalty for very slow strategies (>60 seconds)
    if (tracker.duration > 60000) {
      score -= 10;
    }
    
    // Quality bonus for structured results with metadata
    if (result.metadata && result.metadata.patternUsed) {
      score += 10;
    }
    
    return score;
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
      
      // Check cache first (following SelectorLearningCache pattern)
      await this.cache.initialize();
      const cached = await this.cache.get('navigation', domain, 'taxonomy');
      
      if (cached && !options.bypassCache) {
        this.logger.info(`Using cached navigation data for ${domain}`);
        tracker.fromCache = true;
        tracker.duration = Date.now() - startTime;
        
        return {
          ...cached,
          fromCache: true,
          cacheAge: Date.now() - new Date(cached.metadata?.extractedAt || Date.now()).getTime()
        };
      }
      
      // Initialize for this specific site
      await this.initializeForSite(false, domain);
      
      // Create browser using BrowserManagerBrowserless (handles site config internally)
      const browserOptions = {
        site: url,
        headless: this.isHeadless,
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
        
        // Extract navigation using parallel strategies (optimization)
        const result = await this.executeStrategiesInParallel(page, url, tracker);
        
        // Process results if we have them
        if (result && result.navigation && result.navigation.length > 0) {
          if (this.useProcessors) {
            const processor = new TaxonomyDiscoveryProcessor(this.logger);
            result = await processor.processNavigationData(result);
          }
          
          tracker.success = true;
          tracker.itemCount = result.navigation.length;
          tracker.duration = Date.now() - startTime;
          
          // Cache the results using proper cache infrastructure
          if (result.navigation.length > 10) {
            const domain = new URL(url).hostname.replace('www.', '');
            
            // Cache in Redis for fast access (following WorldModel pattern)
            await this.cache.initialize();
            await this.cache.set('navigation', domain, result, 'taxonomy');
            
            // Persist to MongoDB for long-term storage
            const catalogCache = new ProductCatalogCache();
            await catalogCache.initialize();
            
            // Store each navigation item as a category context
            for (const navItem of result.navigation) {
              if (navItem.url) {
                const navigationNode = {
                  name: navItem.name,
                  url: navItem.url,
                  depth: 1,
                  productCount: navItem.children ? navItem.children.length : 0,
                  children: navItem.children || []
                };
                await catalogCache.storeNavigationContext(domain, navigationNode);
              }
            }
            
            this.logger.info(`Cached ${result.navigation.length} navigation items for ${domain} in Redis + MongoDB`);
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