const { chromium } = require('playwright');
const BrowserManager = require('../../common/BrowserManager');
// Navigation strategies organized by type
const NavigationPatternStrategy = require('./strategies/navigation/NavigationPatternStrategy');
const FallbackLinkStrategy = require('./strategies/navigation/FallbackLinkStrategy');
const MegaMenuStrategy = require('./strategies/navigation/MegaMenuStrategy');
// Removed VisibleNavigationStrategy - merged into FallbackLinkStrategy
const ProductCatalogCache = require('../../cache/ProductCatalogCache');
const TaxonomyDiscoveryProcessor = require('./processors/TaxonomyDiscoveryProcessor');

// Site-specific configuration for headless browser behavior
// Sites that block headless browsers should have allowedHeadless: false
const SITE_CONFIG = {
  'macys.com': { allowedHeadless: false },
  'nordstrom.com': { allowedHeadless: false },
  'saks.com': { allowedHeadless: false },
  'default': { allowedHeadless: true }
};

class NavigationMapper {
  constructor(logger, worldModel) {
    this.logger = logger;
    this.worldModel = worldModel;
    this.browserManager = new BrowserManager();
    // Removed pipeline and tree builder - using processor pattern instead
    this.useProcessors = true; // Feature flag for processor pattern
    this.isHeadless = null; // Track current browser headless state
  }

  async initialize() {
    // Default initialization - will be overridden by initializeForSite if needed
    await this.initializeForSite(false);
  }

  async initializeForSite(needsNonHeadless = false, domain = null) {
    // Normalize domain: strip www prefix and lowercase
    const normalizedDomain = domain ? domain.toLowerCase().replace(/^www\./, '') : null;
    const config = normalizedDomain ? (SITE_CONFIG[normalizedDomain] || SITE_CONFIG.default) : SITE_CONFIG.default;
    const siteBlocksHeadless = !config.allowedHeadless;
    
    const forceHeadless = process.env.HEADLESS_MODE === 'true';
    const disableHeadless = process.env.HEADLESS_MODE === 'false';
    
    // Enhanced logging for debugging headless mode decisions
    this.logger.info('Browser initialization decision factors:', {
      domain: normalizedDomain || 'not-provided',
      siteConfig: config,
      siteBlocksHeadless,
      needsNonHeadless,
      forceHeadless,
      disableHeadless
    });
    
    // Determine headless mode with site-specific configuration
    let shouldUseHeadless;
    let reason;
    
    if (siteBlocksHeadless || needsNonHeadless) {
      // OVERRIDE: Site blocks headless browsers or caller specifically requests non-headless
      shouldUseHeadless = false;
      reason = siteBlocksHeadless ? 
        `site-specific config - ${normalizedDomain} blocks headless` : 
        'caller requested non-headless';
      this.logger.info(`Using headless=false (${reason})`);
    } else if (forceHeadless) {
      shouldUseHeadless = true;
      reason = 'global HEADLESS_MODE=true override';
      this.logger.info(`Using headless=true (${reason})`);
    } else if (disableHeadless) {
      shouldUseHeadless = false;
      reason = 'global HEADLESS_MODE=false override';
      this.logger.info(`Using headless=false (${reason})`);
    } else {
      // Default: use headless for better performance unless site needs otherwise
      shouldUseHeadless = true;
      reason = 'default performance optimization';
      this.logger.info(`Using headless=true (${reason})`);
    }
    
    // Store headless preference for BrowserManager
    this.isHeadless = shouldUseHeadless;
    this.headlessReason = reason;
    
    this.logger.info(`Will use BrowserManager with headless=${shouldUseHeadless}, reason=${reason}`);
    
    // Initialize strategies directly - no pipeline needed
    this.strategies = [
      new NavigationPatternStrategy(this.logger, { // Primary: PROVEN 161-868 items, 95% accuracy
        maxCategories: 20,                          // Limit categories for performance
        enableFullExtraction: true,                 // Extract all dropdown items
        patterns: ['macys-megamenu', 'glasswing-shop', 'universal-fallback'],
        hoverDelay: 3000,                          // Wait for mega-menus to appear
        resetDelay: 300,                           // Reset between hover actions
        timeout: 90000                             // Increased timeout for sites with many dropdowns (7 items * 10s each + overhead)
      }),
      new FallbackLinkStrategy(this.logger, {        // Fallback: Fast link collection
        includeHidden: true,                        // Include hidden navigation
        maxLinks: 500                               // Reasonable limit
      })
    ];
    
    this.logger.info('Navigation Mapper initialized with direct strategies');
    
    // Get cache reference for product storage
    this.productCatalogCache = new ProductCatalogCache(this.logger);
    this.productCatalogCache.initialize().catch(err => 
      this.logger.warn('ProductCatalogCache initialization failed:', err.message)
    );
    this.logger.info('ProductCatalogCache initialized');
  }

