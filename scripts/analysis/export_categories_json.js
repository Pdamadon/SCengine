#!/usr/bin/env node

const SiteIntelligence = require('../../src/intelligence/SiteIntelligence');
const fs = require('fs');

// Analysis logger
const logger = {
  info: (...args) => console.log('[EXPORT]', ...args),
  error: (...args) => console.error('[EXPORT-ERROR]', ...args),
  warn: (...args) => console.warn('[EXPORT-WARN]', ...args),
  debug: (...args) => {}
};

class CategoryExporter {
  constructor() {
    this.siteIntelligence = new SiteIntelligence(logger);
  }

  async exportGlasswingCategories() {
    console.log('\n🧠 EXPORTING GLASSWING CATEGORIES TO JSON');
    console.log('===========================================');
    
    try {
      // Initialize intelligence system
      await this.siteIntelligence.initialize();
      
      // Build navigation intelligence
      const baseUrl = 'https://glasswingshop.com';
      const navigationIntel = await this.siteIntelligence.navigationMapper.mapSiteNavigation(baseUrl);
      
      console.log(`📊 Discovered ${navigationIntel.main_sections.length} navigation sections`);
      
      // Create structured JSON output
      const categoryExport = {
        metadata: {
          site: 'glasswingshop.com',
          discovery_date: new Date().toISOString(),
          total_sections: navigationIntel.main_sections.length,
          intelligence_method: 'NavigationMapper + SiteIntelligence',
          categories_by_type: {}
        },
        raw_navigation: {
          main_sections: navigationIntel.main_sections,
          dropdown_menus: navigationIntel.dropdown_menus,
          clickable_elements: navigationIntel.clickable_elements,
          sidebar_navigation: navigationIntel.sidebar_navigation,
          breadcrumb_patterns: navigationIntel.breadcrumb_patterns
        },
        categorized_sections: this.categorizeAndStructure(navigationIntel.main_sections),
        category_hierarchy: this.buildCategoryHierarchy(navigationIntel.main_sections),
        brand_directory: this.extractBrandDirectory(navigationIntel.main_sections),
        product_categories: this.extractProductCategories(navigationIntel.main_sections),
        scraping_recommendations: this.generateScrapingRecommendations(navigationIntel.main_sections)
      };

      // Update metadata with category counts
      Object.keys(categoryExport.categorized_sections).forEach(categoryType => {
        categoryExport.metadata.categories_by_type[categoryType] = categoryExport.categorized_sections[categoryType].length;
      });

      // Save to JSON file
      const timestamp = new Date().toISOString().slice(0,10);
      const filename = `glasswing_categories_${timestamp}.json`;
      const filepath = `results/data/${filename}`;
      
      fs.writeFileSync(filepath, JSON.stringify(categoryExport, null, 2));
      
      console.log(`✅ Categories exported to: ${filepath}`);
      console.log(`📊 Summary:`);
      console.log(`   Product Categories: ${categoryExport.categorized_sections.product_categories.length}`);
      console.log(`   Brands: ${categoryExport.categorized_sections.brands.length}`);
      console.log(`   Gender/Demographics: ${categoryExport.categorized_sections.gender_demographics.length}`);
      console.log(`   Featured Collections: ${categoryExport.categorized_sections.featured_collections.length}`);
      console.log(`   Account/Service: ${categoryExport.categorized_sections.account_service.length}`);
      console.log(`   Company/Info: ${categoryExport.categorized_sections.company_info.length}`);
      console.log(`   Other: ${categoryExport.categorized_sections.other.length}`);
      
      await this.siteIntelligence.close();
      return filepath;
      
    } catch (error) {
      console.error('❌ Export failed:', error.message);
      await this.siteIntelligence.close();
      return null;
    }
  }

