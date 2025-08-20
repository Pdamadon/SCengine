/**
 * ProductCatalogCache.js
 *
 * Handles product catalog storage and retrieval with MongoDB integration.
 * Bridges NavigationTreeBuilder product discovery with the enterprise MongoDB schema.
 *
 * Provides efficient batch operations for storing complete product catalogs
 * discovered during navigation tree traversal.
 */

const mongoDBClient = require('../database/MongoDBClient');
const DATABASE_NAME = 'ai_shopping_scraper'; // From mongodb-schema.js

class ProductCatalogCache {
  constructor(logger) {
    this.logger = logger;
    this.mongoClient = mongoDBClient;
    this.db = null;
    this.collections = {};

    // Batch processing configuration
    this.batchSize = 1000;
    this.pendingProducts = [];
    this.flushTimer = null;
    this.flushInterval = 30000; // Flush every 30 seconds
  }

  /**
   * Initialize MongoDB connection and collections
   */
  async initialize() {
    try {
      this.db = await this.mongoClient.connect();

      if (this.db) {
        this.collections = {
          products: this.db.collection('products'),
          categories: this.db.collection('categories'),
          productCategories: this.db.collection('product_categories'),
          navigationMaps: this.db.collection('navigation_maps'),
          domains: this.db.collection('domains'),
        };

        this.logger.info('ProductCatalogCache initialized with MongoDB');
        this.startBatchFlushTimer();
      } else {
        this.logger.warn('ProductCatalogCache: MongoDB not available, operating in memory-only mode');
      }
    } catch (error) {
      this.logger.warn('ProductCatalogCache initialization failed:', error.message);
    }
  }

  /**
   * Store products discovered during navigation traversal
   * @param {string} domain - Domain name
   * @param {Object} navigationNode - Navigation node with products
   * @returns {Promise<boolean>} Success status
   */
  async storeProducts(domain, navigationNode) {
    if (!navigationNode.products || navigationNode.products.length === 0) {
      return true; // Nothing to store
    }

    try {
      // Prepare products for batch insertion
      const productDocs = navigationNode.products.map(product => this.createProductDocument(
        domain,
        navigationNode,
        product,
      ));

      if (this.db) {
        // Add to batch queue for efficient processing
        this.pendingProducts.push(...productDocs);

        // Flush immediately if batch is large
        if (this.pendingProducts.length >= this.batchSize) {
          await this.flushPendingProducts();
        }
      }

      // Also store navigation context
      await this.storeNavigationContext(domain, navigationNode);

      this.logger.debug(`Queued ${productDocs.length} products from ${navigationNode.name} for batch storage`);
      return true;

    } catch (error) {
      this.logger.error('Failed to store products:', error);
      return false;
    }
  }

