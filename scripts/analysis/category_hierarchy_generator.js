#!/usr/bin/env node

const fs = require('fs');

// Hierarchy logger
const logger = {
  info: (...args) => console.log('[HIERARCHY]', ...args),
  error: (...args) => console.error('[HIERARCHY-ERROR]', ...args),
  warn: (...args) => console.warn('[HIERARCHY-WARN]', ...args)
};

class CategoryHierarchyGenerator {
  constructor() {
    this.deduplicatedData = null;
    this.hierarchyStructure = {
      metadata: {
        hierarchy_version: '1.0',
        total_canonical_categories: 0,
        hierarchy_levels: 4,
        generated_at: new Date().toISOString()
      },
      level_1_gender: {
        mens: { categories: [], subcategories: [] },
        womens: { categories: [], subcategories: [] },
        unisex: { categories: [], subcategories: [] }
      },
      level_2_product_types: {
        clothing: { parent_genders: [], categories: [], subcategories: [] },
        shoes: { parent_genders: [], categories: [], subcategories: [] },
        accessories: { parent_genders: [], categories: [], subcategories: [] },
        jewelry: { parent_genders: [], categories: [], subcategories: [] },
        lifestyle: { parent_genders: [], categories: [], subcategories: [] }
      },
      level_3_brands: [],
      level_4_promotions: [],
      hierarchy_paths: [],
      category_navigation_tree: {},
      multi_category_mappings: []
    };
  }

  async generateHierarchy() {
    console.log('\n🏗️ CATEGORY HIERARCHY GENERATOR');
    console.log('=================================');
    
    try {
      // Load deduplicated category data
      await this.loadDeduplicatedData();
      
      // Build 4-level hierarchy
      console.log('\n🎯 PHASE 1: Building Level 1 - Gender Demographics');
      this.buildGenderLevel();
      
      console.log('\n🎯 PHASE 2: Building Level 2 - Product Types');
      this.buildProductTypeLevel();
      
      console.log('\n🎯 PHASE 3: Building Level 3 - Brands');
      this.buildBrandLevel();
      
      console.log('\n🎯 PHASE 4: Building Level 4 - Promotions');
      this.buildPromotionLevel();
      
      console.log('\n🔗 PHASE 5: Generate hierarchy navigation paths');
      this.generateNavigationPaths();
      
      console.log('\n🌳 PHASE 6: Create category navigation tree');
      this.createNavigationTree();
      
      console.log('\n💾 PHASE 7: Save hierarchy structure');
      await this.saveHierarchy();
      
      this.generateHierarchyReport();
      
      return this.hierarchyStructure;
      
    } catch (error) {
      logger.error('Hierarchy generation failed:', error.message);
      throw error;
    }
  }

  async loadDeduplicatedData() {
    logger.info('Loading deduplicated category data');
    
    const timestamp = new Date().toISOString().slice(0,10);
    const dataPath = `results/data/glasswing_categories_deduplicated_${timestamp}.json`;
    
    if (!fs.existsSync(dataPath)) {
      throw new Error(`Deduplicated data not found at ${dataPath}. Run deduplication first.`);
    }
    
    this.deduplicatedData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    this.hierarchyStructure.metadata.total_canonical_categories = this.deduplicatedData.canonical_categories.length;
    
    logger.info(`Loaded ${this.deduplicatedData.canonical_categories.length} canonical categories`);
    logger.info(`Found ${this.deduplicatedData.multi_category_relationships.length} multi-category relationships`);
  }

  buildGenderLevel() {
    console.log('👥 Building gender demographics level...');
    
    const genderCategories = this.deduplicatedData.canonical_categories
      .filter(cat => cat.source_type === 'gender_demographics');
    
    genderCategories.forEach(category => {
      const genderType = this.classifyGenderType(category);
      
      if (this.hierarchyStructure.level_1_gender[genderType]) {
        this.hierarchyStructure.level_1_gender[genderType].categories.push({
          canonical_id: category.canonical_id,
          name: category.name,
          url: category.url,
          estimated_products: category.estimated_products || 15,
          subcategory_hints: this.extractGenderSubcategories(category)
        });
      }
    });
    
    // Calculate totals for each gender
    Object.keys(this.hierarchyStructure.level_1_gender).forEach(gender => {
      const genderData = this.hierarchyStructure.level_1_gender[gender];
      const categoryCount = genderData.categories.length;
      const totalProducts = genderData.categories.reduce((sum, cat) => sum + cat.estimated_products, 0);
      
      console.log(`   ${gender.toUpperCase()}: ${categoryCount} categories, ~${totalProducts} products`);
      
      genderData.summary = {
        category_count: categoryCount,
        estimated_total_products: totalProducts
      };
    });
  }

