#!/usr/bin/env node

const fs = require('fs');

// Deduplication logger
const logger = {
  info: (...args) => console.log('[DEDUPLICATION]', ...args),
  error: (...args) => console.error('[DEDUP-ERROR]', ...args),
  warn: (...args) => console.warn('[DEDUP-WARN]', ...args)
};

class CategoryDeduplicationEngine {
  constructor() {
    this.duplicateAnalysisData = null;
    this.originalCategoryData = null;
    this.cleanCategoryStructure = {
      canonical_categories: [],
      multi_category_relationships: [],
      deduplication_stats: {
        original_count: 0,
        duplicate_urls_removed: 0,
        cross_category_conflicts_resolved: 0,
        multi_category_relationships_preserved: 0,
        final_canonical_count: 0
      }
    };
  }

  async performDeduplication() {
    console.log('\n🔧 CATEGORY DEDUPLICATION ENGINE');
    console.log('==================================');
    
    try {
      // Load analysis data and original categories
      await this.loadInputData();
      
      // Execute deduplication phases
      console.log('\n📋 PHASE 1: URL-based deduplication');
      this.deduplicateUrls();
      
      console.log('\n⚡ PHASE 2: Cross-category conflict resolution');
      this.resolveCrossCategoryConflicts();
      
      console.log('\n🔗 PHASE 3: Multi-category relationship preservation');
      this.preserveValidMultiCategoryRelationships();
      
      console.log('\n🏗️ PHASE 4: Generate canonical category structure');
      this.generateCanonicalStructure();
      
      console.log('\n💾 PHASE 5: Save deduplicated results');
      await this.saveResults();
      
      this.generateDeduplicationReport();
      
      return this.cleanCategoryStructure;
      
    } catch (error) {
      logger.error('Deduplication failed:', error.message);
      throw error;
    }
  }

  async loadInputData() {
    logger.info('Loading analysis and category data');
    
    // Load duplicate analysis results
    const timestamp = new Date().toISOString().slice(0,10);
    const analysisPath = `results/data/category_duplicate_analysis_${timestamp}.json`;
    
    if (!fs.existsSync(analysisPath)) {
      throw new Error(`Analysis data not found at ${analysisPath}. Run duplicate analysis first.`);
    }
    
    this.duplicateAnalysisData = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
    
    // Load original category data
    const categoryPath = `results/data/glasswing_categories_${timestamp}.json`;
    if (!fs.existsSync(categoryPath)) {
      throw new Error(`Category data not found at ${categoryPath}`);
    }
    
    this.originalCategoryData = JSON.parse(fs.readFileSync(categoryPath, 'utf8'));
    this.cleanCategoryStructure.deduplication_stats.original_count = this.originalCategoryData.metadata.total_sections;
    
    logger.info(`Loaded ${this.duplicateAnalysisData.summary.duplicate_urls} duplicate URLs`);
    logger.info(`Loaded ${this.duplicateAnalysisData.summary.cross_category_conflicts} cross-category conflicts`);
  }

  deduplicateUrls() {
    console.log('🔗 Removing duplicate URLs by selecting best category classification...');
    
    const urlResolutions = new Map();
    
    this.duplicateAnalysisData.duplicate_urls.forEach(duplicate => {
      const bestCategory = this.selectBestCategoryForUrl(duplicate);
      urlResolutions.set(duplicate.url, bestCategory);
      
      console.log(`   Resolved: ${duplicate.url}`);
      console.log(`      Best Classification: ${bestCategory.source_type} - "${bestCategory.name}"`);
      console.log(`      Eliminated: ${duplicate.count - 1} duplicates`);
    });
    
    this.cleanCategoryStructure.url_resolutions = Array.from(urlResolutions.entries()).map(([url, category]) => ({
      url: url,
      selected_category: category,
      eliminated_duplicates: this.duplicateAnalysisData.duplicate_urls.find(d => d.url === url).count - 1
    }));
    
    this.cleanCategoryStructure.deduplication_stats.duplicate_urls_removed = 
      this.duplicateAnalysisData.duplicate_urls.reduce((total, dup) => total + (dup.count - 1), 0);
    
    console.log(`✅ Eliminated ${this.cleanCategoryStructure.deduplication_stats.duplicate_urls_removed} duplicate URLs`);
  }