  /**
   * Create a product document following the MongoDB schema
   * @param {string} domain - Domain name
   * @param {Object} navigationNode - Navigation context
   * @param {Object} product - Product data from ProductCatalogStrategy
   * @returns {Object} MongoDB product document
   */
  createProductDocument(domain, navigationNode, product) {
    const now = new Date();

    return {
      // Core identification
      product_id: this.generateProductId(domain, product.url),
      domain: domain,
      source_url: product.url,

      // Basic product information
      title: product.title || 'Unknown Product',
      description: product.description || null,
      brand: this.extractBrand(product) || null,
      model: null,
      sku: null,

      // Pricing information
      price: this.parsePrice(product.price),
      original_price: this.parsePrice(product.originalPrice),
      currency: this.detectCurrency(product.price) || 'USD',
      discount_percentage: this.calculateDiscount(product.price, product.originalPrice),

      // Availability - ensure it matches MongoDB schema enum
      availability: this.normalizeAvailability(product.availability),
      stock_quantity: null,

      // Media
      image_urls: product.image ? [product.image] : [],

      // Navigation context (critical for hierarchical discovery)
      navigation_context: {
        parent_category: navigationNode.name,
        navigation_path: this.buildNavigationPath(navigationNode),
        category_url: navigationNode.url,
        discovery_depth: navigationNode.depth,
        tree_position: this.getTreePosition(navigationNode),
      },

      // Discovery metadata
      discovery_metadata: {
        discovered_via: 'NavigationTreeBuilder',
        discovery_strategy: 'ProductCatalogStrategy',
        platform_detected: product.platform || 'generic',
        discovery_confidence: product.confidence || 0.5,
        container_index: product.containerIndex,
        discovered_at: new Date(product.discoveredAt || now),
        page_analysis: product.pageAnalysis || {},
      },

      // Extraction strategy (following schema requirements)
      extraction_strategy: {
        quick_check: {
          selectors: this.generateQuickCheckSelectors(product),
          enabled: true,
          last_attempt: now,
          success_rate: 1.0,
        },
        full_extraction: {
          selectors: this.generateFullExtractionSelectors(product),
          last_attempt: now,
          success_rate: 1.0,
        },
        interaction_requirements: {
          requires_js: true,
          requires_cookies: false,
          requires_session: false,
        },
        platform_hints: {
          detected_platform: product.platform || 'generic',
          confidence: product.confidence || 0.5,
        },
      },

      // Quick check configuration
      quick_check_config: {
        enabled: true,
        check_interval_ms: 3600000, // 1 hour
        last_check: now,
        next_check: new Date(now.getTime() + 3600000),
        priority: this.calculatePriority(product, navigationNode),
      },

      // Category associations (array for multi-category support)
      category_ids: [this.generateCategoryId(domain, navigationNode.name)],

      // Timestamps
      created_at: now,
      updated_at: now,
      scraped_at: now,

      // Update history
      update_history: [{
        timestamp: now,
        update_type: 'discovery',
        changes: { discovered: true },
        success: true,
        extraction_time_ms: 0,
      }],
    };
  }

