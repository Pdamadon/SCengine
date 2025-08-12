/**
 * Selector Library
 * Common e-commerce patterns and selectors that work across multiple platforms
 * Provides fallback chains and adaptive selection strategies
 * Enhanced with sector template integration for comprehensive coverage
 */

const { getPlatformConfig, getEnhancedSelectors, SectorTemplates } = require('../config/platformConfigs');

class SelectorLibrary {
  constructor() {
    // Initialize with sector template integration
    this.sectorTemplates = SectorTemplates;
    
    // Common e-commerce selector patterns organized by purpose
    this.selectors = {
      // Product identification selectors
      products: {
        cards: [
          '.product',
          '.product-item',
          '.product-card',
          '.item',
          '[class*="product"]',
          '[data-testid*="product"]',
          '.grid-item',
          '.collection-item',
        ],
        links: [
          'a[href*="/product"]',
          'a[href*="/products/"]',
          'a[href*="/item"]',
          'a[href*="/p/"]',
          'a[href*="-p-"]',
          'a[href*="/dp/"]', // Amazon
          'a[href*="/gp/product/"]', // Amazon
          '.product a',
          '.product-item a',
          '.product-card a',
        ],
      },

      // Product details selectors
      productDetails: {
        title: [
          'h1',
          '.product-title',
          '.product-name',
          '.product__title',
          '[class*="title"]',
          '[data-testid*="title"]',
          '#product-title',
          '#productTitle', // Amazon
          '.pdp-product-name', // Gap
        ],
        price: [
          '.price',
          '.product-price',
          '.product__price',
          '[class*="price"]',
          '[data-testid*="price"]',
          '.money',
          '.cost',
          '.amount',
          '.a-price .a-offscreen', // Amazon
          '.sr-only', // Screen reader text often contains price
        ],
        images: [
          '.product-image img',
          '.product-photo img',
          '.product__image img',
          '[class*="product"] img',
          '[data-testid*="image"] img',
          '.main-image img',
          '#landingImage', // Amazon
          '.product-images img',
        ],
        description: [
          '.product-description',
          '.product__description',
          '.description',
          '[class*="description"]',
          '.product-details',
          '.details',
          '[data-testid*="description"]',
          '.rte', // Rich text editor content
        ],
      },

      // Navigation and pagination selectors
      navigation: {
        pagination: [
          '.pagination',
          '.pager',
          '[class*="pagination"]',
          '.page-numbers',
          '.page-nav',
          '[role="navigation"]',
        ],
        next: [
          'a[href*="page="]',
          'a[href*="p="]',
          'a[href*="/page/"]',
          '.pagination a',
          '.pager a',
          '[class*="pagination"] a',
          '[aria-label*="Next"]',
          '[aria-label*="next"]',
          'a[rel="next"]',
          '.next',
          '.pagination-next',
        ],
        previous: [
          '[aria-label*="Previous"]',
          '[aria-label*="previous"]',
          'a[rel="prev"]',
          '.prev',
          '.previous',
          '.pagination-prev',
        ],
      },

      // Category and filtering selectors
      categories: {
        breadcrumbs: [
          '.breadcrumb',
          '.breadcrumbs',
          '[class*="breadcrumb"]',
          '.nav-breadcrumb',
          '[data-testid*="breadcrumb"]',
          '.breadcrumb-trail',
        ],
        filters: [
          '.filters',
          '.facets',
          '.filter-sidebar',
          '[class*="filter"]',
          '.category-filters',
          '.refine',
        ],
        categoryNav: [
          '.category-nav',
          '.categories',
          '.main-nav',
          '.navigation',
          '[class*="category"]',
          '.menu',
        ],
      },

      // Commerce-specific selectors
      commerce: {
        addToCart: [
          'button[type="submit"]',
          '.add-to-cart',
          '.btn-add-cart',
          '[data-testid*="add-to-cart"]',
          '#add-to-cart-button', // Amazon
          '.product-form button',
        ],
        variants: [
          'select[name*="id"]',
          'select[name*="Size"]',
          'select[name*="Color"]',
          '.variant-selector select',
          '.product-variants select',
          '.product-form select',
        ],
        quantity: [
          'input[name="quantity"]',
          '.quantity input',
          '[data-testid*="quantity"]',
          '#quantity',
        ],
        availability: [
          '.availability',
          '.stock-status',
          '.in-stock',
          '.out-of-stock',
          '[data-testid*="stock"]',
        ],
      },

      // Rating and review selectors
      reviews: {
        rating: [
          '.rating',
          '.stars',
          '[class*="rating"]',
          '[data-testid*="rating"]',
          '.review-score',
          '.star-rating',
        ],
        count: [
          '.review-count',
          '.rating-count',
          '[class*="review"] [class*="count"]',
          '.total-reviews',
        ],
        reviews: [
          '.reviews',
          '.review',
          '[class*="review"]',
          '.testimonials',
          '.feedback',
        ],
      },
    };

    // Platform-specific selector mappings
    this.platformSpecific = {
      shopify: {
        products: ['.product-item', '.grid__item', '.product-card'],
        title: ['.product__title', '.product-single__title'],
        price: ['.price', '.product__price', '.money'],
        addToCart: ['.btn', '.product-form__cart-submit'],
      },
      gap: {
        products: ['.product-tile', '.category-page .product'],
        title: ['.pdp-product-name', '.product-tile-title'],
        price: ['.price', '.product-price'],
        images: ['.product-tile-image', '.pdp-product-image'],
      },
      amazon: {
        products: ['[data-component-type="s-search-result"]'],
        title: ['h2 a span', '#productTitle'],
        price: ['.a-price .a-offscreen'],
        images: ['.s-image', '#landingImage'],
        next: ['.s-pagination-next'],
      },
      woocommerce: {
        products: ['.product', '.woocommerce-LoopProduct-link'],
        title: ['.woocommerce-loop-product__title', '.product_title'],
        price: ['.price', '.woocommerce-Price-amount'],
        addToCart: ['.add_to_cart_button'],
      },
    };

    // Confidence scoring for selectors
    this.selectorScores = {
      high: ['#', '[data-testid', '[aria-label'],
      medium: ['.product', '.price', '.title', 'h1', 'h2'],
      low: ['div', 'span', 'p', 'a'],
    };
  }

