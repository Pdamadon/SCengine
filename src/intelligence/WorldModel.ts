import { Logger } from '../types/common.types';
import { NavigationIntelligence } from './NavigationMapper';

// Legacy import (will be converted later)
const RedisCache = require('../scrapers/RedisCache');

interface SiteNavigationIntelligence {
  domain: string;
  navigation_map: NavigationIntelligence;
  created_at: string;
  last_updated: string;
  version: string;
}

interface SelectorCategories {
  navigation?: Record<string, string>;
  product?: Record<string, string>;
  pricing?: Record<string, string>;
  availability?: Record<string, string>;
  variants?: Record<string, string>;
  images?: Record<string, string>;
  filters?: Record<string, string>;
  pagination?: Record<string, string>;
}

interface SelectorIntelligence {
  domain: string;
  selectors: SelectorCategories;
  reliability_scores: Record<string, number>;
  tested_at: string;
  success_rate: number;
}

interface URLPatterns {
  product_url?: string | null;
  category_url?: string | null;
  search_url?: string | null;
  collection_url?: string | null;
}

interface URLIntelligence {
  domain: string;
  patterns: URLPatterns;
  examples: Record<string, string[]>;
  discovered_at: string;
}

interface ProductData {
  price?: string | number;
  availability?: string;
  title?: string;
  description?: string;
  images?: string[];
  variants?: Record<string, any>;
  selectors_used?: Record<string, string>;
  extraction_success?: Record<string, boolean>;
  [key: string]: any;
}

interface ProductIntelligence {
  url: string;
  domain: string;
  product_data: ProductData;
  selectors_used: Record<string, string>;
  extraction_success: Record<string, boolean>;
  scraped_at: string;
  expires_at: string;
}

interface SiteIntelligenceSummary {
  domain: string;
  has_navigation_map: boolean;
  has_selector_library: boolean;
  has_url_patterns: boolean;
  navigation_sections: number;
  selector_categories: number;
  last_updated: string | null;
  intelligence_completeness: number;
}

interface QuickPriceCheckResult {
  url: string;
  price?: string | number;
  availability?: string;
  cached: boolean;
  last_updated: string;
}

interface QuickPriceCheckNeedsScraping {
  needs_scraping: true;
  selectors: SelectorCategories;
  domain: string;
}

type QuickPriceCheckResponse = QuickPriceCheckResult | QuickPriceCheckNeedsScraping;

export class WorldModel {
  private logger: Logger;
  private cache: any; // RedisCache type will be available after conversion
  private siteIntelligence: Map<string, SiteNavigationIntelligence>;

  constructor(logger: Logger) {
    this.logger = logger;
    this.cache = new RedisCache(logger);
    this.siteIntelligence = new Map();
  }

  async initialize(): Promise<void> {
    await this.cache.connect();
    this.logger.info('World Model initialized successfully');
  }

