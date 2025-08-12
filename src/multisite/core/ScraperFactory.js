/**
 * Scraper Factory Service
 * Creates appropriate scraper instances based on platform detection
 * Routes scraping jobs to the correct implementation for each e-commerce platform
 */

const PlatformDetector = require('./PlatformDetector');
const GlasswingScraper = require('../../scrapers/GlasswingScraper');
const UniversalScraper = require('./UniversalScraper');
const GapScraper = require('../scrapers/GapScraper');

// Import platform-specific scrapers as we create them
// const ShopifyScraper = require('../scrapers/ShopifyScraper');
// const WooCommerceScraper = require('../scrapers/WooCommerceScraper');

class ScraperFactory {
  constructor(logger, options = {}) {
    this.logger = logger;
    this.platformDetector = new PlatformDetector(logger);
    this.options = options;
    
    // Cache for platform detections to avoid re-analyzing same domains
    this.platformCache = new Map();
    this.cacheTimeout = options.cacheTimeout || 24 * 60 * 60 * 1000; // 24 hours
  }

  async initialize() {
    await this.platformDetector.initialize();
    this.logger.info('ScraperFactory initialized successfully');
  }

  /**
   * Create appropriate scraper instance for the given URL
   */
  async createScraper(url, jobData = {}, options = {}) {
    try {
      // Step 1: Detect platform (with caching)
      const platformInfo = await this.detectPlatformWithCache(url, options);
      
      // Step 2: Get platform configuration
      const platformConfig = this.platformDetector.getPlatformConfig(platformInfo.platform);
      
      // Step 3: Create appropriate scraper instance
      const scraper = await this.instantiateScraper(
        platformInfo.platform,
        url,
        jobData,
        {
          ...options,
          platformInfo,
          platformConfig,
        }
      );

      this.logger.info('Scraper created successfully', {
        url: url,
        platform: platformInfo.platform,
        confidence: platformInfo.confidence,
        scraperType: scraper.constructor.name,
      });

      return {
        scraper,
        platformInfo,
        platformConfig,
      };

    } catch (error) {
      this.logger.error('Failed to create scraper', {
        url: url,
        error: error.message,
      });
      
      // Fallback to universal scraper
      return {
        scraper: new UniversalScraper(this.logger, url, jobData),
        platformInfo: { platform: 'unknown', confidence: 0, method: 'fallback' },
        platformConfig: this.platformDetector.getPlatformConfig('unknown'),
      };
    }
  }

  /**
   * Detect platform with caching to improve performance
   */
  async detectPlatformWithCache(url, options = {}) {
    const domain = this.extractDomain(url);
    const cacheKey = `${domain}:${JSON.stringify(options)}`;
    
    // Check cache first
    if (this.platformCache.has(cacheKey)) {
      const cached = this.platformCache.get(cacheKey);
      const age = Date.now() - cached.timestamp;
      
      if (age < this.cacheTimeout) {
        this.logger.debug(`Using cached platform detection for ${domain}`, {
          platform: cached.platformInfo.platform,
          age: Math.round(age / 1000 / 60),
        });
        return cached.platformInfo;
      } else {
        // Remove expired cache entry
        this.platformCache.delete(cacheKey);
      }
    }
    
    // Perform fresh detection
    const platformInfo = await this.platformDetector.detectPlatform(url, options);
    
    // Cache the result
    this.platformCache.set(cacheKey, {
      platformInfo,
      timestamp: Date.now(),
    });
    
    return platformInfo;
  }

  /**
   * Instantiate the appropriate scraper based on platform
   */
  async instantiateScraper(platform, url, jobData, options) {
    switch (platform.toLowerCase()) {
      case 'glasswing':
      case 'glasswingshop':
        // Use existing glasswing scraper for glasswingshop.com
        if (url.includes('glasswingshop.com')) {
          return new GlasswingScraper(this.logger);
        }
        // Fall through to universal for other URLs
        
      case 'shopify':
        // TODO: Implement ShopifyScraper
        // return new ShopifyScraper(this.logger, url, jobData, options);
        this.logger.warn('ShopifyScraper not yet implemented, using Universal scraper');
        return new UniversalScraper(this.logger, url, jobData, options);
        
      case 'gap':
        // Use Gap-specific scraper with sector template integration
        this.logger.info('Using GapScraper for Gap Inc. brands');
        return new GapScraper(this.logger, url, jobData, options);
        
      case 'woocommerce':
        // TODO: Implement WooCommerceScraper
        // return new WooCommerceScraper(this.logger, url, jobData, options);
        this.logger.warn('WooCommerceScraper not yet implemented, using Universal scraper');
        return new UniversalScraper(this.logger, url, jobData, options);
        
      case 'bigcommerce':
        // TODO: Implement BigCommerceScraper
        this.logger.warn('BigCommerceScraper not yet implemented, using Universal scraper');
        return new UniversalScraper(this.logger, url, jobData, options);
        
      case 'amazon':
        // TODO: Implement AmazonScraper (requires special handling)
        this.logger.warn('AmazonScraper not yet implemented, using Universal scraper');
        return new UniversalScraper(this.logger, url, jobData, options);
        
      default:
        this.logger.info(`Using Universal scraper for unknown platform: ${platform}`);
        return new UniversalScraper(this.logger, url, jobData, options);
    }
  }