  categorizeAndStructure(sections) {
    const categorized = {
      product_categories: [],
      brands: [],
      gender_demographics: [],
      featured_collections: [],
      account_service: [],
      company_info: [],
      other: []
    };
    
    sections.forEach(section => {
      const name = section.name.toLowerCase();
      const url = section.url.toLowerCase();
      
      const categoryData = {
        name: section.name,
        url: section.url,
        has_dropdown: section.has_dropdown,
        selector: section.selector,
        element_type: section.element_type,
        category_type: '',
        subcategory_hints: this.extractSubcategoryHints(section.url),
        estimated_products: this.estimateProductCount(section.url, section.name)
      };
      
      if (this.isProductCategory(name, url)) {
        categoryData.category_type = 'product_category';
        categorized.product_categories.push(categoryData);
      } else if (this.isGenderDemographic(name, url)) {
        categoryData.category_type = 'gender_demographic';
        categorized.gender_demographics.push(categoryData);
      } else if (this.isBrand(name, url, section.name)) {
        categoryData.category_type = 'brand';
        categorized.brands.push(categoryData);
      } else if (this.isFeaturedCollection(name, url)) {
        categoryData.category_type = 'featured_collection';
        categorized.featured_collections.push(categoryData);
      } else if (this.isAccountService(name, url)) {
        categoryData.category_type = 'account_service';
        categorized.account_service.push(categoryData);
      } else if (this.isCompanyInfo(name, url)) {
        categoryData.category_type = 'company_info';
        categorized.company_info.push(categoryData);
      } else {
        categoryData.category_type = 'other';
        categorized.other.push(categoryData);
      }
    });
    
    return categorized;
  }

  buildCategoryHierarchy(sections) {
    const hierarchy = {
      root: {
        men: {
          clothing: [],
          shoes: [],
          accessories: [],
          brands: []
        },
        women: {
          clothing: [],
          shoes: [],
          jewelry: [],
          accessories: [],
          brands: []
        },
        unisex: {
          brands: [],
          collections: []
        },
        featured: {
          new_arrivals: [],
          sale: [],
          gift_guides: [],
          seasonal: []
        },
        lifestyle: {
          home: [],
          fragrance: [],
          bath_body: []
        }
      }
    };

    sections.forEach(section => {
      const url = section.url.toLowerCase();
      const name = section.name.toLowerCase();

      // Men's categories
      if (url.includes('/mens') || url.includes('-mens-') || name.includes("men's")) {
        if (url.includes('clothing') || name.includes('clothing')) {
          hierarchy.root.men.clothing.push(section);
        } else if (url.includes('shoes') || name.includes('shoes')) {
          hierarchy.root.men.shoes.push(section);
        } else if (url.includes('accessories') || name.includes('accessories')) {
          hierarchy.root.men.accessories.push(section);
        } else {
          hierarchy.root.men.brands.push(section);
        }
      }
      // Women's categories  
      else if (url.includes('/womens') || url.includes('-womens-') || name.includes("women's")) {
        if (url.includes('clothing') || name.includes('clothing')) {
          hierarchy.root.women.clothing.push(section);
        } else if (url.includes('shoes') || name.includes('shoes')) {
          hierarchy.root.women.shoes.push(section);
        } else if (url.includes('jewelry') || name.includes('jewelry')) {
          hierarchy.root.women.jewelry.push(section);
        } else if (url.includes('accessories') || name.includes('accessories')) {
          hierarchy.root.women.accessories.push(section);
        } else {
          hierarchy.root.women.brands.push(section);
        }
      }
      // Unisex
      else if (url.includes('unisex') || name.includes('unisex')) {
        hierarchy.root.unisex.brands.push(section);
      }
      // Featured collections
      else if (url.includes('new-arrivals') || name.includes('new arrivals')) {
        hierarchy.root.featured.new_arrivals.push(section);
      } else if (url.includes('sale') || name.includes('sale')) {
        hierarchy.root.featured.sale.push(section);
      } else if (url.includes('gift') || name.includes('gift')) {
        hierarchy.root.featured.gift_guides.push(section);
      }
      // Lifestyle
      else if (url.includes('fragrance') || url.includes('candles') || url.includes('bath')) {
        if (url.includes('fragrance')) {
          hierarchy.root.lifestyle.fragrance.push(section);
        } else if (url.includes('bath')) {
          hierarchy.root.lifestyle.bath_body.push(section);
        } else {
          hierarchy.root.lifestyle.home.push(section);
        }
      }
    });

    return hierarchy;
  }

