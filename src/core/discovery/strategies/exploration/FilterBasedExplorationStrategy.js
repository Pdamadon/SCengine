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
const { canonicalizeUrl } = require('../../../../common/UrlCanonicalizer');
const { FilterPatterns } = require('../../../../common/FilterPatterns');

class FilterBasedExplorationStrategy {
  constructor(browserManager, options = {}) {
    this.browserManager = browserManager;
    this.logger = options.logger || logger;
    this.options = {
      maxFilters: options.maxFilters || 20,
      filterTimeout: options.filterTimeout || 5000,
      captureFilterCombinations: options.captureFilterCombinations || false,
      trackForML: options.trackForML !== false,
      // Anti-bot detection delays (configurable, longer for testing)
      pageLoadDelay: options.pageLoadDelay || process.env.FILTER_PAGE_LOAD_DELAY || 3000,
      filterClickDelay: options.filterClickDelay || process.env.FILTER_CLICK_DELAY || 1000,
      filterProcessDelay: options.filterProcessDelay || process.env.FILTER_PROCESS_DELAY || 2000,
      filterRemovalDelay: options.filterRemovalDelay || process.env.FILTER_REMOVAL_DELAY || 1000,
      useDiscoveredFilters: options.useDiscoveredFilters !== false, // Default to true for Phase 2
      // Feature flags for utility integration (following zen's guidance)
      features: {
        canonicalizedDedup: options.features?.canonicalizedDedup !== false, // Default: true
        filterExclusions: options.features?.filterExclusions !== false, // Default: true
        ...options.features
      }
    };
    
    // Phase 2 integration: Accept FilterDiscoveryStrategy instance
    this.filterDiscoveryStrategy = options.filterDiscoveryStrategy || null;
    
    // Initialize filter patterns for exclusions
    this.filterPatterns = new FilterPatterns();
    
    this.navigationTracker = null;
    this.discoveredProducts = new Map(); // Track unique products (now with canonical keys)
    this.filterPaths = []; // Track filter combinations for ML
    
    // Stats tracking for utility integration
    this.stats = {
      canonicalTransformChangedCount: 0,
      canonicalCollisionsCount: 0,
      filtersExcludedCount: 0,
      excludedFilterLabels: []
    };
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
    
    // Store category context for product tagging
    this.currentCategory = {
      name: categoryName,
      url: categoryUrl
    };

    const { page, close } = await this.browserManager.createBrowser('stealth');
    this.navigationTracker = new NavigationTracker(this.logger);

    try {
      // Navigate to category page
      await page.goto(categoryUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      await new Promise(resolve => setTimeout(resolve, this.options.pageLoadDelay));

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
        await this.processFilter(page, filter, categoryName, categoryUrl);
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
   * Phase 2: Use FilterDiscoveryStrategy when available, fallback to legacy method
   */
  async identifyFilters(page) {
    try {
      // Phase 2: Use discovered filter candidates if FilterDiscoveryStrategy is available
      if (this.filterDiscoveryStrategy && this.options.useDiscoveredFilters) {
        this.logger.info('Using FilterDiscoveryStrategy for filter identification');
        
        const categoryUrl = page.url();
        const discoveryResults = await this.filterDiscoveryStrategy.discoverFilterCandidates(page, categoryUrl);
        
        // Convert FilterCandidate objects to legacy filter format for compatibility
        const convertedFilters = discoveryResults.candidates.map(candidate => ({
          text: candidate.label,
          type: candidate.elementType,
          selector: candidate.selector, // Use the specific selector from discovery
          index: 0, // Not needed when using specific selectors
          ariaLabel: candidate.ariaLabel || null,
          dataAttributes: [],
          // Phase 2 additions: Keep original candidate data for enhanced processing
          candidateData: candidate
        }));
        
        this.logger.info('Converted discovered filters', {
          discovered: discoveryResults.totalCandidates,
          converted: convertedFilters.length,
          types: [...new Set(convertedFilters.map(f => f.type))]
        });
        
        // Apply filter exclusions with fallback (following zen's guidance)
        return this.applyFilterExclusions(convertedFilters);
      }

      // Legacy method: Original hard-coded selector approach (fallback)
      this.logger.info('Using legacy filter identification method');
      
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

      // Apply filter exclusions with fallback (following zen's guidance)
      return this.applyFilterExclusions(filters);
    } catch (error) {
      this.logger.warn('Failed to identify filters', { error: error.message });
      return [];
    }
  }

  /**
   * Apply filter exclusions with fallback - following zen's guidance
   * @param {Array} allFilters - All discovered filters
   * @returns {Array} Filtered list with exclusions applied
   */
  applyFilterExclusions(allFilters) {
    const useExclusions = this.options.features?.filterExclusions === true;
    
    if (!useExclusions || !allFilters || allFilters.length === 0) {
      return allFilters;
    }

    try {
      const beforeCount = allFilters.length;
      const filtered = allFilters.filter(filter => {
        const shouldExclude = this.filterPatterns.shouldExclude(filter.text);
        if (shouldExclude) {
          this.stats.filtersExcludedCount++;
          this.stats.excludedFilterLabels.push(filter.text);
          this.logger.debug('Excluding non-product filter', { label: filter.text });
        }
        return !shouldExclude;
      });

      // Fallback: if exclusion would result in zero filters but we had some, use original set
      const finalFilters = filtered.length > 0 ? filtered : allFilters;
      
      if (filtered.length === 0 && allFilters.length > 0) {
        this.logger.warn('Filter exclusions would remove all filters, using fallback', {
          original: allFilters.length,
          excluded: beforeCount - filtered.length
        });
      } else if (filtered.length < allFilters.length) {
        this.logger.info('Applied filter exclusions', {
          original: beforeCount,
          excluded: beforeCount - filtered.length,
          remaining: finalFilters.length
        });
      }

      return finalFilters;
    } catch (error) {
      this.logger.warn('Error applying filter exclusions, using original filters', { 
        error: error.message 
      });
      return allFilters;
    }
  }

  /**
   * Process a single filter - click, capture, unclick
   * Phase 2: Enhanced to handle discovered filter candidates
   */
  async processFilter(page, filter, categoryName, categoryUrl) {
    try {
      this.logger.debug('Processing filter', { 
        filter: filter.text,
        type: filter.type 
      });

      // Phase 2: Use specific selector for discovered filters, fallback to legacy approach
      let selector;
      if (filter.candidateData) {
        // Use the specific selector from FilterDiscoveryStrategy
        selector = filter.candidateData.selector;
        this.logger.debug('Using discovered filter selector', { selector });
      } else {
        // Legacy approach: Build selector using index
        selector = `${filter.selector}:nth-of-type(${filter.index + 1})`;
        this.logger.debug('Using legacy filter selector', { selector });
      }
      
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
      
      // Wait for JavaScript to process the filter and products to load
      await new Promise(resolve => setTimeout(resolve, this.options.filterClickDelay)); // Initial delay
      await page.waitForLoadState('networkidle'); // Wait for network requests to finish
      await new Promise(resolve => setTimeout(resolve, this.options.filterProcessDelay)); // Additional time for DOM updates

      // Check if filter was applied by URL change (more reliable than DOM state)
      const currentUrl = page.url();
      const urlChanged = currentUrl !== categoryUrl && currentUrl.includes('filter');
      const isActive = urlChanged || await this.isFilterActive(page, element);
      
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

        // Click again to remove filter - re-find element as DOM may have updated
        const elementForRemoval = await page.$(selector);
        if (elementForRemoval) {
          await elementForRemoval.click();
          await new Promise(resolve => setTimeout(resolve, this.options.filterRemovalDelay));
        } else {
          this.logger.debug('Filter element not found for removal', { selector });
        }
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
      // Pass category context to page evaluation
      const categoryContext = this.currentCategory || { name: 'unknown', url: '' };
      
      const products = await page.evaluate((categoryData) => {
        // Enhanced product extraction method inspired by structure analysis
        const allLinks = Array.from(document.querySelectorAll('a[href]'));
        const productsByUrl = new Map();

        allLinks.forEach(link => {
          const href = link.href;
          if (href && href.includes('/products/') && !href.includes('#')) {
            const text = link.textContent.trim();
            
            // Collect all instances of this product URL
            if (!productsByUrl.has(href)) {
              productsByUrl.set(href, {
                url: href,
                titleCandidates: [],
                price: null,
                image: null,
                metadata: {
                  containerClasses: [],
                  linkClasses: []
                }
              });
            }
            
            const product = productsByUrl.get(href);
            
            // Collect title candidates (non-empty text)
            if (text && text !== 'Go to product page >' && text.length > 5) {
              product.titleCandidates.push(text);
            }
            
            // Try to extract price and image from card context
            const card = link.closest('[class*="product"], .grid-item, .card, [class*="col-span"]');
            if (card && !product.price) {
              const priceEl = card.querySelector('[class*="price"], .price, [data-price]');
              if (priceEl) product.price = priceEl.textContent.trim();
              
              const imgEl = card.querySelector('img');
              if (imgEl) product.image = imgEl.src;
            }
            
            // Collect metadata
            const container = link.closest('div, li, article');
            if (container) {
              product.metadata.containerClasses.push(container.className || '');
            }
            product.metadata.linkClasses.push(link.className || '');
          }
        });

        // Process results to get best title for each product
        const foundProducts = [];
        productsByUrl.forEach((product, url) => {
          // Choose best title candidate (usually the longest meaningful one)
          const bestTitle = product.titleCandidates
            .filter(title => title.length > 10) // Reasonable product title length
            .sort((a, b) => b.length - a.length)[0] || 
            product.titleCandidates[0] || '';

          foundProducts.push({
            url: url,
            title: bestTitle,
            price: product.price,
            image: product.image,
            // Add category context
            categoryName: categoryData.name,
            categoryUrl: categoryData.url,
            capturedAt: new Date().toISOString(),
            metadata: {
              titleCandidates: product.titleCandidates.length,
              containerClasses: [...new Set(product.metadata.containerClasses)],
              linkClasses: [...new Set(product.metadata.linkClasses)]
            }
          });
        });

        return foundProducts;
      }, categoryContext);

      // Add to discovered products with canonicalized deduplication (following zen's guidance)
      products.forEach(product => {
        try {
          // Apply canonicalized deduplication with feature flag
          const useCanonical = this.options.features?.canonicalizedDedup === true;
          const key = useCanonical ? canonicalizeUrl(product.url) : product.url;
          
          // Track canonicalization stats
          if (useCanonical && key !== product.url) {
            this.stats.canonicalTransformChangedCount++;
          }
          
          // Cache canonical URL on product for potential downstream use
          product.canonicalUrl = key;
          
          if (!this.discoveredProducts.has(key)) {
            this.discoveredProducts.set(key, {
              ...product,
              filters: [filterName]
            });
          } else {
            // Track collision (duplicate removed by canonicalization)
            if (useCanonical && key !== product.url) {
              this.stats.canonicalCollisionsCount++;
            }
            
            // Add this filter to existing product
            const existing = this.discoveredProducts.get(key);
            if (!existing.filters.includes(filterName)) {
              existing.filters.push(filterName);
            }
          }
        } catch (error) {
          // Fallback: use original URL if canonicalization fails
          this.logger.warn('Canonicalization failed, using original URL', { 
            url: product.url, 
            error: error.message 
          });
          
          if (!this.discoveredProducts.has(product.url)) {
            this.discoveredProducts.set(product.url, {
              ...product,
              filters: [filterName]
            });
          } else {
            const existing = this.discoveredProducts.get(product.url);
            if (!existing.filters.includes(filterName)) {
              existing.filters.push(filterName);
            }
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
            await new Promise(resolve => setTimeout(resolve, this.options.filterRemovalDelay));
            await element2.click();
            await new Promise(resolve => setTimeout(resolve, this.options.filterProcessDelay));

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
            await new Promise(resolve => setTimeout(resolve, this.options.filterRemovalDelay / 2));
            await element1.click();
            await new Promise(resolve => setTimeout(resolve, this.options.filterRemovalDelay / 2));

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
          : 0,
        // Utility integration metrics (following zen's guidance)
        utilityStats: {
          canonicalTransformChangedCount: this.stats.canonicalTransformChangedCount,
          canonicalCollisionsCount: this.stats.canonicalCollisionsCount,
          filtersExcludedCount: this.stats.filtersExcludedCount,
          excludedFilterLabels: [...new Set(this.stats.excludedFilterLabels)], // Dedupe for reporting
          featuresEnabled: {
            canonicalizedDedup: this.options.features?.canonicalizedDedup === true,
            filterExclusions: this.options.features?.filterExclusions === true
          }
        }
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