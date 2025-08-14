const RedisCache = require('../cache/RedisCache');

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

  async getSiteNavigation(domain) {
    try {
      // Check memory cache first
      if (this.siteIntelligence.has(domain)) {
        return this.siteIntelligence.get(domain);
      }

      // Check Redis or memory cache
      const key = `site_nav:${domain}`;
      let cached = null;
      
      if (this.cache.connected && this.cache.redis) {
        cached = await this.cache.redis.get(key);
      } else if (this.cache.memoryCache) {
        cached = this.cache.memoryCache.get(key);
      }

      if (cached) {
        const intelligence = typeof cached === 'string' ? JSON.parse(cached) : cached;
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
        pagination: selectors.pagination || {},
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
      let cached = null;
      
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
  async storeURLPatterns(domain, patterns) {
    const key = `url_patterns:${domain}`;
    const urlIntelligence = {
      domain,
      patterns: {
        product_url: patterns.product_url || null,
        category_url: patterns.category_url || null,
        search_url: patterns.search_url || null,
        collection_url: patterns.collection_url || null,
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

  async getURLPatterns(domain) {
    try {
      const key = `url_patterns:${domain}`;
      let cached = null;
      
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
  async storeProductIntelligence(productUrl, productData) {
    const key = `product:${Buffer.from(productUrl).toString('base64')}`;
    const productIntelligence = {
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

  async getProductIntelligence(productUrl) {
    try {
      const key = `product:${Buffer.from(productUrl).toString('base64')}`;
      let cached = null;
      
      if (this.cache.connected && this.cache.redis) {
        cached = await this.cache.redis.get(key);
      } else if (this.cache.memoryCache) {
        cached = this.cache.memoryCache.get(key);
      }

      if (cached) {
        const intelligence = typeof cached === 'string' ? JSON.parse(cached) : cached;

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

  calculateIntelligenceCompleteness(navigation, selectors, urlPatterns) {
    let score = 0;
    const maxScore = 10;

    // Navigation intelligence (40% of score)
    if (navigation) {
      score += 4;
      if (navigation.navigation_map?.main_sections?.length > 0) {score += 1;}
      if (navigation.navigation_map?.dropdown_menus) {score += 1;}
    }

    // Selector intelligence (40% of score)
    if (selectors) {
      score += 2;
      const selectorTypes = Object.keys(selectors.selectors);
      if (selectorTypes.includes('product')) {score += 1;}
      if (selectorTypes.includes('pricing')) {score += 1;}
      if (selectorTypes.includes('availability')) {score += 1;}
      if (selectors.success_rate > 0.8) {score += 1;}
    }

    // URL pattern intelligence (20% of score)
    if (urlPatterns) {
      score += 1;
      if (urlPatterns.patterns.product_url) {score += 0.5;}
      if (urlPatterns.patterns.category_url) {score += 0.5;}
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

  // Learning Pattern Storage for Universal Scraper
  
  /**
   * Store learning patterns for cross-site knowledge sharing
   */
  async storeLearningPatterns(domain, patterns) {
    const key = `learning:${domain}`;
    const learningData = {
      domain,
      patterns: {
        successful_selectors: patterns.successful_selectors || [],
        failed_patterns: patterns.failed_patterns || [],
        strategy_success_rates: patterns.strategy_success_rates || {},
        element_patterns: patterns.element_patterns || {},
        page_structure: patterns.page_structure || {}
      },
      quality_metrics: patterns.quality_metrics || {},
      learning_metadata: {
        attempts_made: patterns.attempts_made || 0,
        final_quality: patterns.final_quality || 0,
        patterns_learned: patterns.patterns_learned || 0,
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString()
      },
      cross_site_applicable: patterns.cross_site_applicable || true
    };

    try {
      // Store with 30-day TTL (learning patterns are valuable long-term)
      if (this.cache.connected && this.cache.redis) {
        await this.cache.redis.setex(key, 30 * 24 * 60 * 60, JSON.stringify(learningData));
      } else if (this.cache.memoryCache) {
        this.cache.memoryCache.set(key, JSON.stringify(learningData));
      }

      this.logger.info(`Stored learning patterns for ${domain}`, {
        successful_selectors: patterns.successful_selectors?.length || 0,
        failed_patterns: patterns.failed_patterns?.length || 0,
        strategies: Object.keys(patterns.strategy_success_rates || {}).length
      });
      
      return true;
    } catch (error) {
      this.logger.error('Failed to store learning patterns:', error);
      return false;
    }
  }

  /**
   * Get learning patterns for a specific domain
   */
  async getLearningPatterns(domain) {
    try {
      const key = `learning:${domain}`;
      let cached = null;
      
      if (this.cache.connected && this.cache.redis) {
        cached = await this.cache.redis.get(key);
      } else if (this.cache.memoryCache) {
        cached = this.cache.memoryCache.get(key);
      }

      if (cached) {
        const learningData = typeof cached === 'string' ? JSON.parse(cached) : cached;
        
        // Update last accessed
        learningData.learning_metadata.last_accessed = new Date().toISOString();
        
        return learningData;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to retrieve learning patterns:', error);
      return null;
    }
  }

  /**
   * Get cross-site patterns that could apply to current domain
   */
  async getCrossSitePatterns(targetDomain, elementType = null) {
    try {
      // Get patterns from similar domains
      const patterns = [];
      
      // For Redis, we need to scan for learning keys
      if (this.cache.connected && this.cache.redis) {
        const keys = await this.cache.redis.keys('learning:*');
        
        for (const key of keys) {
          const domain = key.replace('learning:', '');
          if (domain === targetDomain) continue; // Skip own domain
          
          const cached = await this.cache.redis.get(key);
          if (cached) {
            const learningData = JSON.parse(cached);
            
            // Filter applicable patterns
            if (learningData.cross_site_applicable) {
              const applicablePatterns = this.filterApplicablePatterns(
                learningData, 
                targetDomain, 
                elementType
              );
              
              if (applicablePatterns.length > 0) {
                patterns.push({
                  source_domain: domain,
                  similarity_score: this.calculateDomainSimilarity(domain, targetDomain),
                  patterns: applicablePatterns,
                  quality_score: learningData.learning_metadata.final_quality || 0
                });
              }
            }
          }
        }
      }

      // Sort by quality and similarity
      return patterns.sort((a, b) => {
        const scoreA = a.quality_score * 0.7 + a.similarity_score * 0.3;
        const scoreB = b.quality_score * 0.7 + b.similarity_score * 0.3;
        return scoreB - scoreA;
      });

    } catch (error) {
      this.logger.error('Failed to get cross-site patterns:', error);
      return [];
    }
  }

  /**
   * Store successful selector for cross-site learning
   */
  async storeSuccessfulSelector(domain, elementType, selector, metadata = {}) {
    const key = `selector_success:${domain}:${elementType}`;
    const selectorData = {
      selector,
      element_type: elementType,
      domain,
      success_metadata: metadata,
      reliability_score: metadata.reliability_score || 1.0,
      usage_count: 1,
      created_at: new Date().toISOString(),
      last_used: new Date().toISOString()
    };

    try {
      // Check if selector already exists and update usage
      let existing = null;
      if (this.cache.connected && this.cache.redis) {
        existing = await this.cache.redis.get(key);
      } else if (this.cache.memoryCache) {
        existing = this.cache.memoryCache.get(key);
      }

      if (existing) {
        const existingData = typeof existing === 'string' ? JSON.parse(existing) : existing;
        selectorData.usage_count = existingData.usage_count + 1;
        selectorData.created_at = existingData.created_at;
      }

      // Store with 14-day TTL
      if (this.cache.connected && this.cache.redis) {
        await this.cache.redis.setex(key, 14 * 24 * 60 * 60, JSON.stringify(selectorData));
      } else if (this.cache.memoryCache) {
        this.cache.memoryCache.set(key, JSON.stringify(selectorData));
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to store successful selector:', error);
      return false;
    }
  }

  /**
   * Get successful selectors for element type across domains
   */
  async getCrossSiteSelectors(elementType, limit = 10) {
    try {
      const selectors = [];
      
      if (this.cache.connected && this.cache.redis) {
        const keys = await this.cache.redis.keys(`selector_success:*:${elementType}`);
        
        for (const key of keys) {
          const cached = await this.cache.redis.get(key);
          if (cached) {
            const selectorData = JSON.parse(cached);
            selectors.push(selectorData);
          }
        }
      }

      // Sort by reliability and usage
      return selectors
        .sort((a, b) => {
          const scoreA = a.reliability_score * 0.6 + (a.usage_count / 10) * 0.4;
          const scoreB = b.reliability_score * 0.6 + (b.usage_count / 10) * 0.4;
          return scoreB - scoreA;
        })
        .slice(0, limit);

    } catch (error) {
      this.logger.error('Failed to get cross-site selectors:', error);
      return [];
    }
  }

  /**
   * Get learning analytics for a domain
   */
  async getLearningAnalytics(domain) {
    try {
      const [patterns, navigation, selectors] = await Promise.all([
        this.getLearningPatterns(domain),
        this.getSiteNavigation(domain),
        this.getSelectorLibrary(domain)
      ]);

      return {
        domain,
        has_learning_data: !!patterns,
        learning_quality: patterns?.learning_metadata?.final_quality || 0,
        attempts_made: patterns?.learning_metadata?.attempts_made || 0,
        patterns_learned: patterns?.learning_metadata?.patterns_learned || 0,
        successful_selectors: patterns?.patterns?.successful_selectors?.length || 0,
        intelligence_completeness: this.calculateIntelligenceCompleteness(navigation, selectors, null),
        last_learned: patterns?.learning_metadata?.last_updated || null,
        cross_site_applicable: patterns?.cross_site_applicable || false
      };
    } catch (error) {
      this.logger.error('Failed to get learning analytics:', error);
      return null;
    }
  }

  // Helper methods for cross-site learning

  /**
   * Filter patterns that could apply to target domain
   */
  filterApplicablePatterns(learningData, targetDomain, elementType) {
    const applicable = [];
    
    // Filter successful selectors
    if (learningData.patterns.successful_selectors) {
      learningData.patterns.successful_selectors.forEach(([selector, metadata]) => {
        // Check if selector is generic enough to be cross-site applicable
        if (this.isSelectorGeneric(selector) && 
            (!elementType || metadata.element_type === elementType)) {
          applicable.push({
            type: 'selector',
            selector,
            metadata,
            confidence: this.calculateSelectorConfidence(selector, metadata)
          });
        }
      });
    }

    // Filter strategy success rates
    if (learningData.patterns.strategy_success_rates) {
      Object.entries(learningData.patterns.strategy_success_rates).forEach(([strategy, rate]) => {
        if (rate > 0.6) { // Only high-success strategies
          applicable.push({
            type: 'strategy',
            strategy,
            success_rate: rate,
            confidence: rate
          });
        }
      });
    }

    return applicable;
  }

  /**
   * Calculate similarity between domains
   */
  calculateDomainSimilarity(domain1, domain2) {
    // Simple TLD-based similarity
    const tld1 = domain1.split('.').pop();
    const tld2 = domain2.split('.').pop();
    
    let similarity = 0;
    
    // Same TLD
    if (tld1 === tld2) similarity += 0.3;
    
    // Similar length
    const lengthDiff = Math.abs(domain1.length - domain2.length);
    similarity += Math.max(0, (1 - lengthDiff / 20)) * 0.2;
    
    // Common e-commerce patterns
    const ecommercePatterns = ['shop', 'store', 'buy', 'cart', 'checkout'];
    const domain1HasEcommerce = ecommercePatterns.some(p => domain1.includes(p));
    const domain2HasEcommerce = ecommercePatterns.some(p => domain2.includes(p));
    
    if (domain1HasEcommerce && domain2HasEcommerce) similarity += 0.5;
    
    return Math.min(similarity, 1.0);
  }

  /**
   * Check if selector is generic enough for cross-site use
   */
  isSelectorGeneric(selector) {
    // Avoid site-specific selectors
    const siteSpecificPatterns = [
      /\.[a-z]+-[0-9a-f]{6,}/i, // CSS classes with hashes
      /\[data-[a-z]+-[0-9]+/i,   // Numbered data attributes
      /#[a-z]+-[0-9]+/i          // IDs with numbers
    ];
    
    return !siteSpecificPatterns.some(pattern => pattern.test(selector)) &&
           selector.length < 100 && // Not overly complex
           !selector.includes('"') && // No quoted content
           !selector.includes("'");   // No quoted content
  }

  /**
   * Calculate confidence score for a selector
   */
  calculateSelectorConfidence(selector, metadata) {
    let confidence = 0.5; // Base confidence
    
    // Semantic selectors are more reliable
    if (selector.includes('title') || selector.includes('name')) confidence += 0.2;
    if (selector.includes('price') || selector.includes('cost')) confidence += 0.2;
    if (selector.includes('description') || selector.includes('detail')) confidence += 0.15;
    
    // Success rate factor
    if (metadata.success_rate) confidence += metadata.success_rate * 0.3;
    
    // Generic class patterns
    if (/\.(product|item|card)/.test(selector)) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  async close() {
    if (this.cache) {
      await this.cache.close();
    }
    this.logger.info('World Model closed successfully');
  }
}

module.exports = WorldModel;
