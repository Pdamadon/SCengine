#!/usr/bin/env node

const fs = require('fs');

// Analysis logger
const logger = {
  info: (...args) => console.log('[DUPLICATE-ANALYSIS]', ...args),
  error: (...args) => console.error('[DUPLICATE-ERROR]', ...args),
  warn: (...args) => console.warn('[DUPLICATE-WARN]', ...args)
};

class CategoryDuplicateAnalyzer {
  constructor() {
    this.analysisResults = {
      duplicateNames: [],
      duplicateUrls: [],
      crossCategoryConflicts: [],
      recommendations: []
    };
  }

  async analyzeDuplicates() {
    console.log('\n🔍 CATEGORY DUPLICATE ANALYSIS');
    console.log('===============================');
    
    try {
      // Load the current category data
      const categoryData = JSON.parse(
        fs.readFileSync('results/data/glasswing_categories_2025-08-11.json', 'utf8')
      );
      
      logger.info(`Analyzing ${categoryData.metadata.total_sections} total categories`);
      
      // Extract all categories into a flat list for analysis
      const allCategories = this.flattenCategories(categoryData);
      
      console.log(`\n📊 CATEGORY DISTRIBUTION:`, 
        '\n  Product Categories:', categoryData.metadata.categories_by_type.product_categories,
        '\n  Brands:', categoryData.metadata.categories_by_type.brands,
        '\n  Gender/Demographics:', categoryData.metadata.categories_by_type.gender_demographics,
        '\n  Featured Collections:', categoryData.metadata.categories_by_type.featured_collections,
        '\n  Other:', categoryData.metadata.categories_by_type.other
      );
      
      // Analyze different types of duplicates
      this.analyzeNameDuplicates(allCategories);
      this.analyzeUrlDuplicates(allCategories);
      this.analyzeCrossCategoryConflicts(allCategories);
      this.generateRecommendations(allCategories);
      
      // Generate comprehensive report
      this.generateDuplicateReport();
      
      return this.analysisResults;
      
    } catch (error) {
      logger.error('Analysis failed:', error.message);
      throw error;
    }
  }

  flattenCategories(categoryData) {
    const categories = [];
    const categoryTypes = Object.keys(categoryData.categorized_sections);
    
    categoryTypes.forEach(type => {
      categoryData.categorized_sections[type].forEach(item => {
        categories.push({
          ...item,
          source_type: type,
          normalized_name: item.name.toLowerCase().trim(),
          normalized_url: item.url.toLowerCase()
        });
      });
    });
    
    return categories;
  }

  analyzeNameDuplicates(categories) {
    console.log('\n🔍 NAME DUPLICATE ANALYSIS:');
    console.log('============================');
    
    const nameGroups = {};
    categories.forEach(cat => {
      const key = cat.normalized_name;
      if (!nameGroups[key]) nameGroups[key] = [];
      nameGroups[key].push(cat);
    });
    
    let duplicateCount = 0;
    Object.entries(nameGroups).forEach(([name, items]) => {
      if (items.length > 1) {
        duplicateCount++;
        const duplicateInfo = {
          name: name,
          count: items.length,
          items: items,
          types: [...new Set(items.map(i => i.source_type))],
          urls: [...new Set(items.map(i => i.url))]
        };
        
        this.analysisResults.duplicateNames.push(duplicateInfo);
        
        console.log(`${duplicateCount}. "${name.toUpperCase()}" (${items.length} instances):`);
        items.forEach((item, i) => {
          console.log(`   ${i+1}. Type: ${item.source_type} | URL: ${item.url}`);
        });
        console.log('');
      }
    });
    
    console.log(`📊 Summary: ${duplicateCount} duplicate names found`);
  }

