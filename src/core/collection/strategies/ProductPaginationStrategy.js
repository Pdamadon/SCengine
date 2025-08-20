/**
 * ProductPaginationStrategy - Product URL collection with pagination handling
 * 
 * Responsibility: Takes a category URL and collects ALL product URLs from it,
 * handling various pagination patterns (numbered pages, load more, infinite scroll).
 * 
 * Input: DiscoveredCategory objects from SubCategoryExplorationStrategy
 * Output: Complete list of product URLs from the category
 */

const { logger } = require('../../../utils/logger');

class ProductPaginationStrategy {
  constructor(browserManager, options = {}) {
    this.browserManager = browserManager;
    this.logger = options.logger || logger;
    this.options = {
      maxPages: options.maxPages || 50,                    // Maximum pages to paginate
      maxProductsPerCategory: options.maxProductsPerCategory || 1000,  // Safety limit
      paginationTimeout: options.paginationTimeout || 10000,
      scrollDelay: options.scrollDelay || 2000,
      extractVariants: options.extractVariants || false,    // Extract color/size variants
      followRedirects: options.followRedirects !== false
    };
    
    this.stats = {
      categoriesProcessed: 0,
      totalProductsFound: 0,
      paginationPatternsFound: new Set()
    };
  }

  /**
   * Extract all product URLs from a category with pagination
   * @param {Object} category - Category object with url and metadata
   * @returns {Promise<Object>} Product URLs with pagination metadata
   */
  async extractProducts(category) {
    const startTime = Date.now();
    this.logger.info('Starting product extraction', {
      category: category.name,
      url: category.url
    });

    const { page, close } = await this.browserManager.createBrowser('stealth');
    
    try {
      const result = await this.extractAllProducts(page, category);
      
      this.stats.categoriesProcessed++;
      this.stats.totalProductsFound += result.products.length;
      
      this.logger.info('Product extraction complete', {
        category: category.name,
        productsFound: result.products.length,
        pagesProcessed: result.pagesProcessed,
        duration: Date.now() - startTime
      });
      
      return result;
      
    } finally {
      await close();
    }
  }

  /**
   * Extract products from all pages of a category
   */
  async extractAllProducts(page, category) {
    const allProducts = [];
    const seenUrls = new Set();
    let currentPage = 1;
    let hasNextPage = true;
    let paginationType = null;

    // Navigate to category page
    try {
      await page.goto(category.url, { 
        waitUntil: 'domcontentloaded',
        timeout: this.options.paginationTimeout 
      });
    } catch (timeoutError) {
      // If domcontentloaded times out, try with commit instead
      this.logger.warn('Navigation timeout with domcontentloaded, trying with commit');
      await page.goto(category.url, { 
        waitUntil: 'commit',
        timeout: this.options.paginationTimeout 
      });
    }
    
    // Wait for initial load
    await this.browserManager.humanDelay(2000, 0.3);

    // Detect pagination type
    paginationType = await this.detectPaginationType(page);
    this.stats.paginationPatternsFound.add(paginationType);

    while (hasNextPage && currentPage <= this.options.maxPages) {
      this.logger.debug('Processing page', { 
        category: category.name, 
        page: currentPage,
        paginationType 
      });

      // Extract products from current page
      const pageProducts = await this.extractProductsFromPage(page);
      
      // Add unique products
      let newProducts = 0;
      for (const product of pageProducts) {
        if (!seenUrls.has(product.url) && allProducts.length < this.options.maxProductsPerCategory) {
          seenUrls.add(product.url);
          allProducts.push({
            ...product,
            categoryUrl: category.url,
            categoryName: category.name,
            categoryPath: category.navigationPath,
            pageNumber: currentPage
          });
          newProducts++;
        }
      }

      this.logger.debug('Page extraction complete', {
        page: currentPage,
        productsOnPage: pageProducts.length,
        newProducts: newProducts,
        totalSoFar: allProducts.length
      });

      // Check if we should continue pagination
      if (newProducts === 0 || allProducts.length >= this.options.maxProductsPerCategory) {
        hasNextPage = false;
      } else {
        // Navigate to next page based on pagination type
        hasNextPage = await this.navigateToNextPage(page, paginationType, currentPage);
        if (hasNextPage) {
          currentPage++;
          // Wait for new products to load
          await this.browserManager.humanDelay(2000, 0.3);
        }
      }
    }

    return {
      products: allProducts,
      category: category,
      paginationType: paginationType,
      pagesProcessed: currentPage,
      totalProducts: allProducts.length
    };
  }

