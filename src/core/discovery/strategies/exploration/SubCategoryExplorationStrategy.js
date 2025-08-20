/**
 * SubCategoryExplorer - Recursive category traversal module
 * 
 * Responsibility: Takes initial category URLs and recursively discovers all subcategories,
 * building a complete hierarchy while tracking navigation paths for ML training.
 * 
 * Input: CategoryEntry objects from NavigationMapper
 * Output: Complete category hierarchy with navigation paths
 */

const NavigationTracker = require('../../../../common/NavigationTracker');
const { logger } = require('../../../../utils/logger');

class SubCategoryExplorationStrategy {
  constructor(browserManager, options = {}) {
    this.browserManager = browserManager;
    this.logger = options.logger || logger;
    this.options = {
      maxDepth: options.maxDepth || 5,              // Maximum recursion depth
      maxCategoriesPerLevel: options.maxCategoriesPerLevel || 20,  // Limit per level
      visitedUrls: new Set(),                       // Prevent infinite loops
      navigationTimeout: options.navigationTimeout || 30000,
      extractSubcategories: options.extractSubcategories !== false,
      trackNavigationPath: options.trackNavigationPath !== false
    };
    
    this.discoveredCategories = [];
    this.navigationTracker = null;
  }

  /**
   * Explore all subcategories starting from initial category entries
   * @param {Array} initialCategories - Array of {url, name} from NavigationMapper
   * @returns {Promise<Array>} Complete category hierarchy with navigation paths
   */
  async exploreAll(initialCategories) {
    this.logger.info('Starting SubCategoryExplorer', {
      initialCategories: initialCategories.length,
      maxDepth: this.options.maxDepth
    });

    const { page, close } = await this.browserManager.createBrowser('stealth');
    this.navigationTracker = new NavigationTracker(this.logger);

    try {
      // Process each initial category
      for (const category of initialCategories) {
        if (!category.url) {
          // If parent has no URL but has children, process children directly
          if (category.children && category.children.length > 0) {
            for (const child of category.children) {
              await this.exploreCategory(page, {
                url: child.url,
                name: child.name || child.text,
                navigationPath: [category.name, child.name || child.text],
                depth: 1,
                parentUrl: null
              });
            }
          }
        } else {
          await this.exploreCategory(page, {
            url: category.url,
            name: category.name,
            navigationPath: [category.name],
            depth: 0,
            parentUrl: null
          });
        }
      }

      return this.buildHierarchy();

    } finally {
      await close();
    }
  }

  /**
   * Recursively explore a single category and its subcategories
   */
  async exploreCategory(page, categoryInfo) {
    const { url, name, navigationPath, depth, parentUrl } = categoryInfo;

    // Check depth limit
    if (depth >= this.options.maxDepth) {
      this.logger.debug('Max depth reached', { url, depth });
      return;
    }

    // Check if already visited
    if (this.options.visitedUrls.has(url)) {
      this.logger.debug('URL already visited', { url });
      return;
    }

    this.options.visitedUrls.add(url);
    this.logger.info('Exploring category', { 
      name, 
      url, 
      depth, 
      pathLength: navigationPath.length 
    });

    try {
      // Navigate to category page
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: this.options.navigationTimeout 
      });
      
      // Track navigation for ML training
      if (this.options.trackNavigationPath && this.navigationTracker) {
        this.navigationTracker.recordNavigation(url, {
          action: 'goto',
          from: parentUrl,
          path: navigationPath,
          depth: depth
        });
      }

      // Wait for page to stabilize
      await this.browserManager.humanDelay(2000, 0.3);

      // Extract subcategories from current page
      const subcategories = await this.extractSubcategories(page);

      // Determine if this is a leaf category (has products but no subcategories)
      const hasProducts = await this.hasProductListings(page);
      const isLeaf = hasProducts && subcategories.length === 0;

      // Store discovered category
      this.discoveredCategories.push({
        url: url,
        name: name,
        navigationPath: navigationPath,
        depth: depth,
        parentUrl: parentUrl,
        isLeaf: isLeaf,
        hasProducts: hasProducts,
        subcategoryCount: subcategories.length,
        discoveredAt: new Date().toISOString()
      });

      // Recursively explore subcategories (limit per level)
      const subcategoriesToExplore = subcategories.slice(0, this.options.maxCategoriesPerLevel);
      