  extractBrandDirectory(sections) {
    const brands = [];
    
    sections.forEach(section => {
      const name = section.name.toLowerCase();
      const url = section.url.toLowerCase();
      
      if (this.isBrand(name, url, section.name)) {
        const brandInfo = {
          brand_name: section.name,
          collection_url: section.url,
          gender_focus: this.determineBrandGenderFocus(section.url),
          category_focus: this.determineBrandCategoryFocus(section.url, section.name),
          selector: section.selector,
          estimated_products: this.estimateProductCount(section.url, section.name)
        };
        
        brands.push(brandInfo);
      }
    });

    // Remove duplicates and sort
    const uniqueBrands = brands.filter((brand, index, self) => 
      index === self.findIndex(b => b.brand_name === brand.brand_name && b.collection_url === brand.collection_url)
    ).sort((a, b) => a.brand_name.localeCompare(b.brand_name));

    return uniqueBrands;
  }

  extractProductCategories(sections) {
    const productCategories = [];
    
    sections.forEach(section => {
      const name = section.name.toLowerCase();
      const url = section.url.toLowerCase();
      
      if (this.isProductCategory(name, url)) {
        const categoryInfo = {
          category_name: section.name,
          category_url: section.url,
          category_type: this.determineProductCategoryType(name, url),
          gender_target: this.determineGenderTarget(url),
          selector: section.selector,
          estimated_products: this.estimateProductCount(section.url, section.name),
          scraping_priority: this.calculateScrapingPriority(section.url, section.name)
        };
        
        productCategories.push(categoryInfo);
      }
    });

    return productCategories.sort((a, b) => b.scraping_priority - a.scraping_priority);
  }

  generateScrapingRecommendations(sections) {
    const recommendations = {
      high_priority_categories: [],
      brand_collections: [],
      gender_segments: {
        mens: [],
        womens: [],
        unisex: []
      },
      featured_collections: [],
      scraping_strategy: {
        recommended_batch_size: 40,
        concurrent_processes: 6,
        estimated_total_products: 0,
        estimated_scraping_time_hours: 0
      }
    };

    let totalEstimatedProducts = 0;

    sections.forEach(section => {
      const url = section.url.toLowerCase();
      const name = section.name.toLowerCase();
      const estimatedProducts = this.estimateProductCount(section.url, section.name);
      totalEstimatedProducts += estimatedProducts;

      const categoryData = {
        name: section.name,
        url: section.url,
        estimated_products: estimatedProducts,
        scraping_priority: this.calculateScrapingPriority(section.url, section.name)
      };

      // High priority categories
      if (categoryData.scraping_priority > 8) {
        recommendations.high_priority_categories.push(categoryData);
      }

      // Brand collections
      if (this.isBrand(name, url, section.name)) {
        recommendations.brand_collections.push(categoryData);
      }

      // Gender segments
      if (url.includes('mens') || url.includes('-mens-')) {
        recommendations.gender_segments.mens.push(categoryData);
      } else if (url.includes('womens') || url.includes('-womens-')) {
        recommendations.gender_segments.womens.push(categoryData);
      } else if (url.includes('unisex')) {
        recommendations.gender_segments.unisex.push(categoryData);
      }

      // Featured collections
      if (this.isFeaturedCollection(name, url)) {
        recommendations.featured_collections.push(categoryData);
      }
    });

    // Calculate overall scraping strategy
    recommendations.scraping_strategy.estimated_total_products = totalEstimatedProducts;
    recommendations.scraping_strategy.estimated_scraping_time_hours = 
      (totalEstimatedProducts / (6 * 0.8 * 3600)).toFixed(1); // 6 processes, 0.8 products/second

    // Sort recommendations by priority
    recommendations.high_priority_categories.sort((a, b) => b.scraping_priority - a.scraping_priority);
    recommendations.brand_collections.sort((a, b) => b.estimated_products - a.estimated_products);

    return recommendations;
  }

