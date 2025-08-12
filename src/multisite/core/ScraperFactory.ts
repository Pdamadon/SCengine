/**
 * Scraper Factory Service
 * Creates appropriate scraper instances based on platform detection
 * Routes scraping jobs to the correct implementation for each e-commerce platform
 */

import { 
  ScraperInfo, 
  ScraperFactoryConfig, 
  BaseScraper, 
  PlatformConfig 
} from '../../types/multisite.types';
import { 
  SupportedPlatform, 
  PlatformDetectionResult 
} from '../../types/intelligence.types';
import { 
  URL, 
  Timestamp 
} from '../../types/common.types';
import { ScrapingJobData } from '../../types/scraping.types';

// Legacy imports (will be converted to TypeScript later)
const PlatformDetector = require('./PlatformDetector');
const GlasswingScraper = require('../../scrapers/GlasswingScraper');
const UniversalScraper = require('./UniversalScraper');
const GapScraper = require('../scrapers/GapScraper');

// Import platform-specific scrapers as we create them
// const ShopifyScraper = require('../scrapers/ShopifyScraper');
// const WooCommerceScraper = require('../scrapers/WooCommerceScraper');

interface CachedPlatformInfo {
  platformInfo: PlatformDetectionResult;
  timestamp: Timestamp;
  domain: string;
}

interface ScraperCreationOptions {
  enableDeepAnalysis?: boolean;
  fallbackToUniversal?: boolean;
  useCache?: boolean;
}

class ScraperFactory {
  private logger: any;
  private platformDetector: any;
  private options: ScraperFactoryConfig;
  private platformCache: Map<string, CachedPlatformInfo> = new Map();
  private readonly cacheTimeout: number;

  constructor(logger: any, options: ScraperFactoryConfig = {}) {
    this.logger = logger;
    this.platformDetector = new PlatformDetector(logger);
    this.options = options;
    
    // Cache for platform detections to avoid re-analyzing same domains
    this.cacheTimeout = options.cacheTimeout || 24 * 60 * 60 * 1000; // 24 hours
  }

  async initialize(): Promise<void> {
    await this.platformDetector.initialize();
    this.logger.info('ScraperFactory initialized successfully');
  }

