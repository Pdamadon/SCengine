const RedisCache = require('../scraping/RedisCache');

class WorldModel {
  constructor(logger) {
    this.logger = logger;
    this.cache = new RedisCache(logger);
    this.siteIntelligence = new Map(); // In-memory cache for active sites
  }

  async initialize() {
    await this.cache.connect();
    this.logger.info('World Model initialized successfully');
  }

  // Site Navigation Intelligence
  async storeSiteNavigation(domain, navigationMap) {
    const key = `site_nav:${domain}`;
    const intelligence = {
      domain,
      navigation_map: navigationMap,
      created_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      version: '1.0'
    };

    try {
      // Store in Redis with 7-day TTL (navigation changes less frequently)
      await this.cache.redis.setex(key, 7 * 24 * 60 * 60, JSON.stringify(intelligence));
      
      // Also cache in memory for fast access
      this.siteIntelligence.set(domain, intelligence);
      
      this.logger.info(`Stored navigation intelligence for ${domain}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to store site navigation:', error);
      return false;
    }
  }

  async getSiteNavigation(domain) {
    try {
      // Check memory cache first
      if (this.siteIntelligence.has(domain)) {
        return this.siteIntelligence.get(domain);
      }

      // Check Redis
      const key = `site_nav:${domain}`;
      const cached = await this.cache.redis.get(key);
      
      if (cached) {
        const intelligence = JSON.parse(cached);
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
  async storeSelectorLibrary(domain, selectors) {
    const key = `selectors:${domain}`;
    const selectorIntelligence = {
      domain,
      selectors: {
        navigation: selectors.navigation || {},
        product: selectors.product || {},
        pricing: selectors.pricing || {},
        availability: selectors.availability || {},
        variants: selectors.variants || {},
        images: selectors.images || {},
        filters: selectors.filters || {},
        pagination: selectors.pagination || {}
      },
      reliability_scores: selectors.reliability_scores || {},
      tested_at: new Date().toISOString(),
      success_rate: selectors.success_rate || 0.0
    };

    try {
      // Store with 3-day TTL (selectors may change with site updates)
      await this.cache.redis.setex(key, 3 * 24 * 60 * 60, JSON.stringify(selectorIntelligence));
      this.logger.info(`Stored selector library for ${domain} with ${Object.keys(selectors).length} categories`);
      return true;
    } catch (error) {
      this.logger.error('Failed to store selector library:', error);
      return false;
    }
  }

  async getSelectorLibrary(domain) {
    try {
      const key = `selectors:${domain}`;
      const cached = await this.cache.redis.get(key);
      
      if (cached) {
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to retrieve selector library:', error);
      return null;
    }
  }

  // Product URL Patterns
  async storeURLPatterns(domain, patterns) {
    const key = `url_patterns:${domain}`;
    const urlIntelligence = {
      domain,
      patterns: {
        product_url: patterns.product_url || null,
        category_url: patterns.category_url || null,
        search_url: patterns.search_url || null,
        collection_url: patterns.collection_url || null
      },
      examples: patterns.examples || {},
      discovered_at: new Date().toISOString()
    };

    try {
      await this.cache.redis.setex(key, 7 * 24 * 60 * 60, JSON.stringify(urlIntelligence));
      this.logger.info(`Stored URL patterns for ${domain}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to store URL patterns:', error);
      return false;
    }
  }

  async getURLPatterns(domain) {
    try {
      const key = `url_patterns:${domain}`;
      const cached = await this.cache.redis.get(key);
      
      if (cached) {
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to retrieve URL patterns:', error);
      return null;
    }
  }

  // Product Intelligence Storage
  async storeProductIntelligence(productUrl, productData) {
    const key = `product:${Buffer.from(productUrl).toString('base64')}`;
    const productIntelligence = {
      url: productUrl,
      domain: new URL(productUrl).hostname,
      product_data: productData,
      selectors_used: productData.selectors_used || {},
      extraction_success: productData.extraction_success || {},
      scraped_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour TTL for product data
    };

    try {
      // Store with 1-hour TTL (product data changes frequently)
      await this.cache.redis.setex(key, 60 * 60, JSON.stringify(productIntelligence));
      return true;
    } catch (error) {
      this.logger.error('Failed to store product intelligence:', error);
      return false;
    }
  }

  async getProductIntelligence(productUrl) {
    try {
      const key = `product:${Buffer.from(productUrl).toString('base64')}`;
      const cached = await this.cache.redis.get(key);
      
      if (cached) {
        const intelligence = JSON.parse(cached);
        
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
  async getSiteIntelligenceSummary(domain) {
    const [navigation, selectors, urlPatterns] = await Promise.all([
      this.getSiteNavigation(domain),
      this.getSelectorLibrary(domain),
      this.getURLPatterns(domain)
    ]);

    return {
      domain,
      has_navigation_map: !!navigation,
      has_selector_library: !!selectors,
      has_url_patterns: !!urlPatterns,
      navigation_sections: navigation?.navigation_map?.main_sections?.length || 0,
      selector_categories: selectors ? Object.keys(selectors.selectors).length : 0,
      last_updated: navigation?.last_updated || null,
      intelligence_completeness: this.calculateIntelligenceCompleteness(navigation, selectors, urlPatterns)
    };
  }

  calculateIntelligenceCompleteness(navigation, selectors, urlPatterns) {
    let score = 0;
    let maxScore = 10;

    // Navigation intelligence (40% of score)
    if (navigation) {
      score += 4;
      if (navigation.navigation_map?.main_sections?.length > 0) score += 1;
      if (navigation.navigation_map?.dropdown_menus) score += 1;
    }

    // Selector intelligence (40% of score)  
    if (selectors) {
      score += 2;
      const selectorTypes = Object.keys(selectors.selectors);
      if (selectorTypes.includes('product')) score += 1;
      if (selectorTypes.includes('pricing')) score += 1;
      if (selectorTypes.includes('availability')) score += 1;
      if (selectors.success_rate > 0.8) score += 1;
    }

    // URL pattern intelligence (20% of score)
    if (urlPatterns) {
      score += 1;
      if (urlPatterns.patterns.product_url) score += 0.5;
      if (urlPatterns.patterns.category_url) score += 0.5;
    }

    return Math.round((score / maxScore) * 100);
  }

  // Quick Price Check Using World Model
  async getQuickPriceCheck(productUrl) {
    const domain = new URL(productUrl).hostname;
    
    // Get cached product data if available
    const productIntelligence = await this.getProductIntelligence(productUrl);
    if (productIntelligence) {
      return {
        url: productUrl,
        price: productIntelligence.product_data.price,
        availability: productIntelligence.product_data.availability,
        cached: true,
        last_updated: productIntelligence.scraped_at
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
      domain
    };
  }

  async close() {
    if (this.cache) {
      await this.cache.close();
    }
    this.logger.info('World Model closed successfully');
  }
}

module.exports = WorldModel;