  /**
   * Store navigation context for the node
   * @param {string} domain - Domain name
   * @param {Object} navigationNode - Navigation node
   * @returns {Promise<boolean>} Success status
   */
  async storeNavigationContext(domain, navigationNode) {
    if (!this.db) {return false;}

    try {
      // Store category information
      const categoryDoc = {
        canonical_id: this.generateCategoryId(domain, navigationNode.name),
        domain: domain,
        name: navigationNode.name,
        url_path: navigationNode.url,
        parent_id: navigationNode.parent ? this.generateCategoryId(domain, navigationNode.parent.name) : null,
        level: navigationNode.depth,
        navigation_priority: 1,
        estimated_product_count: navigationNode.productCount || 0,
        actual_product_count: navigationNode.productCount || 0,
        is_active: true,
        last_crawled: new Date(),
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };

      await this.collections.categories.replaceOne(
        { canonical_id: categoryDoc.canonical_id },
        categoryDoc,
        { upsert: true },
      );

      // Store navigation map entry
      const navigationDoc = {
        domain: domain,
        navigation_type: 'category_page',
        structure: {
          name: navigationNode.name,
          url: navigationNode.url,
          depth: navigationNode.depth,
          product_count: navigationNode.productCount || 0,
          children_count: navigationNode.children ? navigationNode.children.length : 0,
        },
        clickable_elements: [],
        reliability_score: 0.9,
        last_verified: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      await this.collections.navigationMaps.replaceOne(
        { domain, 'structure.url': navigationNode.url },
        navigationDoc,
        { upsert: true },
      );

      return true;
    } catch (error) {
      this.logger.warn('Failed to store navigation context:', error.message);
      return false;
    }
  }

  /**
   * Flush pending products to MongoDB in batch
   * @returns {Promise<void>}
   */
  async flushPendingProducts() {
    if (!this.db || this.pendingProducts.length === 0) {
      return;
    }

    const productsToFlush = this.pendingProducts.splice(0);

    try {
      if (productsToFlush.length > 0) {
        // Use bulk operations for efficiency
        // DEBUG: Log first few documents before MongoDB insertion
        if (productsToFlush.length > 0) {
          this.logger.info('🔍 DEBUG: Sample product documents being sent to MongoDB:', {
            count: productsToFlush.length,
            sampleDocs: productsToFlush.slice(0, 2).map(product => ({
              hasProductId: !!product.product_id,
              hasTitle: !!product.title,
              hasCreatedAt: !!product.created_at,
              productId: product.product_id,
              title: product.title,
              domain: product.domain,
              topLevelKeys: Object.keys(product),
              fullStructure: product,
            })),
          });
        }

        const bulkOps = productsToFlush.map(product => ({
          replaceOne: {
            filter: { product_id: product.product_id, domain: product.domain },
            replacement: product,
            upsert: true,
          },
        }));

        const result = await this.collections.products.bulkWrite(bulkOps, { ordered: false });

        this.logger.info(`✅ Flushed ${productsToFlush.length} products to MongoDB`, {
          inserted: result.upsertedCount,
          modified: result.modifiedCount,
          total: productsToFlush.length,
        });

        // Store product-category relationships
        await this.storeProductCategoryRelationships(productsToFlush);
      }
    } catch (error) {
      this.logger.error('Failed to flush products to MongoDB:', {
        error: error.message,
        name: error.name,
        code: error.code,
        writeErrors: error.writeErrors || [],
        result: error.result || {},
        stack: error.stack,
      });

      // Log specific validation errors if available
      if (error.writeErrors && error.writeErrors.length > 0) {
        this.logger.error('🔍 DEBUG: Specific validation errors:', {
          errorCount: error.writeErrors.length,
          firstError: error.writeErrors[0],
          failedDocuments: error.writeErrors.slice(0, 3).map(err => ({
            index: err.index,
            code: err.code,
            errmsg: err.errmsg,
            op: err.op,
          })),
        });
      }

      // Put products back in queue for retry
      this.pendingProducts.unshift(...productsToFlush);
    }
  }

  /**
   * Store product-category relationships
   * @param {Array} products - Product documents
   * @returns {Promise<void>}
   */
  async storeProductCategoryRelationships(products) {
    if (!this.db) {return;}

    try {
      const relationships = products.flatMap(product =>
        product.category_ids.map(categoryId => ({
          product_id: product.product_id,
          category_id: categoryId,
          relationship_type: 'primary',
          hierarchy_level: product.navigation_context.discovery_depth,
          confidence_score: product.discovery_metadata.discovery_confidence,
          discovery_source: 'NavigationTreeBuilder',
          relevance_score: 0.9,
          created_at: new Date(),
        })),
      );

      if (relationships.length > 0) {
        const bulkOps = relationships.map(rel => ({
          replaceOne: {
            filter: { product_id: rel.product_id, category_id: rel.category_id },
            replacement: rel,
            upsert: true,
          },
        }));

        await this.collections.productCategories.bulkWrite(bulkOps, { ordered: false });
        this.logger.debug(`Stored ${relationships.length} product-category relationships`);
      }
    } catch (error) {
      this.logger.warn('Failed to store product-category relationships:', error.message);
    }
  }

  /**
   * Start automatic batch flushing timer
   */
  startBatchFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(async () => {
      if (this.pendingProducts.length > 0) {
        await this.flushPendingProducts();
      }
    }, this.flushInterval);
  }

