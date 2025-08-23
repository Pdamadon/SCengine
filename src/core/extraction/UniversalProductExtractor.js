/**
 * UniversalProductExtractor
 *
 * Comprehensive product extraction system that:
 * - Extracts all product data fields (title, price, variants, images, etc.)
 * - Learns and stores working selectors for quick updates
 * - Supports multiple extraction strategies with fallbacks
 * - Enables real-time price/availability checks
 * - Integrates with existing intelligence services for smart extraction
 */

const { chromium } = require('playwright');
const WorldModel = require('../../data/WorldModel');
// const AdvancedFallbackSystem = require('../intelligence/AdvancedFallbackSystem'); // REMOVED - over-engineered
// Removed ProductPatternLearner - was fake learning system
const ExtractorIntelligence = require('./ExtractorIntelligence');
const { HTTPJsonLdExtractor } = require('./http');

class UniversalProductExtractor {
  constructor(logger, worldModel = null) {
    this.logger = logger;
    this.worldModel = worldModel || new WorldModel(logger);
    this.browser = null;
    this.extractionTimeout = 30000; // 30 seconds default
    this.quickCheckTimeout = 5000; // 5 seconds for quick checks

    // Initialize intelligence services (removed unused services)

    // Initialize advanced extractor intelligence with interactive validation
    this.extractorIntelligence = new ExtractorIntelligence(logger, worldModel);
    
    // Initialize HTTP-first extraction (configurable)
    this.httpExtractor = new HTTPJsonLdExtractor(logger);

    // Extraction strategies in priority order
    this.strategies = [
      'jsonLd',              // JSON-LD structured data (HIGHEST PRIORITY - fastest and most reliable)
      'validatedSelectors',   // Interactively validated selectors
      'storedPatterns',      // Previously learned patterns from MongoDB/Redis
      'platformSpecific',    // Patterns passed in for known platforms
      'intelligentDiscovery', // Use intelligence services to discover
      'semanticSelectors',   // Semantic HTML patterns
      'structuralPatterns',  // Common structural patterns
      'textPatterns',        // Text-based detection
      'metaTags',           // Meta tags fallback
    ];

    // No hardcoded patterns - will be loaded from storage or passed in
    this.platformPatterns = null;
    this.learnedSelectors = new Map(); // Cache for this session
  }


  /**
   * Simple extract method for PipelineOrchestrator compatibility
   * Extracts product data from an existing page (no browser management)
   */
  async extract(page, options = {}) {
    const url = options.url || page.url();
    
    try {
      // HTTP-first extraction attempt (if enabled)
      const httpResult = await this.tryHTTPFirst(url);
      if (httpResult && httpResult.ok) {
        this.logger.info(`HTTP extraction successful for ${url}`);
        return httpResult.product;
      }
      
      // Fallback to browser-based extraction
      if (httpResult) {
        this.logger.debug(`HTTP extraction failed for ${url}: ${httpResult.reason}, falling back to browser`);
      }
      
      // Extract using JSON-LD first (priority #1)
      const jsonLdData = await this.extractJsonLd(page);
      
      const productData = {
        source_url: url,
        extractionMethod: jsonLdData ? 'jsonLd' : 'domFallback',
        extractedAt: new Date().toISOString()
      };

      if (jsonLdData) {
        // Use JSON-LD data as primary source
        Object.assign(productData, jsonLdData);
        this.logger.info(`JSON-LD extraction successful for ${url}`);
      } else {
        // Fall back to DOM extraction
        this.logger.info(`JSON-LD failed, using DOM fallback for ${url}`);
        productData.title = await this.extractTitleFallback(page);
        productData.price = await this.extractPriceFallback(page);
        productData.brand = await this.extractBrandFallback(page);
      }

      // Add missing basic fields if not present
      if (!productData.title) productData.title = await page.title();
      if (!productData.images) productData.images = [];
      if (!productData.variants) productData.variants = [];
      
      return productData;
      
    } catch (error) {
      this.logger.error(`Failed to extract product from ${url}:`, error);
      throw error;
    }
  }

