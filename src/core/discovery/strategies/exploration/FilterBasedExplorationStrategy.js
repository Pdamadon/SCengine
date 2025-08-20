/**
 * FilterBasedExplorer - Handles filter-based product discovery
 * 
 * Many modern e-commerce sites use filters instead of traditional subcategory navigation.
 * This module clicks filters, captures filtered products, then unclicks to continue.
 * 
 * Flow:
 * 1. Navigate to category page
 * 2. Identify all filter buttons/options
 * 3. For each filter:
 *    - Click to apply filter
 *    - Wait for DOM update
 *    - Capture all product URLs
 *    - Click again to remove filter
 * 4. Track which filter combinations were used
 */

const NavigationTracker = require('../../../../common/NavigationTracker');
const { logger } = require('../../../../utils/logger');

class FilterBasedExplorationStrategy {
  constructor(browserManager, options = {}) {
    this.browserManager = browserManager;
    this.logger = options.logger || logger;
    this.options = {
      maxFilters: options.maxFilters || 20,
      filterTimeout: options.filterTimeout || 5000,
      captureFilterCombinations: options.captureFilterCombinations || false,
      trackForML: options.trackForML !== false
    };
    
    this.navigationTracker = null;
    this.discoveredProducts = new Map(); // Track unique products
    this.filterPaths = []; // Track filter combinations for ML
  }