  // Site Navigation Intelligence
  async storeSiteNavigation(domain: string, navigationMap: NavigationIntelligence): Promise<boolean> {
    const key = `site_nav:${domain}`;
    const intelligence: SiteNavigationIntelligence = {
      domain,
      navigation_map: navigationMap,
      created_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      version: '1.0',
    };

    try {
      // Store in Redis with 7-day TTL (navigation changes less frequently)
      if (this.cache.connected && this.cache.redis) {
        await this.cache.redis.setex(key, 7 * 24 * 60 * 60, JSON.stringify(intelligence));
      } else if (this.cache.memoryCache) {
        // Use memory cache fallback
        this.cache.memoryCache.set(key, JSON.stringify(intelligence));
      }

      // Also cache in memory for fast access
      this.siteIntelligence.set(domain, intelligence);

      this.logger.info(`Stored navigation intelligence for ${domain}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to store site navigation:', error);
      return false;
    }
  }

  async getSiteNavigation(domain: string): Promise<SiteNavigationIntelligence | null> {
    try {
      // Check memory cache first
      if (this.siteIntelligence.has(domain)) {
        const intelligence = this.siteIntelligence.get(domain);
        return intelligence || null;
      }

      // Check Redis or memory cache
      const key = `site_nav:${domain}`;
      let cached: string | null = null;
      
      if (this.cache.connected && this.cache.redis) {
        cached = await this.cache.redis.get(key);
      } else if (this.cache.memoryCache) {
        cached = this.cache.memoryCache.get(key);
      }

      if (cached) {
        const intelligence: SiteNavigationIntelligence = typeof cached === 'string' 
          ? JSON.parse(cached) 
          : cached;
        this.siteIntelligence.set(domain, intelligence); // Cache in memory
        return intelligence;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to retrieve site navigation:', error);
      return null;
    }
  }

  // CSS Selector Intelligence
  async storeSelectorLibrary(domain: string, selectors: Partial<SelectorIntelligence>): Promise<boolean> {
    const key = `selectors:${domain}`;
    const selectorIntelligence: SelectorIntelligence = {
      domain,
      selectors: {
        navigation: selectors.selectors?.navigation || {},
        product: selectors.selectors?.product || {},
        pricing: selectors.selectors?.pricing || {},
        availability: selectors.selectors?.availability || {},
        variants: selectors.selectors?.variants || {},
        images: selectors.selectors?.images || {},
        filters: selectors.selectors?.filters || {},
        pagination: selectors.selectors?.pagination || {},
      },
      reliability_scores: selectors.reliability_scores || {},
      tested_at: new Date().toISOString(),
      success_rate: selectors.success_rate || 0.0,
    };

    try {
      // Store with 3-day TTL (selectors may change with site updates)
      if (this.cache.connected && this.cache.redis) {
        await this.cache.redis.setex(key, 3 * 24 * 60 * 60, JSON.stringify(selectorIntelligence));
      } else if (this.cache.memoryCache) {
        this.cache.memoryCache.set(key, JSON.stringify(selectorIntelligence));
      }
      
      const selectorCount = selectors.selectors ? Object.keys(selectors.selectors).length : 0;
      this.logger.info(`Stored selector library for ${domain} with ${selectorCount} categories`);
      return true;
    } catch (error) {
      this.logger.error('Failed to store selector library:', error);
      return false;
    }
  }

  async getSelectorLibrary(domain: string): Promise<SelectorIntelligence | null> {
    try {
      const key = `selectors:${domain}`;
      let cached: string | null = null;
      
      if (this.cache.connected && this.cache.redis) {
        cached = await this.cache.redis.get(key);
      } else if (this.cache.memoryCache) {
        cached = this.cache.memoryCache.get(key);
      }

      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to retrieve selector library:', error);
      return null;
    }
  }

  // Product URL Patterns
  async storeURLPatterns(domain: string, patterns: Partial<URLIntelligence>): Promise<boolean> {
    const key = `url_patterns:${domain}`;
    const urlIntelligence: URLIntelligence = {
      domain,
      patterns: {
        product_url: patterns.patterns?.product_url || null,
        category_url: patterns.patterns?.category_url || null,
        search_url: patterns.patterns?.search_url || null,
        collection_url: patterns.patterns?.collection_url || null,
      },
      examples: patterns.examples || {},
      discovered_at: new Date().toISOString(),
    };

    try {
      if (this.cache.connected && this.cache.redis) {
        await this.cache.redis.setex(key, 7 * 24 * 60 * 60, JSON.stringify(urlIntelligence));
      } else if (this.cache.memoryCache) {
        this.cache.memoryCache.set(key, JSON.stringify(urlIntelligence));
      }
      this.logger.info(`Stored URL patterns for ${domain}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to store URL patterns:', error);
      return false;
    }
  }

  async getURLPatterns(domain: string): Promise<URLIntelligence | null> {
    try {
      const key = `url_patterns:${domain}`;
      let cached: string | null = null;
      
      if (this.cache.connected && this.cache.redis) {
        cached = await this.cache.redis.get(key);
      } else if (this.cache.memoryCache) {
        cached = this.cache.memoryCache.get(key);
      }

      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to retrieve URL patterns:', error);
      return null;
    }
  }

  // Product Intelligence Storage
  async storeProductIntelligence(productUrl: string, productData: ProductData): Promise<boolean> {
    const key = `product:${Buffer.from(productUrl).toString('base64')}`;
    const productIntelligence: ProductIntelligence = {
      url: productUrl,
      domain: new URL(productUrl).hostname,
      product_data: productData,
      selectors_used: productData.selectors_used || {},
      extraction_success: productData.extraction_success || {},
      scraped_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour TTL for product data
    };

    try {
      // Store with 1-hour TTL (product data changes frequently)
      if (this.cache.connected && this.cache.redis) {
        await this.cache.redis.setex(key, 60 * 60, JSON.stringify(productIntelligence));
      } else if (this.cache.memoryCache) {
        this.cache.memoryCache.set(key, JSON.stringify(productIntelligence));
      }
      return true;
    } catch (error) {
      this.logger.error('Failed to store product intelligence:', error);
      return false;
    }
  }

  async getProductIntelligence(productUrl: string): Promise<ProductIntelligence | null> {
    try {
      const key = `product:${Buffer.from(productUrl).toString('base64')}`;
      let cached: string | null = null;
      
      if (this.cache.connected && this.cache.redis) {
        cached = await this.cache.redis.get(key);
      } else if (this.cache.memoryCache) {
        cached = this.cache.memoryCache.get(key);
      }

      if (cached) {
        const intelligence: ProductIntelligence = typeof cached === 'string' 
          ? JSON.parse(cached) 
          : cached;

        // Check if data is still fresh
        const expiresAt = new Date(intelligence.expires_at);
        if (new Date() < expiresAt) {
          return intelligence;
        }
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to retrieve product intelligence:', error);
      return null;
    }
  }

  // Site Intelligence Summary
  async getSiteIntelligenceSummary(domain: string): Promise<SiteIntelligenceSummary> {
    const [navigation, selectors, urlPatterns] = await Promise.all([
      this.getSiteNavigation(domain),
      this.getSelectorLibrary(domain),
      this.getURLPatterns(domain),
    ]);

    return {
      domain,
      has_navigation_map: !!navigation,
      has_selector_library: !!selectors,
      has_url_patterns: !!urlPatterns,
      navigation_sections: navigation?.navigation_map?.main_sections?.length || 0,
      selector_categories: selectors ? Object.keys(selectors.selectors).length : 0,
      last_updated: navigation?.last_updated || null,
      intelligence_completeness: this.calculateIntelligenceCompleteness(navigation, selectors, urlPatterns),
    };
  }

  private calculateIntelligenceCompleteness(
    navigation: SiteNavigationIntelligence | null, 
    selectors: SelectorIntelligence | null, 
    urlPatterns: URLIntelligence | null
  ): number {
    let score = 0;
    const maxScore = 10;

    // Navigation intelligence (40% of score)
    if (navigation) {
      score += 4;
      if (navigation.navigation_map?.main_sections?.length > 0) {
        score += 1;
      }
      if (navigation.navigation_map?.dropdown_menus) {
        score += 1;
      }
    }

    // Selector intelligence (40% of score)
    if (selectors) {
      score += 2;
      const selectorTypes = Object.keys(selectors.selectors);
      if (selectorTypes.includes('product')) {
        score += 1;
      }
      if (selectorTypes.includes('pricing')) {
        score += 1;
      }
      if (selectorTypes.includes('availability')) {
        score += 1;
      }
      if (selectors.success_rate > 0.8) {
        score += 1;
      }
    }

    // URL pattern intelligence (20% of score)
    if (urlPatterns) {
      score += 1;
      if (urlPatterns.patterns.product_url) {
        score += 0.5;
      }
      if (urlPatterns.patterns.category_url) {
        score += 0.5;
      }
    }

    return Math.round((score / maxScore) * 100);
  }

  // Quick Price Check Using World Model
  async getQuickPriceCheck(productUrl: string): Promise<QuickPriceCheckResponse> {
    const domain = new URL(productUrl).hostname;

    // Get cached product data if available
    const productIntelligence = await this.getProductIntelligence(productUrl);
    if (productIntelligence) {
      return {
        url: productUrl,
        price: productIntelligence.product_data.price,
        availability: productIntelligence.product_data.availability,
        cached: true,
        last_updated: productIntelligence.scraped_at,
      };
    }

    // Get selector library for fresh scraping
    const selectors = await this.getSelectorLibrary(domain);
    if (!selectors) {
      throw new Error(`No selector intelligence available for ${domain}`);
    }

    return {
      needs_scraping: true,
      selectors: selectors.selectors,
      domain,
    };
  }

  async close(): Promise<void> {
    if (this.cache) {
      await this.cache.close();
    }
    this.logger.info('World Model closed successfully');
  }
}

export default WorldModel;