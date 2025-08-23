#!/usr/bin/env node

/**
 * Test FilterBasedExplorationStrategy on a category page
 * Tests filter detection and iteration independently
 */

const FilterBasedExplorationStrategy = require('./src/core/discovery/strategies/exploration/FilterBasedExplorationStrategy');
const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const { logger } = require('./src/utils/logger');

async function testFilterExploration() {
  console.log('🧪 Testing FilterBasedExplorationStrategy on Glasswing category page...\n');
  
  const browserManager = new BrowserManagerBrowserless();
  const filterExplorer = new FilterBasedExplorationStrategy(browserManager, {
    logger: logger,
    maxFilters: 10,
    filterTimeout: 5000,
    captureFilterCombinations: false,
    trackForML: true
  });

  try {
    // Test on a Glasswing category page that should have filters
    const categoryUrl = 'https://glasswingshop.com/collections/shop';
    const categoryName = 'Shop';
    
    console.log(`📍 Testing filter exploration on: ${categoryUrl}`);
    console.log(`📂 Category: ${categoryName}\n`);
    
    const startTime = performance.now();
    
    // Run filter exploration
    const results = await filterExplorer.exploreWithFilters(categoryUrl, categoryName);
    
    const duration = Math.round(performance.now() - startTime);
    
    // Display results
    console.log('🎯 Filter Exploration Results:');
    console.log('=====================================');
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`🔍 Total Products Found: ${results.totalProducts}`);
    console.log(`🏷️  Filter Paths Tried: ${results.filterPaths?.length || 0}`);
    console.log(`📊 Unique Filters: ${results.stats?.uniqueFilters || 0}`);
    console.log(`📈 Avg Products per Filter: ${results.stats?.avgProductsPerFilter || 0}`);
    
    if (results.filterPaths && results.filterPaths.length > 0) {
      console.log('\n🏷️  Filter Details:');
      results.filterPaths.forEach((path, index) => {
        console.log(`  ${index + 1}. "${path.filter}" → ${path.productsFound} products`);
      });
    }
    
    if (results.products && results.products.length > 0) {
      console.log('\n📦 Sample Products Found:');
      results.products.slice(0, 5).forEach((product, index) => {
        console.log(`  ${index + 1}. ${product.title || 'No title'}`);
        console.log(`     URL: ${product.url}`);
        console.log(`     Filters: ${product.filters?.join(', ') || 'baseline'}`);
      });
      
      if (results.products.length > 5) {
        console.log(`     ... and ${results.products.length - 5} more products`);
      }
    }
    
    console.log('\n✅ Filter exploration test completed successfully!');
    
    return results;
    
  } catch (error) {
    console.error('❌ Filter exploration test failed:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testFilterExploration()
    .then(results => {
      console.log('\n🎉 Test completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Test failed:', error.message);
      process.exit(1);
    });
}

module.exports = testFilterExploration;