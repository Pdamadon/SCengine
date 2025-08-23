/**
 * TaxonomyDiscoveryProcessor
 * 
 * Analyzes navigation elements and classifies them into a structured taxonomy:
 * - Product categories (clothing, shoes, etc.)
 * - Brand collections
 * - Gender/demographic sections (men's, women's, kids)
 * - Featured collections (sale, new arrivals)
 * - Utility pages (account, support, etc.)
 * 
 * This helps understand site structure and prioritize scraping targets.
 */

class TaxonomyDiscoveryProcessor {
  constructor(options = {}) {
    this.options = {
      enableBrandDetection: options.enableBrandDetection !== false,
      enableCategoryClassification: options.enableCategoryClassification !== false,
      prioritizeProductPages: options.prioritizeProductPages !== false,
      ...options
    };

    // Classification patterns for different types of navigation elements
    this.classificationPatterns = {
      productCategories: [
        'clothing', 'shoes', 'accessories', 'bags', 'jewelry', 'watches',
        'shirts', 'pants', 'jeans', 'dresses', 'jackets', 'sweaters', 'coats',
        'sneakers', 'boots', 'sandals', 'heels', 'flats',
        'belts', 'hats', 'scarves', 'sunglasses', 'gloves', 'ties'
      ],
      
      genderDemographics: [
        'men', 'mens', "men's", 'women', 'womens', "women's", 
        'kids', 'children', 'boys', 'girls', 'unisex', 'baby'
      ],
      
      featuredCollections: [
        'sale', 'clearance', 'new arrivals', 'featured', 'trending', 
        'bestseller', 'limited', 'exclusive', 'gift', 'holiday', 'seasonal'
      ],
      
      brandIndicators: [
        'brand', 'designer', 'collection', 'label'
      ],
      
      utilityPages: [
        'account', 'login', 'register', 'cart', 'checkout', 'wishlist',
        'help', 'support', 'contact', 'about', 'store locator', 'shipping',
        'returns', 'size guide', 'customer service'
      ]
    };
  }

  /**
   * Process navigation data and create structured taxonomy
   */
  async processNavigationData(navigationData) {
    if (!navigationData || !navigationData.navigation) {
      return this.createEmptyTaxonomy();
    }

    const taxonomy = {
      productCategories: [],
      brandCollections: [],
      genderSections: [],
      featuredCollections: [],
      utilityPages: [],
      unclassified: [],
      metadata: {
        totalSections: navigationData.navigation.length,
        classificationConfidence: 0,
        processingDate: new Date().toISOString()
      }
    };

    // Classify each navigation section
    for (const section of navigationData.navigation) {
      const classification = this.classifyNavigationSection(section);
      
      switch (classification.type) {
        case 'product_category':
          taxonomy.productCategories.push({
            ...section,
            categoryType: classification.subtype,
            priority: this.calculateScrapingPriority(section),
            estimatedProducts: this.estimateProductCount(section)
          });
          break;
          
        case 'brand_collection':
          taxonomy.brandCollections.push({
            ...section,
            brandName: classification.brandName,
            priority: this.calculateScrapingPriority(section),
            estimatedProducts: this.estimateProductCount(section)
          });
          break;
          
        case 'gender_section':
          taxonomy.genderSections.push({
            ...section,
            genderTarget: classification.subtype,
            priority: this.calculateScrapingPriority(section),
            estimatedProducts: this.estimateProductCount(section)
          });
          break;
          
        case 'featured_collection':
          taxonomy.featuredCollections.push({
            ...section,
            collectionType: classification.subtype,
            priority: this.calculateScrapingPriority(section),
            estimatedProducts: this.estimateProductCount(section)
          });
          break;
          
        case 'utility_page':
          taxonomy.utilityPages.push({
            ...section,
            pageType: classification.subtype
          });
          break;
          
        default:
          taxonomy.unclassified.push({
            ...section,
            reason: classification.reason || 'No clear classification match'
          });
      }
    }

    // Calculate overall classification confidence
    const classifiedSections = taxonomy.productCategories.length + 
                              taxonomy.brandCollections.length + 
                              taxonomy.genderSections.length + 
                              taxonomy.featuredCollections.length + 
                              taxonomy.utilityPages.length;
    
    taxonomy.metadata.classificationConfidence = classifiedSections / navigationData.navigation.length;

    // Sort sections by priority within each category
    this.sortSectionsByPriority(taxonomy);

    // Return both the original navigation data and the taxonomy
    return {
      ...navigationData, // preserve original fields like navigation, strategy, etc.
      taxonomy: taxonomy  // add the classified taxonomy
    };
  }

  /**
   * Classify individual navigation section
   */
  classifyNavigationSection(section) {
    const name = section.name?.toLowerCase() || '';
    const url = section.url?.toLowerCase() || '';
    const text = `${name} ${url}`;

    // Check for utility pages first (lowest priority for scraping)
    if (this.matchesPatterns(text, this.classificationPatterns.utilityPages)) {
      return {
        type: 'utility_page',
        subtype: this.identifyUtilityPageType(text),
        confidence: 0.9
      };
    }

    // Check for featured collections
    if (this.matchesPatterns(text, this.classificationPatterns.featuredCollections)) {
      return {
        type: 'featured_collection',
        subtype: this.identifyFeaturedCollectionType(text),
        confidence: 0.8
      };
    }

    // Check for gender/demographic sections
    if (this.matchesPatterns(text, this.classificationPatterns.genderDemographics)) {
      return {
        type: 'gender_section',
        subtype: this.identifyGenderTarget(text),
        confidence: 0.85
      };
    }

    // Check for product categories
    if (this.matchesPatterns(text, this.classificationPatterns.productCategories)) {
      return {
        type: 'product_category',
        subtype: this.identifyProductCategoryType(text),
        confidence: 0.9
      };
    }

    // Check for brand collections (after other checks to avoid false positives)
    if (this.options.enableBrandDetection && this.isBrandCollection(section)) {
      return {
        type: 'brand_collection',
        brandName: this.extractBrandName(section),
        confidence: 0.7
      };
    }

    return {
      type: 'unclassified',
      reason: 'No classification pattern matched',
      confidence: 0
    };
  }

