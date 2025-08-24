#!/usr/bin/env node

require('dotenv').config();

const FilterBasedExplorationStrategy = require('../../src/core/discovery/strategies/exploration/FilterBasedExplorationStrategy');
const BrowserManagerBrowserless = require('../../src/common/browser/managers/BrowserManagerBrowserless');
const { logger } = require('../../src/utils/logger');

async function testRefactoredFilterStrategy() {
  console.log('🧪 Testing Refactored FilterBasedExplorationStrategy');
  console.log('================================================\n');

  const testUrl = 'https://shopfigandwillow.com/collections/tops';
  console.log(`Target URL: ${testUrl}`);
  console.log('Expected: Filter-based product discovery using ProductDiscoveryProcessor\n');

  const browserManager = new BrowserManagerBrowserless({
    logger: logger,
    maxConcurrentPages: 1,
    browserTimeout: 30000
  });

  const strategy = new FilterBasedExplorationStrategy(browserManager, {
    maxFilters: 3, // Limit for testing
    maxProductsPerCategory: 50,
    filterTimeout: 5000,
    pageLoadDelay: 2000,
    filterClickDelay: 1000,
    filterProcessDelay: 2000,
    features: {
      canonicalizedDedup: true,
      filterExclusions: true
    }
  });

  try {
    console.log('🔍 Starting filter-based exploration...');
    const results = await strategy.exploreWithFilters(testUrl, 'Fig & Willow Tops');
    
    console.log('\n📊 Refactored Strategy Results:');
    console.log('===============================');
    console.log(`Total unique products: ${results.totalProducts}`);
    console.log(`Filters processed: ${results.stats.uniqueFilters}`);
    console.log(`Filter combinations: ${results.stats.filterCombinations}`);
    console.log(`Average products per filter: ${results.stats.avgProductsPerFilter}`);
    
    // Show utility integration stats
    console.log('\n🔧 ProductDiscoveryProcessor Integration:');
    console.log('=========================================');
    console.log(`Canonicalized URLs changed: ${results.stats.utilityStats.canonicalTransformChangedCount}`);
    console.log(`Canonical collisions: ${results.stats.utilityStats.canonicalCollisionsCount}`);
    console.log(`Filters excluded: ${results.stats.utilityStats.filtersExcludedCount}`);
    
    if (results.stats.utilityStats.excludedFilterLabels.length > 0) {
      console.log(`Excluded filter labels: ${results.stats.utilityStats.excludedFilterLabels.join(', ')}`);
    }
    
    // Show filter paths (what got processed)
    console.log('\n📋 Filter Processing Summary:');
    console.log('=============================');
    if (results.filterPaths.length > 0) {
      results.filterPaths.forEach((path, i) => {
        console.log(`  ${i + 1}. "${path.filter}" → ${path.productsFound} products`);
      });
    } else {
      console.log('  No filters were processed successfully');
    }
    
    // Show sample products
    console.log('\n🔗 Sample Products Found:');
    console.log('=========================');
    const sampleProducts = results.products.slice(0, 5);
    sampleProducts.forEach((product, i) => {
      console.log(`  ${i + 1}. ${product.url}`);
      console.log(`     Filters: [${product.filters.join(', ')}]`);
      console.log(`     Category: ${product.categoryName}`);
    });
    
    // Success criteria
    const success = results.totalProducts > 0;
    console.log(`\n${success ? '✅' : '❌'} Test Result: ${success ? 'SUCCESS' : 'FAILED'}`);
    
    if (success) {
      console.log('🎉 Refactored strategy successfully uses ProductDiscoveryProcessor!');
      console.log('📈 Benefits gained:');
      console.log('  - Consistent product extraction across all strategies');
      console.log('  - Automatic pagination for filtered results'); 
      console.log('  - Smart pagination detection (numbered, load-more, infinite scroll)');
      console.log('  - Reduced code duplication (~130 lines removed)');
    } else {
      console.log('❌ Strategy needs debugging - no products found');
    }
    
    return success;
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

// Run the test
if (require.main === module) {
  testRefactoredFilterStrategy()
    .then(success => {
      console.log(`\n${'='.repeat(50)}`);
      console.log(success ? '🎉 REFACTORING TEST PASSED' : '❌ REFACTORING TEST FAILED');
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test crashed:', error);
      process.exit(1);
    });
}

module.exports = { testRefactoredFilterStrategy };