  /**
   * Get selectors for a specific element type and platform
   * Enhanced with sector template integration
   */
  getSelectors(type, category = 'general', platform = null) {
    const selectors = [];

    // Add platform-specific enhanced selectors (highest priority)
    if (platform) {
      try {
        const enhancedSelectors = getEnhancedSelectors(platform, type);
        if (enhancedSelectors && enhancedSelectors.length > 0) {
          selectors.push(...enhancedSelectors);
        }
      } catch (error) {
        // Continue with fallback if enhanced selectors fail
      }
    }

    // Add platform-specific selectors from legacy system
    if (platform && this.platformSpecific[platform] && this.platformSpecific[platform][type]) {
      selectors.push(...this.platformSpecific[platform][type]);
    }

    // Add general selectors
    if (this.selectors[category] && this.selectors[category][type]) {
      selectors.push(...this.selectors[category][type]);
    }

    // Remove duplicates while preserving order
    return [...new Set(selectors)];
  }

  /**
   * Get product card selectors with fallbacks
   */
  getProductSelectors(platform = null) {
    return {
      cards: this.getSelectors('cards', 'products', platform),
      links: this.getSelectors('links', 'products', platform),
      title: this.getSelectors('title', 'productDetails', platform),
      price: this.getSelectors('price', 'productDetails', platform),
      images: this.getSelectors('images', 'productDetails', platform),
    };
  }

  /**
   * Get navigation selectors
   */
  getNavigationSelectors(platform = null) {
    return {
      pagination: this.getSelectors('pagination', 'navigation', platform),
      next: this.getSelectors('next', 'navigation', platform),
      previous: this.getSelectors('previous', 'navigation', platform),
    };
  }