  selectBestCategoryForUrl(duplicate) {
    // Priority order for category types (higher priority = better classification)
    const typePriority = {
      'product_categories': 10,    // Product categories are most specific
      'featured_collections': 9,   // Promotional collections are important
      'brands': 8,                 // Brand collections are valuable
      'gender_demographics': 7,    // Gender-specific collections
      'other': 5,                  // Other classifications
      'account_service': 2,        // Service pages are low priority
      'company_info': 1            // Info pages are lowest
    };
    
    // Find the category with highest priority
    let bestCategory = duplicate.items[0];
    let bestPriority = typePriority[bestCategory.source_type] || 0;
    
    duplicate.items.forEach(item => {
      const priority = typePriority[item.source_type] || 0;
      
      // Also consider URL specificity (more specific URLs are better)
      const urlSpecificity = this.calculateUrlSpecificity(item.url);
      const totalScore = priority + (urlSpecificity * 0.1);
      
      if (totalScore > bestPriority) {
        bestCategory = item;
        bestPriority = totalScore;
      }
    });
    
    return bestCategory;
  }

  calculateUrlSpecificity(url) {
    // More path segments = more specific URL
    const segments = url.split('/').filter(s => s.length > 0);
    return segments.length;
  }

  resolveCrossCategoryConflicts() {
    console.log('⚡ Resolving cross-category conflicts...');
    
    const conflictResolutions = [];
    const highPriorityConflicts = this.duplicateAnalysisData.cross_category_conflicts
      .filter(conflict => conflict.severity === 'HIGH');
    
    highPriorityConflicts.forEach(conflict => {
      const resolution = this.resolveSpecificConflict(conflict);
      conflictResolutions.push(resolution);
      
      console.log(`   Resolved conflict: "${conflict.name}"`);
      console.log(`      Types: ${conflict.types.join(', ')} → ${resolution.final_classification}`);
      console.log(`      Strategy: ${resolution.strategy}`);
    });
    
    this.cleanCategoryStructure.conflict_resolutions = conflictResolutions;
    this.cleanCategoryStructure.deduplication_stats.cross_category_conflicts_resolved = conflictResolutions.length;
    
    console.log(`✅ Resolved ${conflictResolutions.length} high-priority conflicts`);
  }

  resolveSpecificConflict(conflict) {
    const { name, types, items } = conflict;
    
    // Resolution strategies based on conflict type combinations
    if (types.includes('brands') && types.includes('featured_collections')) {
      // Brand vs Promotion: Keep as brand, mark promotional status
      const brandItem = items.find(i => i.source_type === 'brands');
      const promoItem = items.find(i => i.source_type === 'featured_collections');
      
      return {
        conflict_name: name,
        final_classification: 'brands',
        selected_item: brandItem,
        strategy: 'Brand takes precedence, promotional context preserved as metadata',
        promotional_metadata: {
          is_promotional: true,
          promotion_type: promoItem ? this.extractPromotionType(promoItem.url) : null
        }
      };
    }
    
    if (types.includes('product_categories') && types.includes('brands')) {
      // Product vs Brand: Keep as product category (more specific)
      const productItem = items.find(i => i.source_type === 'product_categories');
      
      return {
        conflict_name: name,
        final_classification: 'product_categories',
        selected_item: productItem,
        strategy: 'Product category is more specific than brand classification'
      };
    }
    
    // Default: Select highest priority type
    const typePriority = {
      'product_categories': 10,
      'featured_collections': 9,
      'brands': 8,
      'gender_demographics': 7
    };
    
    const bestType = types.reduce((best, type) => 
      (typePriority[type] || 0) > (typePriority[best] || 0) ? type : best
    );
    
    const selectedItem = items.find(i => i.source_type === bestType);
    
    return {
      conflict_name: name,
      final_classification: bestType,
      selected_item: selectedItem,
      strategy: 'Selected highest priority category type'
    };
  }

