/**
 * ProductDiscoveryProcessor
 * 
 * Discovers and extracts product URLs from category pages and navigation sections.
 * Works as a companion to TaxonomyDiscoveryProcessor to find actual product links
 * within the structured navigation taxonomy.
 * 
 * This processor handles:
 * - Product URL extraction from category pages
 * - Product link pattern recognition
 * - Product URL validation and deduplication
 * - Pagination handling for large product catalogs
 */

class ProductDiscoveryProcessor {
  constructor(options = {}) {
    this.options = {
      maxProductsPerCategory: options.maxProductsPerCategory || 100,
      enablePagination: options.enablePagination !== false,
      maxPaginationDepth: options.maxPaginationDepth || 3,
      validateProductUrls: options.validateProductUrls !== false,
      enableCaching: options.enableCaching !== false,
      ...options
    };

    // Product URL patterns - these help identify product pages vs category pages
    this.productUrlPatterns = [
      // Common product URL patterns
      /\/product[s]?\/[^\/]+$/i,
      /\/item[s]?\/[^\/]+$/i,
      /\/p\/[^\/]+$/i,
      /\/dp\/[^\/]+$/i,  // Amazon-style
      /\/pd\/[^\/]+$/i,  // Product detail
      /\/[^\/]+\/p[0-9]+$/i,  // ID-based products
      
      // Brand/retailer specific patterns
      /\/[^\/]+-[0-9]+\.html$/i,  // Many retailers use this
      /\/[^\/]+\/[0-9]+$/i,       // Numeric product IDs
      /\/[^\/]+\/sku-[^\/]+$/i,   // SKU-based
    ];

    // Selectors for finding product links on category pages
    this.productLinkSelectors = [
      'a[href*="/product"]',
      'a[href*="/item"]',
      'a[href*="/p/"]',
      'a[href*="/dp/"]',
      'a[href*="/pd/"]',
      '[class*="product"] a[href]',
      '[class*="item"] a[href]',
      '[data-product-id] a[href]',
      '[data-sku] a[href]',
      'article a[href]',
      '.product-tile a[href]',
      '.product-card a[href]',
      '.item-card a[href]'
    ];

    // Pagination selectors
    this.paginationSelectors = [
      'a[rel="next"]',
      'a[aria-label*="next"]',
      'a[aria-label*="Next"]',
      '.pagination a[href]:contains("Next")',
      '.pagination a[href]:contains(">")',
      '.pager a[href]:contains("Next")',
      '[class*="next"] a[href]',
      '[class*="pagination"] a[href*="page="]'
    ];

    // Cache for discovered products
    this.productCache = new Map();
  }

  /**
   * Discover products from navigation data
   */
  async discoverProducts(navigationData, page = null) {
    if (!navigationData || !navigationData.main_sections) {
      return this.createEmptyProductData();
    }

    const productData = {
      productUrls: [],
      categoryData: [],
      discoveryStats: {
        categoriesProcessed: 0,
        totalProductsFound: 0,
        validProductsFound: 0,
        duplicatesSkipped: 0,
        processingDate: new Date().toISOString()
      }
    };

    // Process each navigation section for product discovery
    for (const section of navigationData.main_sections) {
      if (this.isProductRelevantSection(section)) {
        try {
          const categoryProducts = await this.discoverCategoryProducts(section, page);
          
          productData.categoryData.push({
            category: section,
            products: categoryProducts.products,
            stats: categoryProducts.stats
          });

          productData.productUrls.push(...categoryProducts.products);
          productData.discoveryStats.categoriesProcessed++;
          productData.discoveryStats.totalProductsFound += categoryProducts.stats.totalFound;
          productData.discoveryStats.validProductsFound += categoryProducts.stats.validProducts;
          productData.discoveryStats.duplicatesSkipped += categoryProducts.stats.duplicatesSkipped;

        } catch (error) {
          console.warn(`Failed to discover products from section ${section.name}:`, error.message);
        }
      }
    }

    // Deduplicate all product URLs
    productData.productUrls = this.deduplicateUrls(productData.productUrls);
    productData.discoveryStats.finalProductCount = productData.productUrls.length;

    return productData;
  }

  /**
   * Discover products from a specific category section
   */
  async discoverCategoryProducts(categorySection, page = null) {
    const categoryUrl = categorySection.url;
    const products = [];
    const stats = {
      totalFound: 0,
      validProducts: 0,
      duplicatesSkipped: 0,
      pagesProcessed: 0
    };

    if (!categoryUrl || !page) {
      return { products, stats };
    }

    try {
      // Navigate to category page
      await page.goto(categoryUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);

      // Extract products from current page
      const pageProducts = await this.extractProductsFromPage(page);
      products.push(...pageProducts);
      stats.totalFound += pageProducts.length;
      stats.pagesProcessed++;

      // Handle pagination if enabled
      if (this.options.enablePagination) {
        const paginatedProducts = await this.handlePagination(page, stats.pagesProcessed);
        products.push(...paginatedProducts);
        stats.totalFound += paginatedProducts.length;
      }

      // Validate and clean product URLs
      const validProducts = products.filter(url => this.isValidProductUrl(url));
      stats.validProducts = validProducts.length;

      // Cache results if enabled
      if (this.options.enableCaching) {
        this.productCache.set(categoryUrl, validProducts);
      }

      return { 
        products: validProducts.slice(0, this.options.maxProductsPerCategory), 
        stats 
      };

    } catch (error) {
      console.error(`Error discovering products from ${categoryUrl}:`, error.message);
      return { products, stats };
    }
  }