  /**
   * Get products by navigation path
   * @param {string} domain - Domain name
   * @param {string} navigationPath - Navigation path
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Products
   */
  async getProductsByNavigationPath(domain, navigationPath, options = {}) {
    if (!this.db) {return [];}

    const { limit = 50, offset = 0, sort = { created_at: -1 } } = options;

    try {
      const products = await this.collections.products
        .find({
          domain,
          'navigation_context.navigation_path': { $regex: navigationPath, $options: 'i' },
          availability: { $ne: 'out_of_stock' },
        })
        .sort(sort)
        .skip(offset)
        .limit(limit)
        .toArray();

      return products;
    } catch (error) {
      this.logger.error('Failed to get products by navigation path:', error);
      return [];
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} Cache statistics
   */
  async getStats() {
    const stats = {
      pending_products: this.pendingProducts.length,
      mongodb_connected: !!this.db,
      batch_size: this.batchSize,
      flush_interval: this.flushInterval,
    };

    if (this.db) {
      try {
        const [productCount, categoryCount, relationshipCount] = await Promise.all([
          this.collections.products.countDocuments(),
          this.collections.categories.countDocuments(),
          this.collections.productCategories.countDocuments(),
        ]);

        stats.mongodb_stats = {
          products: productCount,
          categories: categoryCount,
          relationships: relationshipCount,
        };
      } catch (error) {
        stats.mongodb_stats = { error: error.message };
      }
    }

    return stats;
  }

  // Helper methods

  generateProductId(domain, url) {
    // Create deterministic product ID from domain and URL
    const urlPath = new URL(url).pathname;
    return `${domain}_${Buffer.from(urlPath).toString('base64').slice(0, 16)}`;
  }

  generateCategoryId(domain, categoryName) {
    return `${domain}_${categoryName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  }

  buildNavigationPath(node) {
    const path = [];
    let current = node;

    while (current) {
      path.unshift(current.name);
      current = current.parent;
    }

    return path.join(' > ');
  }

  getTreePosition(node) {
    return {
      depth: node.depth,
      has_children: node.children && node.children.length > 0,
      child_count: node.children ? node.children.length : 0,
      is_leaf: !node.children || node.children.length === 0,
    };
  }

  parsePrice(priceString) {
    if (!priceString) {return null;}

    const match = priceString.match(/[\d,]+\.?\d*/);
    return match ? parseFloat(match[0].replace(/,/g, '')) : null;
  }

  detectCurrency(priceString) {
    if (!priceString) {return null;}

    if (priceString.includes('$')) {return 'USD';}
    if (priceString.includes('£')) {return 'GBP';}
    if (priceString.includes('€')) {return 'EUR';}
    if (priceString.includes('¥')) {return 'JPY';}

    return 'USD'; // Default
  }

  calculateDiscount(price, originalPrice) {
    if (!price || !originalPrice) {return null;}

    const current = this.parsePrice(price);
    const original = this.parsePrice(originalPrice);

    if (current && original && original > current) {
      return Math.round(((original - current) / original) * 100);
    }

    return null;
  }

  normalizeAvailability(availability) {
    if (!availability) {return 'out_of_stock';} // Default to out_of_stock instead of 'unknown'

    const lower = availability.toLowerCase();
    if (lower.includes('in stock') || lower.includes('available')) {return 'in_stock';}
    if (lower.includes('out of stock') || lower.includes('unavailable')) {return 'out_of_stock';}
    if (lower.includes('limited')) {return 'limited_stock';}
    if (lower.includes('pre order') || lower.includes('preorder')) {return 'pre_order';}
    if (lower.includes('backorder')) {return 'backorder';}

    // Default to out_of_stock for unknown availability (matches schema enum)
    return 'out_of_stock';
  }

  extractBrand(product) {
    // Try to extract brand from title or URL
    if (product.title) {
      const commonBrands = ['nike', 'adidas', 'apple', 'samsung', 'sony', 'microsoft'];
      const titleLower = product.title.toLowerCase();

      for (const brand of commonBrands) {
        if (titleLower.includes(brand)) {
          return brand.charAt(0).toUpperCase() + brand.slice(1);
        }
      }
    }

    return null;
  }

  calculatePriority(product, navigationNode) {
    // Higher priority for products in main categories, with good metadata
    let priority = 5; // Base priority

    if (navigationNode.depth === 1) {priority += 2;} // Main category
    if (product.price) {priority += 1;} // Has price
    if (product.title && product.title !== 'Unknown Product') {priority += 1;}
    if (product.image) {priority += 1;}

    return Math.min(priority, 10);
  }

  generateQuickCheckSelectors(product) {
    return {
      price: '.price, [class*="price"], [data-price]',
      availability: '.stock, [class*="stock"], [class*="availability"]',
      title: 'h1, .product-title, [class*="title"]',
    };
  }

  generateFullExtractionSelectors(product) {
    return {
      title: 'h1, .product-title, [class*="title"]',
      price: '.price, [class*="price"], [data-price]',
      description: '.description, [class*="description"], .product-details',
      images: 'img.product-image, .product-gallery img, [class*="product-image"]',
      availability: '.stock, [class*="stock"], [class*="availability"]',
      variants: 'select.variants, .variant-selector, [class*="variant"]',
    };
  }

  /**
   * Cleanup resources and flush remaining products
   */
  async close() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush any remaining products
    if (this.pendingProducts.length > 0) {
      this.logger.info(`Flushing ${this.pendingProducts.length} remaining products before shutdown`);
      await this.flushPendingProducts();
    }

    this.logger.info('ProductCatalogCache closed');
  }
}

module.exports = ProductCatalogCache;