  analyzeUrlDuplicates(categories) {
    console.log('\n🔗 URL DUPLICATE ANALYSIS:');
    console.log('===========================');
    
    const urlGroups = {};
    categories.forEach(cat => {
      const key = cat.normalized_url;
      if (!urlGroups[key]) urlGroups[key] = [];
      urlGroups[key].push(cat);
    });
    
    let urlDuplicateCount = 0;
    Object.entries(urlGroups).forEach(([url, items]) => {
      if (items.length > 1) {
        urlDuplicateCount++;
        const urlDuplicateInfo = {
          url: url,
          count: items.length,
          items: items,
          types: [...new Set(items.map(i => i.source_type))],
          names: [...new Set(items.map(i => i.name))]
        };
        
        this.analysisResults.duplicateUrls.push(urlDuplicateInfo);
        
        console.log(`${urlDuplicateCount}. URL: ${url}`);
        items.forEach((item, i) => {
          console.log(`   ${i+1}. Name: "${item.name}" | Type: ${item.source_type}`);
        });
        console.log('');
      }
    });
    
    console.log(`📊 Summary: ${urlDuplicateCount} duplicate URLs found`);
  }

  analyzeCrossCategoryConflicts(categories) {
    console.log('\n⚡ CROSS-CATEGORY CONFLICT ANALYSIS:');
    console.log('====================================');
    
    // Group by name and check for cross-category conflicts
    const nameGroups = {};
    categories.forEach(cat => {
      const key = cat.normalized_name;
      if (!nameGroups[key]) nameGroups[key] = [];
      nameGroups[key].push(cat);
    });
    
    let conflictCount = 0;
    Object.entries(nameGroups).forEach(([name, items]) => {
      const types = [...new Set(items.map(i => i.source_type))];
      
      if (types.length > 1) {
        // This is a cross-category conflict
        conflictCount++;
        const conflict = {
          name: name,
          types: types,
          items: items,
          severity: this.assessConflictSeverity(types)
        };
        
        this.analysisResults.crossCategoryConflicts.push(conflict);
        
        console.log(`${conflictCount}. "${name}" appears in multiple category types:`);
        console.log(`   Types: ${types.join(', ')}`);
        console.log(`   Severity: ${conflict.severity}`);
        items.forEach((item, i) => {
          console.log(`   ${i+1}. ${item.source_type}: ${item.url}`);
        });
        console.log('');
      }
    });
    
    console.log(`📊 Summary: ${conflictCount} cross-category conflicts found`);
  }

  assessConflictSeverity(types) {
    // Define conflict severity based on category type combinations
    const highConflictPairs = [
      ['brands', 'featured_collections'], // Brand vs promotion conflict
      ['product_categories', 'brands'], // Product vs brand conflict
    ];
    
    const mediumConflictPairs = [
      ['brands', 'gender_demographics'], // Brand appearing in gender-specific section
      ['featured_collections', 'gender_demographics'], // Promotion in gender section
    ];
    
    // Check for high severity conflicts
    for (const pair of highConflictPairs) {
      if (pair.every(type => types.includes(type))) {
        return 'HIGH';
      }
    }
    
    // Check for medium severity conflicts
    for (const pair of mediumConflictPairs) {
      if (pair.every(type => types.includes(type))) {
        return 'MEDIUM';
      }
    }
    
    return 'LOW';
  }

  generateRecommendations(categories) {
    console.log('\n💡 DEDUPLICATION RECOMMENDATIONS:');
    console.log('==================================');
    
    const recommendations = [];
    
    // Recommendation 1: URL-based deduplication
    if (this.analysisResults.duplicateUrls.length > 0) {
      recommendations.push({
        type: 'url_deduplication',
        priority: 'HIGH',
        description: 'Eliminate duplicate URLs by selecting the best category type for each URL',
        count: this.analysisResults.duplicateUrls.length
      });
    }
    
    // Recommendation 2: Cross-category conflict resolution
    const highSeverityConflicts = this.analysisResults.crossCategoryConflicts.filter(c => c.severity === 'HIGH');
    if (highSeverityConflicts.length > 0) {
      recommendations.push({
        type: 'conflict_resolution',
        priority: 'HIGH',
        description: 'Resolve high-severity cross-category conflicts through reclassification',
        count: highSeverityConflicts.length
      });
    }
    
    // Recommendation 3: Multi-category relationship preservation
    const validMultiCategories = this.identifyValidMultiCategories(categories);
    if (validMultiCategories.length > 0) {
      recommendations.push({
        type: 'multi_category_preservation',
        priority: 'MEDIUM',
        description: 'Preserve valid multi-category relationships (e.g., brand + gender)',
        count: validMultiCategories.length
      });
    }
    
    // Recommendation 4: Hierarchy optimization
    recommendations.push({
      type: 'hierarchy_optimization',
      priority: 'MEDIUM',
      description: 'Implement 4-level hierarchy: Gender → Product Type → Brands → Promotions',
      count: categories.length
    });
    
    this.analysisResults.recommendations = recommendations;
    
    recommendations.forEach((rec, i) => {
      console.log(`${i+1}. [${rec.priority}] ${rec.type.toUpperCase()}:`);
      console.log(`   Description: ${rec.description}`);
      console.log(`   Affected Items: ${rec.count}`);
      console.log('');
    });
  }

