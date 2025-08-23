#!/usr/bin/env node

/**
 * Test FilterBasedExplorationStrategy filter clicking with discovered candidates
 * Tests actual filter clicking, DOM changes, and product collection with latest fixes
 */

// Load environment variables for browserless protection
require('dotenv').config();

const FilterDiscoveryStrategy = require('./src/core/discovery/strategies/exploration/FilterDiscoveryStrategy');
const FilterBasedExplorationStrategy = require('./src/core/discovery/strategies/exploration/FilterBasedExplorationStrategy');
const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const { logger } = require('./src/utils/logger');

async function testFilterClickingFixed() {
  console.log('🖱️  Testing FilterBasedExplorationStrategy with all fixes applied...\n');
  
  const browserManager = new BrowserManagerBrowserless();
  
  // Create FilterDiscoveryStrategy instance
  const filterDiscovery = new FilterDiscoveryStrategy({
    logger: logger,
    maxFilters: 15,
    scoreThreshold: 2
  });
  
  // Create FilterBasedExplorationStrategy with discovery integration
  const filterExploration = new FilterBasedExplorationStrategy(browserManager, {
    logger: logger,
    maxFilters: 2, // Test just 2 filters to avoid accumulation issues
    filterDiscoveryStrategy: filterDiscovery,
    useDiscoveredFilters: true,
    captureFilterCombinations: false // Simplify for clicking test
  });

  const { page, close } = await browserManager.createBrowser('stealth');

  try {
    const categoryUrl = 'https://glasswingshop.com/collections/mens-collection';
    
    console.log(`📍 Testing complete filter workflow on: ${categoryUrl}`);
    console.log(`🎯 Goal: Verify complete two-phase filter system works\n`);
    
    // Navigate to the page
    console.log('🌐 Navigating to page...');
    await page.goto(categoryUrl, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('✅ Page loaded\n');
    
    const startTime = performance.now();
    
    // Run the complete exploreWithFilters workflow
    console.log('🔄 Running complete exploreWithFilters workflow...');
    const results = await filterExploration.exploreWithFilters(categoryUrl, 'mens-collection');
    
    const duration = Math.round(performance.now() - startTime);
    
    // Display results
    console.log('\n🎯 Complete Workflow Results:');
    console.log('=====================================');
    console.log(`⏱️  Total Duration: ${duration}ms`);
    console.log(`🎯 Total Products Found: ${results.totalProducts}`);
    console.log(`📊 Filter Paths Tried: ${results.filterPaths.length}`);
    console.log(`🔗 Unique Filters: ${results.stats.uniqueFilters}`);
    console.log(`📈 Avg Products Per Filter: ${results.stats.avgProductsPerFilter}`);
    
    // Show filter path details
    if (results.filterPaths.length > 0) {
      console.log('\n🎯 Filter Path Details:');
      results.filterPaths.forEach((path, index) => {
        console.log(`\n  ${index + 1}. Filter: "${path.filter}"`);
        console.log(`     Products Found: ${path.productsFound}`);
        console.log(`     Selector: ${path.selector}`);
      });
    }
    
    // Show sample products
    if (results.products.length > 0) {
      console.log('\n📦 Sample Products Found:');
      results.products.slice(0, 5).forEach((product, index) => {
        console.log(`\n  ${index + 1}. "${product.title}"`);
        console.log(`     URL: ${product.url}`);
        console.log(`     Found via filters: ${product.filters.join(', ')}`);
        if (product.price) console.log(`     Price: ${product.price}`);
      });
      
      if (results.products.length > 5) {
        console.log(`\n   ... and ${results.products.length - 5} more products`);
      }
    }
    
    // Navigation tracking
    if (results.navigationPath && results.navigationPath.length > 0) {
      console.log('\n🗺️  Navigation Path:');
      results.navigationPath.forEach((nav, index) => {
        console.log(`  ${index + 1}. ${nav.action}: ${nav.element} - "${nav.text}"`);
      });
    }
    
    // Success validation
    console.log('\n🔬 Workflow Validation:');
    const success = results.totalProducts > 0 && results.filterPaths.length > 0;
    
    if (success) {
      console.log('✅ Two-phase filter system WORKS completely!');
      console.log('✅ Filter discovery finds candidates');
      console.log('✅ Filter clicking works with discovered selectors');
      console.log('✅ Product collection works with filtered states');
      console.log('✅ Complete workflow produces meaningful results');
      
      // Calculate improvement metrics
      console.log('\n📊 Extraction Success Metrics:');
      console.log(`📈 Products discovered through filters: ${results.totalProducts}`);
      console.log(`🎯 Filter coverage: ${results.stats.uniqueFilters} unique filters tried`);
      console.log(`⚡ Avg efficiency: ${results.stats.avgProductsPerFilter} products per filter`);
      
    } else {
      console.log('❌ Two-phase filter system has issues');
      console.log(`   Products found: ${results.totalProducts}`);
      console.log(`   Filter paths: ${results.filterPaths.length}`);
    }
    
    console.log('\n✅ Complete workflow test finished!');
    
    return {
      success: success,
      totalProducts: results.totalProducts,
      filterPaths: results.filterPaths.length,
      uniqueFilters: results.stats.uniqueFilters,
      duration: duration
    };
    
  } catch (error) {
    console.error('❌ Complete workflow test failed:', error);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    await close();
  }
}

// Run the test
if (require.main === module) {
  testFilterClickingFixed()
    .then(results => {
      console.log('\n🎉 Complete workflow test completed!');
      console.log(`📊 Summary: ${results.totalProducts} products via ${results.filterPaths} filter paths`);
      process.exit(results.success ? 0 : 1);
    })
    .catch(error => {
      console.error('\n💥 Complete workflow test failed:', error.message);
      process.exit(1);
    });
}

module.exports = testFilterClickingFixed;