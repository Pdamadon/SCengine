class WorldModelPopulator {
  constructor(logger, mongoClient) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.db = null;
  }

  async initialize() {
    if (!this.mongoClient) {
      this.logger.warn('MongoDB client not provided, skipping world model population');
      return false;
    }
    
    try {
      this.db = this.mongoClient.db('Worldmodel1');
      this.logger.info('WorldModelPopulator initialized with MongoDB connection');
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize WorldModelPopulator:', error);
      return false;
    }
  }

  async populateFromScraperResults(scraperResults) {
    if (!this.db) {
      this.logger.warn('MongoDB not available, storing results to file instead');
      return this.storeToFile(scraperResults);
    }

    try {
      const domain = scraperResults.site;
      const timestamp = new Date().toISOString();

      // 1. Populate Domain Intelligence
      await this.populateDomainIntelligence(domain, scraperResults, timestamp);

      // 2. Populate Categories 
      await this.populateCategories(domain, scraperResults, timestamp);

      // 3. Populate Products
      await this.populateProducts(domain, scraperResults, timestamp);

      this.logger.info(`Successfully populated world model for ${domain}`);
      return { success: true, domain, recordsProcessed: scraperResults.productAnalysis.length };

    } catch (error) {
      this.logger.error('Failed to populate world model:', error);
      throw error;
    }
  }

  async populateDomainIntelligence(domain, scraperResults, timestamp) {
    const collection = this.db.collection('domains');
    
    // Extract capabilities from scraper results
    const capabilities = this.extractCapabilities(scraperResults);
    
    // Extract selectors from successful product scrapes
    const selectors = this.extractSelectors(scraperResults);
    
    // Calculate intelligence score based on successful extractions
    const intelligenceScore = this.calculateIntelligenceScore(scraperResults);

    const domainDoc = {
      domain: domain,
      platform: this.detectPlatform(scraperResults),
      site_type: 'ecommerce',
      intelligence_score: intelligenceScore,
      capabilities: capabilities,
      selectors: selectors,
      navigation_map: {
        main_sections: scraperResults.categoryAnalysis ? [scraperResults.categoryAnalysis.title] : [],
        category_patterns: ['/collections/', '/products/']
      },
      last_crawled: timestamp,
      crawl_success: scraperResults.summary.successfulScrapes > 0,
      total_products_found: scraperResults.summary.totalProductsFound,
      created_at: timestamp,
      updated_at: timestamp
    };

    await collection.replaceOne(
      { domain: domain },
      domainDoc,
      { upsert: true }
    );

    this.logger.info(`Updated domain intelligence for ${domain} with score ${intelligenceScore}`);
  }

  async populateCategories(domain, scraperResults, timestamp) {
    const collection = this.db.collection('categories');
    
    if (!scraperResults.categoryAnalysis) return;

    const categoryDoc = {
      domain: domain,
      category_path: new URL(scraperResults.categoryAnalysis.url).pathname,
      category_name: scraperResults.categoryAnalysis.title || 'Main Category',
      product_count: scraperResults.categoryAnalysis.productLinks.length,
      navigation_selectors: {
        product_links: scraperResults.categoryAnalysis.productLinks[0]?.primary || 'a[href*="/products/"]',
        next_page: scraperResults.categoryAnalysis.navigation?.nextPage?.primary || null,
        prev_page: scraperResults.categoryAnalysis.navigation?.prevPage?.primary || null
      },
      last_crawled: timestamp,
      created_at: timestamp,
      updated_at: timestamp
    };

    await collection.replaceOne(
      { 
        domain: domain, 
        category_path: categoryDoc.category_path 
      },
      categoryDoc,
      { upsert: true }
    );

    this.logger.info(`Updated category data for ${domain}${categoryDoc.category_path}`);
  }

  async populateProducts(domain, scraperResults, timestamp) {
    const collection = this.db.collection('products');
    
    const productDocs = [];
    const deduplicationStats = {
      processed: 0,
      new: 0,
      updated: 0,
      duplicates_avoided: 0
    };

    for (const productData of scraperResults.productAnalysis) {
      if (productData.error || !productData.productData) continue;

      deduplicationStats.processed++;

      const productId = this.extractProductId(productData.url);
      const normalizedTitle = this.normalizeTitle(productData.productData.title);
      const priceValue = this.parsePrice(productData.productData.price);
      
      // Check for existing product using multiple deduplication strategies
      const existingProduct = await this.findExistingProduct(collection, {
        domain,
        productId,
        url: productData.url,
        normalizedTitle,
        title: productData.productData.title
      });

      const productDoc = {
        domain: domain,
        product_id: productId,
        url: productData.url,
        title: productData.productData.title,
        title_normalized: normalizedTitle,
        price: priceValue,
        description: null,
        images: productData.images || [],
        variants: this.processVariants(productData.variants),
        selectors: {
          title: productData.elements?.title?.primary || 'h1',
          price: productData.elements?.price?.primary || '.price',
          add_to_cart: productData.elements?.addToCartButton?.primary || 'button[type="submit"]',
          size_selector: productData.elements?.sizeSelector?.primary || null,
          quantity_input: productData.elements?.quantityInput?.primary || null
        },
        workflow_actions: productData.workflowActions || [],
        availability: 'in_stock',
        
        // Deduplication and tracking fields
        url_hash: this.hashUrl(productData.url),
        first_seen: existingProduct ? existingProduct.first_seen : timestamp,
        last_crawled: timestamp,
        crawl_count: existingProduct ? (existingProduct.crawl_count || 0) + 1 : 1,
        price_history: this.updatePriceHistory(existingProduct, priceValue, timestamp),
        
        // Timestamps
        created_at: existingProduct ? existingProduct.created_at : timestamp,
        updated_at: timestamp
      };

      if (existingProduct) {
        // Check if this is truly a duplicate or an update
        if (this.shouldUpdateProduct(existingProduct, productDoc)) {
          productDocs.push(productDoc);
          deduplicationStats.updated++;
        } else {
          deduplicationStats.duplicates_avoided++;
          this.logger.debug(`Skipping duplicate product: ${productDoc.title}`);
        }
      } else {
        productDocs.push(productDoc);
        deduplicationStats.new++;
      }
    }

    if (productDocs.length > 0) {
      // Use bulk operations with enhanced deduplication
      const bulkOps = productDocs.map(doc => ({
        replaceOne: {
          filter: { 
            $or: [
              { domain: domain, product_id: doc.product_id },
              { domain: domain, url_hash: doc.url_hash },
              { domain: domain, url: doc.url }
            ]
          },
          replacement: doc,
          upsert: true
        }
      }));

      await collection.bulkWrite(bulkOps);
      this.logger.info(`Product deduplication complete for ${domain}:`, deduplicationStats);
    } else {
      this.logger.info(`No new products to save for ${domain} - all were duplicates`);
    }

    return deduplicationStats;
  }

  extractCapabilities(scraperResults) {
    const successfulProducts = scraperResults.productAnalysis.filter(p => !p.error && p.productData);
    
    return {
      can_extract_products: scraperResults.summary.totalProductsFound > 0,
      can_extract_pricing: successfulProducts.some(p => p.productData.price),
      can_extract_variants: successfulProducts.some(p => p.variants && p.variants.length > 0),
      can_navigate_categories: !!scraperResults.categoryAnalysis,
      can_add_to_cart: successfulProducts.some(p => p.elements?.addToCartButton),
      can_checkout: false, // Not tested yet
      can_search: false, // Not implemented yet
      can_filter: false, // Not implemented yet
      can_book_appointments: false, // Not applicable for e-commerce
      can_check_availability: false // Not implemented yet
    };
  }

  extractSelectors(scraperResults) {
    const successfulProducts = scraperResults.productAnalysis.filter(p => !p.error && p.elements);
    
    if (successfulProducts.length === 0) return {};

    // Use the most common selectors from successful scrapes
    const firstProduct = successfulProducts[0];
    
    return {
      navigation: {
        main_menu: null, // Not extracted yet
        categories: scraperResults.categoryAnalysis?.productLinks[0]?.primary || null,
        breadcrumbs: null,
        search_box: null,
        filters: null
      },
      products: {
        product_card: scraperResults.categoryAnalysis?.productLinks[0]?.primary || 'a[href*="/products/"]',
        product_title: firstProduct.elements?.title?.primary || 'h1',
        product_price: firstProduct.elements?.price?.primary || '.price',
        product_image: firstProduct.elements?.mainImage?.primary || 'img',
        product_link: scraperResults.categoryAnalysis?.productLinks[0]?.primary || 'a[href*="/products/"]',
        availability: null
      },
      cart: {
        add_to_cart_button: firstProduct.elements?.addToCartButton?.primary || 'button[type="submit"]',
        cart_icon: null,
        cart_count: null,
        cart_page: null,
        checkout_button: null
      }
    };
  }

  calculateIntelligenceScore(scraperResults) {
    const total = scraperResults.summary.totalProductsFound;
    const successful = scraperResults.summary.successfulScrapes;
    
    if (total === 0) return 0;
    
    const successRate = successful / total;
    const hasVariants = scraperResults.productAnalysis.some(p => p.variants && p.variants.length > 0);
    const hasPrices = scraperResults.productAnalysis.some(p => p.productData && p.productData.price);
    const hasImages = scraperResults.productAnalysis.some(p => p.images && p.images.length > 0);
    
    let score = successRate * 60; // Base score from success rate
    if (hasVariants) score += 15;
    if (hasPrices) score += 15;
    if (hasImages) score += 10;
    
    return Math.min(100, Math.round(score));
  }

  detectPlatform(scraperResults) {
    const domain = scraperResults.site;
    
    // Basic platform detection - could be enhanced
    if (domain.includes('shopify') || 
        scraperResults.productAnalysis.some(p => p.url && p.url.includes('cdn/shop/'))) {
      return 'shopify';
    }
    
    return 'custom';
  }

  extractProductId(url) {
    // Extract product ID from URL - customize per platform
    const matches = url.match(/\/products\/([^/?]+)/);
    return matches ? matches[1] : url.split('/').pop();
  }

  parsePrice(priceString) {
    if (!priceString) return null;
    
    // Extract numeric price from string like "$29.99" or "29.99"
    const matches = priceString.match(/[\d,]+\.?\d*/);
    return matches ? parseFloat(matches[0].replace(',', '')) : null;
  }

  processVariants(variants) {
    if (!variants || variants.length === 0) return [];
    
    return variants.map(variantGroup => ({
      type: variantGroup.type,
      label: variantGroup.label,
      selector: variantGroup.selector,
      options: variantGroup.options.map(opt => ({
        value: opt.value,
        display_name: opt.text,
        available: opt.available,
        variant_type: opt.variantType
      }))
    }));
  }

  // Deduplication helper methods
  async findExistingProduct(collection, searchCriteria) {
    const { domain, productId, url, normalizedTitle, title } = searchCriteria;
    
    // Try multiple search strategies in order of specificity
    const queries = [
      // 1. Exact product ID match (most specific)
      { domain, product_id: productId },
      
      // 2. Exact URL match
      { domain, url: url },
      
      // 3. URL hash match (handles URL variations)
      { domain, url_hash: this.hashUrl(url) },
      
      // 4. Normalized title match (handles minor title variations)
      { domain, title_normalized: normalizedTitle }
    ];

    for (const query of queries) {
      const existing = await collection.findOne(query);
      if (existing) {
        this.logger.debug(`Found existing product via: ${JSON.stringify(query)}`);
        return existing;
      }
    }

    return null;
  }

  normalizeTitle(title) {
    if (!title) return '';
    
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();
  }

  hashUrl(url) {
    // Create a hash of the URL for deduplication
    // Remove query parameters and fragments that might vary
    try {
      const urlObj = new URL(url);
      const cleanUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
      return require('crypto').createHash('md5').update(cleanUrl).digest('hex');
    } catch (error) {
      // Fallback for invalid URLs
      return require('crypto').createHash('md5').update(url).digest('hex');
    }
  }

  shouldUpdateProduct(existingProduct, newProduct) {
    // Determine if we should update an existing product
    
    // Always update if price changed
    if (existingProduct.price !== newProduct.price) {
      this.logger.debug(`Price changed for ${newProduct.title}: ${existingProduct.price} -> ${newProduct.price}`);
      return true;
    }

    // Update if it's been more than 24 hours since last crawl
    const lastCrawled = new Date(existingProduct.last_crawled);
    const now = new Date(newProduct.last_crawled);
    const hoursSinceLastCrawl = (now - lastCrawled) / (1000 * 60 * 60);
    
    if (hoursSinceLastCrawl > 24) {
      this.logger.debug(`Product ${newProduct.title} last crawled ${hoursSinceLastCrawl.toFixed(1)} hours ago - updating`);
      return true;
    }

    // Update if variants changed
    if (JSON.stringify(existingProduct.variants) !== JSON.stringify(newProduct.variants)) {
      this.logger.debug(`Variants changed for ${newProduct.title}`);
      return true;
    }

    // Update if images changed
    if (JSON.stringify(existingProduct.images) !== JSON.stringify(newProduct.images)) {
      this.logger.debug(`Images changed for ${newProduct.title}`);
      return true;
    }

    // Otherwise, skip the update
    return false;
  }

  updatePriceHistory(existingProduct, newPrice, timestamp) {
    if (!newPrice) return existingProduct?.price_history || [];

    const priceHistory = existingProduct?.price_history || [];
    
    // Add new price entry if price changed or this is first time
    const lastPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1] : null;
    
    if (!lastPrice || lastPrice.price !== newPrice) {
      priceHistory.push({
        price: newPrice,
        timestamp: timestamp,
        crawl_count: (existingProduct?.crawl_count || 0) + 1
      });
    }

    // Keep only last 50 price points to prevent unlimited growth
    return priceHistory.slice(-50);
  }

  async storeToFile(scraperResults) {
    // Fallback when MongoDB is not available
    const fs = require('fs');
    const filename = `world_model_${scraperResults.site}_${Date.now()}.json`;
    
    fs.writeFileSync(filename, JSON.stringify(scraperResults, null, 2));
    this.logger.info(`Stored scraper results to file: ${filename}`);
    
    return { success: true, file: filename };
  }
}

module.exports = WorldModelPopulator;