  identifyValidMultiCategories(categories) {
    // Identify categories that legitimately belong in multiple types
    const validPatterns = [];
    
    // Pattern 1: Brand collections that also appear in gender-specific sections
    const brandsByGender = {};
    categories.forEach(cat => {
      if (cat.source_type === 'brands' || cat.source_type === 'gender_demographics') {
        const key = cat.normalized_name;
        if (!brandsByGender[key]) brandsByGender[key] = [];
        brandsByGender[key].push(cat);
      }
    });
    
    Object.entries(brandsByGender).forEach(([name, items]) => {
      if (items.length > 1) {
        const types = [...new Set(items.map(i => i.source_type))];
        if (types.includes('brands') && types.includes('gender_demographics')) {
          validPatterns.push({
            name: name,
            pattern: 'brand_gender',
            items: items
          });
        }
      }
    });
    
    return validPatterns;
  }

  generateDuplicateReport() {
    console.log('\n📋 COMPREHENSIVE DUPLICATE ANALYSIS REPORT:');
    console.log('===========================================');
    
    const report = {
      summary: {
        total_categories: 0,
        duplicate_names: this.analysisResults.duplicateNames.length,
        duplicate_urls: this.analysisResults.duplicateUrls.length,
        cross_category_conflicts: this.analysisResults.crossCategoryConflicts.length,
        high_priority_issues: 0
      },
      duplicate_names: this.analysisResults.duplicateNames,
      duplicate_urls: this.analysisResults.duplicateUrls,
      cross_category_conflicts: this.analysisResults.crossCategoryConflicts,
      recommendations: this.analysisResults.recommendations,
      generated_at: new Date().toISOString()
    };
    
    // Count high priority issues
    report.summary.high_priority_issues = this.analysisResults.recommendations
      .filter(r => r.priority === 'HIGH').length;
    
    // Save detailed report
    const timestamp = new Date().toISOString().slice(0,10);
    const reportPath = `results/data/category_duplicate_analysis_${timestamp}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n📊 REPORT SUMMARY:');
    console.log(`   Duplicate Names: ${report.summary.duplicate_names}`);
    console.log(`   Duplicate URLs: ${report.summary.duplicate_urls}`);
    console.log(`   Cross-Category Conflicts: ${report.summary.cross_category_conflicts}`);
    console.log(`   High Priority Issues: ${report.summary.high_priority_issues}`);
    console.log(`   📄 Detailed Report: ${reportPath}`);
    
    return report;
  }
}

async function runDuplicateAnalysis() {
  const analyzer = new CategoryDuplicateAnalyzer();
  
  try {
    const results = await analyzer.analyzeDuplicates();
    
    console.log('\n🎉 DUPLICATE ANALYSIS COMPLETE!');
    console.log('Next Step: Implement deduplication logic based on recommendations');
    
    return results;
    
  } catch (error) {
    console.error('\n❌ Duplicate analysis failed:', error.message);
    return null;
  }
}

if (require.main === module) {
  runDuplicateAnalysis()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Analysis crashed:', error);
      process.exit(1);
    });
}

module.exports = { CategoryDuplicateAnalyzer };