  classifyGenderType(category) {
    const lowerName = category.name.toLowerCase();
    const lowerUrl = category.url.toLowerCase();
    
    if (lowerName.includes('men') || lowerUrl.includes('men') || 
        lowerName.includes('mens') || lowerUrl.includes('mens')) {
      return 'mens';
    }
    
    if (lowerName.includes('women') || lowerUrl.includes('women') || 
        lowerName.includes('womens') || lowerUrl.includes('womens')) {
      return 'womens';
    }
    
    if (lowerName.includes('unisex') || lowerUrl.includes('unisex')) {
      return 'unisex';
    }
    
    // Default to unisex for ambiguous cases
    return 'unisex';
  }

  extractGenderSubcategories(category) {
    const hints = [];
    const lowerUrl = category.url.toLowerCase();
    const lowerName = category.name.toLowerCase();
    
    // Product type hints within gender categories
    if (lowerUrl.includes('clothing') || lowerName.includes('clothing')) hints.push('clothing');
    if (lowerUrl.includes('shoes') || lowerName.includes('shoes')) hints.push('shoes');
    if (lowerUrl.includes('accessories') || lowerName.includes('accessories')) hints.push('accessories');
    if (lowerUrl.includes('jewelry') || lowerName.includes('jewelry')) hints.push('jewelry');
    
    return hints;
  }

  buildProductTypeLevel() {
    console.log('🛍️ Building product type level...');
    
    const productCategories = this.deduplicatedData.canonical_categories
      .filter(cat => cat.source_type === 'product_categories');
    
    productCategories.forEach(category => {
      const productTypes = this.classifyProductTypes(category);
      const genderAffinity = this.determineGenderAffinity(category);
      
      productTypes.forEach(type => {
        if (this.hierarchyStructure.level_2_product_types[type]) {
          this.hierarchyStructure.level_2_product_types[type].categories.push({
            canonical_id: category.canonical_id,
            name: category.name,
            url: category.url,
            estimated_products: category.estimated_products || 15,
            gender_affinity: genderAffinity,
            brand_hints: this.extractBrandHints(category)
          });
          
          // Track which genders this product type serves
          genderAffinity.forEach(gender => {
            if (!this.hierarchyStructure.level_2_product_types[type].parent_genders.includes(gender)) {
              this.hierarchyStructure.level_2_product_types[type].parent_genders.push(gender);
            }
          });
        }
      });
    });
    
    // Calculate totals for each product type
    Object.keys(this.hierarchyStructure.level_2_product_types).forEach(type => {
      const typeData = this.hierarchyStructure.level_2_product_types[type];
      const categoryCount = typeData.categories.length;
      const totalProducts = typeData.categories.reduce((sum, cat) => sum + cat.estimated_products, 0);
      
      if (categoryCount > 0) {
        console.log(`   ${type.toUpperCase()}: ${categoryCount} categories, ~${totalProducts} products, serves: ${typeData.parent_genders.join(', ')}`);
      }
      
      typeData.summary = {
        category_count: categoryCount,
        estimated_total_products: totalProducts,
        gender_coverage: typeData.parent_genders
      };
    });
  }

  classifyProductTypes(category) {
    const lowerName = category.name.toLowerCase();
    const lowerUrl = category.url.toLowerCase();
    const types = [];
    
    // Clothing
    if (this.isClothingCategory(lowerName, lowerUrl)) {
      types.push('clothing');
    }
    
    // Shoes
    if (this.isShoeCategory(lowerName, lowerUrl)) {
      types.push('shoes');
    }
    
    // Accessories
    if (this.isAccessoryCategory(lowerName, lowerUrl)) {
      types.push('accessories');
    }
    
    // Jewelry
    if (this.isJewelryCategory(lowerName, lowerUrl)) {
      types.push('jewelry');
    }
    
    // Lifestyle (fragrance, home, etc.)
    if (this.isLifestyleCategory(lowerName, lowerUrl)) {
      types.push('lifestyle');
    }
    
    // Default to clothing if no specific type identified
    if (types.length === 0) {
      types.push('clothing');
    }
    
    return types;
  }

