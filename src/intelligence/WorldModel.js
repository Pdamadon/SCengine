const RedisCacheFactory = require('../cache/RedisCacheFactory');
const mongoDBClient = require('../database/MongoDBClient');
const { collections } = require('../config/mongodb');

class WorldModel {
  constructor(logger) {
    this.logger = logger;
    this.cache = RedisCacheFactory.getInstance(logger, 'WorldModel');
    this.mongoClient = mongoDBClient;
    this.db = null;
    this.collections = {};
    this.siteIntelligence = new Map(); // In-memory cache for active sites
  }

  async initialize() {
    // Connect to Redis cache
    await this.cache.connect();
    
    // Connect to MongoDB
    try {
      this.db = await this.mongoClient.connect();
      this.collections = this.mongoClient.getCollections();
      this.logger.info('World Model initialized with MongoDB and Redis');
    } catch (error) {
      this.logger.warn('MongoDB connection failed, using Redis only:', error.message);
    }
    
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

  // =====================================================
  // CATEGORY TREE STORAGE METHODS (NEW)
  // =====================================================

  /**
   * Store complete category tree from CategoryTreeBuilder
   */
  async storeCategoryTree(domain, categoryTree) {
    if (!this.db) {
      this.logger.warn('MongoDB not connected, cannot store category tree');
      return false;
    }

    try {
      // Store hierarchical tree structure
      const treeDoc = {
        domain,
        tree_type: 'category_hierarchy',
        tree_data: categoryTree,
        total_categories: categoryTree.metadata?.total_categories || 0,
        max_depth: categoryTree.metadata?.max_depth_reached || 0,
        discovery_stats: categoryTree.metadata?.discovery_stats || {},
        created_at: new Date(),
        updated_at: new Date()
      };

      await this.db.collection('category_trees').replaceOne(
        { domain, tree_type: 'category_hierarchy' },
        treeDoc,
        { upsert: true }
      );

      // Also store flattened structure for efficient querying
      const flatCategories = this.flattenCategoryTree(categoryTree, domain);
      
      if (flatCategories.length > 0) {
        // Remove existing flat categories for this domain
        await this.db.collection('category_flat').deleteMany({ domain });
        
        // Insert new flat categories
        await this.db.collection('category_flat').insertMany(flatCategories);
      }

      this.logger.info(`Stored category tree for ${domain}`, {
        total_categories: categoryTree.metadata?.total_categories || 0,
        flat_categories: flatCategories.length,
        max_depth: categoryTree.metadata?.max_depth_reached || 0
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to store category tree:', error);
      return false;
    }
  }

  /**
   * Get stored category tree
   */
  async getCategoryTree(domain) {
    if (!this.db) {
      return null;
    }

    try {
      const treeDoc = await this.db.collection('category_trees').findOne({
        domain,
        tree_type: 'category_hierarchy'
      });

      return treeDoc ? treeDoc.tree_data : null;
    } catch (error) {
      this.logger.error('Failed to get category tree:', error);
      return null;
    }
  }

  /**
   * Get leaf categories for product discovery
   */
  async getCategoryLeafNodes(domain) {
    if (!this.db) {
      return [];
    }

    try {
      // Get categories with no children or few children (likely to have products)
      const leafCategories = await this.db.collection('category_flat').find({
        domain,
        $or: [
          { is_leaf: true },
          { child_count: { $lte: 2 } },
          { depth: { $gte: 3 } }
        ]
      }).sort({ depth: -1, name: 1 }).toArray();

      return leafCategories.map(cat => ({
        name: cat.name,
        url: cat.url,
        depth: cat.depth,
        type: cat.type,
        category_id: cat.category_id,
        parent_path: cat.parent_path
      }));
    } catch (error) {
      this.logger.error('Failed to get category leaf nodes:', error);
      return [];
    }
  }

  /**
   * Initialize product discovery progress tracking
   */
  async initializeProductDiscoveryProgress(domain, categories) {
    if (!this.db) {
      return false;
    }

    try {
      // Clear existing progress for this domain
      await this.db.collection('product_discovery_progress').deleteMany({ domain });

      // Insert initial progress records
      const progressRecords = categories.map(cat => ({
        domain,
        category_url: cat.url,
        category_name: cat.name,
        category_depth: cat.depth,
        status: 'pending',
        products_found: 0,
        start_time: null,
        end_time: null,
        error_message: null,
        created_at: new Date(),
        updated_at: new Date()
      }));

      if (progressRecords.length > 0) {
        await this.db.collection('product_discovery_progress').insertMany(progressRecords);
      }

      this.logger.info(`Initialized product discovery progress for ${domain} with ${categories.length} categories`);
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize product discovery progress:', error);
      return false;
    }
  }

  /**
   * Mark category as processed during product discovery
   */
  async markCategoryProcessed(domain, categoryUrl, statusData) {
    if (!this.db) {
      return false;
    }

    try {
      const updateData = {
        status: statusData.status,
        updated_at: new Date()
      };

      if (statusData.status === 'completed') {
        updateData.products_found = statusData.products_found || 0;
        updateData.end_time = new Date();
      } else if (statusData.status === 'failed') {
        updateData.error_message = statusData.error;
        updateData.end_time = new Date();
      } else if (statusData.status === 'in_progress') {
        updateData.start_time = new Date();
      }

      const result = await this.db.collection('product_discovery_progress').updateOne(
        { domain, category_url: categoryUrl },
        { $set: updateData }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      this.logger.error('Failed to mark category processed:', error);
      return false;
    }
  }

  /**
   * Store discovered products with category information
   */
  async storeDiscoveredProducts(domain, category, products) {
    if (!this.db || !this.collections.products) {
      this.logger.warn('MongoDB not connected, cannot store discovered products');
      return false;
    }

    try {
      const productDocs = products.map(product => ({
        ...product,
        domain,
        product_id: product.product_id || `${domain}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        source_url: product.url,
        
        // Category relationship information
        primary_category: {
          name: category.name,
          url: category.url,
          depth: category.depth,
          type: category.type,
          discovery_path: product.category_info?.discovery_path || {}
        },
        
        // Enhanced category information if available
        category_info: product.category_info || {
          category_name: category.name,
          category_url: category.url,
          category_depth: category.depth,
          category_type: category.type
        },
        
        // Timestamps
        discovered_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        scraped_at: new Date()
      }));

      // Bulk upsert products
      const bulkOps = productDocs.map(product => ({
        replaceOne: {
          filter: { source_url: product.source_url, domain },
          replacement: product,
          upsert: true
        }
      }));

      if (bulkOps.length > 0) {
        const result = await this.collections.products.bulkWrite(bulkOps);
        
        this.logger.info(`Stored ${productDocs.length} products for category ${category.name}`, {
          inserted: result.upsertedCount,
          modified: result.modifiedCount
        });
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to store discovered products:', error);
      return false;
    }
  }

  /**
   * Get product discovery progress summary
   */
  async getProductDiscoveryProgress(domain) {
    if (!this.db) {
      return null;
    }

    try {
      const [progressStats, recentProgress] = await Promise.all([
        this.db.collection('product_discovery_progress').aggregate([
          { $match: { domain } },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              total_products: { $sum: '$products_found' }
            }
          }
        ]).toArray(),
        
        this.db.collection('product_discovery_progress').find({ domain })
          .sort({ updated_at: -1 })
          .limit(10)
          .toArray()
      ]);

      const summary = {
        domain,
        stats: {},
        total_categories: 0,
        total_products_found: 0,
        recent_activity: recentProgress
      };

      progressStats.forEach(stat => {
        summary.stats[stat._id] = stat.count;
        summary.total_categories += stat.count;
        summary.total_products_found += stat.total_products;
      });

      return summary;
    } catch (error) {
      this.logger.error('Failed to get product discovery progress:', error);
      return null;
    }
  }

  /**
   * Helper: Flatten category tree for efficient querying
   */
  flattenCategoryTree(tree, domain, parentPath = []) {
    const flatCategories = [];
    
    const flatten = (node, path = []) => {
      if (node.type !== 'root') {
        const currentPath = [...path, node.name];
        
        flatCategories.push({
          domain,
          category_id: `${domain}_${node.url}`,
          name: node.name,
          url: node.url,
          type: node.type,
          depth: node.depth,
          parent_path: path,
          full_path: currentPath,
          is_leaf: !node.children || node.children.length === 0,
          child_count: node.children ? node.children.length : 0,
          has_products: node.productCount > 0 || false,
          product_count: node.productCount || 0,
          created_at: new Date()
        });
        
        path = currentPath;
      }
      
      if (node.children) {
        node.children.forEach(child => flatten(child, path));
      }
    };
    
    flatten(tree);
    return flatCategories;
  }

  // =====================================================
  // MONGODB PRODUCT STORAGE METHODS
  // =====================================================

  /**
   * Store product in MongoDB with multi-category support
   */
  async storeProduct(domain, productData) {
    if (!this.db || !this.collections.products) {
      this.logger.warn('MongoDB not connected, cannot store product');
      return false;
    }

    try {
      const product = {
        ...productData,
        domain,
        product_id: productData.product_id || `${domain}_${Date.now()}`,
        
        // Ensure extraction strategy fields are preserved
        extraction_strategy: productData.extraction_strategy || {
          quick_check: {},
          full_extraction: {},
          interaction_requirements: {},
          platform_hints: {}
        },
        
        // Quick check configuration with defaults
        quick_check_config: productData.quick_check_config || {
          enabled: false,
          check_interval_ms: 3600000, // 1 hour default
          last_check: null,
          next_check: null,
          priority: 5
        },
        
        // Initialize or preserve update history
        update_history: productData.update_history || [],
        
        // Timestamps
        created_at: productData.created_at || new Date(),
        updated_at: new Date(),
        scraped_at: new Date()
      };
      
      // If this is an update and we have extraction success, add to history
      if (productData.extraction_strategy && product.update_history) {
        product.update_history.push({
          timestamp: new Date(),
          update_type: productData.update_type || 'full',
          changes: productData.changes || {},
          success: true,
          extraction_time_ms: productData.extraction_time_ms || 0
        });
        
        // Keep only last 50 history entries
        if (product.update_history.length > 50) {
          product.update_history = product.update_history.slice(-50);
        }
      }

      // Upsert product (update if exists, insert if new)
      const result = await this.collections.products.replaceOne(
        { product_id: product.product_id, domain },
        product,
        { upsert: true }
      );

      this.logger.info(`Stored product ${product.product_id} in MongoDB with extraction strategy`);
      
      // Also cache in Redis for quick access
      await this.storeProductIntelligence(productData.source_url || productData.url, productData);
      
      return result.acknowledged;
    } catch (error) {
      this.logger.error('Failed to store product in MongoDB:', error);
      return false;
    }
  }

  /**
   * Get product from MongoDB
   */
  async getProduct(domain, productId) {
    if (!this.db || !this.collections.products) {
      return null;
    }

    try {
      const product = await this.collections.products.findOne({
        product_id: productId,
        domain
      });
      return product;
    } catch (error) {
      this.logger.error('Failed to get product from MongoDB:', error);
      return null;
    }
  }

  /**
   * Get products by category with pagination
   */
  async getProductsByCategory(domain, categoryId, options = {}) {
    if (!this.db || !this.collections.products) {
      return [];
    }

    const { limit = 50, offset = 0, sort = { created_at: -1 } } = options;

    try {
      const products = await this.collections.products
        .find({
          domain,
          category_ids: categoryId,
          availability: 'in_stock'
        })
        .sort(sort)
        .skip(offset)
        .limit(limit)
        .toArray();

      return products;
    } catch (error) {
      this.logger.error('Failed to get products by category:', error);
      return [];
    }
  }

  /**
   * Store domain intelligence in MongoDB
   */
  async storeDomainIntelligence(domain, intelligence) {
    if (!this.db) {
      return this.storeSiteNavigation(domain, intelligence); // Fallback to Redis
    }

    try {
      // Store in navigation_maps collection
      const navMap = {
        domain,
        navigation_type: 'main_menu',
        structure: intelligence.navigation_map || {},
        clickable_elements: intelligence.clickable_elements || [],
        reliability_score: intelligence.reliability_score || 0.8,
        last_verified: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      };

      await this.db.collection('navigation_maps').replaceOne(
        { domain, navigation_type: 'main_menu' },
        navMap,
        { upsert: true }
      );

      // Also store in Redis for quick access
      await this.storeSiteNavigation(domain, intelligence);

      this.logger.info(`Stored domain intelligence for ${domain} in MongoDB`);
      return true;
    } catch (error) {
      this.logger.error('Failed to store domain intelligence:', error);
      return false;
    }
  }

  /**
   * Store category in MongoDB
   */
  async storeCategory(domain, categoryData) {
    if (!this.db || !this.collections.categories) {
      return false;
    }

    try {
      const category = {
        ...categoryData,
        canonical_id: categoryData.canonical_id || `${domain}_${categoryData.name.toLowerCase().replace(/\s+/g, '_')}`,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      };

      await this.collections.categories.replaceOne(
        { canonical_id: category.canonical_id },
        category,
        { upsert: true }
      );

      this.logger.info(`Stored category ${category.canonical_id} in MongoDB`);
      return true;
    } catch (error) {
      this.logger.error('Failed to store category:', error);
      return false;
    }
  }

  /**
   * Get category hierarchy from MongoDB
   */
  async getCategoryHierarchy(domain) {
    if (!this.db || !this.collections.categoryHierarchy) {
      return null;
    }

    try {
      const hierarchy = await this.collections.categoryHierarchy
        .find({ level_1_gender: { $exists: true } })
        .sort({ navigation_priority: 1 })
        .toArray();

      return hierarchy;
    } catch (error) {
      this.logger.error('Failed to get category hierarchy:', error);
      return null;
    }
  }

  /**
   * Update selector library in MongoDB
   */
  async storeSelectorPattern(domain, elementType, selector, reliability = 0.8) {
    if (!this.db) {
      return this.storeSelectorLibrary(domain, { [elementType]: selector }); // Fallback to Redis
    }

    try {
      const selectorDoc = {
        domain,
        selector,
        element_type: elementType,
        purpose: `Extract ${elementType} from product pages`,
        reliability_score: reliability,
        usage_count: 0,
        success_count: 0,
        last_successful_use: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      };

      await this.db.collection('selector_libraries').replaceOne(
        { domain, selector, element_type: elementType },
        selectorDoc,
        { upsert: true }
      );

      // Also update Redis cache
      const current = await this.getSelectorLibrary(domain) || { selectors: {} };
      current.selectors[elementType] = selector;
      await this.storeSelectorLibrary(domain, current.selectors);

      return true;
    } catch (error) {
      this.logger.error('Failed to store selector pattern:', error);
      return false;
    }
  }

  /**
   * Get best selectors from MongoDB
   */
  async getBestSelectors(domain, elementType, minReliability = 0.6) {
    if (!this.db) {
      const library = await this.getSelectorLibrary(domain);
      return library?.selectors?.[elementType] ? [library.selectors[elementType]] : [];
    }

    try {
      const selectors = await this.db.collection('selector_libraries')
        .find({
          domain,
          element_type: elementType,
          reliability_score: { $gte: minReliability }
        })
        .sort({ reliability_score: -1, success_count: -1 })
        .limit(5)
        .toArray();

      return selectors.map(s => s.selector);
    } catch (error) {
      this.logger.error('Failed to get best selectors:', error);
      return [];
    }
  }

  /**
   * Record price history in MongoDB
   */
  async recordPriceChange(productId, domain, priceData) {
    if (!this.db) {
      return false;
    }

    try {
      const priceHistory = {
        product_id: productId,
        domain,
        price: priceData.price,
        original_price: priceData.original_price,
        currency: priceData.currency || 'USD',
        discount_percentage: priceData.discount_percentage,
        availability: priceData.availability,
        timestamp: new Date()
      };

      await this.db.collection('price_history').insertOne(priceHistory);
      
      this.logger.info(`Recorded price change for product ${productId}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to record price change:', error);
      return false;
    }
  }

  /**
   * Get price history for a product
   */
  async getPriceHistory(productId, dateRange = {}) {
    if (!this.db) {
      return [];
    }

    const { startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), endDate = new Date() } = dateRange;

    try {
      const history = await this.db.collection('price_history')
        .find({
          product_id: productId,
          timestamp: { $gte: startDate, $lte: endDate }
        })
        .sort({ timestamp: -1 })
        .toArray();

      return history;
    } catch (error) {
      this.logger.error('Failed to get price history:', error);
      return [];
    }
  }

  /**
   * Update category product count
   */
  async updateCategoryProductCount(domain, categoryPath, count) {
    if (!this.db || !this.collections.categories) {
      return false;
    }

    try {
      await this.collections.categories.updateOne(
        { url_path: categoryPath },
        { 
          $set: { 
            actual_product_count: count,
            last_updated_count: new Date()
          }
        }
      );

      return true;
    } catch (error) {
      this.logger.error('Failed to update category product count:', error);
      return false;
    }
  }

  /**
   * Update extraction strategy for a product
   */
  async updateExtractionStrategy(productId, domain, strategy) {
    if (!this.db || !this.collections.products) {
      return false;
    }

    try {
      // Add last_updated to the strategy object itself
      const updatedStrategy = {
        ...strategy,
        last_updated: new Date()
      };
      
      const result = await this.collections.products.updateOne(
        { product_id: productId, domain },
        { 
          $set: { 
            extraction_strategy: updatedStrategy,
            updated_at: new Date()
          }
        }
      );

      if (result.modifiedCount > 0) {
        this.logger.info(`Updated extraction strategy for product ${productId}`);
      }
      
      return result.modifiedCount > 0;
    } catch (error) {
      this.logger.error('Failed to update extraction strategy:', error);
      return false;
    }
  }

  /**
   * Update quick check configuration for a product
   */
  async updateQuickCheckConfig(productId, domain, config) {
    if (!this.db || !this.collections.products) {
      return false;
    }

    try {
      // Calculate next check time if interval is provided
      if (config.check_interval_ms && !config.next_check) {
        config.next_check = new Date(Date.now() + config.check_interval_ms);
      }
      
      const result = await this.collections.products.updateOne(
        { product_id: productId, domain },
        { 
          $set: { 
            quick_check_config: config,
            updated_at: new Date()
          }
        }
      );

      if (result.modifiedCount > 0) {
        this.logger.info(`Updated quick check config for product ${productId}`);
      }
      
      return result.modifiedCount > 0;
    } catch (error) {
      this.logger.error('Failed to update quick check config:', error);
      return false;
    }
  }

  /**
   * Record an extraction attempt in update history
   */
  async recordExtractionAttempt(productId, domain, attempt) {
    if (!this.db || !this.collections.products) {
      return false;
    }

    try {
      const historyEntry = {
        timestamp: new Date(),
        update_type: attempt.update_type || 'full',
        changes: attempt.changes || {},
        success: attempt.success || false,
        extraction_time_ms: attempt.extraction_time_ms || 0,
        error: attempt.error || null
      };
      
      // Push to update_history array and limit to 50 entries
      const result = await this.collections.products.updateOne(
        { product_id: productId, domain },
        { 
          $push: { 
            update_history: {
              $each: [historyEntry],
              $slice: -50  // Keep only last 50 entries
            }
          },
          $set: {
            updated_at: new Date(),
            'quick_check_config.last_check': new Date()
          }
        }
      );

      if (result.modifiedCount > 0) {
        this.logger.info(`Recorded extraction attempt for product ${productId}: ${attempt.success ? 'success' : 'failure'}`);
      }
      
      return result.modifiedCount > 0;
    } catch (error) {
      this.logger.error('Failed to record extraction attempt:', error);
      return false;
    }
  }

  /**
   * Get products needing quick check updates
   */
  async getProductsForQuickCheck(domain, limit = 100) {
    if (!this.db || !this.collections.products) {
      return [];
    }

    try {
      const now = new Date();
      const products = await this.collections.products.find({
        domain,
        'quick_check_config.enabled': true,
        'quick_check_config.next_check': { $lte: now }
      })
      .sort({ 'quick_check_config.priority': -1, 'quick_check_config.next_check': 1 })
      .limit(limit)
      .toArray();
      
      this.logger.info(`Found ${products.length} products ready for quick check in ${domain}`);
      return products;
    } catch (error) {
      this.logger.error('Failed to get products for quick check:', error);
      return [];
    }
  }

  /**
   * Store product-category relationship
   */
  async storeProductCategoryRelationship(productId, categoryId, relationshipData = {}) {
    if (!this.db || !this.collections.productCategories) {
      return false;
    }

    try {
      const relationship = {
        product_id: productId,
        category_id: categoryId,
        relationship_type: relationshipData.type || 'primary',
        hierarchy_level: relationshipData.level || 1,
        confidence_score: relationshipData.confidence || 0.9,
        discovery_source: relationshipData.source || 'scraper',
        relevance_score: relationshipData.relevance || 0.8,
        created_at: new Date()
      };

      await this.collections.productCategories.replaceOne(
        { product_id: productId, category_id: categoryId },
        relationship,
        { upsert: true }
      );

      return true;
    } catch (error) {
      this.logger.error('Failed to store product-category relationship:', error);
      return false;
    }
  }

  /**
   * Get MongoDB statistics
   */
  async getWorldModelStats() {
    const stats = {
      redis_connected: this.cache.connected,
      mongodb_connected: this.mongoClient.isConnectedToDatabase()
    };

    if (this.db) {
      try {
        const [productCount, categoryCount, selectorCount] = await Promise.all([
          this.collections.products?.countDocuments() || 0,
          this.collections.categories?.countDocuments() || 0,
          this.db.collection('selector_libraries').countDocuments()
        ]);

        stats.mongodb_stats = {
          products: productCount,
          categories: categoryCount,
          selectors: selectorCount
        };
      } catch (error) {
        stats.mongodb_stats = { error: error.message };
      }
    }

    return stats;
  }

  async close() {
    if (this.cache) {
      await this.cache.close();
    }
    // MongoDB client is a singleton, don't close it here
    this.logger.info('World Model closed successfully');
  }
}

module.exports = WorldModel;