  /**
   * Create appropriate scraper instance for the given URL
   */
  async createScraper(
    url: URL, 
    jobData: ScrapingJobData = {} as ScrapingJobData, 
    options: ScraperCreationOptions = {}
  ): Promise<ScraperInfo> {
    try {
      // Step 1: Detect platform (with caching)
      const platformInfo = await this.detectPlatformWithCache(url, options);
      
      // Step 2: Get platform configuration
      const platformConfig = this.getPlatformConfig(platformInfo.platform);
      
      // Step 3: Create appropriate scraper instance
      const scraper = await this.instantiateScraper(
        platformInfo.platform, 
        url, 
        jobData, 
        platformConfig, 
        options
      );

      // Step 4: Configure scraper with platform-specific settings
      if (scraper.configure && typeof scraper.configure === 'function') {
        scraper.configure(platformConfig);
      }

      this.logger.info('ScraperFactory: Created scraper instance', {
        url: url,
        platform: platformInfo.platform,
        confidence: platformInfo.confidence,
        scraperType: scraper.constructor.name,
      });

      return {
        scraper: scraper,
        platformInfo: {
          platform: platformInfo.platform,
          confidence: platformInfo.confidence,
          detected_features: platformInfo.detected_features.map(f => f.feature),
        },
        config: platformConfig,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error('ScraperFactory: Failed to create scraper', {
        url: url,
        error: errorMessage,
        fallbackEnabled: options.fallbackToUniversal !== false,
      });

      // Fallback to universal scraper if enabled
      if (options.fallbackToUniversal !== false) {
        this.logger.info('ScraperFactory: Falling back to UniversalScraper');
        
        const universalScraper = new UniversalScraper(this.logger, {
          target_url: url,
        });

        return {
          scraper: universalScraper,
          platformInfo: {
            platform: 'unknown',
            confidence: 0,
            detected_features: [],
          },
          config: this.getPlatformConfig('unknown'),
        };
      }

      throw new Error(`Failed to create scraper for ${url}: ${errorMessage}`);
    }
  }

  /**
   * Detect platform with caching support
   */
  private async detectPlatformWithCache(
    url: URL, 
    options: ScraperCreationOptions
  ): Promise<PlatformDetectionResult> {
    const domain = new URL(url).hostname;
    const now = new Date();

    // Check cache first (unless disabled)
    if (options.useCache !== false) {
      const cached = this.platformCache.get(domain);
      if (cached && (now.getTime() - cached.timestamp.getTime()) < this.cacheTimeout) {
        this.logger.debug('ScraperFactory: Using cached platform detection', {
          domain: domain,
          platform: cached.platformInfo.platform,
          cacheAge: now.getTime() - cached.timestamp.getTime(),
        });
        return cached.platformInfo;
      }
    }

    // Perform fresh platform detection
    this.logger.info('ScraperFactory: Performing platform detection', {
      domain: domain,
      deepAnalysis: options.enableDeepAnalysis || false,
    });

    const platformInfo = await this.platformDetector.detectPlatform(url, {
      enableDeepAnalysis: options.enableDeepAnalysis || false,
    });

    // Cache the result
    this.platformCache.set(domain, {
      platformInfo: platformInfo,
      timestamp: now,
      domain: domain,
    });

    return platformInfo;
  }

  /**
   * Get platform-specific configuration
   */
  private getPlatformConfig(platform: SupportedPlatform): PlatformConfig {
    const commonConfig = {
      rate_limits: {
        requests_per_minute: 60,
        concurrent_requests: 3,
        delay_between_requests: 1000,
      },
      anti_bot_config: {
        user_agents: [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        ],
        proxy_required: false,
        javascript_required: true,
        session_management: true,
      },
    };

    switch (platform) {
      case 'shopify':
        return {
          platform: 'shopify',
          default_selectors: {
            products: {
              product_card: '.product-card, .product-item, .grid__item',
              product_title: '.product-card__title, .product__title, h3',
              product_price: '.price, .product__price, .money',
              product_image: '.product__media img, .product-card__image img',
            },
            navigation: {
              main_menu: '.site-nav, .header__nav',
              categories: '.site-nav__item, .menu__item',
            },
          },
          api_patterns: {
            product_api: '/products/{handle}.js',
            collection_api: '/collections/{handle}/products.json',
          },
          capabilities: {
            can_extract_products: true,
            can_extract_pricing: true,
            can_extract_variants: true,
            can_navigate_categories: true,
            can_add_to_cart: true,
            can_checkout: false,
            can_search: true,
            can_filter: true,
            can_check_availability: true,
          },
          ...commonConfig,
        };

      case 'gap':
        return {
          platform: 'gap',
          default_selectors: {
            products: {
              product_card: '.ProductCard, .product-card',
              product_title: '.ProductCard__name, .product-title',
              product_price: '.ProductCard__price, .price',
              product_image: '.ProductCard__image img, .product-image img',
            },
            navigation: {
              main_menu: '.Header__nav, .main-nav',
              categories: '.Header__navItem, .nav-item',
            },
          },
          capabilities: {
            can_extract_products: true,
            can_extract_pricing: true,
            can_extract_variants: true,
            can_navigate_categories: true,
            can_add_to_cart: true,
            can_checkout: false,
            can_search: true,
            can_filter: true,
            can_check_availability: true,
          },
          ...commonConfig,
          rate_limits: {
            ...commonConfig.rate_limits,
            requests_per_minute: 30, // More conservative for Gap
            delay_between_requests: 2000,
          },
        };

      case 'woocommerce':
        return {
          platform: 'woocommerce',
          default_selectors: {
            products: {
              product_card: '.product, .woocommerce-LoopProduct-link',
              product_title: '.woocommerce-loop-product__title, h2',
              product_price: '.price, .woocommerce-Price-amount',
              product_image: '.product img, .woocommerce-product-gallery__image img',
            },
            navigation: {
              main_menu: '.main-navigation, .primary-menu',
              categories: '.menu-item, .product-category',
            },
          },
          capabilities: {
            can_extract_products: true,
            can_extract_pricing: true,
            can_extract_variants: true,
            can_navigate_categories: true,
            can_add_to_cart: true,
            can_checkout: false,
            can_search: true,
            can_filter: true,
            can_check_availability: true,
          },
          ...commonConfig,
        };

      case 'magento':
        return {
          platform: 'magento',
          default_selectors: {
            products: {
              product_card: '.product-item, .product',
              product_title: '.product-item-name, .product-name',
              product_price: '.price, .regular-price',
              product_image: '.product-image-photo, .product-image img',
            },
            navigation: {
              main_menu: '.navigation, .nav-primary',
              categories: '.nav-item, .category-item',
            },
          },
          capabilities: {
            can_extract_products: true,
            can_extract_pricing: true,
            can_extract_variants: true,
            can_navigate_categories: true,
            can_add_to_cart: true,
            can_checkout: false,
            can_search: true,
            can_filter: true,
            can_check_availability: true,
          },
          ...commonConfig,
        };

      case 'custom':
      case 'unknown':
      default:
        return {
          platform: platform,
          default_selectors: {
            products: {
              product_card: '.product, .item, .card',
              product_title: 'h1, h2, h3, .title, .name',
              product_price: '.price, .cost, .amount',
              product_image: 'img',
            },
            navigation: {
              main_menu: 'nav, .nav, .menu',
              categories: 'a, .link, .menu-item',
            },
          },
          capabilities: {
            can_extract_products: true,
            can_extract_pricing: true,
            can_extract_variants: false,
            can_navigate_categories: true,
            can_add_to_cart: false,
            can_checkout: false,
            can_search: false,
            can_filter: false,
            can_check_availability: false,
          },
          ...commonConfig,
        };
    }
  }

  /**
   * Instantiate the appropriate scraper for the platform
   */
  private async instantiateScraper(
    platform: SupportedPlatform,
    url: URL,
    jobData: ScrapingJobData,
    config: PlatformConfig,
    options: ScraperCreationOptions
  ): Promise<BaseScraper> {
    const domain = new URL(url).hostname;

    this.logger.debug('ScraperFactory: Instantiating scraper', {
      platform: platform,
      domain: domain,
      scraperOptions: options,
    });

    switch (platform) {
      case 'shopify':
        // TODO: Implement ShopifyScraper
        // return new ShopifyScraper(this.logger, { target_url: url, config });
        this.logger.warn('ShopifyScraper not yet implemented, using UniversalScraper');
        return new UniversalScraper(this.logger, { 
          target_url: url,
          scraping_type: jobData.scraping_type || 'product',
        });

      case 'gap':
        return new GapScraper(this.logger, {
          target_url: url,
          scraping_type: jobData.scraping_type || 'product',
        });

      case 'woocommerce':
        // TODO: Implement WooCommerceScraper
        // return new WooCommerceScraper(this.logger, { target_url: url, config });
        this.logger.warn('WooCommerceScraper not yet implemented, using UniversalScraper');
        return new UniversalScraper(this.logger, { 
          target_url: url,
          scraping_type: jobData.scraping_type || 'product',
        });

      case 'magento':
        // TODO: Implement MagentoScraper
        // return new MagentoScraper(this.logger, { target_url: url, config });
        this.logger.warn('MagentoScraper not yet implemented, using UniversalScraper');
        return new UniversalScraper(this.logger, { 
          target_url: url,
          scraping_type: jobData.scraping_type || 'product',
        });

      case 'custom':
      case 'unknown':
      default:
        // Special case: if domain is glasswingshop.com, use the specialized scraper
        if (domain.includes('glasswingshop.com')) {
          this.logger.info('ScraperFactory: Using specialized GlasswingScraper for glasswingshop.com');
          return new GlasswingScraper(this.logger);
        }

        // Default to UniversalScraper for unknown/custom platforms
        return new UniversalScraper(this.logger, {
          target_url: url,
          scraping_type: jobData.scraping_type || 'product',
        });
    }
  }

  /**
   * Clear platform detection cache
   */
  clearCache(): void {
    this.platformCache.clear();
    this.logger.info('ScraperFactory: Platform detection cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    domains: string[];
    oldestEntry?: Timestamp;
  } {
    const entries = Array.from(this.platformCache.values());
    
    return {
      size: this.platformCache.size,
      domains: entries.map(entry => entry.domain),
      oldestEntry: entries.length > 0 
        ? entries.reduce((oldest, entry) => 
            entry.timestamp < oldest ? entry.timestamp : oldest, 
            entries[0].timestamp
          )
        : undefined,
    };
  }

  /**
   * Clean up expired cache entries
   */
  cleanExpiredCache(): number {
    const now = new Date();
    let removedCount = 0;

    for (const [domain, cached] of this.platformCache.entries()) {
      if ((now.getTime() - cached.timestamp.getTime()) > this.cacheTimeout) {
        this.platformCache.delete(domain);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.logger.info('ScraperFactory: Cleaned expired cache entries', {
        removedCount: removedCount,
        remainingCount: this.platformCache.size,
      });
    }

    return removedCount;
  }

  /**
   * Close resources and cleanup
   */
  async close(): Promise<void> {
    try {
      this.clearCache();
      if (this.platformDetector && typeof this.platformDetector.close === 'function') {
        await this.platformDetector.close();
      }
      this.logger.info('ScraperFactory closed successfully');
    } catch (error) {
      this.logger.error('Error closing ScraperFactory', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export default ScraperFactory;