  isClothingCategory(name, url) {
    const clothingKeywords = [
      'clothing', 'shirts', 'pants', 'jeans', 'dresses', 'jackets', 
      'sweaters', 'coats', 'tops', 'bottoms', 'outerwear'
    ];
    return clothingKeywords.some(keyword => name.includes(keyword) || url.includes(keyword));
  }

  isShoeCategory(name, url) {
    const shoeKeywords = [
      'shoes', 'sneakers', 'boots', 'sandals', 'heels', 'flats', 'footwear'
    ];
    return shoeKeywords.some(keyword => name.includes(keyword) || url.includes(keyword));
  }

  isAccessoryCategory(name, url) {
    const accessoryKeywords = [
      'accessories', 'bags', 'belts', 'hats', 'scarves', 'sunglasses', 'gloves', 'watches'
    ];
    return accessoryKeywords.some(keyword => name.includes(keyword) || url.includes(keyword));
  }

  isJewelryCategory(name, url) {
    const jewelryKeywords = ['jewelry', 'rings', 'necklaces', 'earrings', 'bracelets'];
    return jewelryKeywords.some(keyword => name.includes(keyword) || url.includes(keyword));
  }

  isLifestyleCategory(name, url) {
    const lifestyleKeywords = [
      'fragrance', 'candles', 'bath', 'home', 'lifestyle', 'beauty', 'wellness'
    ];
    return lifestyleKeywords.some(keyword => name.includes(keyword) || url.includes(keyword));
  }

  determineGenderAffinity(category) {
    const lowerName = category.name.toLowerCase();
    const lowerUrl = category.url.toLowerCase();
    const affinities = [];
    
    if (lowerName.includes('men') || lowerUrl.includes('men') || 
        lowerName.includes('mens') || lowerUrl.includes('mens')) {
      affinities.push('mens');
    }
    
    if (lowerName.includes('women') || lowerUrl.includes('women') || 
        lowerName.includes('womens') || lowerUrl.includes('womens')) {
      affinities.push('womens');
    }
    
    if (lowerName.includes('unisex') || lowerUrl.includes('unisex')) {
      affinities.push('unisex');
    }
    
    // If no specific gender, assume it serves all
    if (affinities.length === 0) {
      affinities.push('mens', 'womens', 'unisex');
    }
    
    return affinities;
  }

  extractBrandHints(category) {
    // Extract brand hints from URL patterns
    const urlParts = category.url.toLowerCase().split('/');
    const hints = [];
    
    // Look for brand-like segments
    urlParts.forEach(part => {
      if (part.length > 2 && !this.isCommonUrlSegment(part)) {
        hints.push(part);
      }
    });
    
    return hints.slice(0, 3); // Limit to 3 hints
  }

  isCommonUrlSegment(segment) {
    const commonSegments = [
      'collections', 'products', 'category', 'shop', 'store', 'www', 'com',
      'mens', 'womens', 'unisex', 'clothing', 'shoes', 'accessories'
    ];
    return commonSegments.includes(segment);
  }

  buildBrandLevel() {
    console.log('🏷️ Building brand level...');
    
    const brandCategories = this.deduplicatedData.canonical_categories
      .filter(cat => cat.source_type === 'brands');
    
    brandCategories.forEach(category => {
      const brandInfo = {
        canonical_id: category.canonical_id,
        name: category.name,
        url: category.url,
        estimated_products: category.estimated_products || 15,
        gender_focus: this.determineBrandGenderFocus(category),
        product_focus: this.determineBrandProductFocus(category),
        multi_category_relationships: this.findBrandMultiCategoryRelationships(category),
        brand_tier: this.classifyBrandTier(category)
      };
      
      this.hierarchyStructure.level_3_brands.push(brandInfo);
    });
    
    // Sort brands by estimated products (influence)
    this.hierarchyStructure.level_3_brands.sort((a, b) => b.estimated_products - a.estimated_products);
    
    // Calculate brand statistics
    const totalBrands = this.hierarchyStructure.level_3_brands.length;
    const totalBrandProducts = this.hierarchyStructure.level_3_brands.reduce((sum, brand) => sum + brand.estimated_products, 0);
    const multiBrandCount = this.hierarchyStructure.level_3_brands.filter(b => b.multi_category_relationships.length > 0).length;
    
    console.log(`   BRANDS: ${totalBrands} total, ~${totalBrandProducts} products`);
    console.log(`   Multi-Category Brands: ${multiBrandCount} (${(multiBrandCount/totalBrands*100).toFixed(1)}%)`);
    
    this.hierarchyStructure.level_3_brands.summary = {
      total_brands: totalBrands,
      estimated_total_products: totalBrandProducts,
      multi_category_brands: multiBrandCount
    };
  }