  extractPromotionType(url) {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('sale')) return 'sale';
    if (lowerUrl.includes('new-arrivals')) return 'new_arrivals';
    if (lowerUrl.includes('gift')) return 'gift_guide';
    if (lowerUrl.includes('limited')) return 'limited_edition';
    return 'promotional';
  }

  preserveValidMultiCategoryRelationships() {
    console.log('🔗 Preserving valid multi-category relationships...');
    
    const validRelationships = [];
    
    // Identify brand collections that legitimately appear in multiple contexts
    const brandGenderRelationships = this.identifyBrandGenderRelationships();
    validRelationships.push(...brandGenderRelationships);
    
    // Identify products that should appear in multiple product categories
    const productCategoryRelationships = this.identifyProductCategoryRelationships();
    validRelationships.push(...productCategoryRelationships);
    
    this.cleanCategoryStructure.multi_category_relationships = validRelationships;
    this.cleanCategoryStructure.deduplication_stats.multi_category_relationships_preserved = validRelationships.length;
    
    console.log(`✅ Preserved ${validRelationships.length} valid multi-category relationships`);
    
    validRelationships.forEach(rel => {
      console.log(`   "${rel.name}": ${rel.categories.map(c => c.type).join(' + ')}`);
    });
  }

  identifyBrandGenderRelationships() {
    const relationships = [];
    const nameGroups = new Map();
    
    // Group categories by name
    Object.entries(this.originalCategoryData.categorized_sections).forEach(([type, categories]) => {
      categories.forEach(category => {
        const normalizedName = category.name.toLowerCase();
        if (!nameGroups.has(normalizedName)) {
          nameGroups.set(normalizedName, []);
        }
        nameGroups.get(normalizedName).push({ ...category, source_type: type });
      });
    });
    
    // Find valid brand + gender combinations
    nameGroups.forEach((items, name) => {
      const types = [...new Set(items.map(i => i.source_type))];
      
      // Valid pattern: Brand + Gender Demographics
      if (types.includes('brands') && types.includes('gender_demographics')) {
        const brandItem = items.find(i => i.source_type === 'brands');
        const genderItems = items.filter(i => i.source_type === 'gender_demographics');
        
        // Only preserve if this represents a legitimate brand with gender-specific collections
        if (this.isLegitimateMultiCategoryBrand(name, brandItem, genderItems)) {
          relationships.push({
            name: name,
            relationship_type: 'brand_gender',
            primary_category: brandItem,
            categories: [
              { type: 'brands', item: brandItem, role: 'primary' },
              ...genderItems.map(item => ({ type: 'gender_demographics', item: item, role: 'secondary' }))
            ],
            justification: 'Brand with legitimate gender-specific collections'
          });
        }
      }
    });
    
    return relationships;
  }

  isLegitimateMultiCategoryBrand(name, brandItem, genderItems) {
    // Check if this represents a real brand with gender-specific variants
    const lowerName = name.toLowerCase();
    
    // Fashion brands commonly have men's/women's specific collections
    const fashionBrandIndicators = [
      'brain dead', 'kapital', '7115', 'beams', 'needles', 'visvim', 'stone island',
      'comme des garcons', 'yohji yamamoto', 'issey miyake', 'junya watanabe'
    ];
    
    const isFashionBrand = fashionBrandIndicators.some(brand => lowerName.includes(brand));
    
    // Check URL patterns - legitimate brands have consistent URL structure
    const hasConsistentUrlPattern = genderItems.every(genderItem => {
      const brandPath = brandItem.url.toLowerCase();
      const genderPath = genderItem.url.toLowerCase();
      
      // Gender-specific versions should reference the brand in the URL
      return genderPath.includes(lowerName.replace(/\s+/g, '-')) || 
             genderPath.includes(brandPath.split('/').pop());
    });
    
    return isFashionBrand && hasConsistentUrlPattern && genderItems.length <= 3; // Reasonable number of gender variants
  }

  identifyProductCategoryRelationships() {
    // For now, focus on brand-gender relationships
    // Product category multi-relationships can be added in future iterations
    return [];
  }

  generateCanonicalStructure() {
    console.log('🏗️ Generating canonical category structure...');
    
    const canonicalCategories = new Map();
    const processedUrls = new Set();
    
    // Start with all original categories
    Object.entries(this.originalCategoryData.categorized_sections).forEach(([type, categories]) => {
      categories.forEach(category => {
        const key = `${category.url}|${type}`;
        
        if (!processedUrls.has(category.url)) {
          // Check if this URL was deduplicated
          const urlResolution = this.cleanCategoryStructure.url_resolutions?.find(r => r.url === category.url.toLowerCase());
          
          if (urlResolution) {
            // Use the resolved category classification
            if (urlResolution.selected_category.url === category.url) {
              canonicalCategories.set(key, {
                ...category,
                source_type: type,
                canonical_id: this.generateCanonicalId(category.name, type),
                deduplication_notes: `Selected from ${urlResolution.eliminated_duplicates + 1} duplicates`
              });
              processedUrls.add(category.url);
            }
            // Skip other duplicates
          } else {
            // No duplicates, include as-is
            canonicalCategories.set(key, {
              ...category,
              source_type: type,
              canonical_id: this.generateCanonicalId(category.name, type)
            });
            processedUrls.add(category.url);
          }
        }
      });
    });
    
    // Apply conflict resolutions
    this.cleanCategoryStructure.conflict_resolutions?.forEach(resolution => {
      const key = `${resolution.selected_item.url}|${resolution.final_classification}`;
      if (canonicalCategories.has(key)) {
        const category = canonicalCategories.get(key);
        category.conflict_resolution = resolution;
        category.promotional_metadata = resolution.promotional_metadata;
      }
    });
    
    this.cleanCategoryStructure.canonical_categories = Array.from(canonicalCategories.values());
    this.cleanCategoryStructure.deduplication_stats.final_canonical_count = this.cleanCategoryStructure.canonical_categories.length;
    
    console.log(`✅ Generated ${this.cleanCategoryStructure.canonical_categories.length} canonical categories`);
  }

  generateCanonicalId(name, type) {
    // Generate consistent, URL-safe canonical ID
    const cleanName = name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
    
    return `${type}_${cleanName}`;
  }

  async saveResults() {
    const timestamp = new Date().toISOString().slice(0,10);
    const outputPath = `results/data/glasswing_categories_deduplicated_${timestamp}.json`;
    
    const outputData = {
      metadata: {
        site: 'glasswingshop.com',
        deduplication_date: new Date().toISOString(),
        original_category_count: this.cleanCategoryStructure.deduplication_stats.original_count,
        final_canonical_count: this.cleanCategoryStructure.deduplication_stats.final_canonical_count,
        deduplication_method: 'Smart deduplication preserving multi-category relationships',
        version: '1.0'
      },
      deduplication_stats: this.cleanCategoryStructure.deduplication_stats,
      canonical_categories: this.cleanCategoryStructure.canonical_categories,
      multi_category_relationships: this.cleanCategoryStructure.multi_category_relationships,
      url_resolutions: this.cleanCategoryStructure.url_resolutions || [],
      conflict_resolutions: this.cleanCategoryStructure.conflict_resolutions || [],
      category_hierarchy: this.buildFinalCategoryHierarchy()
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    
    console.log(`💾 Deduplicated categories saved to: ${outputPath}`);
    this.cleanCategoryStructure.output_path = outputPath;
  }

  buildFinalCategoryHierarchy() {
    // Group canonical categories by type for final hierarchy
    const hierarchy = {
      product_categories: [],
      brands: [],
      gender_demographics: [],
      featured_collections: [],
      other: []
    };
    
    this.cleanCategoryStructure.canonical_categories.forEach(category => {
      const type = category.source_type;
      if (hierarchy[type]) {
        hierarchy[type].push({
          canonical_id: category.canonical_id,
          name: category.name,
          url: category.url,
          estimated_products: category.estimated_products || 15
        });
      }
    });
    
    return hierarchy;
  }

  generateDeduplicationReport() {
    console.log('\n📋 DEDUPLICATION COMPLETE - SUMMARY REPORT');
    console.log('==========================================');
    
    const stats = this.cleanCategoryStructure.deduplication_stats;
    
    console.log('📊 DEDUPLICATION STATISTICS:');
    console.log(`   Original Categories: ${stats.original_count}`);
    console.log(`   Duplicate URLs Removed: ${stats.duplicate_urls_removed}`);
    console.log(`   Cross-Category Conflicts Resolved: ${stats.cross_category_conflicts_resolved}`);
    console.log(`   Multi-Category Relationships Preserved: ${stats.multi_category_relationships_preserved}`);
    console.log(`   Final Canonical Categories: ${stats.final_canonical_count}`);
    console.log(`   Net Reduction: ${stats.original_count - stats.final_canonical_count} categories`);
    
    const reductionPercentage = ((stats.original_count - stats.final_canonical_count) / stats.original_count * 100).toFixed(1);
    console.log(`   Deduplication Efficiency: ${reductionPercentage}% reduction`);
    
    console.log('\n🎯 QUALITY IMPROVEMENTS:');
    console.log(`   ✅ Eliminated ${stats.duplicate_urls_removed} URL duplicates`);
    console.log(`   ✅ Resolved ${stats.cross_category_conflicts_resolved} classification conflicts`);
    console.log(`   ✅ Preserved ${stats.multi_category_relationships_preserved} valid multi-category relationships`);
    console.log(`   ✅ Generated canonical IDs for all categories`);
    
    console.log('\n📂 OUTPUT FILES:');
    console.log(`   📄 Deduplicated Categories: ${this.cleanCategoryStructure.output_path}`);
    
    console.log('\n🚀 NEXT STEPS:');
    console.log('   1. Review canonical category structure');
    console.log('   2. Generate 4-level category hierarchy');
    console.log('   3. Update database schema for multi-category support');
    console.log('   4. Implement category-aware world model');
  }
}

async function runCategoryDeduplication() {
  const engine = new CategoryDeduplicationEngine();
  
  try {
    const results = await engine.performDeduplication();
    
    console.log('\n🎉 CATEGORY DEDUPLICATION COMPLETE!');
    console.log('Ready for Task 1.3: Generate clean category hierarchy');
    
    return results;
    
  } catch (error) {
    console.error('\n❌ Category deduplication failed:', error.message);
    return null;
  }
}

if (require.main === module) {
  runCategoryDeduplication()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Deduplication crashed:', error);
      process.exit(1);
    });
}

module.exports = { CategoryDeduplicationEngine };