  /**
   * Extract product URLs from current page
   */
  async extractProductsFromPage(page) {
    const products = [];

    try {
      // Try each product link selector
      for (const selector of this.productLinkSelectors) {
        try {
          const links = await page.locator(selector).all();
          
          for (const link of links) {
            try {
              const href = await link.getAttribute('href');
              if (href) {
                const fullUrl = this.resolveUrl(href, page.url());
                if (this.looksLikeProductUrl(fullUrl)) {
                  products.push(fullUrl);
                }
              }
            } catch (e) {
              // Skip individual link errors
            }
          }
        } catch (e) {
          // Try next selector
        }
      }

      // Also look for any links that match product URL patterns
      const allLinks = await page.locator('a[href]').all();
      for (const link of allLinks.slice(0, 200)) { // Limit to prevent timeout
        try {
          const href = await link.getAttribute('href');
          if (href && this.matchesProductPattern(href)) {
            const fullUrl = this.resolveUrl(href, page.url());
            products.push(fullUrl);
          }
        } catch (e) {
          // Skip errors
        }
      }

    } catch (error) {
      console.warn('Error extracting products from page:', error.message);
    }

    return products;
  }

  /**
   * Handle pagination to discover more products
   */
  async handlePagination(page, currentPageCount) {
    const products = [];
    let nextPageUrl = null;

    if (currentPageCount >= this.options.maxPaginationDepth) {
      return products;
    }

    try {
      // Find next page link
      for (const selector of this.paginationSelectors) {
        try {
          const nextLink = await page.locator(selector).first();
          if (await nextLink.isVisible({ timeout: 1000 })) {
            nextPageUrl = await nextLink.getAttribute('href');
            if (nextPageUrl) {
              nextPageUrl = this.resolveUrl(nextPageUrl, page.url());
              break;
            }
          }
        } catch (e) {
          // Try next selector
        }
      }

      if (nextPageUrl && nextPageUrl !== page.url()) {
        await page.goto(nextPageUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForTimeout(1500);

        const pageProducts = await this.extractProductsFromPage(page);
        products.push(...pageProducts);

        // Recursively handle next page
        if (pageProducts.length > 0) {
          const nextPageProducts = await this.handlePagination(page, currentPageCount + 1);
          products.push(...nextPageProducts);
        }
      }

    } catch (error) {
      console.warn('Error handling pagination:', error.message);
    }

    return products;
  }

  /**
   * Check if section is relevant for product discovery
   */
  isProductRelevantSection(section) {
    const name = section.name?.toLowerCase() || '';
    const url = section.url?.toLowerCase() || '';
    
    // Skip utility pages
    const utilityKeywords = ['login', 'account', 'cart', 'checkout', 'contact', 'about', 'help'];
    if (utilityKeywords.some(keyword => name.includes(keyword) || url.includes(keyword))) {
      return false;
    }

    // Include product-related sections
    const productKeywords = [
      'shop', 'products', 'collections', 'category', 'categories',
      'clothing', 'shoes', 'accessories', 'men', 'women', 'kids',
      'sale', 'new', 'featured', 'trending', 'brands'
    ];

    return productKeywords.some(keyword => 
      name.includes(keyword) || url.includes(keyword)
    );
  }

  /**
   * Check if URL looks like a product URL
   */
  looksLikeProductUrl(url) {
    if (!url) return false;
    
    // Check against known product URL patterns
    return this.matchesProductPattern(url) || this.hasProductIndicators(url);
  }

  /**
   * Check if URL matches product patterns
   */
  matchesProductPattern(url) {
    return this.productUrlPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Check for product indicators in URL
   */
  hasProductIndicators(url) {
    const productIndicators = ['product', 'item', 'sku', 'model', 'style'];
    const lowerUrl = url.toLowerCase();
    
    return productIndicators.some(indicator => 
      lowerUrl.includes(`/${indicator}`) || 
      lowerUrl.includes(`${indicator}-`) ||
      lowerUrl.includes(`${indicator}=`)
    );
  }

  /**
   * Validate product URL
   */
  isValidProductUrl(url) {
    if (!this.options.validateProductUrls) return true;
    
    try {
      const urlObj = new URL(url);
      
      // Basic validation
      if (!urlObj.protocol.startsWith('http')) return false;
      if (urlObj.pathname === '/' || urlObj.pathname === '') return false;
      
      // Check if it looks like a product
      return this.looksLikeProductUrl(url);
      
    } catch (error) {
      return false;
    }
  }

  /**
   * Resolve relative URLs to absolute
   */
  resolveUrl(href, baseUrl) {
    try {
      if (href.startsWith('http')) {
        return href;
      }
      return new URL(href, baseUrl).href;
    } catch (error) {
      return href;
    }
  }

  /**
   * Deduplicate URLs
   */
  deduplicateUrls(urls) {
    const seen = new Set();
    return urls.filter(url => {
      const normalized = this.normalizeUrl(url);
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
  }

  /**
   * Normalize URL for deduplication
   */
  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      // Remove common tracking parameters
      const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source'];
      paramsToRemove.forEach(param => urlObj.searchParams.delete(param));
      
      // Sort search params for consistency
      urlObj.searchParams.sort();
      
      return urlObj.href;
    } catch (error) {
      return url;
    }
  }

  /**
   * Create empty product data structure
   */
  createEmptyProductData() {
    return {
      productUrls: [],
      categoryData: [],
      discoveryStats: {
        categoriesProcessed: 0,
        totalProductsFound: 0,
        validProductsFound: 0,
        duplicatesSkipped: 0,
        finalProductCount: 0,
        processingDate: new Date().toISOString()
      }
    };
  }

  /**
   * Get cached products for a category
   */
  getCachedProducts(categoryUrl) {
    return this.productCache.get(categoryUrl) || null;
  }

  /**
   * Clear product cache
   */
  clearCache() {
    this.productCache.clear();
  }
}

module.exports = ProductDiscoveryProcessor;