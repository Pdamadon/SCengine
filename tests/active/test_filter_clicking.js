#!/usr/bin/env node

/**
 * Test FilterBasedExplorationStrategy filter clicking with discovered candidates
 * Tests actual filter clicking, DOM changes, and product collection
 */

const FilterDiscoveryStrategy = require('./src/core/discovery/strategies/exploration/FilterDiscoveryStrategy');
const FilterBasedExplorationStrategy = require('./src/core/discovery/strategies/exploration/FilterBasedExplorationStrategy');
const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const { logger } = require('./src/utils/logger');

async function testFilterClicking() {
  console.log('🖱️  Testing FilterBasedExplorationStrategy filter clicking...\n');
  
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
    maxFilters: 3, // Test just a few filters
    filterDiscoveryStrategy: filterDiscovery,
    useDiscoveredFilters: true,
    captureFilterCombinations: false // Simplify for clicking test
  });

  const { page, close } = await browserManager.createBrowser('stealth');

  try {
    const categoryUrl = 'https://glasswingshop.com/collections/mens-collection';
    
    console.log(`📍 Testing filter clicking on: ${categoryUrl}`);
    console.log(`🎯 Goal: Verify filter clicking works with discovered candidates\n`);
    
    // Navigate to the page
    console.log('🌐 Navigating to page...');
    await page.goto(categoryUrl, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('✅ Page loaded\n');
    
    // Get baseline product count before filtering
    console.log('📊 Getting baseline product count...');
    const baselineProducts = await filterExploration.captureProducts(page, 'baseline');
    console.log(`📋 Baseline products: ${baselineProducts.length}\n`);
    
    // Get discovered filters
    console.log('🔍 Discovering filters...');
    const filters = await filterExploration.identifyFilters(page);
    console.log(`🎯 Found ${filters.length} filters\n`);
    
    if (filters.length === 0) {
      console.log('⚠️  No filters found - cannot test clicking');
      return { success: false, reason: 'No filters found' };
    }
    
    // Test clicking first 3 filters
    const testFilters = filters.slice(0, 3);
    const clickResults = [];
    
    for (let i = 0; i < testFilters.length; i++) {
      const filter = testFilters[i];
      console.log(`\n🖱️  Testing filter ${i + 1}/${testFilters.length}: "${filter.text}"`);
      console.log(`    Type: ${filter.type}, Selector: ${filter.selector}`);
      
      try {
        const startTime = performance.now();
        
        // Use the specific selector from discovered candidate
        const selector = filter.candidateData ? filter.candidateData.selector : filter.selector;
        console.log(`    Using selector: ${selector}`);
        
        // Find the element
        const element = await page.$(selector);
        if (!element) {
          console.log(`    ❌ Element not found with selector: ${selector}`);
          clickResults.push({
            filter: filter.text,
            success: false,
            reason: 'Element not found'
          });
          continue;
        }
        
        // Check initial state
        const initialState = await filterExploration.isFilterActive(page, element);
        console.log(`    Initial state: ${initialState ? 'active' : 'inactive'}`);
        
        // Click the filter
        console.log(`    🖱️  Clicking filter...`);
        await element.click();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for DOM update
        
        // Check if filter was applied
        const activeState = await filterExploration.isFilterActive(page, element);
        console.log(`    After click state: ${activeState ? 'active' : 'inactive'}`);
        
        // Capture products with this filter applied
        const filteredProducts = await filterExploration.captureProducts(page, filter.text);
        console.log(`    📋 Products with filter: ${filteredProducts.length}`);
        
        // Check for URL changes (some filters change URL)
        const currentUrl = page.url();
        const urlChanged = currentUrl !== categoryUrl;
        console.log(`    🌐 URL changed: ${urlChanged ? 'YES' : 'NO'}`);
        if (urlChanged) {
          console.log(`    New URL: ${currentUrl}`);
        }
        
        const duration = Math.round(performance.now() - startTime);
        
        // Click again to remove filter (if it was applied)
        if (activeState || urlChanged) {
          console.log(`    🖱️  Clicking to remove filter...`);
          await element.click();
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Check if we're back to original state
          const removedState = await filterExploration.isFilterActive(page, element);
          console.log(`    After removal state: ${removedState ? 'still active' : 'inactive'}`);
          
          // Check URL restoration
          const restoredUrl = page.url();
          const urlRestored = restoredUrl === categoryUrl || !restoredUrl.includes('filter');
          console.log(`    🌐 URL restored: ${urlRestored ? 'YES' : 'NO'}`);
        }
        
        clickResults.push({
          filter: filter.text,
          type: filter.type,
          selector: selector,
          success: true,
          initialState: initialState,
          activatedSuccessfully: activeState,
          productsFound: filteredProducts.length,
          baselineProducts: baselineProducts.length,
          urlChanged: urlChanged,
          duration: duration
        });
        
        console.log(`    ✅ Filter test completed in ${duration}ms`);
        
      } catch (error) {
        console.log(`    ❌ Filter clicking failed: ${error.message}`);
        clickResults.push({
          filter: filter.text,
          success: false,
          reason: error.message
        });
      }
    }
    
    // Summary results
    console.log('\n🎯 Filter Clicking Test Results:');
    console.log('=====================================');
    
    const successfulClicks = clickResults.filter(r => r.success);
    const activatedFilters = clickResults.filter(r => r.success && r.activatedSuccessfully);
    
    console.log(`📊 Filters tested: ${clickResults.length}`);
    console.log(`✅ Successful clicks: ${successfulClicks.length}`);
    console.log(`🎯 Filters activated: ${activatedFilters.length}`);
    console.log(`📋 Baseline products: ${baselineProducts.length}`);
    
    if (activatedFilters.length > 0) {
      console.log('\n🎯 Filter Activation Details:');
      activatedFilters.forEach((result, index) => {
        console.log(`\n  ${index + 1}. "${result.filter}" (${result.type})`);
        console.log(`     Products found: ${result.productsFound} (baseline: ${result.baselineProducts})`);
        console.log(`     URL changed: ${result.urlChanged ? 'YES' : 'NO'}`);
        console.log(`     Duration: ${result.duration}ms`);
        console.log(`     Selector: ${result.selector}`);
      });
    }
    
    // Validation
    console.log('\n🔬 Clicking Validation:');
    if (successfulClicks.length > 0) {
      console.log('✅ Filter clicking WORKS - Elements are clickable with discovered selectors');
      
      if (activatedFilters.length > 0) {
        console.log('✅ Filter activation WORKS - Filters change state when clicked');
        console.log('✅ Product collection WORKS - Can capture products after filter application');
      } else {
        console.log('⚠️  Filter activation UNCERTAIN - Clicks worked but no state changes detected');
      }
    } else {
      console.log('❌ Filter clicking FAILED - No successful clicks achieved');
    }
    
    console.log('\n✅ Filter clicking test completed!');
    
    return {
      success: successfulClicks.length > 0,
      filtersActivated: activatedFilters.length,
      totalTested: clickResults.length,
      results: clickResults
    };
    
  } catch (error) {
    console.error('❌ Filter clicking test failed:', error);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    await close();
  }
}

// Run the test
if (require.main === module) {
  testFilterClicking()
    .then(results => {
      console.log('\n🎉 Filter clicking test completed!');
      console.log(`📊 Summary: ${results.filtersActivated}/${results.totalTested} filters activated successfully`);
      process.exit(results.success ? 0 : 1);
    })
    .catch(error => {
      console.error('\n💥 Filter clicking test failed:', error.message);
      process.exit(1);
    });
}

module.exports = testFilterClicking;