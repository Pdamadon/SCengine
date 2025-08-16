/**
 * ProductCatalogStrategy.js
 * 
 * Specialized strategy for detecting product-rich pages and systematically collecting
 * ALL product URLs with complete pagination handling.
 * 
 * Integrates with NavigationTreeBuilder to provide product discovery during 
 * hierarchical navigation traversal for comprehensive site mapping.
 * 
 * Supports universal website types through adaptive detection patterns.
 */

const NavigationStrategy = require('../NavigationStrategy');

class ProductCatalogStrategy extends NavigationStrategy {
  constructor(logger, options = {}) {
    super(logger, options);
    this.name = 'ProductCatalogStrategy';
    
    // Configuration options
    this.config = {
      productDetectionThreshold: options.productDetectionThreshold || 3,
      maxProductsPerPage: options.maxProductsPerPage || 1000,
      paginationTimeout: options.paginationTimeout || 30000,
      enableInfiniteScroll: options.enableInfiniteScroll !== false,
      enableLoadMoreButtons: options.enableLoadMoreButtons !== false,
      enableTraditionalPagination: options.enableTraditionalPagination !== false,
      ...options
    };

    // Platform-specific product patterns
    this.productPatterns = {
      // E-commerce platforms
      shopify: {
        containers: ['.product-item', '.grid__item', '.card-wrapper', '.product-card-wrapper'],
        links: ['[data-product-id] a', '.product-form a', '.product-link'],
        indicators: ['.price', '.money', '.product-price', '[data-price]']
      },
      woocommerce: {
        containers: ['.product', '.wc-block-grid__product', '.product-item'],
        links: ['.woocommerce-loop-product__link', '.product a', '.wc-block-grid__product a'],
        indicators: ['.price', '.amount', '.woocommerce-Price-amount']
      },
      magento: {
        containers: ['.product-item', '.product-item-info', '.catalog-product-view'],
        links: ['.product-item-link', '.product-item-photo a'],
        indicators: ['.price', '.regular-price', '.special-price']
      },
      generic: {
        containers: ['.product', '.item', '.card', '.listing', '[class*="product"]', '[class*="item"]', 'article', 'li'],
        links: ['a[href*="/product"]', 'a[href*="/p/"]', 'a[href*="/item"]', 'a[href*="/catalogue"]', 'a[href*="/book"]'],
        indicators: ['.price', '[class*="price"]', '[data-price]', '$', '£', '€', '¥', '.price_color']
      }
    };

    // URL patterns that indicate product pages
    this.productUrlPatterns = [
      /\/product[s]?\//i,
      /\/p\//i,
      /\/item[s]?\//i,
      /\/shop\//i,
      /\/catalog\//i,
      /\/browse\//i,
      /\/category\//i,
      /\/collection[s]?\//i
    ];
  }

  /**
   * Main execution method - analyze page and collect products if applicable
   * @param {Page} page - Playwright page object
   * @returns {Promise<Object>} Strategy results
   */
  async execute(page) {
    return await this.measureExecution(async () => {
      try {
        this.logger.info('🛍️ Analyzing page for product catalog discovery');

        // Step 1: Analyze if this page contains products
        const productAnalysis = await this.analyzePageForProducts(page);
        
        if (!productAnalysis.isProductRich) {
          this.logger.debug(`Page not product-rich (score: ${productAnalysis.productScore})`);
          return {
            items: [],
            confidence: 0.1,
            metadata: {
              isProductRich: false,
              productScore: productAnalysis.productScore,
              reason: 'Page does not contain sufficient product indicators'
            }
          };
        }

        this.logger.info(`✅ Product-rich page detected (score: ${productAnalysis.productScore})`);

        // Step 2: Collect initial product URLs
        const initialProducts = await this.collectProductURLs(page);
        this.logger.info(`Found ${initialProducts.length} initial products`);

        // Step 3: Handle pagination to get ALL products
        const allProducts = await this.handlePagination(page, initialProducts);
        this.logger.info(`Total products collected: ${allProducts.length}`);

        // Step 4: Enhance products with metadata
        const enhancedProducts = this.enhanceProductMetadata(allProducts, productAnalysis);

        return {
          items: enhancedProducts,
          confidence: this.calculateConfidence(productAnalysis, enhancedProducts),
          metadata: {
            isProductRich: true,
            productScore: productAnalysis.productScore,
            platform: productAnalysis.platform,
            paginationHandled: allProducts.length > initialProducts.length,
            totalProducts: enhancedProducts.length,
            productDensity: productAnalysis.productDensity
          }
        };

      } catch (error) {
        this.logger.error('ProductCatalogStrategy execution failed:', error);
        return {
          items: [],
          confidence: 0,
          metadata: {
            error: error.message,
            isProductRich: false
          }
        };
      }
    });
  }

