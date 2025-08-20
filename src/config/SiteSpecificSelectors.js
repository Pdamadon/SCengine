/**
 * Site-specific selectors for ProductCatalogStrategy
 * 
 * Each site has unique HTML structure - we need custom selectors
 * to reliably extract products
 */

const SiteSpecificSelectors = {
  /**
   * Glasswing Shop - Modern Tailwind CSS structure
   */
  'glasswingshop.com': {
    name: 'Glasswing',
    platform: 'custom-shopify',
    
    // Product detection patterns
    patterns: {
      containers: [
        // Main product grid items
        '.col-span-1.scroll-animate',
        '[class*="col-span-1"]',
        '.aspect-\\[3\\/4\\]', // Escaped for aspect-[3/4]
        
        // Product cards
        '.open-product-item',
        '.open-product',
      ],
      
      // Product links - MUST contain /products/
      links: [
        'a[href*="/products/"]',
      ],
      
      // Price indicators
      indicators: [
        '.open-product-cost',
        '[class*="product-cost"]',
        '.price',
        '[class*="price"]',
        '[data-price]',
      ],
    },
    
    // Navigation patterns to EXCLUDE
    excludePatterns: [
      '/collections/',
      '/pages/',
      '/account/',
      '/cart',
      '/search',
    ],
    
    // Pagination
    pagination: {
      type: 'none', // Glasswing doesn't paginate collections
      selectors: {}
    },
    
    // Additional config
    waitForSelector: '.grid', // Wait for grid to load
    scrollToLoad: false,
  },
  
  /**
   * Macy's - Complex mega-retailer structure
   */
  'macys.com': {
    name: 'Macys',
    platform: 'enterprise',
    
    patterns: {
      containers: [
        '.productThumbnail',
        '.cell.productThumbnailItem',
        '[data-auto="product-tile"]',
      ],
      
      links: [
        'a.productDescLink',
        'a[href*="/shop/product/"]',
      ],
      
      indicators: [
        '.prices',
        '.regular',
        '.discount',
        '[class*="price"]',
      ],
    },
    
    excludePatterns: [
      '/shop/featured/',
      '/social/',
      '/registry/',
    ],
    
    pagination: {
      type: 'traditional',
      selectors: {
        next: '.pagination .next',
        loadMore: '.load-more-button',
      }
    },
    
    waitForSelector: '.productThumbnail',
    scrollToLoad: true,
  },
  
  /**
   * Gap - Standard retail structure
   */
  'gap.com': {
    name: 'Gap',
    platform: 'enterprise',
    
    patterns: {
      containers: [
        '.product-card',
        '[data-testid="product-card"]',
        '.css-product-card',
      ],
      
      links: [
        'a[href*="/browse/product.do"]',
        '.product-card__link',
      ],
      
      indicators: [
        '.product-price',
        '.product-card__price',
        '[data-testid="product-price"]',
      ],
    },
    
    excludePatterns: [
      '/browse/category.do',
      '/customer-service/',
    ],
    
    pagination: {
      type: 'infiniteScroll',
      selectors: {}
    },
    
    waitForSelector: '.product-card',
    scrollToLoad: true,
  },
  
  /**
   * Default patterns for unknown sites
   */
  default: {
    name: 'Generic',
    platform: 'unknown',
    
    patterns: {
      containers: [
        '.product',
        '.item',
        '.card',
        '[class*="product"]',
        'article',
      ],
      
      links: [
        'a[href*="/product"]',
        'a[href*="/p/"]',
        'a[href*="/item"]',
      ],
      
      indicators: [
        '.price',
        '[class*="price"]',
        '[data-price]',
      ],
    },
    
    excludePatterns: [
      '/category/',
      '/categories/',
      '/collections/',
    ],
    
    pagination: {
      type: 'auto', // Try to detect
      selectors: {
        next: '.next, [rel="next"]',
        loadMore: '[class*="load-more"]',
      }
    },
    
    waitForSelector: null,
    scrollToLoad: false,
  }
};

/**
 * Get selectors for a specific domain
 */
function getSelectorsForDomain(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    
    // Check for exact match
    if (SiteSpecificSelectors[domain]) {
      return SiteSpecificSelectors[domain];
    }
    
    // Check for partial match (e.g., "macys.com" in "www1.macys.com")
    for (const [key, config] of Object.entries(SiteSpecificSelectors)) {
      if (domain.includes(key)) {
        return config;
      }
    }
    
    // Return default
    return SiteSpecificSelectors.default;
    
  } catch (error) {
    console.error('Error parsing domain:', error);
    return SiteSpecificSelectors.default;
  }
}

/**
 * Test if a URL should be excluded based on patterns
 */
function shouldExcludeUrl(url, config) {
  const excludePatterns = config.excludePatterns || [];
  return excludePatterns.some(pattern => url.includes(pattern));
}

module.exports = {
  SiteSpecificSelectors,
  getSelectorsForDomain,
  shouldExcludeUrl
};