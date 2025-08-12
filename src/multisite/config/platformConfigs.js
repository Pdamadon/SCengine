/**
 * Platform Configuration System
 * Integrates sector templates with platform-specific configurations
 * Provides comprehensive selector mappings for multi-site scraping
 */

const { SectorTemplates, SectorSites, getTemplate } = require('./sectorTemplates');

/**
 * Platform-specific configurations that extend sector templates
 */
const PlatformConfigs = {
  // Gap Inc. brands configuration
  gap: {
    name: 'Gap Inc.',
    domains: ['gap.com', 'oldnavy.com', 'bananarepublic.com', 'athleta.com'],
    sector: 'clothing',
    antiBot: {
      delayRange: [2000, 4000], // Higher delays for Gap
      userAgentRotation: true,
      proxyRequired: false, // Start without, escalate if needed
    },
    platformFingerprints: {
      // Gap-specific detection patterns
      meta: ['gap-product', 'gap-category'],
      scripts: ['gap.com', 'gapinc'],
      stylesheets: ['gap-styles', 'gap.css'],
      elements: ['.pdp-product-name', '.product-tile'],
    },
    selectors: {
      // Use sector template selectors with Gap-specific overrides
      title: [
        '.pdp-product-name h1', // Gap PDP
        '.product-title__text', // Gap category
        '.product-tile-title', // Gap grid
        ...SectorTemplates.clothing.selectors.title, // Fallback to sector template
      ],
      price: [
        'span.pd-price', // Gap main price
        '.markdown-price', // Gap sale price
        '.current-sale-price', // Gap discount
        ...SectorTemplates.clothing.selectors.price,
      ],
      images: [
        'div.gallery-main img', // Gap main product image
        '.product-tile-image img', // Gap category image
        '.product-images img', // Gap gallery
        ...SectorTemplates.clothing.selectors.images,
      ],
      sizes: [
        'select#product-size', // Gap size selector
        '.ProductOption--size select',
        ...SectorTemplates.clothing.selectors.sizes,
      ],
      colors: [
        'button[data-attribute="color"]', // Gap color selector
        '.ColorSwatch-option',
        ...SectorTemplates.clothing.selectors.colors,
      ],
      addToCart: [
        'button[data-test="add-to-bag-button"]', // Gap add to cart
        ...SectorTemplates.clothing.selectors.addToCart,
      ],
    },
    productUrlPatterns: [
      '/browse/product', // Gap pattern
      '/products/', // General pattern
      ...SectorTemplates.clothing.productUrlPatterns,
    ],
    categoryUrlPatterns: [
      '/browse/', // Gap browse pattern
      '/shop/', // Gap shop pattern
      ...SectorTemplates.clothing.categoryUrlPatterns,
    ],
  },

  // Shopify platform configuration
  shopify: {
    name: 'Shopify',
    domains: [], // Dynamic detection via fingerprints
    sector: 'clothing', // Default, can be overridden
    antiBot: {
      delayRange: [1500, 3000],
      userAgentRotation: true,
      proxyRequired: false,
    },
    platformFingerprints: {
      meta: ['shopify', 'shopify-digital-wallet'],
      scripts: ['shopify.com', 'shopify_common', 'Shopify'],
      stylesheets: ['shopify', 'theme'],
      elements: ['.shopify-section', '.product-form'],
    },
    selectors: {
      title: [
        '.product__title',
        '.product-single__title',
        'h1.product-title',
        ...SectorTemplates.clothing.selectors.title,
      ],
      price: [
        '.price',
        '.product__price',
        '.money',
        '.price-item--sale',
        ...SectorTemplates.clothing.selectors.price,
      ],
      images: [
        '.product__media img',
        '.product-single__photo img',
        '.grid__item img',
        ...SectorTemplates.clothing.selectors.images,
      ],
      addToCart: [
        '.btn',
        '.product-form__cart-submit',
        'button[name="add"]',
        ...SectorTemplates.clothing.selectors.addToCart,
      ],
    },
    jsonApiEndpoints: {
      products: '/products.json',
      collections: '/collections/{handle}/products.json',
    },
    productUrlPatterns: [
      '/products/',
      '/collections/*/products/',
      ...SectorTemplates.clothing.productUrlPatterns,
    ],
    categoryUrlPatterns: [
      '/collections/',
      ...SectorTemplates.clothing.categoryUrlPatterns,
    ],
  },

  // WooCommerce platform configuration
  woocommerce: {
    name: 'WooCommerce',
    domains: [], // Dynamic detection
    sector: 'clothing',
    antiBot: {
      delayRange: [1000, 2000],
      userAgentRotation: true,
      proxyRequired: false,
    },
    platformFingerprints: {
      meta: ['woocommerce', 'wc-'],
      scripts: ['woocommerce', 'wc-'],
      stylesheets: ['woocommerce'],
      elements: ['.woocommerce', '.product', '.shop'],
    },
    selectors: {
      title: [
        '.woocommerce-loop-product__title',
        '.product_title',
        'h1.entry-title',
        ...SectorTemplates.clothing.selectors.title,
      ],
      price: [
        '.price',
        '.woocommerce-Price-amount',
        '.amount',
        ...SectorTemplates.clothing.selectors.price,
      ],
      images: [
        '.woocommerce-product-gallery__image img',
        '.attachment-woocommerce_thumbnail',
        ...SectorTemplates.clothing.selectors.images,
      ],
      addToCart: [
        '.add_to_cart_button',
        '.single_add_to_cart_button',
        ...SectorTemplates.clothing.selectors.addToCart,
      ],
    },
  },

  // Amazon configuration (limited support - respect robots.txt)
  amazon: {
    name: 'Amazon',
    domains: ['amazon.com', 'amazon.co.uk', 'amazon.de'],
    sector: 'clothing',
    antiBot: {
      delayRange: [3000, 6000], // Very conservative
      userAgentRotation: true,
      proxyRequired: true, // Always use proxy for Amazon
    },
    platformFingerprints: {
      meta: ['amazon'],
      scripts: ['amazon', 'amzn'],
      elements: ['#navbar', '#nav-logo', '#productTitle'],
    },
    selectors: {
      title: [
        '#productTitle',
        'h1.a-size-large',
        ...SectorTemplates.clothing.selectors.title,
      ],
      price: [
        '.a-price .a-offscreen',
        '.a-price-whole',
        ...SectorTemplates.clothing.selectors.price,
      ],
      images: [
        '#landingImage',
        '.s-image',
        ...SectorTemplates.clothing.selectors.images,
      ],
    },
    productUrlPatterns: [
      '/dp/',
      '/gp/product/',
      ...SectorTemplates.clothing.productUrlPatterns,
    ],
    // Note: Amazon restricts automated access - check robots.txt
  },
};