  /**
   * Analyze page to determine if it contains products worth collecting
   * @param {Page} page - Playwright page object
   * @returns {Promise<Object>} Analysis results
   */
  async analyzePageForProducts(page) {
    return await page.evaluate((serializedData) => {
      const { patterns, urlPatterns, threshold } = serializedData;
      const analysis = {
        isProductRich: false,
        productScore: 0,
        productDensity: 0,
        platform: 'generic',
        indicators: {},
        reason: ''
      };

      // Check URL patterns
      const currentUrl = window.location.href.toLowerCase();
      const urlScore = urlPatterns.some(pattern => {
        try {
          const regex = new RegExp(pattern, 'i');
          return regex.test(currentUrl);
        } catch (e) {
          return currentUrl.includes(pattern.toLowerCase());
        }
      }) ? 2 : 0;
      analysis.productScore += urlScore;
      analysis.indicators.urlMatch = urlScore > 0;

      // Detect platform
      let bestPlatform = 'generic';
      let maxContainers = 0;

      for (const [platform, config] of Object.entries(patterns)) {
        const containers = config.containers.reduce((count, selector) => {
          return count + document.querySelectorAll(selector).length;
        }, 0);

        if (containers > maxContainers) {
          maxContainers = containers;
          bestPlatform = platform;
        }
      }

      analysis.platform = bestPlatform;
      const platformConfig = patterns[bestPlatform];

      // Count product containers
      const productContainers = platformConfig.containers.reduce((count, selector) => {
        return count + document.querySelectorAll(selector).length;
      }, 0);

      analysis.indicators.productContainers = productContainers;
      analysis.productScore += Math.min(productContainers * 0.5, 5);

      // Count price indicators
      const priceElements = platformConfig.indicators.reduce((count, selector) => {
        if (selector.startsWith('[') || selector.startsWith('.') || selector.startsWith('#')) {
          return count + document.querySelectorAll(selector).length;
        } else {
          // Text-based price indicators like '$', '£', etc.
          const textContent = document.body.textContent || '';
          const matches = textContent.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
          return count + (matches ? Math.min(matches.length, 20) : 0);
        }
      }, 0);

      analysis.indicators.priceElements = priceElements;
      analysis.productScore += Math.min(priceElements * 0.3, 3);

      // Look for "Add to Cart" buttons
      const addToCartButtons = document.querySelectorAll(
        'button[class*="cart"], button[class*="add"], [class*="add-to-cart"], [data-add-to-cart]'
      ).length;

      analysis.indicators.addToCartButtons = addToCartButtons;
      analysis.productScore += Math.min(addToCartButtons * 0.4, 2);

      // Check for product grid layouts
      const gridLayouts = document.querySelectorAll(
        '.grid, .products-grid, .product-grid, [class*="grid"], [class*="listing"]'
      ).length;

      analysis.indicators.gridLayouts = gridLayouts;
      analysis.productScore += Math.min(gridLayouts * 0.5, 2);

      // Calculate product density (products per viewport)
      const viewportHeight = window.innerHeight;
      const visibleProducts = Array.from(document.querySelectorAll(platformConfig.containers.join(', ')))
        .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.top < viewportHeight && rect.bottom > 0;
        }).length;

      analysis.productDensity = visibleProducts;
      analysis.indicators.visibleProducts = visibleProducts;

      // Final determination
      analysis.isProductRich = analysis.productScore >= threshold;
      analysis.reason = analysis.isProductRich 
        ? `Product score ${analysis.productScore.toFixed(1)} exceeds threshold ${threshold}`
        : `Product score ${analysis.productScore.toFixed(1)} below threshold ${threshold}`;

      return analysis;
    }, {
      patterns: this.productPatterns,
      urlPatterns: this.productUrlPatterns.map(p => p.source || p.toString()),
      threshold: this.config.productDetectionThreshold
    });
  }

  /**
   * Collect all product URLs from the current page
   * @param {Page} page - Playwright page object
   * @returns {Promise<Array>} Array of product objects
   */
  async collectProductURLs(page) {
    return await page.evaluate((patterns) => {
      // Helper functions defined first
      function extractProductTitle(container, link) {
        // Try multiple title selectors
        const titleSelectors = [
          '.product-title', '.product-name', '.title', '.name',
          'h1', 'h2', 'h3', 'h4', '[data-testid*="title"]',
          '.product__title', '.item-title'
        ];

        for (const selector of titleSelectors) {
          const titleEl = container.querySelector(selector);
          if (titleEl && titleEl.textContent.trim()) {
            return titleEl.textContent.trim();
          }
        }

        // Fallback to link text or alt text
        return link.textContent.trim() || 
               link.getAttribute('title') || 
               link.querySelector('img')?.alt || 
               'Unknown Product';
      }

      function extractProductPrice(container, config) {
        for (const priceSelector of config.indicators) {
          if (priceSelector.startsWith('[') || priceSelector.startsWith('.') || priceSelector.startsWith('#')) {
            const priceEl = container.querySelector(priceSelector);
            if (priceEl && priceEl.textContent.trim()) {
              return priceEl.textContent.trim();
            }
          }
        }
        return null;
      }

      function extractProductImage(container) {
        const img = container.querySelector('img');
        return img ? (img.src || img.getAttribute('data-src')) : null;
      }

      function extractAvailability(container) {
        const availabilitySelectors = [
          '.in-stock', '.available', '.availability',
          '[data-stock]', '.stock-status'
        ];

        for (const selector of availabilitySelectors) {
          const availEl = container.querySelector(selector);
          if (availEl) {
            return availEl.textContent.trim();
          }
        }

        // Look for "Add to Cart" button as availability indicator
        const addToCartBtn = container.querySelector(
          'button[class*="cart"], button[class*="add"], [class*="add-to-cart"]'
        );
        
        return addToCartBtn && !addToCartBtn.disabled ? 'Available' : 'Unknown';
      }

      // Main product collection logic
      const products = [];
      const processedUrls = new Set();

      // Get platform-specific selectors
      const platform = window.productAnalysisPlatform || 'generic';
      const config = patterns[platform] || patterns.generic;

      // Find all product containers
      const containers = document.querySelectorAll(config.containers.join(', '));

      containers.forEach((container, index) => {
        try {
          // Find product link within container
          let productLink = null;
          
          // Try platform-specific link selectors first
          for (const linkSelector of config.links) {
            productLink = container.querySelector(linkSelector);
            if (productLink) break;
          }

          // Fallback to any link within container
          if (!productLink) {
            productLink = container.querySelector('a[href]');
          }

          if (!productLink || !productLink.href) return;

          const productUrl = productLink.href;
          if (processedUrls.has(productUrl)) return;
          processedUrls.add(productUrl);

          // Extract product metadata
          const product = {
            url: productUrl,
            title: extractProductTitle(container, productLink),
            price: extractProductPrice(container, config),
            image: extractProductImage(container),
            availability: extractAvailability(container),
            containerIndex: index,
            platform: platform,
            discoveredAt: new Date().toISOString()
          };

          products.push(product);

        } catch (error) {
          console.warn('Error processing product container:', error);
        }
      });

      return products;

    }, this.productPatterns);
  }

  /**
   * Handle all types of pagination to collect complete product catalog
   * @param {Page} page - Playwright page object
   * @param {Array} initialProducts - Products found on initial page
   * @returns {Promise<Array>} Complete product list
   */
  async handlePagination(page, initialProducts) {
    const allProducts = [...initialProducts];
    const maxPages = 50; // Safety limit
    let pageCount = 1;

    try {
      // Detect pagination type
      const paginationType = await this.detectPaginationType(page);
      this.logger.info(`Detected pagination type: ${paginationType.type}`);

      switch (paginationType.type) {
        case 'traditional':
          if (this.config.enableTraditionalPagination) {
            const traditionalProducts = await this.handleTraditionalPagination(page, maxPages);
            allProducts.push(...traditionalProducts);
          }
          break;

        case 'loadMore':
          if (this.config.enableLoadMoreButtons) {
            const loadMoreProducts = await this.handleLoadMoreButtons(page, maxPages);
            allProducts.push(...loadMoreProducts);
          }
          break;

        case 'infiniteScroll':
          if (this.config.enableInfiniteScroll) {
            const scrollProducts = await this.handleInfiniteScroll(page, maxPages);
            allProducts.push(...scrollProducts);
          }
          break;

        case 'none':
        default:
          this.logger.debug('No pagination detected');
          break;
      }

    } catch (error) {
      this.logger.warn('Pagination handling failed:', error.message);
    }

    // Deduplicate products by URL
    const uniqueProducts = this.deduplicateProducts(allProducts);
    this.logger.info(`Collected ${uniqueProducts.length} unique products (${allProducts.length} total, ${allProducts.length - uniqueProducts.length} duplicates removed)`);

    return uniqueProducts;
  }

  /**
   * Detect the type of pagination on the page
   * @param {Page} page - Playwright page object
   * @returns {Promise<Object>} Pagination type and elements
   */
  async detectPaginationType(page) {
    return await page.evaluate(() => {
      // Traditional pagination (Next/Previous buttons)
      const nextButton = document.querySelector(
        'a[rel="next"], .next, .pagination-next, [class*="next"], [aria-label*="next" i]'
      );

      // Load More button
      const loadMoreBtn = document.querySelector(
        '[class*="load-more"], [class*="see-all"], [class*="show-more"], button[class*="more"]'
      );

      // Infinite scroll indicators
      const hasInfiniteScroll = document.querySelector(
        '[class*="infinite"], [data-infinite], [class*="lazy-load"]'
      ) || document.body.style.overflow === 'hidden';

      if (nextButton && nextButton.href) {
        return { type: 'traditional', element: nextButton };
      } else if (loadMoreBtn) {
        return { type: 'loadMore', element: loadMoreBtn };
      } else if (hasInfiniteScroll) {
        return { type: 'infiniteScroll' };
      } else {
        return { type: 'none' };
      }
    });
  }

  /**
   * Handle traditional pagination (Next/Previous buttons)
   * @param {Page} page - Playwright page object
   * @param {number} maxPages - Maximum pages to process
   * @returns {Promise<Array>} Products from all pages
   */
  async handleTraditionalPagination(page, maxPages) {
    const products = [];
    let currentPage = 1;

    while (currentPage < maxPages) {
      try {
        // Look for next button
        const nextButton = await page.locator(
          'a[rel="next"], .next, .pagination-next, [class*="next"]:not([class*="disabled"])'
        ).first();

        if (!await nextButton.isVisible()) {
          this.logger.debug('No more pages available');
          break;
        }

        // Click next and wait for navigation
        await nextButton.click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000); // Let page settle

        // Collect products from this page
        const pageProducts = await this.collectProductURLs(page);
        products.push(...pageProducts);

        this.logger.debug(`Page ${currentPage + 1}: Found ${pageProducts.length} products`);
        currentPage++;

      } catch (error) {
        this.logger.warn(`Traditional pagination failed on page ${currentPage + 1}:`, error.message);
        break;
      }
    }

    return products;
  }

  /**
   * Handle Load More buttons
   * @param {Page} page - Playwright page object  
   * @param {number} maxClicks - Maximum Load More clicks
   * @returns {Promise<Array>} Products from all loads
   */
  async handleLoadMoreButtons(page, maxClicks) {
    const products = [];
    let clickCount = 0;

    while (clickCount < maxClicks) {
      try {
        // Find Load More button
        const loadMoreBtn = await page.locator(
          '[class*="load-more"], [class*="see-all"], [class*="show-more"], button[class*="more"]'
        ).first();

        if (!await loadMoreBtn.isVisible() || await loadMoreBtn.isDisabled()) {
          this.logger.debug('Load More button no longer available');
          break;
        }

        // Get current product count for comparison
        const beforeCount = await page.locator(
          '.product, .item, .card, [class*="product"], [class*="item"]'
        ).count();

        // Click Load More
        await loadMoreBtn.click();
        
        // Wait for new content
        await page.waitForTimeout(3000);

        // Check if new products were loaded
        const afterCount = await page.locator(
          '.product, .item, .card, [class*="product"], [class*="item"]'
        ).count();

        if (afterCount <= beforeCount) {
          this.logger.debug('No new products loaded');
          break;
        }

        // Collect newly loaded products
        const allPageProducts = await this.collectProductURLs(page);
        
        // Filter out products we already have
        const newProducts = allPageProducts.slice(beforeCount);
        products.push(...newProducts);

        this.logger.debug(`Load More ${clickCount + 1}: Added ${newProducts.length} new products`);
        clickCount++;

      } catch (error) {
        this.logger.warn(`Load More handling failed on click ${clickCount + 1}:`, error.message);
        break;
      }
    }

    return products;
  }

  /**
   * Handle infinite scroll pagination
   * @param {Page} page - Playwright page object
   * @param {number} maxScrolls - Maximum scroll attempts
   * @returns {Promise<Array>} Products from all scroll loads
   */
  async handleInfiniteScroll(page, maxScrolls) {
    const products = [];
    let scrollCount = 0;
    let previousHeight = 0;

    while (scrollCount < maxScrolls) {
      try {
        // Get current page height
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);
        
        if (currentHeight === previousHeight) {
          this.logger.debug('Page height unchanged, no more content to load');
          break;
        }

        // Scroll to bottom
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });

        // Wait for new content to load
        await page.waitForTimeout(3000);

        // Check for loading indicators
        const isLoading = await page.locator(
          '[class*="loading"], [class*="spinner"], [class*="loader"]'
        ).isVisible().catch(() => false);

        if (isLoading) {
          await page.waitForSelector(
            '[class*="loading"], [class*="spinner"], [class*="loader"]',
            { state: 'detached', timeout: 10000 }
          ).catch(() => {});
        }

        // Collect all products from updated page
        const allPageProducts = await this.collectProductURLs(page);
        
        // Add new products (dedupe happens later)
        products.push(...allPageProducts);

        this.logger.debug(`Infinite scroll ${scrollCount + 1}: Page height ${currentHeight}`);
        
        previousHeight = currentHeight;
        scrollCount++;

      } catch (error) {
        this.logger.warn(`Infinite scroll failed on attempt ${scrollCount + 1}:`, error.message);
        break;
      }
    }

    return products;
  }

  /**
   * Remove duplicate products based on URL
   * @param {Array} products - Array of product objects
   * @returns {Array} Deduplicated products
   */
  deduplicateProducts(products) {
    const seen = new Set();
    return products.filter(product => {
      if (seen.has(product.url)) {
        return false;
      }
      seen.add(product.url);
      return true;
    });
  }

  /**
   * Enhance products with additional metadata and context
   * @param {Array} products - Raw product objects
   * @param {Object} analysis - Page analysis results
   * @returns {Array} Enhanced product objects
   */
  enhanceProductMetadata(products, analysis) {
    return products.map(product => ({
      ...product,
      // Add discovery context
      discoveryMethod: 'ProductCatalogStrategy',
      pageAnalysis: {
        platform: analysis.platform,
        productScore: analysis.productScore,
        productDensity: analysis.productDensity
      },
      // Add classification
      category: this.classifyProductFromUrl(product.url),
      // Add confidence score
      confidence: this.calculateProductConfidence(product, analysis)
    }));
  }

  /**
   * Classify product category from URL patterns
   * @param {string} url - Product URL
   * @returns {string} Estimated category
   */
  classifyProductFromUrl(url) {
    const urlLower = url.toLowerCase();
    
    // Common category patterns
    const categories = {
      'clothing': ['clothing', 'apparel', 'fashion', 'dress', 'shirt', 'pants', 'jeans'],
      'shoes': ['shoes', 'footwear', 'boots', 'sneakers', 'sandals'],
      'accessories': ['accessories', 'jewelry', 'bags', 'handbags', 'watches'],
      'home': ['home', 'furniture', 'decor', 'kitchen', 'bedding', 'bath'],
      'electronics': ['electronics', 'tech', 'computer', 'phone', 'laptop'],
      'beauty': ['beauty', 'makeup', 'skincare', 'fragrance', 'cosmetics'],
      'sports': ['sports', 'outdoor', 'fitness', 'athletic', 'gear']
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => urlLower.includes(keyword))) {
        return category;
      }
    }

    return 'unknown';
  }

  /**
   * Calculate confidence score for a product
   * @param {Object} product - Product object
   * @param {Object} analysis - Page analysis
   * @returns {number} Confidence score (0-1)
   */
  calculateProductConfidence(product, analysis) {
    let confidence = 0.5; // Base confidence

    // URL quality
    if (product.url && product.url.includes('/product')) confidence += 0.2;
    
    // Metadata completeness
    if (product.title && product.title !== 'Unknown Product') confidence += 0.15;
    if (product.price) confidence += 0.15;
    if (product.image) confidence += 0.1;
    
    // Platform detection quality
    if (analysis.platform !== 'generic') confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Calculate overall strategy confidence
   * @param {Object} analysis - Page analysis
   * @param {Array} products - Collected products
   * @returns {number} Overall confidence score
   */
  calculateConfidence(analysis, products) {
    let confidence = 0.5; // Base confidence

    // Product detection quality
    confidence += Math.min(analysis.productScore / 10, 0.3);
    
    // Product quantity
    if (products.length > 0) confidence += 0.2;
    if (products.length > 10) confidence += 0.1;
    if (products.length > 50) confidence += 0.1;
    
    // Product quality (average of individual confidences)
    if (products.length > 0) {
      const avgProductConfidence = products.reduce((sum, p) => sum + (p.confidence || 0.5), 0) / products.length;
      confidence += avgProductConfidence * 0.2;
    }

    return Math.min(confidence, 1.0);
  }
}

module.exports = ProductCatalogStrategy;