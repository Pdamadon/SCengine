#!/usr/bin/env node

/**
 * Quick A/B Validation Test
 * Tests our URL canonicalization and filter exclusion improvements
 */

require('dotenv').config();

const FilterBasedExplorationStrategy = require('./src/core/discovery/strategies/exploration/FilterBasedExplorationStrategy');
const FilterDiscoveryStrategy = require('./src/core/discovery/strategies/exploration/FilterDiscoveryStrategy');
const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const { logger } = require('./src/utils/logger');

async function testABValidation() {
  console.log('🧪 A/B Validation Test: URL Canonicalization + Filter Exclusions\n');
  
  const browserManager = new BrowserManagerBrowserless();
  const categoryUrl = 'https://glasswingshop.com/collections/mens-collection';
  
  // Test A: Baseline (features OFF)
  console.log('🔴 TEST A (BASELINE): Features OFF');
  console.log('=====================================');
  
  const filterDiscoveryA = new FilterDiscoveryStrategy(browserManager, {
    logger: logger,
    maxFilters: 5 // Quick test with just 5 filters
  });
  
  const filterExplorerA = new FilterBasedExplorationStrategy(browserManager, {
    logger: logger,
    maxFilters: 5,
    filterDiscoveryStrategy: filterDiscoveryA,
    useDiscoveredFilters: true,
    captureFilterCombinations: false,
    pageLoadDelay: 1000, // Faster for testing
    filterClickDelay: 500,
    filterProcessDelay: 1000,
    filterRemovalDelay: 500,
    // Features OFF
    features: {
      canonicalizedDedup: false,
      filterExclusions: false
    }
  });
  
  try {
    const resultsA = await filterExplorerA.exploreWithFilters(categoryUrl, 'mens-collection');
    
    // Count unique products without canonicalization
    const uniqueProductsA = new Set(resultsA.products.map(p => p.url));
    
    console.log(`\n📊 BASELINE RESULTS:`);
    console.log(`   Total Products: ${resultsA.totalProducts}`);
    console.log(`   Unique Products: ${uniqueProductsA.size}`);
    console.log(`   Duplicates: ${resultsA.totalProducts - uniqueProductsA.size}`);
    console.log(`   Filters Processed: ${resultsA.filterPaths.length}`);
    
    // Test B: Treatment (features ON)
    console.log('\n🟢 TEST B (TREATMENT): Features ON');
    console.log('=====================================');
    
    const filterDiscoveryB = new FilterDiscoveryStrategy(browserManager, {
      logger: logger,
      maxFilters: 5
    });
    
    const filterExplorerB = new FilterBasedExplorationStrategy(browserManager, {
      logger: logger,
      maxFilters: 5,
      filterDiscoveryStrategy: filterDiscoveryB,
      useDiscoveredFilters: true,
      captureFilterCombinations: false,
      pageLoadDelay: 1000,
      filterClickDelay: 500,
      filterProcessDelay: 1000,
      filterRemovalDelay: 500,
      // Features ON
      features: {
        canonicalizedDedup: true,
        filterExclusions: true
      }
    });
    
    const resultsB = await filterExplorerB.exploreWithFilters(categoryUrl, 'mens-collection');
    
    // Count unique products with canonicalization
    const uniqueProductsB = new Set(resultsB.products.map(p => p.url));
    
    console.log(`\n📊 TREATMENT RESULTS:`);
    console.log(`   Total Products: ${resultsB.totalProducts}`);
    console.log(`   Unique Products: ${uniqueProductsB.size}`);
    console.log(`   Duplicates: ${resultsB.totalProducts - uniqueProductsB.size}`);
    console.log(`   Filters Processed: ${resultsB.filterPaths.length}`);
    
    // Calculate improvements
    console.log('\n🎯 A/B COMPARISON');
    console.log('===================');
    console.log(`   Deduplication Improvement: ${uniqueProductsA.size} → ${uniqueProductsB.size} unique products`);
    console.log(`   Duplicate Reduction: ${resultsA.totalProducts - uniqueProductsA.size} → ${resultsB.totalProducts - uniqueProductsB.size} duplicates`);
    console.log(`   Filter Processing: ${resultsA.filterPaths.length} → ${resultsB.filterPaths.length} filters`);
    
    const improvementRate = ((uniqueProductsB.size - uniqueProductsA.size) / uniqueProductsA.size * 100).toFixed(1);
    console.log(`   Overall Improvement: ${improvementRate}% more unique products extracted`);
    
    console.log('\n✅ A/B Test Complete!');
    
  } catch (error) {
    console.error('❌ Error during A/B test:', error);
  }
}

testABValidation().catch(console.error);