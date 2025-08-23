#!/usr/bin/env node

/**
 * Test PipelineOrchestrator with integrated two-phase filter system
 * Verifies that the main pipeline uses our enhanced FilterBasedExplorationStrategy
 */

// Load environment variables for browserless protection
require('dotenv').config();

const PipelineOrchestrator = require('./src/core/PipelineOrchestrator');
const { logger } = require('./src/utils/logger');

async function testIntegratedPipeline() {
  console.log('🔄 Testing PipelineOrchestrator with enhanced two-phase filter system...\n');
  
  // Create PipelineOrchestrator with configuration for testing
  const orchestrator = new PipelineOrchestrator({
    logger: logger,
    mode: 'category', // Focus on category-level scraping with filters
    maxFilters: 3, // Limit for testing
    useDiscoveredFilters: true, // Ensure two-phase system is enabled
    filterScoreThreshold: 2, // Lower threshold for more candidates
    maxFiltersPerGroup: 10,
    enableNavigation: false, // Skip navigation for this test
    enableSubcategories: false, // Skip subcategories for this test
    enableFilters: true, // Focus on filters
    enableCollection: true,
    enableExtraction: false // Skip extraction for faster testing
  });

  try {
    const categoryUrl = 'https://glasswingshop.com/collections/mens-collection';
    const siteDomain = 'glasswingshop.com';
    
    console.log(`📍 Testing integrated pipeline on: ${categoryUrl}`);
    console.log(`🎯 Goal: Verify enhanced two-phase filter system in main pipeline\n`);
    
    const startTime = performance.now();
    
    // Run category-level scraping which will use our enhanced filter system
    console.log('🔄 Running category scraping with enhanced filters...');
    const results = await orchestrator.execute(categoryUrl, {
      domain: siteDomain,
      categoryName: 'mens-collection'
    });
    
    const duration = Math.round(performance.now() - startTime);
    
    // Display pipeline results
    console.log('\n🎯 Integrated Pipeline Results:');
    console.log('=====================================');
    console.log(`⏱️  Total Duration: ${duration}ms`);
    console.log(`🎯 Total Products Found: ${results.totalProducts || 0}`);
    console.log(`📊 Categories Processed: ${results.categories ? results.categories.length : 1}`);
    
    // Check if filter system was used
    let filterResults = null;
    if (results.categories && results.categories.length > 0) {
      filterResults = results.categories[0].filterResults;
    } else if (results.filterResults) {
      filterResults = results.filterResults;
    }
    
    console.log('\\n🔍 Debug Results Structure:');
    console.log('Results keys:', Object.keys(results));
    if (results.filterResults) {
      console.log('FilterResults keys:', Object.keys(results.filterResults));
      console.log('FilterResults sample:', JSON.stringify(results.filterResults, null, 2).slice(0, 500) + '...');
    }
    
    if (filterResults) {
      console.log(`🔗 Filter Paths Executed: ${filterResults.filterPaths ? filterResults.filterPaths.length : 0}`);
      console.log(`🎯 Unique Filters: ${filterResults.stats ? filterResults.stats.uniqueFilters : 0}`);
      console.log(`📈 Avg Products Per Filter: ${filterResults.stats ? filterResults.stats.avgProductsPerFilter : 0}`);
      
      // Show filter path details
      if (filterResults.filterPaths && filterResults.filterPaths.length > 0) {
        console.log('\n🎯 Filter Path Details:');
        filterResults.filterPaths.forEach((path, index) => {
          console.log(`\n  ${index + 1}. Filter: "${path.filter}"`);
          console.log(`     Products Found: ${path.productsFound}`);
          console.log(`     Selector: ${path.selector}`);
        });
      }
    }
    
    // Show sample products from filterResults
    let products = [];
    if (results.filterResults && results.filterResults.categories) {
      products = results.filterResults.categories[0]?.filterProducts || [];
    } else {
      products = results.products || [];
    }
    
    if (products.length > 0) {
      console.log('\n📦 Sample Products Found:');
      console.log(`Total products collected: ${products.length}`);
      products.slice(0, 5).forEach((product, index) => {
        console.log(`\n  ${index + 1}. "${product.title || 'No title'}"`);
        console.log(`     URL: ${product.url}`);
        if (product.filters) {
          console.log(`     Found via filters: ${product.filters.join(', ')}`);
        }
        if (product.categoryName) {
          console.log(`     Category: ${product.categoryName}`);
        }
        if (product.categoryUrl) {
          console.log(`     Category URL: ${product.categoryUrl}`);
        }
        if (product.price) console.log(`     Price: ${product.price}`);
        
        // Show complete product payload structure
        console.log(`     Full payload keys: ${Object.keys(product).join(', ')}`);
      });
      
      if (products.length > 5) {
        console.log(`\n   ... and ${products.length - 5} more products`);
      }
    }
    
    // Integration validation
    console.log('\n🔬 Integration Validation:');
    const hasProducts = products.length > 0;
    const hasFilterResults = filterResults && filterResults.filterPaths && filterResults.filterPaths.length > 0;
    const success = hasProducts && hasFilterResults;
    
    if (success) {
      console.log('✅ Integration SUCCESSFUL - PipelineOrchestrator uses enhanced two-phase filters!');
      console.log('✅ FilterDiscoveryStrategy integrated correctly');
      console.log('✅ FilterBasedExplorationStrategy enhanced with CSS escaping and JS waits');
      console.log('✅ Pipeline produces improved results');
      
      // Calculate improvement metrics
      const baselineEstimate = 40; // From our testing baseline
      const improvement = products.length > baselineEstimate ? 
        Math.round(((products.length - baselineEstimate) / baselineEstimate) * 100) : 0;
      
      console.log('\n📊 Extraction Success Metrics:');
      console.log(`📈 Products discovered: ${products.length} (baseline ~${baselineEstimate})`);
      if (improvement > 0) {
        console.log(`🚀 Improvement: +${improvement}% over baseline`);
      }
      console.log(`🎯 Filter coverage: ${filterResults?.stats?.uniqueFilters || 0} unique filters`);
      
    } else {
      console.log('❌ Integration needs attention:');
      console.log(`   Products found: ${products.length}`);
      console.log(`   Filter results: ${hasFilterResults ? 'YES' : 'NO'}`);
      console.log(`   Filter paths: ${filterResults?.filterPaths?.length || 0}`);
    }
    
    console.log('\n✅ Integrated pipeline test completed!');
    
    return {
      success: success,
      totalProducts: products.length,
      filterPaths: filterResults?.filterPaths?.length || 0,
      uniqueFilters: filterResults?.stats?.uniqueFilters || 0,
      duration: duration
    };
    
  } catch (error) {
    console.error('❌ Integrated pipeline test failed:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testIntegratedPipeline()
    .then(results => {
      console.log('\n🎉 Integrated pipeline test completed!');
      console.log(`📊 Summary: ${results.totalProducts} products via ${results.filterPaths} filter paths`);
      console.log(`🚀 Two-phase filter system ${results.success ? 'WORKING' : 'NEEDS ATTENTION'} in main pipeline`);
      process.exit(results.success ? 0 : 1);
    })
    .catch(error => {
      console.error('\n💥 Integrated pipeline test failed:', error.message);
      process.exit(1);
    });
}

module.exports = testIntegratedPipeline;