  // Helper methods (category classification)
  isProductCategory(name, url) {
    const categoryKeywords = [
      'clothing', 'shoes', 'accessories', 'bags', 'jewelry', 'watches',
      'shirts', 'pants', 'jeans', 'dresses', 'jackets', 'sweaters', 'coats',
      'sneakers', 'boots', 'sandals', 'heels', 'flats',
      'belts', 'hats', 'scarves', 'sunglasses', 'gloves'
    ];
    return categoryKeywords.some(keyword => name.includes(keyword) || url.includes(keyword));
  }

  isGenderDemographic(name, url) {
    const genderKeywords = ['men', 'women', 'mens', 'womens', 'unisex', 'kids', 'children'];
    return genderKeywords.some(keyword => name.includes(keyword) || url.includes(keyword));
  }

  isBrand(name, url, sectionName) {
    const brandKeywords = ['brand', 'designer', 'label'];
    
    // Exclude non-brand categories first
    const lowerName = name.toLowerCase();
    const lowerUrl = url.toLowerCase();
    
    // Not a brand if it's clearly a product category
    if (this.isProductCategory(lowerName, lowerUrl)) return false;
    if (this.isFeaturedCollection(lowerName, lowerUrl)) return false;
    
    // Check for explicit brand keywords
    if (brandKeywords.some(keyword => lowerName.includes(keyword) || lowerUrl.includes(keyword))) return true;
    
    // Check if it looks like a brand name (capitalized words, not generic terms)
    const isBrandName = /^[A-Z][a-z]+(\s+[A-Z&+][a-z]*)*$/.test(sectionName || '') && 
                        !lowerName.includes('all ') && 
                        !lowerName.includes('new ') && 
                        !lowerName.includes('shop ') &&
                        !lowerName.includes('clothing') &&
                        !lowerName.includes('shoes') &&
                        !lowerName.includes('accessories');
    
    // Additional brand patterns (many fashion brands have specific patterns)
    const brandPatterns = [
      /^[A-Z]{2,}(\s|$)/, // All caps brands (MAN-TLE, etc.)
      /\s&\s/, // Brands with & (D.S. & Durga)
      /\s\+\s/, // Brands with + (History + Industry)
      /^[0-9]+\s/, // Numbered brands (7115 by Szeki)
    ];
    
    const matchesBrandPattern = brandPatterns.some(pattern => pattern.test(sectionName || ''));
    
    return isBrandName || matchesBrandPattern;
  }

  isFeaturedCollection(name, url) {
    // Only true promotional/special collections, not brand collections
    const featuredKeywords = [
      'new arrivals', 'featured', 'trending', 'popular', 'sale', 'clearance',
      'limited', 'exclusive', 'season', 'holiday', 'gift', 'all sale'
    ];
    
    // More specific matching - avoid catching brand collections
    const lowerName = name.toLowerCase();
    const lowerUrl = url.toLowerCase();
    
    // Specific promotional patterns
    if (lowerName.includes('new arrivals') || lowerUrl.includes('new-arrivals')) return true;
    if (lowerName.includes('sale') || lowerUrl.includes('sale')) return true;
    if (lowerName.includes('gift') || lowerUrl.includes('gift')) return true;
    if (lowerName.includes('clearance') || lowerUrl.includes('clearance')) return true;
    if (lowerName.includes('featured') || lowerUrl.includes('featured')) return true;
    if (lowerName.includes('limited') || lowerUrl.includes('limited')) return true;
    
    // Avoid generic 'collection' which catches brand collections
    return false;
  }

