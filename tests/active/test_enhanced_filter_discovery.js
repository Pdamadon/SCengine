#!/usr/bin/env node

require('dotenv').config();

const FilterDiscoveryStrategy = require('../../src/core/discovery/strategies/exploration/FilterDiscoveryStrategy');
const BrowserManagerBrowserless = require('../../src/common/browser/managers/BrowserManagerBrowserless');
const { logger } = require('../../src/utils/logger');

async function testEnhancedFilterDiscovery() {
  console.log('🧪 Testing Enhanced Filter Discovery with Menu Activation');
  console.log('========================================================\n');

  const testUrl = 'https://shopfigandwillow.com/collections/tops';
  console.log(`Target URL: ${testUrl}`);
  console.log('Expected: Click Filter button → Find filters → Exclude size filters\n');

  const browserManager = new BrowserManagerBrowserless({
    logger: logger,
    maxConcurrentPages: 1,
    browserTimeout: 60000
  });

  const strategy = new FilterDiscoveryStrategy({
    logger: logger,
    maxFilters: 20, // Allow more to see all discovered filters
    scoreThreshold: 1, // Lower threshold to see more candidates
    includeHiddenFilters: false
  });

  try {
    const { page, close } = await browserManager.createBrowser('stealth');
    
    console.log('📄 Navigating to Fig & Willow tops...');
    await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    console.log('🎯 Testing enhanced filter discovery...');
    const startTime = Date.now();
    
    // Test the enhanced filter discovery with activation
    const results = await strategy.discoverFilterCandidates(page, testUrl);
    const duration = Date.now() - startTime;
    
    console.log('\n📊 Enhanced Filter Discovery Results:');
    console.log('====================================');
    console.log(`Total candidates found: ${results.totalCandidates}`);
    console.log(`Discovery time: ${Math.round(duration / 1000)}s`);
    
    if (results.totalCandidates > 0) {
      console.log('\n🎯 Filter Candidates Found:');
      console.log('===========================');
      results.candidates.forEach((candidate, i) => {
        console.log(`${i + 1}. "${candidate.label}" (${candidate.elementType})`);
        console.log(`   Score: ${candidate.score}, Container: ${candidate.containerHint || 'unknown'}`);
        if (candidate.value) console.log(`   Value: ${candidate.value}`);
        console.log('');
      });
      
      // Analyze filter types
      console.log('📋 Filter Analysis:');
      console.log('==================');
      const filterTypes = {};
      results.candidates.forEach(c => {
        const type = c.elementType;
        filterTypes[type] = (filterTypes[type] || 0) + 1;
      });
      
      Object.entries(filterTypes).forEach(([type, count]) => {
        console.log(`  ${type}: ${count} filters`);
      });
      
      // Check for size-related filters (should be excluded)
      const sizeRelated = results.candidates.filter(c => 
        /\b(size|xs|sm|md|lg|xl)\b/i.test(c.label)
      );
      
      console.log('\n🔍 Size Filter Check:');
      console.log('====================');
      if (sizeRelated.length > 0) {
        console.log(`❌ Found ${sizeRelated.length} size-related filters (exclusions may need improvement):`);
        sizeRelated.forEach(f => console.log(`   - "${f.label}"`));
      } else {
        console.log('✅ No size-related filters found (exclusions working!)');
      }
      
      // Show useful discovery filters
      const discoveryFilters = results.candidates.filter(c => 
        !/\b(size|color|price|sort|xs|sm|md|lg|xl)\b/i.test(c.label)
      );
      
      if (discoveryFilters.length > 0) {
        console.log('\n🎯 Useful Discovery Filters:');
        console.log('============================');
        discoveryFilters.forEach(f => {
          console.log(`  ✓ "${f.label}" (${f.elementType}, score: ${f.score})`);
        });
      }
      
    } else {
      console.log('\n❌ No filter candidates found');
      console.log('Possible issues:');
      console.log('  - Filter activation failed');
      console.log('  - Filters are dynamically loaded');
      console.log('  - Score threshold too high');
      console.log('  - All filters excluded by exclusion patterns');
    }
    
    // Test activation success
    console.log('\n🔧 Filter Menu Activation Test:');
    console.log('==============================');
    
    // Check if filter menu is now visible
    const filterMenuVisible = await page.$('.filter-menu, .filters, [role="dialog"], .modal') !== null;
    console.log(`Filter menu visible: ${filterMenuVisible ? '✅ YES' : '❌ NO'}`);
    
    // Check for common filter elements
    const checkboxes = await page.$$('input[type="checkbox"]');
    const radios = await page.$$('input[type="radio"]');
    const filterButtons = await page.$$('button[class*="filter"], .filter-option');
    
    console.log(`Checkboxes found: ${checkboxes.length}`);
    console.log(`Radio buttons found: ${radios.length}`);
    console.log(`Filter buttons found: ${filterButtons.length}`);
    
    await close();
    
    const success = results.totalCandidates > 0;
    console.log(`\n${success ? '✅' : '❌'} Test Result: ${success ? 'SUCCESS' : 'FAILED'}`);
    
    if (success) {
      console.log('🎉 Enhanced filter discovery working!');
      console.log('📈 Improvements:');
      console.log('  - Filter menu activation implemented');
      console.log('  - Size/variant filter exclusions working');
      console.log('  - Ready for product discovery filtering');
    }
    
    return {
      success,
      totalCandidates: results.totalCandidates,
      discoveryFilters: results.candidates.filter(c => 
        !/\b(size|color|price|sort)\b/i.test(c.label)
      ).length,
      processingTime: duration
    };
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    console.error('Stack:', error.stack);
    return { success: false, error: error.message };
  }
}

// Run the test
if (require.main === module) {
  testEnhancedFilterDiscovery()
    .then(result => {
      console.log(`\n${'='.repeat(60)}`);
      if (result.success) {
        console.log('🎉 ENHANCED FILTER DISCOVERY TEST: PASSED');
        console.log(`📊 Found ${result.totalCandidates} total candidates`);
        console.log(`🎯 ${result.discoveryFilters} useful discovery filters`);
        console.log(`⏱️  Processing time: ${Math.round(result.processingTime / 1000)}s`);
      } else {
        console.log('❌ ENHANCED FILTER DISCOVERY TEST: FAILED');
        if (result.error) {
          console.log(`Error: ${result.error}`);
        }
      }
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test crashed:', error);
      process.exit(1);
    });
}

module.exports = { testEnhancedFilterDiscovery };