  /**
   * Extract product URLs from current page
   */
  async extractProductsFromPage(page) {
    try {
      // Multiple patterns for finding product links
      const patterns = [
        // Common product card patterns
        { 
          selector: '.product-card a, .product-item a, .product-tile a',
          attribute: 'href',
          context: 'card'
        },
        // Product grid patterns
        {
          selector: '.product-grid a[href*="/product/"], .items-grid a[href*="/p/"]',
          attribute: 'href',
          context: 'grid'
        },
        // List view patterns
        {
          selector: '.product-list-item a, .search-result-item a',
          attribute: 'href',
          context: 'list'
        },
        // Generic product patterns
        {
          selector: 'a[href*="/product/"], a[href*="/item/"], a[href*="/p/"]',
          attribute: 'href',
          context: 'generic'
        }
      ];

      const products = [];
      const seenUrls = new Set();

      for (const pattern of patterns) {
        try {
          const items = await page.$$eval(pattern.selector, (elements, ctx) => {
            return elements.map(el => {
              const url = el.href;
              const title = el.title || el.textContent.trim();
              const image = el.querySelector('img')?.src;
              const price = el.closest('.product-card')?.querySelector('[class*="price"]')?.textContent;
              
              return {
                url: url,
                title: title.substring(0, 200),
                image: image,
                price: price,
                context: ctx
              };
            }).filter(item => item.url && !item.url.includes('#'));
          }, pattern.context);

          for (const item of items) {
            if (!seenUrls.has(item.url) && this.isProductUrl(item.url)) {
              seenUrls.add(item.url);
              products.push(item);
            }
          }
        } catch (error) {
          // Pattern didn't match, continue
        }
      }

      // If we have variants enabled, extract color/size variants
      if (this.options.extractVariants && products.length > 0) {
        const variantUrls = await this.extractVariantUrls(page);
        for (const variantUrl of variantUrls) {
          if (!seenUrls.has(variantUrl)) {
            seenUrls.add(variantUrl);
            products.push({ url: variantUrl, isVariant: true });
          }
        }
      }

      return products;
    } catch (error) {
      this.logger.warn('Failed to extract products from page', { error: error.message });
      return [];
    }
  }

  /**
   * Detect pagination type on the page
   */
  async detectPaginationType(page) {
    try {
      // Check for numbered pagination
      const hasNumberedPages = await page.$('.pagination a, .page-numbers a, [class*="pagination"] a');
      if (hasNumberedPages) {
        return 'numbered';
      }

      // Check for load more button
      const hasLoadMore = await page.$('button[class*="load-more"], button[class*="show-more"], .load-more-button');
      if (hasLoadMore) {
        return 'load-more';
      }

      // Check for infinite scroll indicators
      const hasInfiniteScroll = await page.$('[class*="infinite-scroll"], [data-infinite-scroll]');
      if (hasInfiniteScroll) {
        return 'infinite-scroll';
      }

      // Check for next button
      const hasNextButton = await page.$('a[rel="next"], .next-page, button[aria-label*="next"]');
      if (hasNextButton) {
        return 'next-button';
      }

      return 'single-page';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Navigate to next page based on pagination type
   */
  async navigateToNextPage(page, paginationType, currentPage) {
    try {
      switch (paginationType) {
        case 'numbered':
          // Click on next page number
          const nextPageSelector = `a:has-text("${currentPage + 1}"), [aria-label="Page ${currentPage + 1}"]`;
          const nextPageLink = await page.$(nextPageSelector);
          if (nextPageLink) {
            await nextPageLink.click();
            await page.waitForLoadState('domcontentloaded');
            return true;
          }
          // Fallback to next button
          const nextButton = await page.$('a[rel="next"], .pagination .next');
          if (nextButton) {
            await nextButton.click();
            await page.waitForLoadState('domcontentloaded');
            return true;
          }
          return false;

        case 'load-more':
          // Click load more button
          const loadMoreButton = await page.$('button[class*="load-more"]:visible, button[class*="show-more"]:visible');
          if (loadMoreButton) {
            const prevProductCount = await page.$$eval('a[href*="/product/"]', els => els.length);
            await loadMoreButton.click();
            // Wait for new products to load
            await page.waitForTimeout(this.options.scrollDelay);
            const newProductCount = await page.$$eval('a[href*="/product/"]', els => els.length);
            return newProductCount > prevProductCount;
          }
          return false;

        case 'infinite-scroll':
          // Scroll to bottom to trigger loading
          const prevProductCount = await page.$$eval('a[href*="/product/"]', els => els.length);
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(this.options.scrollDelay);
          const newProductCount = await page.$$eval('a[href*="/product/"]', els => els.length);
          return newProductCount > prevProductCount;

        case 'next-button':
          // Click next button
          const nextBtn = await page.$('a[rel="next"]:visible, .next-page:visible, button[aria-label*="next"]:visible');
          if (nextBtn) {
            await nextBtn.click();
            await page.waitForLoadState('domcontentloaded');
            return true;
          }
          return false;

        default:
          return false;
      }
    } catch (error) {
      this.logger.debug('Failed to navigate to next page', { 
        error: error.message,
        paginationType,
        currentPage 
      });
      return false;
    }
  }

  /**
   * Extract variant URLs (colors, sizes) from the page
   */
  async extractVariantUrls(page) {
    try {
      const variantUrls = await page.$$eval(
        'a[href*="color="], a[href*="size="], a[href*="variant="], .color-swatch a, .size-selector a',
        elements => elements.map(el => el.href).filter(Boolean)
      );
      return variantUrls;
    } catch (error) {
      return [];
    }
  }

  /**
   * Check if URL is likely a product URL
   */
  isProductUrl(url) {
    const productPatterns = [
      /\/product\//i,
      /\/item\//i,
      /\/p\//i,
      /\/pd\//i,
      /\/products?\//i,
      /\/detail\//i,
      /\/goods\//i
    ];

    const excludePatterns = [
      /\/category\//i,
      /\/collections?\//i,
      /\.(jpg|jpeg|png|gif|pdf|js|css)$/i,
      /#reviews/i,
      /mailto:/i,
      /javascript:/i
    ];

    // Check exclusions first
    for (const pattern of excludePatterns) {
      if (pattern.test(url)) {
        return false;
      }
    }

    // Check if matches product patterns
    for (const pattern of productPatterns) {
      if (pattern.test(url)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get paginator statistics
   */
  getStats() {
    return {
      ...this.stats,
      paginationTypes: Array.from(this.stats.paginationPatternsFound)
    };
  }
}

module.exports = ProductPaginationStrategy;