  /**
   * Initialize browser for extraction
   */
  async initialize() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
        ],
      });
    }
    await this.worldModel.initialize();
  }

  /**
   * Main extraction method - comprehensive product data extraction
   */
  async extractProduct(url, domain = null, options = {}) {
    const startTime = Date.now();
    domain = domain || new URL(url).hostname;

    const page = await this.browser.newPage();

    try {
      // Configure page
      await this.configurePage(page);

      // Navigate to product page - use domcontentloaded for faster initial load
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.extractionTimeout,
      });

      // Wait a bit for dynamic content to load
      await page.waitForTimeout(2000);

      // Load learned patterns from storage (MongoDB/Redis)
      const storedPatterns = await this.loadStoredPatterns(domain);

      // Detect platform using stored patterns or discovery
      const platform = await this.detectPlatform(page, domain, storedPatterns);

      // Get existing selectors from WorldModel
      const existingSelectors = await this.worldModel.getSelectorLibrary(domain);

      // Merge all available patterns
      const availablePatterns = {
        stored: storedPatterns,
        existing: existingSelectors,
        platform: options.platformPatterns || null,
      };

      // Extract product data with multiple strategies
      const productData = await this.extractWithStrategies(page, url, domain, platform, availablePatterns);

      // Extract successful selectors for storage
      const extractionStrategy = this.buildExtractionStrategy(productData._extractionMetadata);

      // Clean metadata from final product
      delete productData._extractionMetadata;

      // Add extraction strategy to product data
      productData.extraction_strategy = extractionStrategy;
      productData.quick_check_config = {
        enabled: true,
        check_interval_ms: 3600000, // 1 hour default
        last_check: new Date(),
        next_check: new Date(Date.now() + 3600000),
        priority: this.calculatePriority(productData),
      };

      // Record extraction in update history
      productData.update_history = [{
        timestamp: new Date(),
        update_type: 'full',
        changes: { all_fields: true },
        success: true,
        extraction_time_ms: Date.now() - startTime,
      }];

      // Store successful selectors in WorldModel
      await this.storeSuccessfulSelectors(domain, extractionStrategy);

      // Calculate quality score
      productData.extraction_quality = this.calculateQualityScore(productData);

      this.logger.info(`Product extracted from ${url}`, {
        title: productData.title,
        price: productData.price,
        quality: productData.extraction_quality,
        time: Date.now() - startTime,
      });

      return productData;

    } catch (error) {
      this.logger.error(`Failed to extract product from ${url}:`, error);
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * Quick check for real-time price/availability updates
   */
  async quickCheck(url, extractionStrategy, domain = null) {
    const startTime = Date.now();
    domain = domain || new URL(url).hostname;

    if (!extractionStrategy?.quick_check) {
      throw new Error('No quick check strategy available');
    }

    const page = await this.browser.newPage();

    try {
      // Lighter page configuration for speed
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        // Block unnecessary resources for quick checks
        if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.quickCheckTimeout,
      });

      const updates = {};

      // Check price
      if (extractionStrategy.quick_check.price) {
        updates.price = await this.extractQuickField(
          page,
          extractionStrategy.quick_check.price,
        );
      }

      // Check availability
      if (extractionStrategy.quick_check.availability) {
        updates.availability = await this.extractAvailability(
          page,
          extractionStrategy.quick_check.availability,
        );
      }

      // Check stock count if available
      if (extractionStrategy.quick_check.stock_count) {
        updates.stock_count = await this.extractStockCount(
          page,
          extractionStrategy.quick_check.stock_count,
        );
      }

      updates.extraction_time_ms = Date.now() - startTime;
      updates.timestamp = new Date();

      return updates;

    } finally {
      await page.close();
    }
  }

  /**
   * Load stored patterns from MongoDB/Redis
   */
  async loadStoredPatterns(domain) {
    try {
      // TODO: Implement these methods in WorldModel
      // For now, return null to allow testing without stored patterns

      // Check if WorldModel has the methods before calling
      if (this.worldModel.getCachedExtractionPatterns) {
        const cachedPatterns = await this.worldModel.getCachedExtractionPatterns(domain);
        if (cachedPatterns) {
          this.logger.info(`Loaded cached extraction patterns for ${domain}`);
          return cachedPatterns;
        }
      }

      // Try to get from selector library (this method exists)
      const selectorLibrary = await this.worldModel.getSelectorLibrary(domain);
      if (selectorLibrary) {
        this.logger.info(`Using selector library for ${domain}`);
        return {
          stored: {
            quick_check: {
              title: { selector: selectorLibrary.selectors?.product?.title },
              price: { selector: selectorLibrary.selectors?.product?.price },
            },
          },
        };
      }

      this.logger.info(`No stored patterns found for ${domain}, will discover new ones`);
      return null;
    } catch (error) {
      this.logger.warn(`Failed to load stored patterns for ${domain}:`, error.message);
      return null;
    }
  }

  /**
   * Extract product data using multiple strategies
   */
  async extractWithStrategies(page, url, domain, platform, availablePatterns) {
    const productData = {
      source_url: url,
      domain,
      platform,
      _extractionMetadata: {}, // Track what worked for strategy storage
    };

    // Strategy 1: Try validated selectors from ExtractorIntelligence first
    const validatedStrategy = await this.getValidatedSelectors(page, url, domain);

    if (validatedStrategy && validatedStrategy.selectors) {
      this.logger.info(`Using validated selectors for extraction (quality: ${validatedStrategy.quality}%)`);

      // Extract using validated selectors
      const validatedData = await this.extractWithValidatedSelectors(page, validatedStrategy.selectors);

      // Merge validated data into product data
      Object.assign(productData, validatedData);

      // Mark metadata for successful strategy
      productData._extractionMetadata.primary_strategy = 'validatedSelectors';
      productData._extractionMetadata.strategy_quality = validatedStrategy.quality;
      productData._extractionMetadata.validated_fields = Object.keys(validatedData).filter(key => validatedData[key] !== null);
    }

    // Strategy 2: Try JSON-LD first (fastest and most complete)
    const jsonLdData = await this.extractJsonLd(page);
    if (jsonLdData) {
      this.logger.info('Using JSON-LD structured data for extraction');
      Object.assign(productData, jsonLdData);
      productData._extractionMetadata.primary_strategy = 'jsonLd';
      productData._extractionMetadata.jsonld_fields = Object.keys(jsonLdData).filter(key => jsonLdData[key] !== null);
    }

    // Strategy 3: Fill any missing fields with DOM fallback methods
    if (!productData.title) {
      productData.title = await this.extractTitleFallback(page);
      if (!productData.title) {
        productData.title = await this.extractTitle(page, platform, availablePatterns);
      }
    }
    if (!productData.price) {
      productData.price = await this.extractPriceFallback(page);
      if (!productData.price) {
        productData.price = await this.extractPrice(page, platform, availablePatterns);
      }
    }
    if (!productData.brand) {
      productData.brand = await this.extractBrandFallback(page);
      if (!productData.brand) {
        productData.brand = await this.extractBrand(page, platform, availablePatterns);
      }
    }
    if (!productData.original_price) {
      productData.original_price = await this.extractOriginalPrice(page, platform, availablePatterns);
    }
    if (!productData.description) {
      productData.description = await this.extractDescription(page, platform, availablePatterns);
    }
    if (!productData.availability) {
      productData.availability = await this.extractAvailabilityStatus(page, platform, availablePatterns);
    }
    if (!productData.images) {
      productData.images = await this.extractImages(page, platform, availablePatterns);
    }
    if (!productData.variants) {
      productData.variants = await this.extractVariants(page, platform, availablePatterns);
    }

    // Additional fields
    productData.brand = await this.extractBrand(page, platform, availablePatterns);
    productData.categories = await this.extractCategories(page);
    productData.attributes = await this.extractAttributes(page);
    productData.reviews = await this.extractReviews(page);
    productData.shipping = await this.extractShipping(page);

    // SEO and meta data
    const metaData = await this.extractMetaData(page);
    productData.meta_title = metaData.title;
    productData.meta_description = metaData.description;
    productData.meta_keywords = metaData.keywords;

    // Generate product ID
    productData.product_id = await this.extractProductId(page, url);

    return productData;
  }

  /**
   * Get or learn validated selectors for a domain using ExtractorIntelligence
   */
  async getValidatedSelectors(page, url, domain) {
    try {
      // Try to load existing strategy from storage first
      const existingStrategy = await this.worldModel.getExtractionStrategy?.(domain);

      if (existingStrategy && existingStrategy.quality >= 70) {
        this.logger.info(`Using existing validated strategy for ${domain} (quality: ${existingStrategy.quality}%)`);
        return existingStrategy;
      }

      // If no good existing strategy, use ExtractorIntelligence to learn one
      this.logger.info(`Learning new validated selectors for ${domain}`);

      // Share our browser instance with ExtractorIntelligence
      if (!this.extractorIntelligence.browser) {
        this.extractorIntelligence.browser = this.browser;
      }

      const strategy = await this.extractorIntelligence.learnExtractionStrategy(domain, [url], {
        qualityThreshold: 60,
        maxAttempts: 2,  // Reduce attempts to prevent excessive browser usage
      });

      if (strategy && strategy.quality >= 60) {
        this.logger.info(`Successfully learned validated selectors for ${domain} (quality: ${strategy.quality}%)`);
        return strategy;
      }

      (this.logger.warn || this.logger.info)(`Failed to learn validated selectors for ${domain}`);
      return null;

    } catch (error) {
      this.logger.error(`Error getting validated selectors for ${domain}:`, error);
      return null;
    }
  }

  /**
   * Extract product data using validated selectors from ExtractorIntelligence
   */
  async extractWithValidatedSelectors(page, selectors) {
    const extractedData = {};

    try {
      // Extract each field using its validated selector
      for (const [fieldName, selectorObj] of Object.entries(selectors)) {
        try {
          if (!selectorObj || !selectorObj.selector) {
            continue;
          }

          const value = await this.extractFieldWithSelector(page, fieldName, selectorObj);
          if (value !== null && value !== undefined) {
            extractedData[fieldName] = value;

            this.logger.debug(`✓ Extracted ${fieldName} using validated selector:`, {
              selector: selectorObj.selector,
              confidence: selectorObj.confidence,
              validated: selectorObj.validated,
              value: typeof value === 'string' ? value.substring(0, 50) : value,
            });
          }
        } catch (error) {
          this.logger.debug(`Failed to extract ${fieldName} with validated selector:`, error.message);
        }
      }

      return extractedData;

    } catch (error) {
      this.logger.error('Failed to extract with validated selectors:', error);
      return {};
    }
  }

  /**
   * Extract a specific field using a validated selector
   */
  async extractFieldWithSelector(page, fieldName, selectorObj) {
    const { selector, confidence, validated, interactive } = selectorObj;

    try {
      const elements = await page.$$(selector);
      if (elements.length === 0) {
        return null;
      }

      const element = elements[0]; // Use first matching element

      switch (fieldName) {
        case 'title':
          return await element.textContent();

        case 'price':
          const priceText = await element.textContent();
          return this.normalizePrice(priceText);

        case 'images':
          if (await element.evaluate(el => el.tagName.toLowerCase()) === 'img') {
            const src = await element.getAttribute('src');
            return src ? [{ url: src, alt: await element.getAttribute('alt') || '' }] : null;
          } else {
            // Look for img within the element
            const img = await element.$('img');
            if (img) {
              const src = await img.getAttribute('src');
              return src ? [{ url: src, alt: await img.getAttribute('alt') || '' }] : null;
            }
          }
          return null;

        case 'description':
          return await element.textContent();

        case 'variants':
          return await this.extractVariantOptions(element);

        case 'availability':
          const text = await element.textContent();
          const isDisabled = await element.evaluate(el => el.disabled);

          // Determine availability based on text and state
          if (isDisabled || text.toLowerCase().includes('sold out') || text.toLowerCase().includes('unavailable')) {
            return { status: 'out_of_stock', text: text.trim() };
          } else if (text.toLowerCase().includes('add to cart') || text.toLowerCase().includes('buy now')) {
            return { status: 'in_stock', text: text.trim() };
          }
          return { status: 'unknown', text: text.trim() };

        case 'brand':
          return await element.textContent();

        default:
          return await element.textContent();
      }

    } catch (error) {
      this.logger.debug(`Error extracting ${fieldName} with selector ${selector}:`, error.message);
      return null;
    }
  }

  /**
   * Extract variant options from a form element
   */
  async extractVariantOptions(element) {
    try {
      const tagName = await element.evaluate(el => el.tagName.toLowerCase());

      if (tagName === 'select') {
        const options = await element.$$eval('option', options =>
          options.map(opt => ({
            value: opt.value,
            text: opt.textContent.trim(),
            selected: opt.selected,
          })).filter(opt => opt.value && opt.text),
        );
        return options.length > 0 ? options : null;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Normalize price text to a standard format
   */
  normalizePrice(priceText) {
    if (!priceText) {return null;}

    // Extract numeric value from price text
    const match = priceText.match(/[\d,]+\.?\d*/);
    if (match) {
      const numericValue = parseFloat(match[0].replace(/,/g, ''));
      return {
        amount: numericValue,
        currency: priceText.includes('$') ? 'USD' : 'USD', // Default to USD
        display: priceText.trim(),
      };
    }

    return null;
  }

  /**
   * Extract product title with multiple fallback strategies
   */
  async extractTitle(page, platform, availablePatterns) {
    const strategies = [];

    // Try stored patterns first (from MongoDB/Redis)
    if (availablePatterns?.stored?.quick_check?.title) {
      strategies.push({
        name: 'stored',
        selector: availablePatterns.stored.quick_check.title.selector,
        confidence: availablePatterns.stored.quick_check.title.success_rate || 0.9,
      });
    }

    // Try existing successful selectors from WorldModel
    if (availablePatterns?.existing?.selectors?.product?.title) {
      strategies.push({
        name: 'existing',
        selector: availablePatterns.existing.selectors.product.title,
      });
    }

    // Try cross-site patterns
    if (availablePatterns?.stored?.crossSite) {
      availablePatterns.stored.crossSite.forEach(pattern => {
        if (pattern.elementType === 'title' && pattern.selector) {
          strategies.push({
            name: 'crossSite',
            selector: pattern.selector,
            confidence: pattern.success_rate || 0.7,
          });
        }
      });
    }

    // Fallback system was removed - rely on common patterns below

    // Add common patterns as last resort
    strategies.push(
      { name: 'h1', selector: 'h1', confidence: 0.3 },
      { name: 'product-title', selector: '.product-title, .product-name, [class*="product-title"]', confidence: 0.3 },
      { name: 'itemprop', selector: '[itemprop="name"]', confidence: 0.4 },
      { name: 'og-title', selector: 'meta[property="og:title"]', attribute: 'content', confidence: 0.2 },
    );

    for (const strategy of strategies) {
      try {
        let title;
        if (strategy.attribute) {
          title = await page.$eval(strategy.selector,
            (el, attr) => el.getAttribute(attr),
            strategy.attribute,
          );
        } else {
          title = await page.$eval(strategy.selector, el => el.textContent?.trim());
        }

        if (title && title.length > 2) {
          // Store successful strategy
          page._extractionMetadata = page._extractionMetadata || {};
          page._extractionMetadata.title = {
            strategy: strategy.name,
            selector: strategy.selector,
            success: true,
          };
          return title;
        }
      } catch (e) {
        // Try next strategy
      }
    }

    // Fallback to page title
    return await page.title();
  }

  /**
   * Extract price with currency detection
   */
  async extractPrice(page, platform, existingSelectors) {
    const pricePatterns = [
      /\$[\d,]+\.?\d*/,
      /€[\d,]+\.?\d*/,
      /£[\d,]+\.?\d*/,
      /[\d,]+\.?\d*\s*(USD|EUR|GBP)/i,
    ];

    const strategies = [];

    // Platform-specific (now loaded from storage, not hardcoded)
    if (platform && existingSelectors?.platform?.selectors?.price) {
      strategies.push(existingSelectors.platform.selectors.price);
    }

    // Common selectors
    strategies.push(
      '.price-now, .sale-price, .special-price',
      '.price:not(.old-price):not(.was-price)',
      '[itemprop="price"]',
      '.product-price',
      'meta[property="product:price:amount"]',
    );

    for (const selector of strategies) {
      try {
        const priceText = await page.$eval(selector, el => {
          if (el.tagName === 'META') {
            return el.getAttribute('content');
          }
          return el.textContent;
        });

        // Extract numeric price
        for (const pattern of pricePatterns) {
          const match = priceText.match(pattern);
          if (match) {
            const price = parseFloat(match[0].replace(/[^0-9.]/g, ''));
            if (!isNaN(price) && price > 0) {
              // Store successful selector
              page._extractionMetadata = page._extractionMetadata || {};
              page._extractionMetadata.price = {
                selector,
                success: true,
              };
              return Math.round(price * 100); // Store in cents
            }
          }
        }
      } catch (e) {
        // Continue to next strategy
      }
    }

    return null;
  }

  /**
   * Extract product images
   */
  async extractImages(page, platform, existingSelectors) {
    const images = [];

    // Try product image gallery first
    const gallerySelectors = [
      '.product-images img',
      '.product-gallery img',
      '.product-photo img',
      '[data-zoom-image]',
      '.thumbnails img',
    ];

    for (const selector of gallerySelectors) {
      try {
        const imgs = await page.$$eval(selector, elements =>
          elements.map(img => ({
            url: img.src || img.dataset.src || img.dataset.zoomImage,
            alt_text: img.alt,
            type: 'gallery',
          })).filter(img => img.url),
        );

        if (imgs.length > 0) {
          images.push(...imgs);
          break;
        }
      } catch (e) {
        // Continue
      }
    }

    // Get primary image if no gallery found
    if (images.length === 0) {
      try {
        const mainImage = await page.$eval(
          'img.main-image, img.product-image, .product-main-image img',
          img => ({
            url: img.src || img.dataset.src,
            alt_text: img.alt,
            type: 'primary',
          }),
        );
        if (mainImage.url) {
          images.push(mainImage);
        }
      } catch (e) {
        // Try meta tag
        try {
          const ogImage = await page.$eval(
            'meta[property="og:image"]',
            meta => meta.content,
          );
          if (ogImage) {
            images.push({ url: ogImage, type: 'primary' });
          }
        } catch (e) {
          // No images found
        }
      }
    }

    // Mark first image as primary
    if (images.length > 0 && !images.some(img => img.type === 'primary')) {
      images[0].type = 'primary';
    }

    return images;
  }

  /**
   * Extract product variants (sizes, colors, etc.)
   */
  async extractVariants(page, platform, existingSelectors) {
    const variants = [];

    try {
      // Look for variant selectors (dropdowns, radio buttons, swatches)
      const variantData = await page.evaluate(() => {
        const variants = [];

        // Check for select dropdowns
        const selects = document.querySelectorAll('select.product-option, select[name*="option"], select[data-variant]');
        selects.forEach(select => {
          const type = select.name || select.dataset.option || 'variant';
          const options = Array.from(select.options).slice(1).map(opt => ({ // Skip first "Choose..." option
            variant_id: opt.value,
            type,
            value: opt.text,
            availability: !opt.disabled,
          }));
          variants.push(...options);
        });

        // Check for radio/checkbox groups
        const radioGroups = {};
        document.querySelectorAll('input[type="radio"][name*="option"], input[type="radio"][data-variant]').forEach(radio => {
          const groupName = radio.name;
          if (!radioGroups[groupName]) {
            radioGroups[groupName] = [];
          }
          radioGroups[groupName].push({
            variant_id: radio.value,
            type: radio.dataset.optionName || groupName,
            value: radio.dataset.optionValue || radio.parentElement.textContent.trim(),
            availability: !radio.disabled,
          });
        });
        Object.values(radioGroups).forEach(group => variants.push(...group));

        // Check for swatch buttons
        const swatches = document.querySelectorAll('.swatch, .product-option-swatch, [data-variant-option]');
        swatches.forEach(swatch => {
          variants.push({
            variant_id: swatch.dataset.variantId || swatch.dataset.value,
            type: swatch.dataset.optionType || 'color',
            value: swatch.title || swatch.textContent.trim(),
            availability: !swatch.classList.contains('unavailable') && !swatch.disabled,
          });
        });

        return variants;
      });

      return variantData;
    } catch (e) {
      this.logger.warn('Failed to extract variants:', e.message);
      return [];
    }
  }

  /**
   * Build extraction strategy from successful extractions
   */
  buildExtractionStrategy(metadata) {
    if (!metadata) {return {};}

    const strategy = {
      quick_check: {},
      full_extraction: {},
      interaction_requirements: {
        requires_js: true,
        wait_for: [],
        timeouts: {
          page_load: 30000,
          quick_check: 5000,
        },
      },
      platform_hints: {},
    };

    // Build quick check selectors
    if (metadata.price?.selector) {
      strategy.quick_check.price = {
        selector: metadata.price.selector,
        alternatives: [],
        last_success: new Date(),
        success_rate: 1.0,
      };
    }

    if (metadata.availability?.selector) {
      strategy.quick_check.availability = {
        selector: metadata.availability.selector,
        success_indicators: ['in stock', 'available', 'add to cart'],
        failure_indicators: ['out of stock', 'sold out', 'unavailable'],
        last_success: new Date(),
      };
    }

    // Store full extraction selectors
    Object.entries(metadata).forEach(([field, data]) => {
      if (data.selector) {
        strategy.full_extraction[field] = {
          selector: data.selector,
          strategy: data.strategy,
          success_rate: 1.0,
        };
      }
    });

    return strategy;
  }

  /**
   * Store successful selectors in WorldModel for future use
   */
  async storeSuccessfulSelectors(domain, extractionStrategy) {
    if (!extractionStrategy.full_extraction) {return;}

    // Store using existing WorldModel method
    try {
      // Build selector library format that WorldModel expects
      const selectorLibrary = {
        selectors: {
          product: {},
        },
        success_rate: 0.9,
        last_updated: new Date().toISOString(),
      };

      for (const [field, data] of Object.entries(extractionStrategy.full_extraction)) {
        if (data.selector) {
          selectorLibrary.selectors.product[field] = data.selector;
        }
      }

      // Use existing storeSelectorLibrary method
      await this.worldModel.storeSelectorLibrary(domain, selectorLibrary);
      this.logger.info(`Stored successful selectors for ${domain}`);
    } catch (error) {
      this.logger.warn(`Failed to store selectors for ${domain}:`, error.message);
    }
  }

  /**
   * Additional extraction methods
   */

  async extractDescription(page, platform, existingSelectors) {
    const selectors = [
      '.product-description',
      '[itemprop="description"]',
      '.description',
      '#product-description',
      '.product-details',
    ];

    for (const selector of selectors) {
      try {
        const description = await page.$eval(selector, el => {
          return {
            text: el.textContent.trim(),
            html: el.innerHTML,
          };
        });

        if (description.text.length > 10) {
          return description.text;
        }
      } catch (e) {
        // Continue
      }
    }

    return null;
  }

  async extractAvailabilityStatus(page, platform, existingSelectors) {
    const inStockIndicators = ['in stock', 'available', 'add to cart', 'buy now'];
    const outOfStockIndicators = ['out of stock', 'sold out', 'unavailable', 'notify me'];

    try {
      const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());

      for (const indicator of outOfStockIndicators) {
        if (pageText.includes(indicator)) {
          return 'out_of_stock';
        }
      }

      for (const indicator of inStockIndicators) {
        if (pageText.includes(indicator)) {
          return 'in_stock';
        }
      }
    } catch (e) {
      // Default to unknown
    }

    return 'unknown';
  }

  async extractBrand(page, platform, existingSelectors) {
    const selectors = [
      '[itemprop="brand"]',
      '.product-brand',
      '.brand-name',
      'a[href*="/brand/"]',
    ];

    for (const selector of selectors) {
      try {
        const brand = await page.$eval(selector, el => el.textContent.trim());
        if (brand) {return { name: brand };}
      } catch (e) {
        // Continue
      }
    }

    return null;
  }

  async extractCategories(page) {
    try {
      // Look for breadcrumbs
      const breadcrumbs = await page.$$eval(
        '.breadcrumb a, .breadcrumbs a, nav[aria-label="breadcrumb"] a',
        links => links.map(link => ({
          name: link.textContent.trim(),
          url: link.href,
        })).filter(cat => cat.name && cat.name !== 'Home'),
      );

      if (breadcrumbs.length > 0) {
        return breadcrumbs.map((cat, index) => ({
          category_name: cat.name,
          hierarchy_level: index + 1,
          category_type: index === 0 ? 'product_type' : 'subcategory',
        }));
      }
    } catch (e) {
      // No categories found
    }

    return [];
  }

  async extractAttributes(page) {
    const attributes = {};

    try {
      // Look for product specifications
      const specs = await page.$$eval(
        '.product-specs tr, .specifications tr, .product-attributes tr',
        rows => rows.map(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length === 2) {
            return {
              key: cells[0].textContent.trim(),
              value: cells[1].textContent.trim(),
            };
          }
          return null;
        }).filter(Boolean),
      );

      specs.forEach(spec => {
        const key = spec.key.toLowerCase().replace(/\s+/g, '_');
        attributes[key] = spec.value;
      });
    } catch (e) {
      // No attributes found
    }

    return attributes;
  }

  async extractReviews(page) {
    try {
      const reviewData = await page.evaluate(() => {
        // Look for common review patterns
        const ratingElement = document.querySelector('.rating, .stars, [itemprop="ratingValue"]');
        const countElement = document.querySelector('.review-count, [itemprop="reviewCount"]');

        return {
          average_rating: ratingElement ? parseFloat(ratingElement.textContent) : null,
          review_count: countElement ? parseInt(countElement.textContent) : null,
        };
      });

      return reviewData.average_rating ? reviewData : null;
    } catch (e) {
      return null;
    }
  }

  async extractShipping(page) {
    try {
      const shippingInfo = await page.evaluate(() => {
        const shippingElement = document.querySelector('.shipping-info, .delivery-info');
        if (shippingElement) {
          return {
            text: shippingElement.textContent.trim(),
          };
        }
        return null;
      });

      return shippingInfo;
    } catch (e) {
      return null;
    }
  }

  async extractMetaData(page) {
    try {
      return await page.evaluate(() => ({
        title: document.querySelector('meta[property="og:title"]')?.content || document.title,
        description: document.querySelector('meta[name="description"]')?.content ||
                    document.querySelector('meta[property="og:description"]')?.content,
        keywords: document.querySelector('meta[name="keywords"]')?.content,
      }));
    } catch (e) {
      return {};
    }
  }

  async extractOriginalPrice(page, platform, existingSelectors) {
    const selectors = [
      '.was-price, .old-price, .original-price',
      '.price-was',
      'del .price',
      '.compare-at-price',
    ];

    for (const selector of selectors) {
      try {
        const priceText = await page.$eval(selector, el => el.textContent);
        const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
        if (!isNaN(price) && price > 0) {
          return Math.round(price * 100); // Store in cents
        }
      } catch (e) {
        // Continue
      }
    }

    return null;
  }

  async extractProductId(page, url) {
    // Try to extract from URL
    const urlPatterns = [
      /\/products?\/([^\/\?]+)/,
      /[?&]id=([^&]+)/,
      /\/p\/([^\/\?]+)/,
      /\/item\/([^\/\?]+)/,
    ];

    for (const pattern of urlPatterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Try meta tags
    try {
      const productId = await page.$eval(
        'meta[property="product:id"], meta[name="product-id"]',
        meta => meta.content,
      );
      if (productId) {return productId;}
    } catch (e) {
      // Generate from URL
    }

    // Generate from URL hash
    const crypto = require('crypto');
    return crypto.createHash('md5').update(url).digest('hex').substring(0, 12);
  }

  /**
   * Detect e-commerce platform dynamically
   */
  async detectPlatform(page, domain, storedPatterns) {
    try {
      // Check if we have a stored platform profile for this domain
      if (storedPatterns?.platform_hints?.platform) {
        this.logger.info(`Using stored platform: ${storedPatterns.platform_hints.platform} for ${domain}`);
        return storedPatterns.platform_hints.platform;
      }

      // Try to detect using the fallback system's platform patterns
      const pageContent = await page.content();

      // Check for common platform indicators
      const platformIndicators = {
        shopify: ['Shopify.', 'shopify_features', '/cart/add.js'],
        woocommerce: ['woocommerce', 'wc-', 'add-to-cart'],
        magento: ['Magento', 'mage/', 'product-info-main'],
        // Custom platforms would be detected by domain
        custom_gap: domain.includes('gap.com'),
        custom_macys: domain.includes('macys.com'),
        custom_nordstrom: domain.includes('nordstrom.com'),
        custom_rei: domain.includes('rei.com'),
      };

      for (const [platform, indicators] of Object.entries(platformIndicators)) {
        if (typeof indicators === 'boolean' && indicators) {
          this.logger.info(`Detected custom platform: ${platform} for ${domain}`);
          // TODO: Store this for future use when storePlatformProfile is implemented
          // await this.worldModel.storePlatformProfile(domain, { platform, detected_at: new Date() });
          return platform;
        }

        if (Array.isArray(indicators)) {
          for (const indicator of indicators) {
            if (pageContent.includes(indicator)) {
              this.logger.info(`Detected platform: ${platform} for ${domain}`);
              // TODO: Store this for future use when storePlatformProfile is implemented
              // await this.worldModel.storePlatformProfile(domain, { platform, detected_at: new Date() });
              return platform;
            }
          }
        }
      }

      // If no platform detected, mark as custom/unknown
      this.logger.info(`No known platform detected for ${domain}, treating as custom`);
      return 'custom';

    } catch (e) {
      this.logger.warn('Platform detection failed:', e.message);
      return 'unknown';
    }
  }

  /**
   * Configure page for extraction
   */
  async configurePage(page) {
    // Set viewport
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Set user agent to avoid detection
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    // Dismiss popups/modals
    page.on('dialog', async dialog => {
      await dialog.dismiss();
    });

    // Handle cookie consent
    await page.addInitScript(() => {
      // Try to auto-accept cookies
      window.addEventListener('load', () => {
        const acceptButtons = document.querySelectorAll('button');
        acceptButtons.forEach(btn => {
          if (btn.textContent.toLowerCase().includes('accept')) {
            btn.click();
          }
        });
      });
    });
  }

  /**
   * Calculate quality score for extracted data
   */
  calculateQualityScore(productData) {
    let score = 0;
    let maxScore = 0;

    // Required fields
    const requiredFields = [
      { field: 'title', weight: 20 },
      { field: 'price', weight: 20 },
      { field: 'availability', weight: 15 },
      { field: 'images', weight: 15 },
      { field: 'description', weight: 10 },
    ];

    // Optional fields
    const optionalFields = [
      { field: 'variants', weight: 5 },
      { field: 'brand', weight: 5 },
      { field: 'categories', weight: 5 },
      { field: 'reviews', weight: 3 },
      { field: 'attributes', weight: 2 },
    ];

    // Check required fields
    requiredFields.forEach(({ field, weight }) => {
      maxScore += weight;
      if (productData[field]) {
        if (field === 'images' && productData[field].length > 0) {
          score += weight;
        } else if (field !== 'images') {
          score += weight;
        }
      }
    });

    // Check optional fields
    optionalFields.forEach(({ field, weight }) => {
      maxScore += weight;
      if (productData[field]) {
        if (Array.isArray(productData[field]) && productData[field].length > 0) {
          score += weight;
        } else if (!Array.isArray(productData[field])) {
          score += weight;
        }
      }
    });

    return Math.round((score / maxScore) * 100);
  }

  /**
   * Calculate priority for quick checks
   */
  calculatePriority(productData) {
    let priority = 5; // Default medium priority

    // Higher priority for popular/expensive items
    if (productData.price > 10000) { // Over $100
      priority += 2;
    }

    // Higher priority for items with variants
    if (productData.variants && productData.variants.length > 5) {
      priority += 1;
    }

    // Higher priority for items with good reviews
    if (productData.reviews?.average_rating > 4) {
      priority += 1;
    }

    return Math.min(priority, 10); // Cap at 10
  }

  /**
   * Extract quick field for real-time updates
   */
  async extractQuickField(page, config) {
    try {
      // Try primary selector
      let value = await page.$eval(config.selector, el => el.textContent);

      // Try alternatives if primary fails
      if (!value && config.alternatives) {
        for (const alt of config.alternatives) {
          try {
            value = await page.$eval(alt, el => el.textContent);
            if (value) {break;}
          } catch (e) {
            // Continue
          }
        }
      }

      // Parse price if numeric
      if (value && /[\d,]+\.?\d*/.test(value)) {
        const price = parseFloat(value.replace(/[^0-9.]/g, ''));
        return Math.round(price * 100); // cents
      }

      return value;
    } catch (e) {
      return null;
    }
  }

  /**
   * Extract availability for quick check
   */
  async extractAvailability(page, config) {
    try {
      const text = await page.$eval(config.selector, el => el.textContent.toLowerCase());

      // Check failure indicators first
      for (const indicator of config.failure_indicators || []) {
        if (text.includes(indicator)) {
          return 'out_of_stock';
        }
      }

      // Check success indicators
      for (const indicator of config.success_indicators || []) {
        if (text.includes(indicator)) {
          return 'in_stock';
        }
      }

      return 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  /**
   * Extract stock count
   */
  async extractStockCount(page, config) {
    try {
      const text = await page.$eval(config.selector, el => el.textContent);

      if (config.regex) {
        const match = text.match(new RegExp(config.regex));
        if (match) {
          return parseInt(match[1] || match[0]);
        }
      }

      // Try to extract number
      const numberMatch = text.match(/\d+/);
      if (numberMatch) {
        return parseInt(numberMatch[0]);
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Try HTTP-first extraction before browser-based extraction
   * Returns null if HTTP extraction should be skipped
   */
  async tryHTTPFirst(url) {
    try {
      return await this.httpExtractor.extract(url);
    } catch (error) {
      this.logger.debug(`HTTP extraction error for ${url}:`, error.message);
      return { ok: false, reason: 'http_error', errorMessage: error.message };
    }
  }

  /**
   * Extract product data from JSON-LD structured data
   */
  async extractJsonLd(page) {
    try {
      const jsonLdData = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        
        for (const script of scripts) {
          try {
            const data = JSON.parse(script.textContent);
            
            // Look for Product schema
            if (data['@type'] === 'Product') {
              return {
                title: data.name, // Map name → title for consistency
                name: data.name, // Keep both for backward compatibility
                price: data.offers ? (Array.isArray(data.offers) ? data.offers[0].price : data.offers.price) : null,
                currency: data.offers ? (Array.isArray(data.offers) ? data.offers[0].priceCurrency : data.offers.priceCurrency) : null,
                original_price: data.offers ? (Array.isArray(data.offers) ? data.offers[0].highPrice : data.offers.highPrice) : null,
                description: data.description,
                brand: data.brand ? (data.brand.name || data.brand) : null,
                images: data.image ? (Array.isArray(data.image) ? data.image.map(img => ({ url: img, type: 'product' })) : [{ url: data.image, type: 'product' }]) : null,
                availability: data.offers ? (Array.isArray(data.offers) ? data.offers[0].availability : data.offers.availability) : null,
                sku: data.sku,
                gtin: data.gtin, // Global Trade Item Number
                mpn: data.mpn, // Manufacturer Part Number
                categories: data.category ? (Array.isArray(data.category) ? data.category : [data.category]) : null,
                reviews: data.aggregateRating ? {
                  average_rating: data.aggregateRating.ratingValue,
                  review_count: data.aggregateRating.reviewCount,
                  best_rating: data.aggregateRating.bestRating,
                  worst_rating: data.aggregateRating.worstRating
                } : null,
                // Extract product variants from offers array
                variants: Array.isArray(data.offers) && data.offers.length > 1 ? data.offers.map((offer, index) => ({
                  variant_id: offer.sku || offer.gtin || offer.mpn || `variant_${index}`,
                  price: offer.price,
                  currency: offer.priceCurrency,
                  availability: offer.availability,
                  sku: offer.sku,
                  // Try to extract variant properties from offer name or additionalProperty
                  properties: offer.additionalProperty ? offer.additionalProperty.reduce((props, prop) => {
                    props[prop.name] = prop.value;
                    return props;
                  }, {}) : null
                })) : null,
                // Extract rich product data
                model: data.model,
                manufacturer: data.manufacturer ? (data.manufacturer.name || data.manufacturer) : null,
                product_id: data.productID,
                // Additional metadata
                extractionMethod: 'jsonLd',
                extractedAt: new Date().toISOString()
              };
            }
          } catch (e) {
            // Skip malformed JSON-LD scripts
            continue;
          }
        }
        
        return null;
      });

      if (jsonLdData) {
        // Normalize price to cents if it exists
        if (jsonLdData.price) {
          jsonLdData.price = Math.round(parseFloat(jsonLdData.price) * 100);
        }
        if (jsonLdData.original_price) {
          jsonLdData.original_price = Math.round(parseFloat(jsonLdData.original_price) * 100);
        }
        
        // Normalize variant prices to cents
        if (jsonLdData.variants) {
          jsonLdData.variants = jsonLdData.variants.map(variant => ({
            ...variant,
            price: variant.price ? Math.round(parseFloat(variant.price) * 100) : null
          }));
        }

        // Normalize availability
        if (jsonLdData.availability) {
          const availability = jsonLdData.availability.toLowerCase();
          if (availability.includes('instock')) {
            jsonLdData.availability = 'in_stock';
          } else if (availability.includes('outofstock')) {
            jsonLdData.availability = 'out_of_stock';
          } else {
            jsonLdData.availability = 'unknown';
          }
        }

        // Use name as title for consistency
        if (jsonLdData.name) {
          jsonLdData.title = jsonLdData.name;
          delete jsonLdData.name;
        }

        this.logger.info('Successfully extracted JSON-LD product data', {
          fields: Object.keys(jsonLdData).filter(key => jsonLdData[key] !== null),
          title: jsonLdData.title?.substring(0, 50),
          price: jsonLdData.price,
          brand: jsonLdData.brand
        });

        return jsonLdData;
      }

      return null;
    } catch (error) {
      this.logger.warn('Failed to extract JSON-LD data:', error.message);
      return null;
    }
  }

  /**
   * DOM fallback extraction methods for when JSON-LD fails
   */
  async extractTitleFallback(page) {
    const selectors = [
      'h1.product-title, h1[class*="product-title"]',
      'h1.product-name, h1[class*="product-name"]', 
      '.product-title, .product-name',
      '[data-product-title]',
      '[itemprop="name"]',
      'h1',
      'meta[property="og:title"]'
    ];

    for (const selector of selectors) {
      try {
        let title;
        if (selector.includes('meta')) {
          title = await page.$eval(selector, el => el.getAttribute('content'));
        } else {
          title = await page.$eval(selector, el => el.textContent?.trim());
        }
        
        if (title && title.length > 2) {
          this.logger.debug(`Extracted title using fallback selector: ${selector}`);
          return title;
        }
      } catch (e) {
        // Try next selector
      }
    }

    // Last resort: page title
    return await page.title();
  }

  async extractBrandFallback(page) {
    const selectors = [
      '[itemprop="brand"] [itemprop="name"]',
      '[itemprop="brand"]',
      '.product-brand, .brand-name',
      '.breadcrumb a:first-child, .breadcrumbs a:first-child',
      'meta[property="product:brand"]',
      '[data-brand]'
    ];

    for (const selector of selectors) {
      try {
        let brand;
        if (selector.includes('meta')) {
          brand = await page.$eval(selector, el => el.getAttribute('content'));
        } else {
          brand = await page.$eval(selector, el => el.textContent?.trim());
        }
        
        if (brand && brand.length > 1 && brand.toLowerCase() !== 'home') {
          this.logger.debug(`Extracted brand using fallback selector: ${selector}`);
          return brand;
        }
      } catch (e) {
        // Try next selector
      }
    }

    return null;
  }

  async extractPriceFallback(page) {
    const selectors = [
      '.price:not(.old-price):not(.was-price)',
      '.product-price .price',
      '.current-price, .sale-price',
      '[data-price]',
      '[itemprop="price"]',
      '.price-now',
      'meta[property="product:price:amount"]'
    ];

    for (const selector of selectors) {
      try {
        let priceText;
        if (selector.includes('meta')) {
          priceText = await page.$eval(selector, el => el.getAttribute('content'));
        } else {
          priceText = await page.$eval(selector, el => el.textContent?.trim());
        }
        
        if (priceText) {
          // Extract numeric price
          const match = priceText.match(/[\d,]+\.?\d*/);
          if (match) {
            const price = parseFloat(match[0].replace(/,/g, ''));
            if (!isNaN(price) && price > 0) {
              this.logger.debug(`Extracted price using fallback selector: ${selector}`);
              return Math.round(price * 100); // Convert to cents
            }
          }
        }
      } catch (e) {
        // Try next selector
      }
    }

    return null;
  }

  /**
   * Close browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = UniversalProductExtractor;