  /**
   * Check if text matches any patterns in a list
   */
  matchesPatterns(text, patterns) {
    return patterns.some(pattern => text.includes(pattern));
  }

  /**
   * Identify specific product category type
   */
  identifyProductCategoryType(text) {
    if (text.includes('clothing') || text.includes('apparel')) return 'clothing';
    if (text.includes('shoes') || text.includes('footwear')) return 'footwear';
    if (text.includes('accessories')) return 'accessories';
    if (text.includes('jewelry')) return 'jewelry';
    if (text.includes('bags') || text.includes('handbags')) return 'bags';
    if (text.includes('watches')) return 'watches';
    return 'general';
  }

  /**
   * Identify gender target
   */
  identifyGenderTarget(text) {
    if (text.includes('men') && !text.includes('women')) return 'mens';
    if (text.includes('women') && !text.includes('men')) return 'womens';
    if (text.includes('kids') || text.includes('children')) return 'kids';
    if (text.includes('unisex')) return 'unisex';
    return 'general';
  }

  /**
   * Identify featured collection type
   */
  identifyFeaturedCollectionType(text) {
    if (text.includes('sale') || text.includes('clearance')) return 'sale';
    if (text.includes('new') || text.includes('arrivals')) return 'new_arrivals';
    if (text.includes('featured') || text.includes('trending')) return 'featured';
    if (text.includes('gift')) return 'gift';
    if (text.includes('limited') || text.includes('exclusive')) return 'limited';
    return 'general';
  }

  /**
   * Identify utility page type
   */
  identifyUtilityPageType(text) {
    if (text.includes('account') || text.includes('login')) return 'account';
    if (text.includes('cart') || text.includes('checkout')) return 'shopping';
    if (text.includes('help') || text.includes('support')) return 'support';
    if (text.includes('about') || text.includes('contact')) return 'company';
    return 'general';
  }

  /**
   * Determine if section represents a brand collection
   */
  isBrandCollection(section) {
    const name = section.name || '';
    const url = section.url?.toLowerCase() || '';

    // Explicit brand indicators
    if (this.matchesPatterns(`${name} ${url}`, this.classificationPatterns.brandIndicators)) {
      return true;
    }

    // Check if it looks like a brand name (capitalized, not generic terms)
    const isBrandName = /^[A-Z][a-z]+(\\s+[A-Z&+][a-z]*)*$/.test(name) && 
                        !name.toLowerCase().includes('all ') && 
                        !name.toLowerCase().includes('new ') && 
                        !name.toLowerCase().includes('shop ') &&
                        !this.matchesPatterns(name.toLowerCase(), this.classificationPatterns.productCategories);

    return isBrandName;
  }

  /**
   * Extract brand name from section
   */
  extractBrandName(section) {
    return section.name || 'Unknown Brand';
  }

  /**
   * Calculate scraping priority (1-10 scale)
   */
  calculateScrapingPriority(section) {
    let priority = 5; // Base priority

    const name = section.name?.toLowerCase() || '';
    const url = section.url?.toLowerCase() || '';

    // Higher priority for product categories
    if (this.matchesPatterns(`${name} ${url}`, this.classificationPatterns.productCategories)) {
      priority += 3;
    }

    // Higher priority for broad categories
    if (name.includes('all') || name.includes('shop')) {
      priority += 2;
    }

    // Moderate priority for gender sections
    if (this.matchesPatterns(`${name} ${url}`, this.classificationPatterns.genderDemographics)) {
      priority += 1;
    }

    // Lower priority for sale/clearance
    if (name.includes('sale') || name.includes('clearance')) {
      priority += 1;
    }

    return Math.min(priority, 10);
  }

  /**
   * Estimate number of products in section
   */
  estimateProductCount(section) {
    const name = section.name?.toLowerCase() || '';
    const url = section.url?.toLowerCase() || '';

    // Estimation based on section type
    if (name.includes('all') || name.includes('shop')) return 200;
    if (this.matchesPatterns(`${name} ${url}`, this.classificationPatterns.productCategories)) return 80;
    if (name.includes('sale') || name.includes('clearance')) return 100;
    if (name.includes('new')) return 40;
    if (this.isBrandCollection(section)) return 25;
    
    return 15; // Default estimate
  }

  /**
   * Sort sections by priority within each category
   */
  sortSectionsByPriority(taxonomy) {
    taxonomy.productCategories.sort((a, b) => b.priority - a.priority);
    taxonomy.brandCollections.sort((a, b) => b.priority - a.priority);
    taxonomy.genderSections.sort((a, b) => b.priority - a.priority);
    taxonomy.featuredCollections.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Create empty taxonomy structure
   */
  createEmptyTaxonomy() {
    return {
      productCategories: [],
      brandCollections: [],
      genderSections: [],
      featuredCollections: [],
      utilityPages: [],
      unclassified: [],
      metadata: {
        totalSections: 0,
        classificationConfidence: 0,
        processingDate: new Date().toISOString()
      }
    };
  }
}

module.exports = TaxonomyDiscoveryProcessor;