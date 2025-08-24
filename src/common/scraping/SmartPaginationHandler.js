/**
 * SmartPaginationHandler - Intelligent pagination detection and handling
 * 
 * Extracted from ProductPaginationStrategy.js to provide reusable pagination
 * logic that can detect and handle multiple pagination patterns:
 * - Numbered pages (Shopify-style)
 * - Load-more buttons (Target-style) 
 * - Infinite scroll
 * - Next-button navigation
 * - Single-page detection
 * 
 * Based on Zen's guidance to reuse proven pagination logic instead of building new systems.
 */

const { logger } = require('../../utils/logger');

class SmartPaginationHandler {
  constructor(options = {}) {
    this.options = {
      maxPages: options.maxPages || 20,
      scrollDelay: options.scrollDelay || 2000,
      paginationTimeout: options.paginationTimeout || 10000,
      logger: options.logger || logger,
      ...options
    };
  }

  /**
   * Detect pagination type on the page
   * Based on ProductPaginationStrategy.js lines 242-272
   */
  async detectPaginationType(page) {
    try {
      // Check for numbered pagination
      const hasNumberedPages = await page.$('.pagination a, .page-numbers a, [class*="pagination"] a');
      if (hasNumberedPages) {
        return 'numbered';
      }

      // Check for load more button
      const hasLoadMore = await page.$('button[class*="load-more"], button[class*="show-more"], .load-more-button, button[data-test*="load"]');
      if (hasLoadMore) {
        return 'load-more';
      }

      // Check for infinite scroll indicators
      const hasInfiniteScroll = await page.$('[class*="infinite-scroll"], [data-infinite-scroll]');
      if (hasInfiniteScroll) {
        return 'infinite-scroll';
      }

      // Check for next button (including simple text-based next links)
      const hasNextButton = await page.$('a[rel="next"], .next-page, button[aria-label*="next"], a:has-text("next"), a:has-text("Next")');
      if (hasNextButton) {
        return 'next-button';
      }

      return 'single-page';
    } catch (error) {
      this.options.logger.warn('Error detecting pagination type:', error.message);
      return 'unknown';
    }
  }