  /**
   * Score selector based on specificity and reliability
   */
  scoreSelector(selector) {
    let score = 0;

    // ID selectors are most reliable
    if (selector.includes('#')) score += 10;

    // Data attributes and aria labels are reliable
    if (selector.includes('[data-') || selector.includes('[aria-')) score += 8;

    // Class selectors with specific names
    if (selector.includes('.product') || selector.includes('.price') || selector.includes('.title')) {
      score += 6;
    }

    // Generic class selectors
    if (selector.includes('.') && !selector.includes('.product') && !selector.includes('.price')) {
      score += 4;
    }

    // Tag selectors are least reliable but sometimes necessary
    if (!selector.includes('.') && !selector.includes('#') && !selector.includes('[')) {
      score += 2;
    }

    return score;
  }

  /**
   * Sort selectors by reliability score
   */
  sortByReliability(selectors) {
    return selectors.sort((a, b) => this.scoreSelector(b) - this.scoreSelector(a));
  }

  /**
   * Create fallback chain for a selector type
   */
  createFallbackChain(type, category, platform = null, maxSelectors = 5) {
    const selectors = this.getSelectors(type, category, platform);
    const scored = this.sortByReliability(selectors);
    return scored.slice(0, maxSelectors);
  }

  /**
   * Test selector against a page and return confidence score
   */
  async testSelector(page, selector, expectedMinimum = 1) {
    try {
      const elements = await page.$$(selector);
      const count = elements.length;
      
      if (count >= expectedMinimum) {
        // Higher confidence for more specific selectors that find appropriate number of elements
        const baseScore = Math.min(count / expectedMinimum, 3) * 0.3; // Max 0.9 from count
        const selectorScore = this.scoreSelector(selector) / 10 * 0.1; // Max 0.1 from selector quality
        return Math.min(baseScore + selectorScore, 1.0);
      }
      
      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Find best selector from a list by testing against page
   */
  async findBestSelector(page, selectors, expectedMinimum = 1) {
    const results = [];
    
    for (const selector of selectors) {
      const confidence = await this.testSelector(page, selector, expectedMinimum);
      results.push({ selector, confidence });
    }
    
    // Sort by confidence and return best match
    results.sort((a, b) => b.confidence - a.confidence);
    
    return results.length > 0 ? results[0] : { selector: selectors[0] || 'div', confidence: 0 };
  }

  /**
   * Generate adaptive selectors based on page analysis
   */
  async generateAdaptiveSelectors(page, type, category) {
    const baseSelectors = this.getSelectors(type, category);
    
    // Test each selector and build confidence map
    const selectorResults = [];
    
    for (const selector of baseSelectors) {
      const confidence = await this.testSelector(page, selector);
      if (confidence > 0) {
        selectorResults.push({ selector, confidence });
      }
    }
    
    // Sort by confidence
    selectorResults.sort((a, b) => b.confidence - a.confidence);
    
    return selectorResults.map(result => result.selector);
  }

  /**
   * Extract common patterns from successful selectors
   */
  learnFromSuccess(successfulSelectors, type, category) {
    // This would implement machine learning to identify patterns
    // For now, we'll add successful selectors to the library
    
    if (!this.selectors[category]) {
      this.selectors[category] = {};
    }
    
    if (!this.selectors[category][type]) {
      this.selectors[category][type] = [];
    }
    
    // Add new selectors that aren't already in the library
    successfulSelectors.forEach(selector => {
      if (!this.selectors[category][type].includes(selector)) {
        this.selectors[category][type].push(selector);
      }
    });
  }

  /**
   * Get all available categories and types
   */
  getAvailablePatterns() {
    return Object.keys(this.selectors).reduce((acc, category) => {
      acc[category] = Object.keys(this.selectors[category]);
      return acc;
    }, {});
  }

  /**
   * Export learned selectors for persistence
   */
  exportLibrary() {
    return {
      selectors: this.selectors,
      platformSpecific: this.platformSpecific,
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Import previously learned selectors
   */
  importLibrary(libraryData) {
    if (libraryData.selectors) {
      // Merge with existing selectors
      Object.keys(libraryData.selectors).forEach(category => {
        if (!this.selectors[category]) {
          this.selectors[category] = {};
        }
        Object.keys(libraryData.selectors[category]).forEach(type => {
          if (!this.selectors[category][type]) {
            this.selectors[category][type] = [];
          }
          // Add new selectors
          libraryData.selectors[category][type].forEach(selector => {
            if (!this.selectors[category][type].includes(selector)) {
              this.selectors[category][type].push(selector);
            }
          });
        });
      });
    }
  }

  /**
   * Get comprehensive selectors for a domain/platform using sector templates
   */
  getComprehensiveSelectors(domain, type, sector = 'clothing') {
    const selectors = [];

    // Try to get platform-specific selectors
    const platform = this.detectPlatformFromDomain(domain);
    if (platform) {
      const enhancedSelectors = getEnhancedSelectors(platform, type);
      selectors.push(...enhancedSelectors);
    }

    // Add sector template selectors
    const sectorTemplate = this.sectorTemplates[sector];
    if (sectorTemplate && sectorTemplate.selectors[type]) {
      selectors.push(...sectorTemplate.selectors[type]);
    }

    // Add generic selectors as fallback
    if (this.selectors.productDetails && this.selectors.productDetails[type]) {
      selectors.push(...this.selectors.productDetails[type]);
    }

    return [...new Set(selectors)];
  }

  /**
   * Detect platform from domain name
   */
  detectPlatformFromDomain(domain) {
    const lowerDomain = domain.toLowerCase();
    
    // Check for specific platform indicators
    if (lowerDomain.includes('gap.') || lowerDomain.includes('oldnavy.') || 
        lowerDomain.includes('bananarepublic.') || lowerDomain.includes('athleta.')) {
      return 'gap';
    }
    
    if (lowerDomain.includes('shopify') || lowerDomain.includes('myshopify')) {
      return 'shopify';
    }
    
    if (lowerDomain.includes('amazon.')) {
      return 'amazon';
    }

    return 'universal';
  }

  /**
   * Get Gap.com specific selectors (leveraging sector templates)
   */
  getGapSelectors() {
    return {
      title: getEnhancedSelectors('gap', 'title'),
      price: getEnhancedSelectors('gap', 'price'),
      images: getEnhancedSelectors('gap', 'images'),
      sizes: getEnhancedSelectors('gap', 'sizes'),
      colors: getEnhancedSelectors('gap', 'colors'),
      addToCart: getEnhancedSelectors('gap', 'addToCart'),
      availability: getEnhancedSelectors('gap', 'availability'),
      productLinks: [
        'a[href*="/browse/product"]', // Gap specific
        'a[href*="/products/"]',      // General
        '.product-tile a',            // Gap category page
        ...this.sectorTemplates.clothing.productUrlPatterns.map(pattern => 
          `a[href*="${pattern}"]`
        )
      ],
      categoryLinks: [
        'a[href*="/browse/"]',        // Gap browse
        'a[href*="/shop/"]',          // Gap shop
        ...this.sectorTemplates.clothing.categoryUrlPatterns.map(pattern => 
          `a[href*="${pattern}"]`
        )
      ]
    };
  }

  /**
   * Validate selectors against sector template patterns
   */
  validateAgainstSectorTemplate(selectors, type, sector = 'clothing') {
    const sectorTemplate = this.sectorTemplates[sector];
    if (!sectorTemplate || !sectorTemplate.selectors[type]) {
      return { valid: true, coverage: 0 };
    }

    const templateSelectors = sectorTemplate.selectors[type];
    const matches = selectors.filter(selector => 
      templateSelectors.includes(selector)
    );

    return {
      valid: matches.length > 0,
      coverage: matches.length / templateSelectors.length,
      matches: matches.length,
      missing: templateSelectors.filter(selector => 
        !selectors.includes(selector)
      ).slice(0, 5) // Show first 5 missing
    };
  }
}

module.exports = SelectorLibrary;