  determineBrandGenderFocus(category) {
    const lowerUrl = category.url.toLowerCase();
    const lowerName = category.name.toLowerCase();
    
    if (lowerUrl.includes('mens') || lowerName.includes('mens') || 
        lowerUrl.includes('-men') || lowerName.includes(' men')) {
      return 'mens';
    }
    
    if (lowerUrl.includes('womens') || lowerName.includes('womens') || 
        lowerUrl.includes('-women') || lowerName.includes(' women')) {
      return 'womens';
    }
    
    return 'unisex';
  }

  determineBrandProductFocus(category) {
    const lowerUrl = category.url.toLowerCase();
    const lowerName = category.name.toLowerCase();
    
    if (lowerUrl.includes('clothing') || lowerName.includes('clothing')) return 'clothing';
    if (lowerUrl.includes('shoes') || lowerName.includes('shoes')) return 'shoes';
    if (lowerUrl.includes('accessories') || lowerName.includes('accessories')) return 'accessories';
    if (lowerUrl.includes('fragrance') || lowerUrl.includes('bath')) return 'lifestyle';
    
    return 'mixed';
  }

  findBrandMultiCategoryRelationships(category) {
    const relationships = this.deduplicatedData.multi_category_relationships || [];
    const brandRelationships = relationships.filter(rel => 
      rel.primary_category && rel.primary_category.canonical_id === category.canonical_id
    );
    
    return brandRelationships.map(rel => ({
      relationship_type: rel.relationship_type,
      additional_categories: rel.categories.filter(cat => cat.role === 'secondary').map(cat => cat.type),
      justification: rel.justification
    }));
  }

  classifyBrandTier(category) {
    const estimatedProducts = category.estimated_products || 15;
    
    if (estimatedProducts >= 50) return 'premium'; // Large collections
    if (estimatedProducts >= 25) return 'established'; // Medium collections
    return 'emerging'; // Smaller collections
  }

  buildPromotionLevel() {
    console.log('🎁 Building promotion level...');
    
    const promotionCategories = this.deduplicatedData.canonical_categories
      .filter(cat => cat.source_type === 'featured_collections');
    
    promotionCategories.forEach(category => {
      const promotionInfo = {
        canonical_id: category.canonical_id,
        name: category.name,
        url: category.url,
        estimated_products: category.estimated_products || 15,
        promotion_type: this.classifyPromotionType(category),
        seasonality: this.determinePromotionSeasonality(category),
        urgency_level: this.assessPromotionUrgency(category)
      };
      
      this.hierarchyStructure.level_4_promotions.push(promotionInfo);
    });
    
    // Sort promotions by urgency and estimated products
    this.hierarchyStructure.level_4_promotions.sort((a, b) => {
      const urgencyOrder = { 'high': 3, 'medium': 2, 'low': 1 };
      const urgencyDiff = urgencyOrder[b.urgency_level] - urgencyOrder[a.urgency_level];
      return urgencyDiff !== 0 ? urgencyDiff : b.estimated_products - a.estimated_products;
    });
    
    const totalPromotions = this.hierarchyStructure.level_4_promotions.length;
    const totalPromotionProducts = this.hierarchyStructure.level_4_promotions.reduce((sum, promo) => sum + promo.estimated_products, 0);
    
    console.log(`   PROMOTIONS: ${totalPromotions} total, ~${totalPromotionProducts} products`);
    
    this.hierarchyStructure.level_4_promotions.forEach(promo => {
      console.log(`     ${promo.name} (${promo.promotion_type}, ${promo.urgency_level} urgency)`);
    });
    
    this.hierarchyStructure.level_4_promotions.summary = {
      total_promotions: totalPromotions,
      estimated_total_products: totalPromotionProducts
    };
  }

  classifyPromotionType(category) {
    const lowerName = category.name.toLowerCase();
    const lowerUrl = category.url.toLowerCase();
    
    if (lowerName.includes('sale') || lowerUrl.includes('sale')) return 'sale';
    if (lowerName.includes('new arrivals') || lowerUrl.includes('new-arrivals')) return 'new_arrivals';
    if (lowerName.includes('gift') || lowerUrl.includes('gift')) return 'gift_guide';
    if (lowerName.includes('limited') || lowerUrl.includes('limited')) return 'limited_edition';
    if (lowerName.includes('featured') || lowerUrl.includes('featured')) return 'featured';
    
    return 'promotional';
  }

