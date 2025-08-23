#!/usr/bin/env node

/**
 * PROPER A/B Test - explicitly control the canonicalization
 */

require('dotenv').config();

const FilterBasedExplorationStrategy = require('./src/core/discovery/strategies/exploration/FilterBasedExplorationStrategy');
const FilterDiscoveryStrategy = require('./src/core/discovery/strategies/exploration/FilterDiscoveryStrategy');
const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const { logger } = require('./src/utils/logger');

async function properABTest() {
  console.log('🧪 PROPER A/B Test: Explicit Feature Control');
  console.log('============================================\n');
  
  const browserManager = new BrowserManagerBrowserless();
  const categoryUrl = 'https://glasswingshop.com/collections/mens-collection';
  
  // Test A: EXPLICITLY DISABLE canonicalization
  console.log('🔴 TEST A (BASELINE): canonicalizedDedup = FALSE');
  console.log('================================================');
  
  const filterDiscoveryA = new FilterDiscoveryStrategy(browserManager, {
    logger: logger,
    maxFilters: 8  // More filters to catch duplicates
  });
  
  const filterExplorerA = new FilterBasedExplorationStrategy(browserManager, {
    logger: logger,
    maxFilters: 8,
    filterDiscoveryStrategy: filterDiscoveryA,
    useDiscoveredFilters: true,
    captureFilterCombinations: false,
    pageLoadDelay: 1000,
    filterClickDelay: 500,
    filterProcessDelay: 1000,
    filterRemovalDelay: 500,
    features: {
      canonicalizedDedup: false,  // EXPLICITLY FALSE
      filterExclusions: true
    }
  });
  
  console.log(`   canonicalizedDedup setting: ${filterExplorerA.options.features.canonicalizedDedup}`);
  
  try {
    const resultsA = await filterExplorerA.exploreWithFilters(categoryUrl, 'mens-collection');
    
    console.log(`\n📊 BASELINE RESULTS (should have duplicates):`);
    console.log(`   Total Products: ${resultsA.totalProducts}`);
    console.log(`   Filters Processed: ${resultsA.filterPaths.length}`);
    
    // Manual deduplication to see how many duplicates there were
    const manualDedup = new Set();
    resultsA.products.forEach(product => {
      const cleanUrl = product.url.split('?')[0];
      manualDedup.add(cleanUrl);
    });
    console.log(`   Manual Dedup: ${manualDedup.size} unique`);
    console.log(`   Duplicates Found: ${resultsA.totalProducts - manualDedup.size}`);
    
    // Test B: EXPLICITLY ENABLE canonicalization
    console.log('\n🟢 TEST B (TREATMENT): canonicalizedDedup = TRUE');
    console.log('=================================================');
    
    const filterDiscoveryB = new FilterDiscoveryStrategy(browserManager, {
      logger: logger,
      maxFilters: 8
    });
    
    const filterExplorerB = new FilterBasedExplorationStrategy(browserManager, {
      logger: logger,
      maxFilters: 8,
      filterDiscoveryStrategy: filterDiscoveryB,
      useDiscoveredFilters: true,
      captureFilterCombinations: false,
      pageLoadDelay: 1000,
      filterClickDelay: 500,
      filterProcessDelay: 1000,
      filterRemovalDelay: 500,
      features: {
        canonicalizedDedup: true,   // EXPLICITLY TRUE
        filterExclusions: true
      }
    });
    
    console.log(`   canonicalizedDedup setting: ${filterExplorerB.options.features.canonicalizedDedup}`);
    
    const resultsB = await filterExplorerB.exploreWithFilters(categoryUrl, 'mens-collection');
    
    console.log(`\n📊 TREATMENT RESULTS (should be deduplicated):`);
    console.log(`   Total Products: ${resultsB.totalProducts}`);
    console.log(`   Filters Processed: ${resultsB.filterPaths.length}`);
    
    // Final comparison
    console.log('\n🎯 PROPER A/B COMPARISON');
    console.log('==========================');
    console.log(`   Baseline (no dedup): ${resultsA.totalProducts} products`);
    console.log(`   Treatment (with dedup): ${resultsB.totalProducts} products`);
    console.log(`   Duplicates Removed by System: ${resultsA.totalProducts - resultsB.totalProducts}`);
    console.log(`   Manual Dedup Found: ${resultsA.totalProducts - manualDedup.size} duplicates in baseline`);
    
    if (resultsA.totalProducts > resultsB.totalProducts) {
      const improvement = ((resultsA.totalProducts - resultsB.totalProducts) / resultsA.totalProducts * 100).toFixed(1);
      console.log(`   ✅ SUCCESS: UrlCanonicalizer removed ${improvement}% duplicates!`);
    } else if (resultsA.totalProducts === resultsB.totalProducts) {
      console.log(`   ⚠️ No difference - may need to check implementation or test with more filters`);
    }
    
    console.log('\n✅ Proper A/B Test Complete!');
    
  } catch (error) {
    console.error('❌ Error during A/B test:', error);
  }
}

properABTest().catch(console.error);