  /**
   * Explore products using filters on a category page
   * @param {string} categoryUrl - The category page URL
   * @param {string} categoryName - Category name for tracking
   * @returns {Promise<Object>} Products discovered through filters
   */
  async exploreWithFilters(categoryUrl, categoryName) {
    this.logger.info('Starting filter-based exploration', {
      category: categoryName,
      url: categoryUrl
    });

    const { page, close } = await this.browserManager.createBrowser('stealth');
    this.navigationTracker = new NavigationTracker(this.logger);

    try {
      // Navigate to category page
      await page.goto(categoryUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      await this.browserManager.humanDelay(3000, 0.3);

      // Get baseline products (no filters applied)
      const baselineProducts = await this.captureProducts(page, 'baseline');
      this.logger.info('Baseline products captured', { count: baselineProducts.length });

      // Identify all filters on the page
      const filters = await this.identifyFilters(page);
      this.logger.info('Filters identified', { 
        count: filters.length,
        types: [...new Set(filters.map(f => f.type))]
      });

      // Process each filter
      for (const filter of filters.slice(0, this.options.maxFilters)) {
        await this.processFilter(page, filter, categoryName);
      }

      // If capturing combinations, try some multi-filter combinations
      if (this.options.captureFilterCombinations && filters.length > 1) {
        await this.processCombinations(page, filters, categoryName);
      }

      return this.buildResults(categoryName, categoryUrl);

    } finally {
      await close();
    }
  }

  /**
   * Identify all filter elements on the page
   */
  async identifyFilters(page) {
    try {
      const filters = await page.evaluate(() => {
        const filterSelectors = [
          // Common filter button patterns
          { selector: 'button[class*="filter"]', type: 'button' },
          { selector: 'button[data-filter]', type: 'button' },
          { selector: '.filter-option button', type: 'button' },
          { selector: '.filter-group button', type: 'button' },
          
          // Checkbox filters
          { selector: 'input[type="checkbox"][name*="filter"]', type: 'checkbox' },
          { selector: '.filter-checkbox input', type: 'checkbox' },
          
          // Link-style filters
          { selector: 'a[class*="filter"]:not([href*="http"])', type: 'link' },
          { selector: '.filter-nav a', type: 'link' },
          
          // Specific patterns for Glasswing-style sites
          { selector: '.collection-filters button', type: 'button' },
          { selector: '.product-filters button', type: 'button' },
          { selector: '[role="group"] button', type: 'button' },
          { selector: '.btn-group button', type: 'button' }
        ];

        const foundFilters = [];
        const seenTexts = new Set();

        for (const pattern of filterSelectors) {
          const elements = document.querySelectorAll(pattern.selector);
          elements.forEach(el => {
            const text = el.textContent.trim();
            const isVisible = el.offsetParent !== null;
            
            // Skip if already seen or not visible
            if (!text || seenTexts.has(text) || !isVisible) return;
            
            seenTexts.add(text);
            foundFilters.push({
              text: text,
              type: pattern.type,
              selector: pattern.selector,
              index: Array.from(document.querySelectorAll(pattern.selector)).indexOf(el),
              ariaLabel: el.getAttribute('aria-label'),
              dataAttributes: Object.keys(el.dataset)
            });
          });
        }

        return foundFilters;
      });

      return filters;
    } catch (error) {
      this.logger.warn('Failed to identify filters', { error: error.message });
      return [];
    }
  }

  /**
   * Process a single filter - click, capture, unclick
   */
  async processFilter(page, filter, categoryName) {
    try {
      this.logger.debug('Processing filter', { 
        filter: filter.text,
        type: filter.type 
      });

      // Build selector for this specific filter
      const selector = `${filter.selector}:nth-of-type(${filter.index + 1})`;
      
      // Click to apply filter
      const element = await page.$(selector);
      if (!element) {
        this.logger.debug('Filter element not found', { selector });
        return;
      }

      // Record for ML training
      if (this.navigationTracker) {
        this.navigationTracker.recordClick(selector, filter.text, {
          filterType: filter.type,
          category: categoryName
        });
      }

      // Click the filter
      await element.click();
      await this.browserManager.humanDelay(2000, 0.3); // Wait for DOM update

      // Check if filter was applied (look for active state)
      const isActive = await this.isFilterActive(page, element);
      
      if (isActive) {
        // Capture products with this filter
        const filteredProducts = await this.captureProducts(page, filter.text);
        this.logger.info('Filter applied', {
          filter: filter.text,
          productsFound: filteredProducts.length
        });

        // Store filter path for ML
        this.filterPaths.push({
          category: categoryName,
          filter: filter.text,
          selector: selector,
          productsFound: filteredProducts.length
        });

        // Click again to remove filter
        await element.click();
        await this.browserManager.humanDelay(1000, 0.3);
      } else {
        this.logger.debug('Filter did not activate', { filter: filter.text });
      }

    } catch (error) {
      this.logger.warn('Failed to process filter', {
        filter: filter.text,
        error: error.message
      });
    }
  }

  /**
   * Check if a filter is currently active
   */
  async isFilterActive(page, element) {
    try {
      return await page.evaluate(el => {
        // Check various active states
        return el.classList.contains('active') ||
               el.classList.contains('selected') ||
               el.classList.contains('checked') ||
               el.getAttribute('aria-pressed') === 'true' ||
               el.getAttribute('aria-checked') === 'true' ||
               el.checked === true;
      }, element);
    } catch (error) {
      return false;
    }
  }

  /**
   * Capture all product URLs currently visible on the page
   */
  async captureProducts(page, filterName) {
    try {
      const products = await page.evaluate(() => {
        const productSelectors = [
          'a[href*="/products/"]',
          'a[href*="/product/"]',
          'a[href*="/item/"]',
          '.product-card a',
          '.product-item a',
          '.product-tile a',
          '[class*="product"] a[href]'
        ];

        const foundProducts = [];
        const seenUrls = new Set();

        for (const selector of productSelectors) {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            const url = el.href;
            if (url && !seenUrls.has(url) && !url.includes('#')) {
              seenUrls.add(url);
              
              // Try to extract product info
              const card = el.closest('[class*="product"]');
              const title = card?.querySelector('[class*="title"], [class*="name"], h3, h4')?.textContent?.trim();
              const price = card?.querySelector('[class*="price"]')?.textContent?.trim();
              const image = card?.querySelector('img')?.src;

              foundProducts.push({
                url: url,
                title: title || el.textContent.trim(),
                price: price,
                image: image
              });
            }
          });
        }

        return foundProducts;
      });

      // Add to discovered products with filter tracking
      products.forEach(product => {
        if (!this.discoveredProducts.has(product.url)) {
          this.discoveredProducts.set(product.url, {
            ...product,
            filters: [filterName]
          });
        } else {
          // Add this filter to existing product
          const existing = this.discoveredProducts.get(product.url);
          if (!existing.filters.includes(filterName)) {
            existing.filters.push(filterName);
          }
        }
      });

      return products;
    } catch (error) {
      this.logger.warn('Failed to capture products', { error: error.message });
      return [];
    }
  }

  /**
   * Try combinations of filters (for advanced exploration)
   */
  async processCombinations(page, filters, categoryName) {
    // For now, just try pairs of filters
    const maxCombinations = 5;
    let combinationsTried = 0;

    for (let i = 0; i < filters.length - 1 && combinationsTried < maxCombinations; i++) {
      for (let j = i + 1; j < filters.length && combinationsTried < maxCombinations; j++) {
        try {
          const filter1 = filters[i];
          const filter2 = filters[j];

          this.logger.debug('Trying filter combination', {
            filter1: filter1.text,
            filter2: filter2.text
          });

          // Apply both filters
          const selector1 = `${filter1.selector}:nth-of-type(${filter1.index + 1})`;
          const selector2 = `${filter2.selector}:nth-of-type(${filter2.index + 1})`;
          
          const element1 = await page.$(selector1);
          const element2 = await page.$(selector2);
          
          if (element1 && element2) {
            await element1.click();
            await this.browserManager.humanDelay(1000, 0.3);
            await element2.click();
            await this.browserManager.humanDelay(2000, 0.3);

            // Capture products with combination
            const combinedProducts = await this.captureProducts(
              page, 
              `${filter1.text} + ${filter2.text}`
            );

            this.logger.info('Filter combination applied', {
              filters: [filter1.text, filter2.text],
              productsFound: combinedProducts.length
            });

            // Remove both filters
            await element2.click();
            await this.browserManager.humanDelay(500, 0.3);
            await element1.click();
            await this.browserManager.humanDelay(500, 0.3);

            combinationsTried++;
          }
        } catch (error) {
          this.logger.debug('Failed to process filter combination', { error: error.message });
        }
      }
    }
  }

  /**
   * Build final results
   */
  buildResults(categoryName, categoryUrl) {
    const products = Array.from(this.discoveredProducts.values());
    
    const results = {
      category: categoryName,
      categoryUrl: categoryUrl,
      totalProducts: products.length,
      products: products,
      filterPaths: this.filterPaths,
      navigationPath: this.navigationTracker ? this.navigationTracker.getNavigationPath() : [],
      stats: {
        uniqueFilters: [...new Set(this.filterPaths.map(p => p.filter))].length,
        filterCombinations: this.filterPaths.length,
        avgProductsPerFilter: this.filterPaths.length > 0 
          ? Math.round(this.filterPaths.reduce((sum, p) => sum + p.productsFound, 0) / this.filterPaths.length)
          : 0
      }
    };

    this.logger.info('Filter exploration complete', {
      category: categoryName,
      totalProducts: results.totalProducts,
      uniqueFilters: results.stats.uniqueFilters
    });

    return results;
  }
}

module.exports = FilterBasedExplorationStrategy;