  determinePromotionSeasonality(category) {
    const lowerName = category.name.toLowerCase();
    const lowerUrl = category.url.toLowerCase();
    
    if (lowerName.includes('holiday') || lowerName.includes('christmas')) return 'winter';
    if (lowerName.includes('summer') || lowerName.includes('beach')) return 'summer';
    if (lowerName.includes('spring')) return 'spring';
    if (lowerName.includes('fall') || lowerName.includes('autumn')) return 'fall';
    
    return 'year_round';
  }

  assessPromotionUrgency(category) {
    const lowerName = category.name.toLowerCase();
    const lowerUrl = category.url.toLowerCase();
    
    if (lowerName.includes('sale') || lowerName.includes('clearance') || lowerName.includes('limited')) return 'high';
    if (lowerName.includes('new arrivals') || lowerName.includes('featured')) return 'medium';
    
    return 'low';
  }

  generateNavigationPaths() {
    console.log('🔗 Generating hierarchy navigation paths...');
    
    const paths = [];
    
    // Generate paths for different navigation scenarios
    // Path pattern: Gender → Product Type → Brand → Promotion
    
    // Gender-first paths
    Object.keys(this.hierarchyStructure.level_1_gender).forEach(gender => {
      const genderData = this.hierarchyStructure.level_1_gender[gender];
      
      genderData.categories.forEach(genderCategory => {
        // Find compatible product types
        Object.keys(this.hierarchyStructure.level_2_product_types).forEach(productType => {
          const typeData = this.hierarchyStructure.level_2_product_types[productType];
          
          if (typeData.parent_genders.includes(gender)) {
            // Find brands that serve this gender + product type combination
            const compatibleBrands = this.hierarchyStructure.level_3_brands.filter(brand => 
              (brand.gender_focus === gender || brand.gender_focus === 'unisex') &&
              (brand.product_focus === productType || brand.product_focus === 'mixed')
            );
            
            compatibleBrands.slice(0, 5).forEach(brand => { // Limit to top 5 brands per path
              const path = {
                path_id: `${gender}-${productType}-${brand.canonical_id}`,
                navigation_sequence: [
                  { level: 1, type: 'gender', category: genderCategory },
                  { level: 2, type: 'product_type', category: { name: productType, type: productType }},
                  { level: 3, type: 'brand', category: brand }
                ],
                estimated_products: Math.min(brand.estimated_products, 50), // Cap estimate
                path_type: 'gender_product_brand'
              };
              
              paths.push(path);
            });
          }
        });
      });
    });
    
    // Brand-first paths (for popular brands)
    const popularBrands = this.hierarchyStructure.level_3_brands.slice(0, 10); // Top 10 brands
    
    popularBrands.forEach(brand => {
      const path = {
        path_id: `brand-${brand.canonical_id}`,
        navigation_sequence: [
          { level: 3, type: 'brand', category: brand }
        ],
        estimated_products: brand.estimated_products,
        path_type: 'brand_direct',
        multi_category_info: brand.multi_category_relationships
      };
      
      paths.push(path);
    });
    
    // Promotion-first paths
    this.hierarchyStructure.level_4_promotions.forEach(promotion => {
      const path = {
        path_id: `promotion-${promotion.canonical_id}`,
        navigation_sequence: [
          { level: 4, type: 'promotion', category: promotion }
        ],
        estimated_products: promotion.estimated_products,
        path_type: 'promotion_direct'
      };
      
      paths.push(path);
    });
    
    this.hierarchyStructure.hierarchy_paths = paths;
    console.log(`   Generated ${paths.length} navigation paths`);
  }