  /**
   * Navigate to next page based on pagination type
   * Based on ProductPaginationStrategy.js lines 275-340
   */
  async navigateToNextPage(page, paginationType, currentPage) {
    try {
      switch (paginationType) {
        case 'numbered':
          // Try to find and navigate to next page URL first (more reliable)
          const nextUrl = await this.findNextPageUrl(page);
          if (nextUrl) {
            await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: this.options.paginationTimeout });
            return true;
          }
          
          // Fallback to clicking next page number
          const nextPageSelector = `a:has-text("${currentPage + 1}"), [aria-label="Page ${currentPage + 1}"]`;
          const nextPageLink = await page.$(nextPageSelector);
          if (nextPageLink) {
            await nextPageLink.click();
            await page.waitForLoadState('domcontentloaded');
            return true;
          }
          
          // Final fallback to next button
          const nextButton = await page.$('a[rel="next"], .pagination .next');
          if (nextButton) {
            await nextButton.click();
            await page.waitForLoadState('domcontentloaded');
            return true;
          }
          return false;

        case 'load-more':
          // Click load more button and validate new content loaded
          const loadMoreButton = await page.$('button[class*="load-more"]:visible, button[class*="show-more"]:visible, button[data-test*="load"]:visible');
          if (loadMoreButton) {
            const prevProductCount = await this.countProducts(page);
            await loadMoreButton.click();
            // Wait for new products to load
            await page.waitForTimeout(this.options.scrollDelay);
            const newProductCount = await this.countProducts(page);
            return newProductCount > prevProductCount;
          }
          return false;

        case 'infinite-scroll':
          // Scroll to bottom to trigger loading
          const prevProductCount = await this.countProducts(page);
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(this.options.scrollDelay);
          const newProductCount = await this.countProducts(page);
          return newProductCount > prevProductCount;

        case 'next-button':
          // Try to find next URL first (more reliable for simple next links)
          const nextPageUrl = await this.findNextPageUrl(page);
          if (nextPageUrl) {
            await page.goto(nextPageUrl, { waitUntil: 'domcontentloaded', timeout: this.options.paginationTimeout });
            return true;
          }
          
          // Fallback to clicking next button
          const nextBtn = await page.$('a[rel="next"]:visible, .next-page:visible, button[aria-label*="next"]:visible, a:has-text("next"):visible, a:has-text("Next"):visible');
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
      this.options.logger.debug('Failed to navigate to next page', { 
        error: error.message,
        paginationType,
        currentPage 
      });
      return false;
    }
  }

  /**
   * Find next page URL using multiple strategies
   * Enhanced version of ProductDiscoveryProcessor.findNextPageUrl
   */
  async findNextPageUrl(page) {
    try {
      let nextUrl = null;
      
      // Strategy 1: Look for rel="next" link in head
      const relNextLink = await page.$('link[rel="next"]');
      if (relNextLink) {
        const href = await relNextLink.getAttribute('href');
        if (href) nextUrl = href;
      }
      
      // Strategy 2: Look for data-next-url attributes (Shopify themes)
      if (!nextUrl) {
        const dataNextUrl = await page.$('[data-next-url]');
        if (dataNextUrl) {
          const href = await dataNextUrl.getAttribute('data-next-url');
          if (href) nextUrl = href;
        }
      }
      
      // Strategy 3: Traditional pagination selectors
      if (!nextUrl) {
        const selectors = [
          'a[rel="next"]',
          'a[aria-label*="next" i]',
          '.pagination .next:not(.disabled) a',
          '.page-numbers .next:not(.disabled)',
          '[class*="next"] a[href]',
          '[class*="pagination"] a[href*="page="]',
          'a:has-text("next")',
          'a:has-text("Next")'
        ];
        
        for (const selector of selectors) {
          try {
            const nextLink = await page.$(selector);
            if (nextLink && await nextLink.isVisible({ timeout: 1000 })) {
              const href = await nextLink.getAttribute('href');
              if (href && !href.includes('#')) {
                nextUrl = href;
                break;
              }
            }
          } catch (e) {
            // Try next selector
          }
        }
      }
      
      // Make URL absolute if found
      if (nextUrl) {
        return this.resolveUrl(nextUrl, page.url());
      }
      
      return null;
    } catch (error) {
      this.options.logger.warn('Error finding next page URL:', error.message);
      return null;
    }
  }

  /**
   * Count products on current page for validation
   */
  async countProducts(page) {
    try {
      const count = await page.$$eval(
        'a[href*="/product/"], a[href*="/item/"], a[href*="/p/"], a[href*="/products/"]', 
        els => els.length
      );
      return count;
    } catch (error) {
      return 0;
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
   * Full pagination handler that combines detection and navigation
   * @param {Object} page - Playwright page
   * @param {Function} extractProductsCallback - Function to extract products from each page
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} All products from paginated pages
   */
  async paginateAndExtract(page, extractProductsCallback, options = {}) {
    const maxPages = options.maxPages || this.options.maxPages;
    const allProducts = [];
    let currentPage = 1;
    
    // Detect pagination type
    const paginationType = await this.detectPaginationType(page);
    this.options.logger.debug('Detected pagination type:', paginationType);
    
    while (currentPage <= maxPages) {
      this.options.logger.debug(`Processing page ${currentPage} (${paginationType})`);
      
      // Extract products from current page
      const pageProducts = await extractProductsCallback(page);
      
      if (pageProducts.length === 0 && currentPage > 1) {
        this.options.logger.debug('No products found, stopping pagination');
        break;
      }
      
      allProducts.push(...pageProducts);
      
      // Try to navigate to next page
      if (currentPage < maxPages) {
        const hasNext = await this.navigateToNextPage(page, paginationType, currentPage);
        if (!hasNext) {
          this.options.logger.debug('No more pages available');
          break;
        }
        currentPage++;
        
        // Wait for page to load
        await page.waitForTimeout(this.options.scrollDelay);
      } else {
        break;
      }
    }
    
    this.options.logger.info('Pagination complete', {
      paginationType,
      pagesProcessed: currentPage,
      totalProducts: allProducts.length
    });
    
    return allProducts;
  }
}

module.exports = SmartPaginationHandler;