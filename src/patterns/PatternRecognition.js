class PatternRecognition {
  constructor(logger) {
    this.logger = logger;
    this.knownPatterns = this.loadKnownPatterns();
    this.siteTemplates = new Map();
    this.supportedSites = new Set();
  }

  loadKnownPatterns() {
    return {
      ecommerce_indicators: [
        { pattern: '.add-to-cart', confidence: 0.9, type: 'cart_action' },
        { pattern: '.product-price', confidence: 0.8, type: 'pricing' },
        { pattern: '.checkout', confidence: 0.9, type: 'purchase_flow' },
        { pattern: '.shopping-cart', confidence: 0.8, type: 'cart_display' },
        { pattern: '.product-grid', confidence: 0.7, type: 'product_listing' },
        { pattern: '.filter', confidence: 0.6, type: 'product_filtering' },
        { pattern: '.search-results', confidence: 0.7, type: 'search_functionality' }
      ],
      
      navigation_patterns: [
        { pattern: 'nav', confidence: 0.9, type: 'main_navigation' },
        { pattern: '.breadcrumb', confidence: 0.8, type: 'breadcrumb_nav' },
        { pattern: '.pagination', confidence: 0.7, type: 'page_navigation' },
        { pattern: '.menu-toggle', confidence: 0.6, type: 'mobile_menu' }
      ],
      
      product_patterns: [
        { pattern: '.product-title', confidence: 0.9, type: 'product_name' },
        { pattern: '.product-image', confidence: 0.8, type: 'product_visual' },
        { pattern: '.product-description', confidence: 0.7, type: 'product_details' },
        { pattern: '.product-variants', confidence: 0.8, type: 'product_options' },
        { pattern: '.product-reviews', confidence: 0.6, type: 'social_proof' }
      ],
      
      platform_signatures: {
        shopify: [
          'shopify-section',
          'Shopify.theme',
          '/cdn/shop/',
          'myshopify.com'
        ],
        woocommerce: [
          'woocommerce',
          'wp-content/plugins/woocommerce',
          'wc-',
          'single-product'
        ],
        magento: [
          'Magento_',
          'mage-',
          'catalog-product-view',
          'checkout/cart'
        ],
        bigcommerce: [
          'bigcommerce',
          '/product/',
          'bc-sf-filter'
        ]
      }
    };
  }

  async identifyPatterns(siteData) {
    try {
      this.logger.info(`Identifying patterns for ${siteData.url}`);
      
      const patterns = {
        platform: await this.detectPlatform(siteData),
        ecommerce_score: this.calculateEcommerceScore(siteData),
        navigation_structure: this.analyzeNavigationStructure(siteData),
        product_layout: this.analyzeProductLayout(siteData),
        interaction_patterns: this.identifyInteractionPatterns(siteData),
        selector_reliability: this.assessSelectorReliability(siteData),
        responsive_indicators: this.checkResponsiveIndicators(siteData)
      };
      
      this.cacheSiteTemplate(siteData.url, patterns);
      this.supportedSites.add(siteData.url);
      
      return patterns;
    } catch (error) {
      this.logger.error('Pattern identification failed:', error);
      throw error;
    }
  }

  detectPlatform(siteData) {
    const { pageStructure, metadata } = siteData;
    const platformScores = {};
    
    Object.entries(this.knownPatterns.platform_signatures).forEach(([platform, signatures]) => {
      platformScores[platform] = 0;
      
      signatures.forEach(signature => {
        if (siteData.url.includes(signature) || 
            JSON.stringify(pageStructure).includes(signature) ||
            JSON.stringify(metadata).includes(signature)) {
          platformScores[platform] += 1;
        }
      });
    });
    
    const detectedPlatform = Object.entries(platformScores)
      .sort(([,a], [,b]) => b - a)[0];
    
    return {
      platform: detectedPlatform[0],
      confidence: detectedPlatform[1] / this.knownPatterns.platform_signatures[detectedPlatform[0]].length,
      scores: platformScores
    };
  }

  calculateEcommerceScore(siteData) {
    let score = 0;
    let maxScore = 0;
    
    this.knownPatterns.ecommerce_indicators.forEach(indicator => {
      maxScore += indicator.confidence;
      
      if (this.patternExists(siteData, indicator.pattern)) {
        score += indicator.confidence;
      }
    });
    
    return {
      score: score / maxScore,
      raw_score: score,
      max_score: maxScore,
      is_ecommerce: score / maxScore > 0.6
    };
  }

  analyzeNavigationStructure(siteData) {
    const { navigation } = siteData;
    
    return {
      has_main_menu: navigation.mainMenu.length > 0,
      menu_depth: this.calculateMenuDepth(navigation.mainMenu),
      category_count: navigation.categories.length,
      has_search: navigation.search !== null,
      search_prominence: this.assessSearchProminence(navigation.search),
      filter_availability: navigation.filters.length > 0,
      navigation_type: this.classifyNavigationType(navigation)
    };
  }

  analyzeProductLayout(siteData) {
    const { products } = siteData;
    
    if (products.length === 0) {
      return { layout_type: 'no_products', confidence: 0 };
    }
    
    const layout = {
      product_count: products.length,
      has_grid_layout: this.detectGridLayout(products),
      has_list_layout: this.detectListLayout(products),
      average_product_info_completeness: this.calculateProductInfoCompleteness(products),
      price_display_consistency: this.checkPriceConsistency(products),
      image_availability: this.checkImageAvailability(products),
      variant_support: this.checkVariantSupport(products)
    };
    
    layout.layout_type = layout.has_grid_layout ? 'grid' : 
                        layout.has_list_layout ? 'list' : 'mixed';
    layout.confidence = this.calculateLayoutConfidence(layout);
    
    return layout;
  }

  identifyInteractionPatterns(siteData) {
    const { ecommercePatterns } = siteData;
    
    return {
      cart_interaction: ecommercePatterns.hasCart ? 'standard_cart' : 'no_cart',
      wishlist_support: ecommercePatterns.hasWishlist,
      filter_interaction: this.classifyFilterInteraction(ecommercePatterns),
      pagination_style: this.classifyPaginationStyle(ecommercePatterns),
      user_account_flow: ecommercePatterns.hasUserAccount ? 'account_based' : 'guest_only',
      checkout_type: this.classifyCheckoutType(ecommercePatterns)
    };
  }

  assessSelectorReliability(siteData) {
    const selectors = this.extractAllSelectors(siteData);
    
    return selectors.map(selector => ({
      selector,
      reliability_score: this.calculateSelectorReliability(selector),
      stability_indicators: this.identifyStabilityIndicators(selector),
      fallback_options: this.generateFallbackSelectors(selector)
    }));
  }

  checkResponsiveIndicators(siteData) {
    const { pageStructure } = siteData;
    
    return {
      has_viewport_meta: pageStructure.hasViewportMeta || false,
      css_media_queries: pageStructure.mediaQueries || 0,
      responsive_images: pageStructure.responsiveImages || false,
      mobile_navigation: pageStructure.mobileNavigation || false,
      responsive_score: this.calculateResponsiveScore(pageStructure)
    };
  }

  patternExists(siteData, pattern) {
    const searchableContent = JSON.stringify(siteData);
    return searchableContent.includes(pattern) || 
           siteData.pageStructure.hasClass?.(pattern);
  }

  calculateMenuDepth(menuItems) {
    if (!menuItems || menuItems.length === 0) return 0;
    return Math.max(1, menuItems.length > 5 ? 2 : 1);
  }

  assessSearchProminence(searchElement) {
    if (!searchElement) return 'none';
    
    const selector = searchElement.selector;
    if (selector.includes('header') || selector.includes('nav')) {
      return 'prominent';
    }
    return 'secondary';
  }

  classifyNavigationType(navigation) {
    if (navigation.mainMenu.length > 8) return 'mega_menu';
    if (navigation.categories.length > 5) return 'category_focused';
    if (navigation.search) return 'search_focused';
    return 'simple';
  }

  detectGridLayout(products) {
    return products.some(product => 
      product.selector.includes('grid') || 
      product.selector.includes('col-')
    );
  }

  detectListLayout(products) {
    return products.some(product => 
      product.selector.includes('list') || 
      product.selector.includes('row')
    );
  }

  calculateProductInfoCompleteness(products) {
    if (products.length === 0) return 0;
    
    const totalCompleteness = products.reduce((sum, product) => {
      let completeness = 0;
      if (product.title) completeness += 0.3;
      if (product.price) completeness += 0.3;
      if (product.image) completeness += 0.2;
      if (product.link) completeness += 0.2;
      return sum + completeness;
    }, 0);
    
    return totalCompleteness / products.length;
  }

  checkPriceConsistency(products) {
    const priceFormats = products
      .filter(p => p.price)
      .map(p => this.extractPriceFormat(p.price));
    
    const uniqueFormats = new Set(priceFormats);
    return uniqueFormats.size <= 1;
  }

  checkImageAvailability(products) {
    const withImages = products.filter(p => p.image).length;
    return withImages / products.length;
  }

  checkVariantSupport(products) {
    const withVariants = products.filter(p => p.variants && p.variants.length > 0).length;
    return withVariants > 0;
  }

  calculateLayoutConfidence(layout) {
    let confidence = 0.5;
    
    if (layout.product_count > 0) confidence += 0.2;
    if (layout.average_product_info_completeness > 0.7) confidence += 0.2;
    if (layout.price_display_consistency) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  extractPriceFormat(priceString) {
    const hasSymbol = /[$£€¥]/.test(priceString);
    const hasDecimals = /\.\d{2}/.test(priceString);
    return `${hasSymbol ? 'symbol' : 'no-symbol'}-${hasDecimals ? 'decimals' : 'no-decimals'}`;
  }

  extractAllSelectors(siteData) {
    const selectors = [];
    
    if (siteData.navigation) {
      siteData.navigation.mainMenu.forEach(item => {
        if (item.selector) selectors.push(item.selector);
      });
    }
    
    if (siteData.products) {
      siteData.products.forEach(product => {
        if (product.selector) selectors.push(product.selector);
      });
    }
    
    return [...new Set(selectors)];
  }

  calculateSelectorReliability(selector) {
    let score = 0.5;
    
    if (selector.includes('#')) score += 0.3;
    if (selector.includes('[data-')) score += 0.2;
    if (selector.includes('.') && !selector.includes(' ')) score += 0.1;
    if (selector.includes(':nth-child')) score -= 0.2;
    if (selector.length < 50) score += 0.1;
    
    return Math.max(0, Math.min(1, score));
  }

  identifyStabilityIndicators(selector) {
    const indicators = [];
    
    if (selector.includes('data-')) indicators.push('has_data_attributes');
    if (selector.includes('#')) indicators.push('has_id');
    if (selector.includes('role=')) indicators.push('has_semantic_role');
    if (/^[a-zA-Z]+$/.test(selector)) indicators.push('simple_tag');
    
    return indicators;
  }

  generateFallbackSelectors(selector) {
    const fallbacks = [];
    
    if (selector.includes('.')) {
      const className = selector.split('.')[1];
      fallbacks.push(`[class*="${className}"]`);
    }
    
    if (selector.includes('[')) {
      const tag = selector.split('[')[0];
      if (tag) fallbacks.push(tag);
    }
    
    return fallbacks;
  }

  calculateResponsiveScore(pageStructure) {
    let score = 0;
    if (pageStructure.hasViewportMeta) score += 0.3;
    if (pageStructure.mediaQueries > 0) score += 0.3;
    if (pageStructure.responsiveImages) score += 0.2;
    if (pageStructure.mobileNavigation) score += 0.2;
    return score;
  }

  cacheSiteTemplate(url, patterns) {
    const domain = new URL(url).hostname;
    this.siteTemplates.set(domain, {
      patterns,
      cached_at: new Date().toISOString(),
      usage_count: 0
    });
  }

  getSiteTemplate(url) {
    const domain = new URL(url).hostname;
    const template = this.siteTemplates.get(domain);
    
    if (template) {
      template.usage_count++;
      return template.patterns;
    }
    
    return null;
  }

  async loadPatterns() {
    this.logger.info('Pattern recognition system initialized');
    this.logger.info(`Loaded ${Object.keys(this.knownPatterns).length} pattern categories`);
  }

  async getSupportedSitesCount() {
    return this.supportedSites.size;
  }

  classifyFilterInteraction(patterns) {
    if (patterns.hasFilters) {
      return patterns.hasPagination ? 'ajax_filtering' : 'page_reload_filtering';
    }
    return 'no_filtering';
  }

  classifyPaginationStyle(patterns) {
    if (!patterns.hasPagination) return 'no_pagination';
    return 'numbered_pagination';
  }

  classifyCheckoutType(patterns) {
    if (!patterns.hasCheckout) return 'no_checkout';
    return patterns.hasUserAccount ? 'account_checkout' : 'guest_checkout';
  }
}

module.exports = PatternRecognition;