#!/usr/bin/env node

/**
 * Test FilterBasedExplorationStrategy integration with FilterDiscoveryStrategy
 * Tests Phase 2 of the two-phase filter approach: Integration and Basic Functionality
 */

// Load environment variables for browserless protection
require('dotenv').config();

const FilterDiscoveryStrategy = require('./src/core/discovery/strategies/exploration/FilterDiscoveryStrategy');
const FilterBasedExplorationStrategy = require('./src/core/discovery/strategies/exploration/FilterBasedExplorationStrategy');
const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const { logger } = require('./src/utils/logger');

async function testFilterIntegration() {
  console.log('🔗 Testing FilterBasedExplorationStrategy integration with FilterDiscoveryStrategy...\n');
  
  const browserManager = new BrowserManagerBrowserless();
  
  // Create FilterDiscoveryStrategy instance
  const filterDiscovery = new FilterDiscoveryStrategy({
    logger: logger,
    maxFilters: 10,
    scoreThreshold: 2
  });
  
  // Create FilterBasedExplorationStrategy with discovery integration
  const filterExploration = new FilterBasedExplorationStrategy(browserManager, {
    logger: logger,
    maxFilters: 5, // Limit for testing
    filterDiscoveryStrategy: filterDiscovery,
    useDiscoveredFilters: true,
    captureFilterCombinations: false // Simplify for basic test
  });

  const { page, close } = await browserManager.createBrowser('stealth');

  try {
    const categoryUrl = 'https://glasswingshop.com/collections/mens-collection';
    
    console.log(`📍 Testing integration on: ${categoryUrl}`);
    console.log(`🎯 Goal: Verify FilterBasedExplorationStrategy can use discovered filters\n`);
    
    // Navigate to the page
    console.log('🌐 Navigating to page...');
    await page.goto(categoryUrl, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('✅ Page loaded\n');
    
    const startTime = performance.now();
    
    // Test the identifyFilters method specifically (core integration point)
    console.log('🔍 Testing identifyFilters method with integration...');
    const filters = await filterExploration.identifyFilters(page);
    
    const duration = Math.round(performance.now() - startTime);
    
    // Display integration results
    console.log('🎯 Integration Test Results:');
    console.log('=====================================');
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`🎯 Filters Found: ${filters.length}`);
    console.log(`📊 Filter Types: ${[...new Set(filters.map(f => f.type))].join(', ')}`);
    
    // Check if we're using discovered filters
    const usingDiscovered = filters.length > 0 && filters[0].candidateData;
    console.log(`🔗 Using Discovered Filters: ${usingDiscovered ? 'YES' : 'NO (fallback to legacy)'}`);
    
    // Show sample filters
    if (filters.length > 0) {
      console.log('\n🎯 Sample Filters:');
      filters.slice(0, 5).forEach((filter, index) => {
        console.log(`\n  ${index + 1}. "${filter.text}" (${filter.type})`);
        console.log(`     Selector: ${filter.selector}`);
        if (filter.candidateData) {
          console.log(`     Score: ${filter.candidateData.score}`);
          console.log(`     Container: ${filter.candidateData.containerHint || 'unknown'}`);
          console.log(`     Original Selector: ${filter.candidateData.selector}`);
        }
      });
      
      if (filters.length > 5) {
        console.log(`\n   ... and ${filters.length - 5} more filters`);
      }
    } else {
      console.log('\n⚠️  No filters found');
      console.log('   This could mean:');
      console.log('   - No filters on this page');
      console.log('   - Integration issue');
      console.log('   - Discovery threshold too high');
    }
    
    // Validation
    console.log('\n🔬 Integration Validation:');
    if (usingDiscovered && filters.length > 0) {
      console.log('✅ Integration SUCCESSFUL - FilterBasedExplorationStrategy is using discovered filters');
      console.log('✅ Filter candidates have specific selectors from FilterDiscoveryStrategy');
      console.log('✅ Backward compatibility maintained (candidateData preserved)');
    } else if (!usingDiscovered && filters.length > 0) {
      console.log('⚠️  Integration FALLBACK - Using legacy filter identification');
      console.log('   This may indicate FilterDiscoveryStrategy is not finding candidates');
    } else {
      console.log('❌ Integration FAILED - No filters found by either method');
    }
    
    console.log('\n✅ Basic integration test completed!');
    console.log('📋 Next: Test actual filter clicking and product collection');
    
    return {
      success: usingDiscovered && filters.length > 0,
      filtersFound: filters.length,
      usingDiscovered: usingDiscovered,
      duration: duration
    };
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    await close();
  }
}

// Run the test
if (require.main === module) {
  testFilterIntegration()
    .then(results => {
      console.log('\n🎉 Integration test completed!');
      console.log(`📊 Summary: ${results.filtersFound} filters found, using discovered: ${results.usingDiscovered}`);
      process.exit(results.success ? 0 : 1);
    })
    .catch(error => {
      console.error('\n💥 Integration test failed:', error.message);
      process.exit(1);
    });
}

module.exports = testFilterIntegration;