  createNavigationTree() {
    console.log('🌳 Creating category navigation tree...');
    
    const tree = {
      root: {
        level_1_gender: {},
        level_2_product_types: {},
        level_3_brands: {},
        level_4_promotions: {},
        quick_access: {
          popular_brands: this.hierarchyStructure.level_3_brands.slice(0, 10),
          active_promotions: this.hierarchyStructure.level_4_promotions.filter(p => p.urgency_level === 'high'),
          top_categories: []
        }
      }
    };
    
    // Build hierarchical tree structure for UI navigation
    Object.entries(this.hierarchyStructure.level_1_gender).forEach(([gender, genderData]) => {
      tree.root.level_1_gender[gender] = {
        summary: genderData.summary,
        categories: genderData.categories,
        compatible_product_types: []
      };
      
      // Find product types compatible with this gender
      Object.entries(this.hierarchyStructure.level_2_product_types).forEach(([productType, typeData]) => {
        if (typeData.parent_genders.includes(gender)) {
          tree.root.level_1_gender[gender].compatible_product_types.push({
            type: productType,
            summary: typeData.summary
          });
        }
      });
    });
    
    // Add product types to tree
    Object.entries(this.hierarchyStructure.level_2_product_types).forEach(([type, typeData]) => {
      tree.root.level_2_product_types[type] = {
        summary: typeData.summary,
        categories: typeData.categories,
        parent_genders: typeData.parent_genders,
        compatible_brands: this.hierarchyStructure.level_3_brands.filter(brand => 
          brand.product_focus === type || brand.product_focus === 'mixed'
        ).slice(0, 10) // Top 10 brands per product type
      };
    });
    
    this.hierarchyStructure.category_navigation_tree = tree;
    console.log(`   Navigation tree created with ${Object.keys(tree.root).length} root branches`);
  }

  async saveHierarchy() {
    const timestamp = new Date().toISOString().slice(0,10);
    const outputPath = `results/data/glasswing_category_hierarchy_${timestamp}.json`;
    
    fs.writeFileSync(outputPath, JSON.stringify(this.hierarchyStructure, null, 2));
    
    console.log(`💾 Category hierarchy saved to: ${outputPath}`);
    this.hierarchyStructure.output_path = outputPath;
  }

  generateHierarchyReport() {
    console.log('\n📋 CATEGORY HIERARCHY COMPLETE - SUMMARY REPORT');
    console.log('===============================================');
    
    console.log('🏗️ HIERARCHY STRUCTURE:');
    console.log(`   Level 1 - Gender Demographics:`);
    Object.entries(this.hierarchyStructure.level_1_gender).forEach(([gender, data]) => {
      console.log(`     ${gender}: ${data.categories.length} categories, ~${data.summary?.estimated_total_products || 0} products`);
    });
    
    console.log(`   Level 2 - Product Types:`);
    Object.entries(this.hierarchyStructure.level_2_product_types).forEach(([type, data]) => {
      if (data.categories.length > 0) {
        console.log(`     ${type}: ${data.categories.length} categories, serves ${data.parent_genders.join(', ')}`);
      }
    });
    
    console.log(`   Level 3 - Brands: ${this.hierarchyStructure.level_3_brands.length} brands`);
    console.log(`   Level 4 - Promotions: ${this.hierarchyStructure.level_4_promotions.length} promotions`);
    
    console.log('\n🔗 NAVIGATION CAPABILITIES:');
    console.log(`   Total Navigation Paths: ${this.hierarchyStructure.hierarchy_paths.length}`);
    console.log(`   Multi-Category Relationships: ${this.hierarchyStructure.multi_category_mappings.length}`);
    
    const totalEstimatedProducts = 
      Object.values(this.hierarchyStructure.level_1_gender).reduce((sum, g) => sum + (g.summary?.estimated_total_products || 0), 0) +
      this.hierarchyStructure.level_3_brands.reduce((sum, b) => sum + b.estimated_products, 0) +
      this.hierarchyStructure.level_4_promotions.reduce((sum, p) => sum + p.estimated_products, 0);
    
    console.log(`   Estimated Total Products: ~${totalEstimatedProducts}`);
    
    console.log('\n📂 OUTPUT FILES:');
    console.log(`   📄 Category Hierarchy: ${this.hierarchyStructure.output_path}`);
    
    console.log('\n🚀 NEXT STEPS:');
    console.log('   1. Design multi-category database schema');
    console.log('   2. Update WorldModelPopulator for hierarchy support');
    console.log('   3. Implement fast multi-category queries');
    console.log('   4. Create category-aware scraper integration');
  }
}

async function runHierarchyGeneration() {
  const generator = new CategoryHierarchyGenerator();
  
  try {
    const results = await generator.generateHierarchy();
    
    console.log('\n🎉 CATEGORY HIERARCHY GENERATION COMPLETE!');
    console.log('Ready for Task 2.1: Design multi-category database schema');
    
    return results;
    
  } catch (error) {
    console.error('\n❌ Category hierarchy generation failed:', error.message);
    return null;
  }
}

if (require.main === module) {
  runHierarchyGeneration()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Hierarchy generation crashed:', error);
      process.exit(1);
    });
}

module.exports = { CategoryHierarchyGenerator };