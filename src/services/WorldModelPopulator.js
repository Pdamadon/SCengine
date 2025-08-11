class WorldModelPopulator {
  constructor(logger, mongoClient) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.db = null;
    this.categoryHierarchy = null;
    this.canonicalCategories = null;
  }

  async initialize() {
    if (!this.mongoClient) {
      this.logger.warn('MongoDB client not provided, skipping world model population');
      return false;
    }

    try {
      this.db = this.mongoClient.db('Worldmodel1');
      await this.loadCategoryHierarchy();
      this.logger.info('WorldModelPopulator initialized with MongoDB connection and category hierarchy');
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

      // 2. Populate Category Hierarchy (if not already done)
      await this.populateCategoryHierarchy(domain, timestamp);

      // 3. Populate Categories with enhanced multi-category support
      await this.populateCategoriesWithHierarchy(domain, scraperResults, timestamp);

      // 4. Populate Products with multi-category relationships
      await this.populateProductsWithCategories(domain, scraperResults, timestamp);

      // 5. Update category analytics
      await this.updateCategoryAnalytics(domain, timestamp);

      this.logger.info(`Successfully populated enhanced world model for ${domain}`);
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
        category_patterns: ['/collections/', '/products/'],
      },
      last_crawled: timestamp,
      crawl_success: scraperResults.summary.successfulScrapes > 0,
      total_products_found: scraperResults.summary.totalProductsFound,
      created_at: timestamp,
      updated_at: timestamp,
    };

    await collection.replaceOne(
      { domain: domain },
      domainDoc,
      { upsert: true },
    );

    this.logger.info(`Updated domain intelligence for ${domain} with score ${intelligenceScore}`);
  }

  async populateCategories(domain, scraperResults, timestamp) {
    const collection = this.db.collection('categories');

    if (!scraperResults.categoryAnalysis) {return;}

    const categoryDoc = {
      domain: domain,
      category_path: new URL(scraperResults.categoryAnalysis.url).pathname,
      category_name: scraperResults.categoryAnalysis.title || 'Main Category',
      product_count: scraperResults.categoryAnalysis.productLinks.length,
      navigation_selectors: {
        product_links: scraperResults.categoryAnalysis.productLinks[0]?.primary || 'a[href*="/products/"]',
        next_page: scraperResults.categoryAnalysis.navigation?.nextPage?.primary || null,
        prev_page: scraperResults.categoryAnalysis.navigation?.prevPage?.primary || null,
      },
      last_crawled: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    };

    await collection.replaceOne(
      {
        domain: domain,
        category_path: categoryDoc.category_path,
      },
      categoryDoc,
      { upsert: true },
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
      duplicates_avoided: 0,
    };

    for (const productData of scraperResults.productAnalysis) {
      if (productData.error || !productData.productData) {continue;}

      deduplicationStats.processed++;

      const productId = this.extractProductId(productData.url);
      const normalizedTitle = this.normalizeTitle(productData.productData.title);
      const priceValue = this.parsePrice(productData.productData.price);

      this.logger.debug(`Processing product: ${productData.productData.title} (ID: ${productId})`);

      // Check for existing product using multiple deduplication strategies
      const existingProduct = await this.findExistingProduct(collection, {
        domain,
        productId,
        url: productData.url,
        normalizedTitle,
        title: productData.productData.title,
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
          quantity_input: productData.elements?.quantityInput?.primary || null,
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
        updated_at: timestamp,
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
      this.logger.info(`Processing ${productDocs.length} products for ${domain}`);

      // Process each product individually to avoid conflicts
      for (const doc of productDocs) {
        try {
          const result = await collection.replaceOne(
            {
              domain: domain,
              product_id: doc.product_id,
            },
            doc,
            { upsert: true },
          );

          this.logger.debug(`Product ${doc.product_id}: ${result.upsertedCount ? 'inserted' : 'updated'}`);
        } catch (error) {
          this.logger.error(`Failed to save product ${doc.product_id}:`, error);
        }
      }

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
      can_check_availability: false, // Not implemented yet
    };
  }

  extractSelectors(scraperResults) {
    const successfulProducts = scraperResults.productAnalysis.filter(p => !p.error && p.elements);

    if (successfulProducts.length === 0) {return {};}

    // Use the most common selectors from successful scrapes
    const firstProduct = successfulProducts[0];

    return {
      navigation: {
        main_menu: null, // Not extracted yet
        categories: scraperResults.categoryAnalysis?.productLinks[0]?.primary || null,
        breadcrumbs: null,
        search_box: null,
        filters: null,
      },
      products: {
        product_card: scraperResults.categoryAnalysis?.productLinks[0]?.primary || 'a[href*="/products/"]',
        product_title: firstProduct.elements?.title?.primary || 'h1',
        product_price: firstProduct.elements?.price?.primary || '.price',
        product_image: firstProduct.elements?.mainImage?.primary || 'img',
        product_link: scraperResults.categoryAnalysis?.productLinks[0]?.primary || 'a[href*="/products/"]',
        availability: null,
      },
      cart: {
        add_to_cart_button: firstProduct.elements?.addToCartButton?.primary || 'button[type="submit"]',
        cart_icon: null,
        cart_count: null,
        cart_page: null,
        checkout_button: null,
      },
    };
  }

  calculateIntelligenceScore(scraperResults) {
    const total = scraperResults.summary.totalProductsFound;
    const successful = scraperResults.summary.successfulScrapes;

    if (total === 0) {return 0;}

    const successRate = successful / total;
    const hasVariants = scraperResults.productAnalysis.some(p => p.variants && p.variants.length > 0);
    const hasPrices = scraperResults.productAnalysis.some(p => p.productData && p.productData.price);
    const hasImages = scraperResults.productAnalysis.some(p => p.images && p.images.length > 0);

    let score = successRate * 60; // Base score from success rate
    if (hasVariants) {score += 15;}
    if (hasPrices) {score += 15;}
    if (hasImages) {score += 10;}

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
    if (!priceString) {return null;}

    // Extract numeric price from string like "$29.99" or "29.99"
    const matches = priceString.match(/[\d,]+\.?\d*/);
    return matches ? parseFloat(matches[0].replace(',', '')) : null;
  }

  processVariants(variants) {
    if (!variants || variants.length === 0) {return [];}

    return variants.map(variantGroup => ({
      type: variantGroup.type,
      label: variantGroup.label,
      selector: variantGroup.selector,
      options: variantGroup.options.map(opt => ({
        value: opt.value,
        display_name: opt.text,
        available: opt.available,
        variant_type: opt.variantType,
      })),
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
      { domain, title_normalized: normalizedTitle },
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
    if (!title) {return '';}

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
    if (!newPrice) {return existingProduct?.price_history || [];}

    const priceHistory = existingProduct?.price_history || [];

    // Add new price entry if price changed or this is first time
    const lastPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1] : null;

    if (!lastPrice || lastPrice.price !== newPrice) {
      priceHistory.push({
        price: newPrice,
        timestamp: timestamp,
        crawl_count: (existingProduct?.crawl_count || 0) + 1,
      });
    }

    // Keep only last 50 price points to prevent unlimited growth
    return priceHistory.slice(-50);
  }

  // NEW METHODS FOR MULTI-CATEGORY SUPPORT

  async loadCategoryHierarchy() {
    try {
      const fs = require('fs');
      const timestamp = new Date().toISOString().slice(0,10);
      const hierarchyPath = `results/data/glasswing_category_hierarchy_${timestamp}.json`;
      const deduplicatedPath = `results/data/glasswing_categories_deduplicated_${timestamp}.json`;

      if (fs.existsSync(hierarchyPath)) {
        this.categoryHierarchy = JSON.parse(fs.readFileSync(hierarchyPath, 'utf8'));
        this.logger.info('Loaded category hierarchy with ' + this.categoryHierarchy.hierarchy_paths.length + ' paths');
      }

      if (fs.existsSync(deduplicatedPath)) {
        const deduplicatedData = JSON.parse(fs.readFileSync(deduplicatedPath, 'utf8'));
        this.canonicalCategories = deduplicatedData.canonical_categories;
        this.logger.info('Loaded ' + this.canonicalCategories.length + ' canonical categories');
      }
    } catch (error) {
      this.logger.warn('Could not load category hierarchy, using basic categorization:', error.message);
    }
  }

  async populateCategoryHierarchy(domain, timestamp) {
    if (!this.categoryHierarchy) {
      this.logger.info('No category hierarchy loaded, skipping hierarchy population');
      return;
    }

    const categoriesCollection = this.db.collection('categories');
    const hierarchyCollection = this.db.collection('category_hierarchy');

    // Populate canonical categories
    if (this.canonicalCategories) {
      for (const category of this.canonicalCategories) {
        const categoryDoc = {
          canonical_id: category.canonical_id,
          name: category.name,
          slug: this.generateSlug(category.name),
          description: `${category.name} category for ${domain}`,
          hierarchy_level: this.getHierarchyLevel(category.source_type),
          category_type: this.mapCategoryType(category.source_type),
          url_path: category.url,
          navigation_order: 0,

          // Category-specific metadata
          gender_focus: this.extractGenderFocus(category),
          product_focus: this.extractProductFocus(category),
          brand_tier: category.source_type === 'brands' ? this.classifyBrandTier(category) : null,
          promotion_type: category.source_type === 'featured_collections' ? this.extractPromotionType(category) : null,
          urgency_level: category.source_type === 'featured_collections' ? this.assessUrgency(category) : null,

          // Analytics
          estimated_products: category.estimated_products || 15,
          actual_product_count: 0,
          last_updated_count: timestamp,

          // Multi-category relationships
          multi_category_relationships: this.findMultiCategoryRelationships(category),

          // SEO
          meta_title: category.name,
          meta_description: `Shop ${category.name} collection`,

          status: 'active',
          created_at: timestamp,
          updated_at: timestamp,
        };

        await categoriesCollection.replaceOne(
          { canonical_id: category.canonical_id },
          categoryDoc,
          { upsert: true },
        );
      }

      this.logger.info(`Populated ${this.canonicalCategories.length} canonical categories`);
    }

    // Populate category hierarchy paths
    if (this.categoryHierarchy.hierarchy_paths) {
      for (const path of this.categoryHierarchy.hierarchy_paths) {
        const pathDoc = {
          path_id: path.path_id,
          level_1_gender: this.extractPathLevel(path, 'gender'),
          level_2_product_type: this.extractPathLevel(path, 'product_type'),
          level_3_brand: this.extractPathLevel(path, 'brand'),
          level_4_promotion: this.extractPathLevel(path, 'promotion'),
          full_path: this.buildFullPath(path),
          path_segments: this.buildPathSegments(path),
          estimated_products: path.estimated_products || 15,
          path_type: path.path_type,
          navigation_priority: this.calculateNavigationPriority(path),
          query_count: 0,
          last_queried: null,
          created_at: timestamp,
        };

        await hierarchyCollection.replaceOne(
          { path_id: path.path_id },
          pathDoc,
          { upsert: true },
        );
      }

      this.logger.info(`Populated ${this.categoryHierarchy.hierarchy_paths.length} hierarchy paths`);
    }
  }

  async populateCategoriesWithHierarchy(domain, scraperResults, timestamp) {
    // Enhanced version of populateCategories with hierarchy support
    if (!scraperResults.categoryAnalysis) {return;}

    const collection = this.db.collection('categories');
    const categoryUrl = scraperResults.categoryAnalysis.url;
    const categoryName = scraperResults.categoryAnalysis.title || 'Main Category';

    // Try to match with canonical categories
    const canonicalCategory = this.findCanonicalCategory(categoryUrl, categoryName);

    const categoryDoc = {
      domain: domain,
      canonical_id: canonicalCategory?.canonical_id || this.generateCanonicalId(categoryName),
      category_path: new URL(categoryUrl).pathname,
      category_name: categoryName,
      product_count: scraperResults.categoryAnalysis.productLinks.length,

      // Enhanced hierarchy information
      hierarchy_level: canonicalCategory?.hierarchy_level || 2, // Default to product type level
      category_type: canonicalCategory?.category_type || 'product_type',
      parent_categories: canonicalCategory?.parent_categories || [],
      child_categories: canonicalCategory?.child_categories || [],

      navigation_selectors: {
        product_links: scraperResults.categoryAnalysis.productLinks[0]?.primary || 'a[href*="/products/"]',
        next_page: scraperResults.categoryAnalysis.navigation?.nextPage?.primary || null,
        prev_page: scraperResults.categoryAnalysis.navigation?.prevPage?.primary || null,
      },

      // Multi-category support
      related_categories: this.findRelatedCategories(categoryUrl, categoryName),

      last_crawled: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    };

    await collection.replaceOne(
      { domain: domain, category_path: categoryDoc.category_path },
      categoryDoc,
      { upsert: true },
    );

    this.logger.info(`Updated enhanced category data for ${domain}${categoryDoc.category_path}`);
  }

  async populateProductsWithCategories(domain, scraperResults, timestamp) {
    const productsCollection = this.db.collection('products');
    const productCategoriesCollection = this.db.collection('product_categories');

    const productDocs = [];
    const categoryRelationships = [];
    const deduplicationStats = {
      processed: 0,
      new: 0,
      updated: 0,
      duplicates_avoided: 0,
    };

    for (const productData of scraperResults.productAnalysis) {
      if (productData.error || !productData.productData) {continue;}

      deduplicationStats.processed++;

      const productId = this.extractProductId(productData.url);
      const normalizedTitle = this.normalizeTitle(productData.productData.title);
      const priceValue = this.parsePrice(productData.productData.price);

      // Classify product into multiple categories
      const productCategories = this.classifyProductCategories(productData, scraperResults.categoryAnalysis);
      const primaryCategory = productCategories.find(cat => cat.is_primary) || productCategories[0];

      // Check for existing product
      const existingProduct = await this.findExistingProduct(productsCollection, {
        domain, productId, url: productData.url, normalizedTitle, title: productData.productData.title,
      });

      // Enhanced product document with multi-category support
      const productDoc = {
        product_id: productId,
        site_product_id: productId,
        title: productData.productData.title,
        description: productData.productData.description || null,
        price: Math.round((priceValue || 0) * 100), // Store price in cents
        original_price: Math.round((priceValue || 0) * 100),
        currency: 'USD',
        availability: 'in_stock',

        // Enhanced multi-category system
        categories: productCategories.map(cat => ({
          category_id: cat.canonical_id,
          category_type: cat.category_type,
          category_name: cat.name,
          category_path: cat.url_path,
          is_primary: cat.is_primary,
          hierarchy_level: cat.hierarchy_level,
          confidence_score: cat.confidence_score,
          source_context: `Discovered from ${scraperResults.categoryAnalysis?.url || 'scraping'}`,
        })),

        // Fast query fields (denormalized)
        primary_category: primaryCategory?.canonical_id || 'unknown',
        category_ids: productCategories.map(cat => cat.canonical_id),
        hierarchy_path: this.buildProductHierarchyPath(productCategories),

        // Brand information
        brand: {
          name: this.extractBrandName(productData.productData.title),
          canonical_id: this.findBrandCanonicalId(productData.productData.title),
          tier: 'established', // Default tier
        },

        // Gender/demographic targeting
        gender_target: this.determineGenderTarget(productCategories, productData.productData.title),

        // Product attributes
        attributes: {
          color: this.extractColors(productData),
          sizes: this.extractSizes(productData),
          materials: this.extractMaterials(productData.productData.description),
          style_tags: this.generateStyleTags(productData.productData.title, productCategories),
        },

        // Images and media
        images: (productData.images || []).map((img, index) => ({
          url: img,
          alt_text: `${productData.productData.title} - Image ${index + 1}`,
          type: index === 0 ? 'primary' : 'secondary',
        })),

        // SEO
        slug: this.generateProductSlug(productData.productData.title, productId),
        tags: this.generateProductTags(productData.productData.title, productCategories),

        // Scraping metadata
        source_url: productData.url,
        scraped_at: timestamp,
        scrape_context: {
          category_context: scraperResults.categoryAnalysis?.url || null,
          discovery_method: 'category_scraping',
          batch_id: `${domain}_${timestamp.slice(0,10)}`,
        },

        // Legacy fields for backward compatibility
        domain: domain,
        url: productData.url,
        title_normalized: normalizedTitle,
        variants: this.processVariants(productData.variants),
        selectors: {
          title: productData.elements?.title?.primary || 'h1',
          price: productData.elements?.price?.primary || '.price',
          add_to_cart: productData.elements?.addToCartButton?.primary || 'button[type="submit"]',
        },
        workflow_actions: productData.workflowActions || [],

        // Deduplication and tracking
        url_hash: this.hashUrl(productData.url),
        first_seen: existingProduct ? existingProduct.first_seen : timestamp,
        last_crawled: timestamp,
        crawl_count: existingProduct ? (existingProduct.crawl_count || 0) + 1 : 1,
        price_history: this.updatePriceHistory(existingProduct, priceValue, timestamp),

        // Timestamps
        created_at: existingProduct ? existingProduct.created_at : timestamp,
        updated_at: timestamp,
      };

      // Create category relationships
      productCategories.forEach(category => {
        categoryRelationships.push({
          product_id: productId,
          category_id: category.canonical_id,
          relationship_type: category.is_primary ? 'primary' : 'secondary',
          hierarchy_level: category.hierarchy_level,
          confidence_score: category.confidence_score,
          discovery_source: 'category_scraping',
          source_url: productData.url,
          relevance_score: category.confidence_score,
          created_at: timestamp,
        });
      });

      if (existingProduct) {
        if (this.shouldUpdateProduct(existingProduct, productDoc)) {
          productDocs.push(productDoc);
          deduplicationStats.updated++;
        } else {
          deduplicationStats.duplicates_avoided++;
        }
      } else {
        productDocs.push(productDoc);
        deduplicationStats.new++;
      }
    }

    // Save products
    if (productDocs.length > 0) {
      for (const doc of productDocs) {
        try {
          await productsCollection.replaceOne(
            { product_id: doc.product_id },
            doc,
            { upsert: true },
          );
        } catch (error) {
          this.logger.error(`Failed to save product ${doc.product_id}:`, error);
        }
      }
    }

    // Save category relationships
    if (categoryRelationships.length > 0) {
      for (const relationship of categoryRelationships) {
        try {
          await productCategoriesCollection.replaceOne(
            { product_id: relationship.product_id, category_id: relationship.category_id },
            relationship,
            { upsert: true },
          );
        } catch (error) {
          this.logger.error('Failed to save product-category relationship:', error);
        }
      }

      this.logger.info(`Created ${categoryRelationships.length} product-category relationships`);
    }

    this.logger.info(`Enhanced product population complete for ${domain}:`, deduplicationStats);
    return deduplicationStats;
  }

  async updateCategoryAnalytics(domain, timestamp) {
    const analyticsCollection = this.db.collection('category_analytics');
    const productsCollection = this.db.collection('products');

    if (!this.canonicalCategories) {return;}

    for (const category of this.canonicalCategories) {
      try {
        // Count products in this category
        const productCount = await productsCollection.countDocuments({
          category_ids: category.canonical_id,
        });

        // Calculate price analytics
        const priceAggregation = await productsCollection.aggregate([
          { $match: { category_ids: category.canonical_id, price: { $gt: 0 } } },
          {
            $group: {
              _id: category.canonical_id,
              min_price: { $min: '$price' },
              max_price: { $max: '$price' },
              avg_price: { $avg: '$price' },
              product_count: { $sum: 1 },
            },
          },
        ]).toArray();

        const priceStats = priceAggregation[0] || {
          min_price: 0, max_price: 0, avg_price: 0, product_count: 0,
        };

        const analyticsDoc = {
          category_id: category.canonical_id,
          date: new Date(timestamp),
          product_count: productCount,
          new_products_this_period: productCount, // For initial population
          active_products: productCount,
          price_range: {
            min: Math.round(priceStats.min_price || 0),
            max: Math.round(priceStats.max_price || 0),
            average: Math.round(priceStats.avg_price || 0),
            median: Math.round(priceStats.avg_price || 0), // Simplified
          },
          query_metrics: {
            total_queries: 0,
            average_response_time: 0,
            cache_hit_rate: 0,
          },
          health_score: this.calculateCategoryHealthScore(productCount, priceStats),
          created_at: timestamp,
        };

        await analyticsCollection.insertOne(analyticsDoc);
      } catch (error) {
        this.logger.error(`Failed to update analytics for category ${category.canonical_id}:`, error);
      }
    }

    this.logger.info(`Updated category analytics for ${this.canonicalCategories.length} categories`);
  }

  // HELPER METHODS FOR MULTI-CATEGORY SUPPORT

  generateSlug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  getHierarchyLevel(sourceType) {
    const levelMap = {
      'gender_demographics': 1,
      'product_categories': 2,
      'brands': 3,
      'featured_collections': 4,
      'other': 2,
    };
    return levelMap[sourceType] || 2;
  }

  mapCategoryType(sourceType) {
    const typeMap = {
      'gender_demographics': 'gender',
      'product_categories': 'product_type',
      'brands': 'brand',
      'featured_collections': 'promotion',
      'other': 'product_type',
    };
    return typeMap[sourceType] || 'product_type';
  }

  extractGenderFocus(category) {
    const lowerName = category.name.toLowerCase();
    const lowerUrl = (category.url || '').toLowerCase();

    if (lowerName.includes('men') || lowerUrl.includes('men')) {return 'mens';}
    if (lowerName.includes('women') || lowerUrl.includes('women')) {return 'womens';}
    return 'unisex';
  }

  extractProductFocus(category) {
    const lowerName = category.name.toLowerCase();
    const lowerUrl = (category.url || '').toLowerCase();

    if (lowerName.includes('clothing') || lowerUrl.includes('clothing')) {return 'clothing';}
    if (lowerName.includes('shoes') || lowerUrl.includes('shoes')) {return 'shoes';}
    if (lowerName.includes('accessories') || lowerUrl.includes('accessories')) {return 'accessories';}
    if (lowerName.includes('jewelry') || lowerUrl.includes('jewelry')) {return 'jewelry';}
    return 'mixed';
  }

  classifyBrandTier(category) {
    const estimatedProducts = category.estimated_products || 15;
    if (estimatedProducts >= 50) {return 'premium';}
    if (estimatedProducts >= 25) {return 'established';}
    return 'emerging';
  }

  extractPromotionType(category) {
    const lowerName = category.name.toLowerCase();
    const lowerUrl = (category.url || '').toLowerCase();

    if (lowerName.includes('sale') || lowerUrl.includes('sale')) {return 'sale';}
    if (lowerName.includes('new') || lowerUrl.includes('new')) {return 'new_arrivals';}
    if (lowerName.includes('gift') || lowerUrl.includes('gift')) {return 'gift_guide';}
    return 'featured';
  }

  assessUrgency(category) {
    const lowerName = category.name.toLowerCase();
    if (lowerName.includes('sale') || lowerName.includes('limited')) {return 'high';}
    if (lowerName.includes('new') || lowerName.includes('featured')) {return 'medium';}
    return 'low';
  }

  findMultiCategoryRelationships(category) {
    // Find related categories from hierarchy data
    if (!this.categoryHierarchy?.multi_category_relationships) {return [];}

    return this.categoryHierarchy.multi_category_relationships
      .filter(rel => rel.primary_category?.canonical_id === category.canonical_id)
      .map(rel => ({
        relationship_type: rel.relationship_type,
        related_category_ids: rel.categories
          .filter(cat => cat.role === 'secondary')
          .map(cat => cat.item.canonical_id),
        relationship_strength: 0.8, // Default strength
      }));
  }

  classifyProductCategories(productData, categoryAnalysis) {
    const categories = [];

    // Primary category from scraping context
    if (categoryAnalysis) {
      const contextCategory = this.findCanonicalCategory(categoryAnalysis.url, categoryAnalysis.title);
      if (contextCategory) {
        categories.push({
          canonical_id: contextCategory.canonical_id,
          name: contextCategory.name,
          category_type: contextCategory.category_type || 'product_type',
          hierarchy_level: contextCategory.hierarchy_level || 2,
          url_path: contextCategory.url,
          is_primary: true,
          confidence_score: 0.9,
        });
      }
    }

    // Brand category from product title
    const brandName = this.extractBrandName(productData.productData.title);
    if (brandName) {
      const brandCategory = this.findBrandCategory(brandName);
      if (brandCategory) {
        categories.push({
          canonical_id: brandCategory.canonical_id,
          name: brandCategory.name,
          category_type: 'brand',
          hierarchy_level: 3,
          url_path: brandCategory.url,
          is_primary: false,
          confidence_score: 0.8,
        });
      }
    }

    // Gender category from product analysis
    const genderTarget = this.determineGenderFromProduct(productData.productData.title, productData.url);
    if (genderTarget !== 'unisex') {
      const genderCategory = this.findGenderCategory(genderTarget);
      if (genderCategory) {
        categories.push({
          canonical_id: genderCategory.canonical_id,
          name: genderCategory.name,
          category_type: 'gender',
          hierarchy_level: 1,
          url_path: genderCategory.url,
          is_primary: false,
          confidence_score: 0.7,
        });
      }
    }

    // Default category if none found
    if (categories.length === 0) {
      categories.push({
        canonical_id: 'clothing_general',
        name: 'General Clothing',
        category_type: 'product_type',
        hierarchy_level: 2,
        url_path: '/collections/clothing',
        is_primary: true,
        confidence_score: 0.5,
      });
    }

    return categories;
  }

  findCanonicalCategory(url, name) {
    if (!this.canonicalCategories) {return null;}

    // Try URL match first
    let match = this.canonicalCategories.find(cat =>
      cat.url && url && cat.url.toLowerCase() === url.toLowerCase(),
    );

    if (match) {return match;}

    // Try name match
    match = this.canonicalCategories.find(cat =>
      cat.name && name && cat.name.toLowerCase() === name.toLowerCase(),
    );

    if (match) {return match;}

    // Try partial URL match
    if (url) {
      const urlPath = url.split('/').pop();
      match = this.canonicalCategories.find(cat =>
        cat.url && cat.url.includes(urlPath),
      );
    }

    return match;
  }

  extractBrandName(title) {
    // Simple brand extraction - could be enhanced with brand recognition
    const commonBrands = ['brain dead', 'kapital', '7115', 'needles', 'visvim', 'stone island'];
    const lowerTitle = title.toLowerCase();

    for (const brand of commonBrands) {
      if (lowerTitle.includes(brand)) {
        return brand.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      }
    }

    // Extract first word if it looks like a brand
    const firstWord = title.split(' ')[0];
    if (firstWord && firstWord.length > 2 && /^[A-Z]/.test(firstWord)) {
      return firstWord;
    }

    return null;
  }

  findBrandCategory(brandName) {
    if (!this.canonicalCategories) {return null;}

    return this.canonicalCategories.find(cat =>
      cat.source_type === 'brands' &&
      cat.name.toLowerCase().includes(brandName.toLowerCase()),
    );
  }

  findGenderCategory(gender) {
    if (!this.canonicalCategories) {return null;}

    return this.canonicalCategories.find(cat =>
      cat.source_type === 'gender_demographics' &&
      cat.name.toLowerCase().includes(gender),
    );
  }

  determineGenderFromProduct(title, url) {
    const lowerTitle = title.toLowerCase();
    const lowerUrl = (url || '').toLowerCase();

    if (lowerTitle.includes('men') || lowerUrl.includes('men') ||
        lowerTitle.includes("men's") || lowerUrl.includes('mens')) {
      return 'mens';
    }

    if (lowerTitle.includes('women') || lowerUrl.includes('women') ||
        lowerTitle.includes("women's") || lowerUrl.includes('womens')) {
      return 'womens';
    }

    return 'unisex';
  }

  determineGenderTarget(categories, title) {
    // Extract gender from categories first
    const genderCategories = categories.filter(cat => cat.category_type === 'gender');
    if (genderCategories.length > 0) {
      return genderCategories.map(cat => {
        const name = cat.name.toLowerCase();
        if (name.includes('men')) {return 'mens';}
        if (name.includes('women')) {return 'womens';}
        return 'unisex';
      });
    }

    // Fallback to title analysis
    const gender = this.determineGenderFromProduct(title, '');
    return [gender];
  }

  buildProductHierarchyPath(categories) {
    // Build slash-separated hierarchy path
    const levels = ['', '', '', ''];

    categories.forEach(cat => {
      if (cat.hierarchy_level && cat.hierarchy_level <= 4) {
        levels[cat.hierarchy_level - 1] = this.generateSlug(cat.name);
      }
    });

    return levels.filter(level => level).join('/');
  }

  generateProductSlug(title, productId) {
    const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `${titleSlug}-${productId}`.slice(0, 100);
  }

  generateProductTags(title, categories) {
    const tags = [];

    // Add category names as tags
    categories.forEach(cat => {
      tags.push(cat.name.toLowerCase());
    });

    // Add title words as tags
    title.toLowerCase().split(' ').forEach(word => {
      if (word.length > 2 && !['the', 'and', 'for', 'with'].includes(word)) {
        tags.push(word);
      }
    });

    return [...new Set(tags)].slice(0, 10); // Remove duplicates, limit to 10
  }

  generateStyleTags(title, categories) {
    const styleTags = [];
    const lowerTitle = title.toLowerCase();

    // Extract style indicators from title
    const styleKeywords = [
      'vintage', 'modern', 'classic', 'casual', 'formal', 'street', 'minimalist',
      'oversized', 'slim', 'fitted', 'loose', 'cropped', 'long', 'short',
    ];

    styleKeywords.forEach(keyword => {
      if (lowerTitle.includes(keyword)) {
        styleTags.push(keyword);
      }
    });

    // Add category-based style tags
    categories.forEach(cat => {
      if (cat.category_type === 'brand') {
        styleTags.push(`${cat.name.toLowerCase()}-style`);
      }
    });

    return styleTags.slice(0, 5);
  }

  extractColors(productData) {
    // Simple color extraction from variants
    const colors = [];

    if (productData.variants) {
      productData.variants.forEach(variantGroup => {
        if (variantGroup.type === 'color' || variantGroup.label?.toLowerCase().includes('color')) {
          variantGroup.options?.forEach(option => {
            colors.push(option.text || option.value);
          });
        }
      });
    }

    return colors.slice(0, 10);
  }

  extractSizes(productData) {
    // Simple size extraction from variants
    const sizes = [];

    if (productData.variants) {
      productData.variants.forEach(variantGroup => {
        if (variantGroup.type === 'size' || variantGroup.label?.toLowerCase().includes('size')) {
          variantGroup.options?.forEach(option => {
            sizes.push(option.text || option.value);
          });
        }
      });
    }

    return sizes.slice(0, 15);
  }

  extractMaterials(description) {
    if (!description) {return [];}

    const materials = [];
    const materialKeywords = [
      'cotton', 'wool', 'silk', 'linen', 'polyester', 'nylon', 'leather',
      'denim', 'cashmere', 'bamboo', 'organic', 'recycled',
    ];

    const lowerDescription = description.toLowerCase();
    materialKeywords.forEach(material => {
      if (lowerDescription.includes(material)) {
        materials.push(material);
      }
    });

    return materials.slice(0, 5);
  }

  calculateCategoryHealthScore(productCount, priceStats) {
    let score = 0;

    // Product count score (0-40 points)
    if (productCount >= 50) {score += 40;}
    else if (productCount >= 25) {score += 30;}
    else if (productCount >= 10) {score += 20;}
    else if (productCount >= 1) {score += 10;}

    // Price diversity score (0-30 points)
    if (priceStats.max_price > priceStats.min_price) {
      const priceRange = priceStats.max_price - priceStats.min_price;
      if (priceRange >= 10000) {score += 30;} // $100+ range
      else if (priceRange >= 5000) {score += 20;} // $50+ range
      else if (priceRange >= 1000) {score += 10;} // $10+ range
    }

    // Average price reasonableness (0-30 points)
    if (priceStats.avg_price > 0 && priceStats.avg_price < 50000) { // Under $500
      score += 30;
    } else if (priceStats.avg_price > 0) {
      score += 15;
    }

    return Math.min(100, score);
  }

  // Keep original helper methods
  extractPathLevel(path, levelType) {
    const sequence = path.navigation_sequence || [];
    const levelItem = sequence.find(item => item.type === levelType);
    return levelItem ? levelItem.category.canonical_id || levelItem.category.name : null;
  }

  buildFullPath(path) {
    const sequence = path.navigation_sequence || [];
    return sequence.map(item => item.category.name || item.category.type).join(' > ');
  }

  buildPathSegments(path) {
    const sequence = path.navigation_sequence || [];
    return sequence.map(item => ({
      level: item.level,
      type: item.type,
      name: item.category.name || item.category.type,
      canonical_id: item.category.canonical_id,
    }));
  }

  calculateNavigationPriority(path) {
    // Higher priority for complete paths and popular combinations
    let priority = 0;

    if (path.path_type === 'brand_direct') {priority += 10;}
    if (path.path_type === 'promotion_direct') {priority += 8;}
    if (path.navigation_sequence?.length >= 3) {priority += 5;}
    if (path.estimated_products >= 50) {priority += 3;}

    return priority;
  }

  generateCanonicalId(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  findBrandCanonicalId(title) {
    const brandName = this.extractBrandName(title);
    if (brandName) {
      const brandCategory = this.findBrandCategory(brandName);
      return brandCategory?.canonical_id || this.generateCanonicalId(`brand_${brandName}`);
    }
    return null;
  }

  findRelatedCategories(url, name) {
    // Find related categories based on URL patterns and name similarity
    if (!this.canonicalCategories) {return [];}

    return this.canonicalCategories
      .filter(cat => {
        const catUrl = cat.url || '';
        const catName = cat.name || '';

        // Skip exact matches
        if (catUrl === url || catName === name) {return false;}

        // Check for URL similarity
        if (url && catUrl) {
          const urlParts = url.split('/').filter(p => p.length > 0);
          const catUrlParts = catUrl.split('/').filter(p => p.length > 0);
          const commonParts = urlParts.filter(part => catUrlParts.includes(part));
          if (commonParts.length >= 2) {return true;}
        }

        // Check for name similarity
        if (name && catName) {
          const nameParts = name.toLowerCase().split(' ');
          const catNameParts = catName.toLowerCase().split(' ');
          const commonWords = nameParts.filter(word => catNameParts.includes(word));
          if (commonWords.length >= 1 && commonWords[0].length > 3) {return true;}
        }

        return false;
      })
      .slice(0, 5) // Limit to 5 related categories
      .map(cat => cat.canonical_id);
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