/**
 * Universal platform configuration for unknown sites
 */
const UniversalConfig = {
  name: 'Universal',
  sector: 'clothing', // Default sector
  antiBot: {
    delayRange: [2000, 4000],
    userAgentRotation: true,
    proxyRequired: false,
  },
  selectors: {
    // Use sector template selectors directly
    title: SectorTemplates.clothing.selectors.title,
    price: SectorTemplates.clothing.selectors.price,
    images: SectorTemplates.clothing.selectors.images,
    sizes: SectorTemplates.clothing.selectors.sizes,
    colors: SectorTemplates.clothing.selectors.colors,
    addToCart: SectorTemplates.clothing.selectors.addToCart,
  },
  productUrlPatterns: SectorTemplates.clothing.productUrlPatterns,
  categoryUrlPatterns: SectorTemplates.clothing.categoryUrlPatterns,
};

/**
 * Get platform configuration by name or domain
 */
function getPlatformConfig(platformOrDomain) {
  // Check if it's a platform name
  if (PlatformConfigs[platformOrDomain]) {
    return PlatformConfigs[platformOrDomain];
  }

  // Check domains for platform match
  for (const [platform, config] of Object.entries(PlatformConfigs)) {
    if (config.domains && config.domains.some(domain => 
      platformOrDomain.includes(domain) || domain.includes(platformOrDomain)
    )) {
      return config;
    }
  }

  return UniversalConfig;
}

/**
 * Get enhanced selectors combining platform-specific and sector template selectors
 */
function getEnhancedSelectors(platform, selectorType) {
  const config = getPlatformConfig(platform);
  const sectorTemplate = getTemplate(config.sector);
  
  // Combine platform selectors with sector template selectors
  const platformSelectors = config.selectors?.[selectorType] || [];
  const sectorSelectors = sectorTemplate.selectors?.[selectorType] || [];
  
  // Remove duplicates while preserving order (platform selectors first)
  return [...new Set([...platformSelectors, ...sectorSelectors])];
}

/**
 * Get all available platforms
 */
function getAvailablePlatforms() {
  return Object.keys(PlatformConfigs);
}

/**
 * Get sector-specific site list for testing/discovery
 */
function getSectorSites(sector, count = 10) {
  return SectorSites[sector]?.slice(0, count) || [];
}

/**
 * Generate complete configuration for a platform including sector data
 */
function generatePlatformConfig(platform, overrides = {}) {
  const baseConfig = getPlatformConfig(platform);
  const sectorTemplate = getTemplate(baseConfig.sector);
  
  return {
    ...baseConfig,
    sectorTemplate,
    enhancedSelectors: {
      title: getEnhancedSelectors(platform, 'title'),
      price: getEnhancedSelectors(platform, 'price'),
      images: getEnhancedSelectors(platform, 'images'),
      sizes: getEnhancedSelectors(platform, 'sizes'),
      colors: getEnhancedSelectors(platform, 'colors'),
      addToCart: getEnhancedSelectors(platform, 'addToCart'),
      availability: getEnhancedSelectors(platform, 'availability'),
    },
    ...overrides,
  };
}

module.exports = {
  PlatformConfigs,
  UniversalConfig,
  getPlatformConfig,
  getEnhancedSelectors,
  getAvailablePlatforms,
  getSectorSites,
  generatePlatformConfig,
  SectorTemplates, // Re-export for convenience
};