  /**
   * Get scraper capabilities for a given platform
   */
  getScraperCapabilities(platform) {
    const capabilities = {
      glasswing: {
        categoryPages: true,
        productPages: true,
        pagination: true,
        variants: true,
        images: true,
        reviews: false,
        jsonApi: false,
        reliability: 0.95,
      },
      
      shopify: {
        categoryPages: true,
        productPages: true,
        pagination: true,
        variants: true,
        images: true,
        reviews: false,
        jsonApi: true,
        reliability: 0.85, // Estimated - will improve as we implement
      },
      
      gap: {
        categoryPages: true,
        productPages: true,
        pagination: true,
        variants: true,
        images: true,
        reviews: false,
        jsonApi: false,
        reliability: 0.85, // High reliability with sector templates and specific selectors
      },
      
      woocommerce: {
        categoryPages: true,
        productPages: true,
        pagination: true,
        variants: true,
        images: true,
        reviews: true,
        jsonApi: true,
        reliability: 0.80, // Estimated
      },
      
      amazon: {
        categoryPages: true,
        productPages: true,
        pagination: true,
        variants: true,
        images: true,
        reviews: true,
        jsonApi: false,
        reliability: 0.40, // Very challenging due to anti-bot measures
      },
      
      universal: {
        categoryPages: true,
        productPages: true,
        pagination: false,
        variants: false,
        images: true,
        reviews: false,
        jsonApi: false,
        reliability: 0.30, // Basic fallback scraper
      },
    };
    
    return capabilities[platform.toLowerCase()] || capabilities.universal;
  }

  /**
   * Estimate job complexity and duration based on platform and job parameters
   */
  estimateJobDuration(platform, jobData) {
    const capabilities = this.getScraperCapabilities(platform);
    const platformConfig = this.platformDetector.getPlatformConfig(platform);
    
    // Base times in seconds
    const baseTimes = {
      category_page: 10,
      product_page: 5,
      navigation_discovery: 15,
    };
    
    // Platform multipliers based on complexity and anti-bot measures
    const platformMultipliers = {
      glasswing: 1.0,
      shopify: 1.2,
      gap: 2.0,
      woocommerce: 1.3,
      amazon: 4.0,
      universal: 3.0,
    };
    
    const multiplier = platformMultipliers[platform.toLowerCase()] || 3.0;
    
    // Estimate based on job parameters
    let estimatedSeconds = baseTimes.category_page;
    
    if (jobData.max_pages) {
      estimatedSeconds += (jobData.max_pages - 1) * baseTimes.category_page * 0.5;
    }
    
    if (jobData.extract_product_details) {
      const estimatedProducts = jobData.max_products || 20;
      estimatedSeconds += estimatedProducts * baseTimes.product_page;
    }
    
    // Apply platform complexity multiplier
    estimatedSeconds *= multiplier;
    
    // Apply reliability factor (less reliable = longer due to retries)
    const reliabilityFactor = 1 + (1 - capabilities.reliability);
    estimatedSeconds *= reliabilityFactor;
    
    return Math.round(estimatedSeconds);
  }

  /**
   * Extract domain from URL for caching purposes
   */
  extractDomain(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch (error) {
      return url.toLowerCase();
    }
  }

  /**
   * Clear platform detection cache
   */
  clearCache() {
    this.platformCache.clear();
    this.logger.info('Platform detection cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.platformCache.size,
      entries: Array.from(this.platformCache.keys()),
      timeout: this.cacheTimeout,
    };
  }

  async close() {
    await this.platformDetector.close();
    this.clearCache();
    this.logger.info('ScraperFactory closed successfully');
  }
}

module.exports = ScraperFactory;