  isAccountService(name, url) {
    const serviceKeywords = [
      'account', 'login', 'register', 'profile', 'wishlist', 'cart', 'checkout',
      'order', 'shipping', 'return', 'help', 'support', 'customer', 'service'
    ];
    return serviceKeywords.some(keyword => name.includes(keyword) || url.includes(keyword));
  }

  isCompanyInfo(name, url) {
    const companyKeywords = [
      'about', 'story', 'contact', 'store', 'location', 'careers', 'press',
      'blog', 'news', 'sustainability', 'privacy', 'terms', 'policy'
    ];
    return companyKeywords.some(keyword => name.includes(keyword) || url.includes(keyword));
  }

  // Helper methods (analysis)
  extractSubcategoryHints(url) {
    const hints = [];
    if (url.includes('/mens')) hints.push('mens');
    if (url.includes('/womens')) hints.push('womens');
    if (url.includes('clothing')) hints.push('clothing');
    if (url.includes('shoes')) hints.push('shoes');
    if (url.includes('accessories')) hints.push('accessories');
    if (url.includes('sale')) hints.push('sale');
    if (url.includes('new')) hints.push('new_arrivals');
    return hints;
  }

  estimateProductCount(url, name) {
    // Estimation based on category type and URL patterns
    if (url.includes('all-') || name.toLowerCase().includes('all ')) return 200;
    if (url.includes('clothing') || name.toLowerCase().includes('clothing')) return 80;
    if (url.includes('shoes') || name.toLowerCase().includes('shoes')) return 50;
    if (url.includes('accessories')) return 30;
    if (url.includes('sale')) return 100;
    if (url.includes('new-arrivals')) return 40;
    if (url.includes('collection')) return 25;
    return 15; // Default brand/specific collection
  }

  calculateScrapingPriority(url, name) {
    let priority = 5; // Base priority
    
    if (url.includes('all-') || name.toLowerCase().includes('all ')) priority += 3;
    if (url.includes('clothing')) priority += 2;
    if (url.includes('shoes')) priority += 2;
    if (url.includes('new-arrivals')) priority += 2;
    if (url.includes('sale')) priority += 1;
    if (url.includes('mens') || url.includes('womens')) priority += 1;
    
    return Math.min(priority, 10); // Max priority 10
  }

  determineBrandGenderFocus(url) {
    if (url.includes('mens') || url.includes('-mens-')) return 'mens';
    if (url.includes('womens') || url.includes('-womens-')) return 'womens';
    if (url.includes('unisex')) return 'unisex';
    return 'general';
  }

  determineBrandCategoryFocus(url, name) {
    if (url.includes('clothing') || name.toLowerCase().includes('clothing')) return 'clothing';
    if (url.includes('shoes') || name.toLowerCase().includes('shoes')) return 'shoes';
    if (url.includes('accessories')) return 'accessories';
    if (url.includes('fragrance') || url.includes('bath')) return 'lifestyle';
    return 'mixed';
  }

  determineProductCategoryType(name, url) {
    if (name.includes('clothing') || url.includes('clothing')) return 'clothing';
    if (name.includes('shoes') || url.includes('shoes')) return 'shoes';
    if (name.includes('accessories')) return 'accessories';
    if (name.includes('jewelry')) return 'jewelry';
    return 'general';
  }

  determineGenderTarget(url) {
    if (url.includes('mens') || url.includes('-mens-')) return 'mens';
    if (url.includes('womens') || url.includes('-womens-')) return 'womens';
    if (url.includes('unisex')) return 'unisex';
    return 'all';
  }
}

async function exportCategoriesToJSON() {
  const exporter = new CategoryExporter();
  const filepath = await exporter.exportGlasswingCategories();
  
  if (filepath) {
    console.log(`\n🎉 SUCCESS! Categories exported to: ${filepath}`);
    console.log(`📖 Use this JSON for category-aware scraping configuration.`);
  } else {
    console.log(`\n❌ Export failed. Check logs for details.`);
  }
}

if (require.main === module) {
  exportCategoriesToJSON()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Export crashed:', error);
      process.exit(1);
    });
}

module.exports = { CategoryExporter };