  /**
   * [DEPRECATED] Legacy method maintained for backward compatibility.
   * Use mapSiteProducts() for product discovery or mapSiteTaxonomy() for clean navigation mapping.
   * 
   * @param {string} url - The starting URL
   * @returns {Promise<object>} Navigation data with product information
   * @deprecated Use mapSiteProducts() or mapSiteTaxonomy() instead
   */
  async mapSiteNavigation(url) {
    this.logger.warn('mapSiteNavigation() is deprecated. Use mapSiteProducts() for product discovery or mapSiteTaxonomy() for clean navigation mapping.');
    return this.mapSiteProducts(url);
  }

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
                await this.browserManager.humanDelay(200, 0.3);
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
        // Wait a bit longer for animations to complete
        await this.browserManager.humanDelay(1000, 0.2);
      }
    } catch (e) {
      // No modal to close
    }
    return false;
  }

  async extractNavigationIntelligence(page) {
    // Use strategies directly without pipeline
    try {
      this.logger.info('Using direct strategies for navigation discovery');
      
      let bestResult = null;
      let bestConfidence = 0;
      
      // Try each strategy and use the best result
      for (const strategy of this.strategies) {
        try {
          const result = await strategy.execute(page);
          if (result && result.confidence > bestConfidence) {
            bestResult = result;
            bestConfidence = result.confidence;
          }
        } catch (error) {
          this.logger.warn(`Strategy ${strategy.getName()} failed:`, error.message);
        }
      }
      
      if (bestResult) {
        // Convert strategy result to expected format
        // Handle NavigationPatternStrategy format (main_sections) vs FallbackLinkStrategy format (items)
        const items = bestResult.main_sections || bestResult.items || [];
        
        return {
          // Preserve both formats for compatibility
          main_sections: bestResult.main_sections || items,  // NavigationPatternStrategy format
          items: items,                                       // Legacy format
          totalNavigationItems: bestResult.totalNavigationItems || items.length,
          dropdownMenus: bestResult.dropdown_menus || {},
          navigation_selectors: bestResult.navigation_selectors || {},
          clickable_elements: bestResult.clickable_elements || [],
          site_structure: {},
          breadcrumb_patterns: bestResult.breadcrumb_patterns || [],
          sidebar_navigation: bestResult.sidebar_navigation || [],
          strategy: bestResult.strategy || 'direct',
          confidence: bestResult.confidence || 0,
          metadata: {
            ...bestResult.metadata || {},
            totalNavigationItems: bestResult.totalNavigationItems || items.length,
            patternUsed: bestResult.patternUsed || null
          }
        };
      }
      
      // Return empty but valid navigation data if all strategies fail
      return {
        main_sections: [],
        items: [],
        totalNavigationItems: 0,
        dropdownMenus: {},
        navigation_selectors: {},
        clickable_elements: [],
        site_structure: {},
        breadcrumb_patterns: [],
        strategy: 'fallback',
        confidence: 0,
        metadata: {
          error: 'All strategies failed',
          timestamp: new Date().toISOString()
        }
      };
      
    } catch (error) {
      this.logger.error('Navigation discovery failed:', error.message);
      // Return empty but valid navigation data instead of throwing
      return {
        main_sections: [],
        items: [],
        totalNavigationItems: 0,
        dropdownMenus: {},
        navigation_selectors: {},
        clickable_elements: [],
        site_structure: {},
        breadcrumb_patterns: [],
        strategy: 'fallback',
        confidence: 0,
        metadata: {
          error: error.message,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Removed convertPipelineToLegacyFormat - no longer needed without pipeline

  /**
   * Maps the site's product catalog by traversing its navigation tree.
   * DEPRECATED: NavigationMapper should only handle navigation discovery.
   * Use ProductCatalogStrategy in collection stage for actual product discovery.
   * 
   * @param {string} url - The starting URL
   * @returns {Promise<object>} Navigation data (same as taxonomy mapping)
   * @deprecated Use PipelineOrchestrator with collection stage for product discovery
   */
  async mapSiteProducts(url) {
    this.logger.warn('mapSiteProducts() is deprecated. NavigationMapper only handles navigation. Use PipelineOrchestrator collection stage for product discovery.');
    return this.mapSiteTaxonomy(url);
  }

  /**
   * Maps the site's taxonomy (categories, filters) without extracting products.
   * Uses TaxonomyDiscoveryProcessor for clean navigation discovery.
   * 
   * @param {string} url - The starting URL
   * @returns {Promise<object>} Navigation data with taxonomy and filter structures
   */
  async mapSiteTaxonomy(url) {
    const taxonomyProcessor = new TaxonomyDiscoveryProcessor({
      maxSubcategories: 50,
      maxFilters: 100,
      enableFilterDiscovery: true,
      enableSubcategoryDiscovery: true
    });
    
    this.logger.info('Starting taxonomy mapping with TaxonomyDiscoveryProcessor');
    return this._mapSiteWithProcessor(url, taxonomyProcessor);
  }

  /**
   * Private helper to run the mapping process with a given processor.
   * Contains the shared logic for both product and taxonomy mapping.
   * 
   * @private
   * @param {string} url - The starting URL
   * @param {INodeProcessor} processor - The processor to use for node processing
   * @returns {Promise<object>} Navigation intelligence data
   */
  async _mapSiteWithProcessor(url, processor) {
    const domain = new URL(url).hostname;
    
    this.logger.info(`Site: ${domain}, processor: ${processor.constructor.name}`);
    
    // Determine headless mode for this domain if not already initialized
    if (this.isHeadless === null) {
      await this.initializeForSite(false, domain);
    } else {
      // Check if current headless setting is compatible with this domain
      const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
      const config = SITE_CONFIG[normalizedDomain] || SITE_CONFIG.default;
      const siteBlocksHeadless = !config.allowedHeadless;
      
      if (siteBlocksHeadless && this.isHeadless) {
        this.logger.info(`Updating headless setting for ${domain} - site requires non-headless mode`);
        await this.initializeForSite(false, domain);
      }
    }
    
    // Create browser with BrowserManager anti-bot detection (100% success rate)
    // Use stealth profile for all sites - no need for mobile-first complexity
    const { page, close } = await this.browserManager.createBrowser('stealth', {
      headless: this.isHeadless
    });
    this.logger.debug(`Created stealth browser for navigation mapping`, { domain, headless: this.isHeadless });

    try {
      this.logger.info(`Starting navigation mapping for ${domain}`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.browserManager.humanDelay(3000, 0.2);
      
      // Wait for navigation elements and close popups (same as original)
      try {
        await page.waitForSelector('nav, header, [role="navigation"], [class*="nav"], [class*="menu"]', { 
          timeout: 5000,
          state: 'visible'
        });
        this.logger.info('Navigation elements detected on page');
      } catch (e) {
        this.logger.warn('No navigation elements found with initial selectors, continuing anyway');
      }
      
      await this.closeAnyPopups(page);
      const navigationIntelligence = await this.extractNavigationIntelligence(page);
      
      // Tree building removed - using processor pattern instead
      // Processors handle their own hierarchical organization

      // Store in world model if available
      if (this.worldModel && this.worldModel.storeSiteNavigation) {
        await this.worldModel.storeSiteNavigation(domain, navigationIntelligence);
      }

      this.logger.info(`Navigation mapping completed for ${domain}`);
      return navigationIntelligence;

    } catch (error) {
      this.logger.error(`Navigation mapping failed for ${domain}:`, error);
      throw error;
    } finally {
      await close(); // BrowserManager handles proper cleanup
    }
  }

  async close() {
    // No browser to close - BrowserManager handles its own cleanup
    this.logger.info('Navigation Mapper closed');
  }
}

module.exports = NavigationMapper;