      for (const subcategory of subcategoriesToExplore) {
        await this.exploreCategory(page, {
          url: subcategory.url,
          name: subcategory.name,
          navigationPath: [...navigationPath, subcategory.name],
          depth: depth + 1,
          parentUrl: url
        });
      }

    } catch (error) {
      this.logger.warn('Failed to explore category', {
        url,
        name,
        error: error.message
      });
    }
  }

  /**
   * Extract subcategory links from current category page
   */
  async extractSubcategories(page) {
    try {
      // Multiple patterns for finding subcategory navigation
      const patterns = [
        // Common sidebar/filter navigation
        { selector: '.category-navigation a, .sidebar-nav a, .filter-nav a', context: 'sidebar' },
        // Subcategory grids
        { selector: '.subcategory-grid a, .category-tiles a, .shop-categories a', context: 'grid' },
        // Breadcrumb siblings
        { selector: '.breadcrumb ~ ul a, .category-list a', context: 'breadcrumb' },
        // Generic category links
        { selector: '[class*="category"] a[href*="/category/"], [class*="category"] a[href*="/shop/"]', context: 'generic' }
      ];

      const subcategories = [];
      const seenUrls = new Set();

      for (const pattern of patterns) {
        try {
          const links = await page.$$eval(pattern.selector, (elements, ctx) => {
            return elements.map(el => ({
              url: el.href,
              name: el.textContent.trim(),
              context: ctx
            })).filter(item => item.url && item.name);
          }, pattern.context);

          for (const link of links) {
            // Filter out duplicates and non-category URLs
            if (!seenUrls.has(link.url) && this.isCategoryUrl(link.url)) {
              seenUrls.add(link.url);
              subcategories.push(link);
            }
          }
        } catch (error) {
          // Pattern didn't match, continue with next
        }
      }

      this.logger.debug('Extracted subcategories', { 
        count: subcategories.length,
        sample: subcategories.slice(0, 3)
      });

      return subcategories;
    } catch (error) {
      this.logger.warn('Failed to extract subcategories', { error: error.message });
      return [];
    }
  }

  /**
   * Check if page has product listings
   */
  async hasProductListings(page) {
    try {
      // Common product grid selectors
      const productSelectors = [
        '.product-grid',
        '.product-list',
        '[class*="product-item"]',
        '[class*="product-card"]',
        '.items-grid',
        '.search-results'
      ];

      for (const selector of productSelectors) {
        const hasProducts = await page.$(selector);
        if (hasProducts) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if URL is likely a category URL
   */
  isCategoryUrl(url) {
    const categoryPatterns = [
      /\/category\//i,
      /\/shop\//i,
      /\/collections?\//i,
      /\/departments?\//i,
      /\/browse\//i,
      /\/catalog\//i
    ];

    const excludePatterns = [
      /\/product\//i,
      /\/item\//i,
      /\/p\//i,
      /\.(jpg|jpeg|png|gif|pdf|js|css)$/i,
      /#/,
      /mailto:/i,
      /javascript:/i
    ];

    // Check exclusions first
    for (const pattern of excludePatterns) {
      if (pattern.test(url)) {
        return false;
      }
    }

    // Check if matches category patterns
    for (const pattern of categoryPatterns) {
      if (pattern.test(url)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Build hierarchical structure from discovered categories
   */
  buildHierarchy() {
    const hierarchy = {
      totalCategories: this.discoveredCategories.length,
      maxDepth: Math.max(...this.discoveredCategories.map(c => c.depth), 0),
      leafCategories: this.discoveredCategories.filter(c => c.isLeaf).length,
      categoriesWithProducts: this.discoveredCategories.filter(c => c.hasProducts).length,
      categories: this.discoveredCategories,
      navigationPaths: this.navigationTracker ? this.navigationTracker.getNavigationPath() : []
    };

    this.logger.info('Category exploration complete', {
      total: hierarchy.totalCategories,
      leafCategories: hierarchy.leafCategories,
      maxDepth: hierarchy.maxDepth
    });

    return hierarchy;
  }

  /**
   * Get statistics about exploration
   */
  getStats() {
    return {
      visitedUrls: this.options.visitedUrls.size,
      discoveredCategories: this.discoveredCategories.length,
      leafCategories: this.discoveredCategories.filter(c => c.isLeaf).length,
      maxDepthReached: Math.max(...this.discoveredCategories.map(c => c.depth), 0)
    };
  }
}

module.exports = SubCategoryExplorationStrategy;