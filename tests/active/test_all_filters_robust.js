#!/usr/bin/env node

/**
 * Robust test for ALL filters with crash handling and filter exclusions
 */

require('dotenv').config();

const FilterBasedExplorationStrategy = require('./src/core/discovery/strategies/exploration/FilterBasedExplorationStrategy');
const FilterDiscoveryStrategy = require('./src/core/discovery/strategies/exploration/FilterDiscoveryStrategy');
const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const { logger } = require('./src/utils/logger');
const { canonicalizeUrl } = require('./src/common/UrlCanonicalizer');
const { FilterPatterns } = require('./src/common/FilterPatterns');
const fs = require('fs').promises;

async function testAllFiltersRobust() {
  const categoryUrl = 'https://glasswingshop.com/collections/mens-collection';
  
  console.log(`🚀 Testing ALL filters on: ${categoryUrl}\n`);
  console.log('This will process every filter with crash recovery...\n');
  
  const startTime = Date.now();
  const filterTimings = [];
  const allProducts = [];
  const productsByFilter = {};
  let processedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  
  // Get all filters first
  console.log('📋 Discovering all available filters...\n');
  const browserManager = new BrowserManagerBrowserless();
  
  let allFilters = [];
  try {
    const filterDiscovery = new FilterDiscoveryStrategy(browserManager, {
      logger: logger,
      maxFilters: 100 // Get ALL filters
    });
    
    const { page, close } = await browserManager.createBrowser('stealth');
    await page.goto(categoryUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const discoveryResults = await filterDiscovery.discoverFilterCandidates(page, categoryUrl);
    allFilters = discoveryResults.candidates;
    
    await close();
    
    console.log(`Found ${allFilters.length} total filters\n`);
  } catch (error) {
    console.error('Failed to discover filters:', error.message);
    return;
  }
  
  // Filter out non-product filters using the reusable FilterPatterns utility
  const filterPatterns = new FilterPatterns();
  const validFilters = filterPatterns.filterValidCandidates(allFilters);
  skippedCount = allFilters.length - validFilters.length;
  
  console.log(`\n✅ Will process ${validFilters.length} product-related filters\n`);
  console.log('=' .repeat(60) + '\n');
  
  // Process each filter individually with new browser session
  for (let i = 0; i < validFilters.length; i++) {
    const filter = validFilters[i];
    const filterStart = Date.now();
    
    console.log(`\n⏱️  [${i + 1}/${validFilters.length}] Processing filter: "${filter.label}"`);
    
    try {
      // Create fresh browser session for each filter
      const filterBrowserManager = new BrowserManagerBrowserless();
      const filterDiscovery = new FilterDiscoveryStrategy(filterBrowserManager, {
        logger: logger,
        maxFilters: 1
      });
      
      const filterExplorer = new FilterBasedExplorationStrategy(filterBrowserManager, {
        logger: logger,
        maxFilters: 1,
        filterDiscoveryStrategy: filterDiscovery,
        useDiscoveredFilters: false, // We'll apply manually
        captureFilterCombinations: false,
        pageLoadDelay: 3000,
        filterClickDelay: 1000,
        filterProcessDelay: 2000,
        filterRemovalDelay: 1000
      });
      
      // Navigate and apply just this filter
      const { page, close } = await filterBrowserManager.createBrowser('stealth');
      
      await page.goto(categoryUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Get baseline products first
      const baselineProducts = await filterExplorer.captureProducts(page, 'baseline');
      
      // Apply the specific filter
      const element = await page.$(filter.selector);
      if (element) {
        await element.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await page.waitForLoadState('networkidle');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Capture filtered products
        const filteredProducts = await filterExplorer.captureProducts(page, filter.label);
        
        // Store products
        if (!productsByFilter[filter.label]) {
          productsByFilter[filter.label] = [];
        }
        
        filteredProducts.forEach(product => {
          const cleanUrl = canonicalizeUrl(product.url);
          productsByFilter[filter.label].push({
            url: cleanUrl,
            title: product.title,
            filter: filter.label
          });
          allProducts.push({
            ...product,
            url: cleanUrl, // Use canonicalized URL in allProducts too
            filter: filter.label
          });
        });
        
        console.log(`   ✓ Found ${filteredProducts.length} products`);
        processedCount++;
      } else {
        console.log(`   ⚠️  Filter element not found`);
        failedCount++;
      }
      
      await close();
      
      const filterDuration = Date.now() - filterStart;
      filterTimings.push({
        filterName: filter.label,
        filterType: filter.elementType,
        duration_ms: filterDuration,
        duration_seconds: (filterDuration / 1000).toFixed(2),
        productsFound: productsByFilter[filter.label]?.length || 0
      });
      
      console.log(`   ⏱️  Completed in ${(filterDuration / 1000).toFixed(2)}s`);
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      failedCount++;
      
      filterTimings.push({
        filterName: filter.label,
        filterType: filter.elementType,
        duration_ms: Date.now() - filterStart,
        duration_seconds: ((Date.now() - filterStart) / 1000).toFixed(2),
        productsFound: 0,
        error: error.message
      });
    }
    
    // Progress update every 5 filters
    if ((i + 1) % 5 === 0) {
      console.log(`\n📊 Progress: ${i + 1}/${validFilters.length} filters processed`);
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      const remaining = (validFilters.length - i - 1) / rate;
      console.log(`   Time elapsed: ${(elapsed / 60).toFixed(1)} minutes`);
      console.log(`   Est. remaining: ${(remaining / 60).toFixed(1)} minutes\n`);
    }
  }
  
  const totalDuration = Date.now() - startTime;
  
  // Calculate unique products using canonicalizer
  const uniqueProductUrls = new Set();
  allProducts.forEach(product => {
    // URLs are already canonicalized in the processing loop above
    uniqueProductUrls.add(product.url);
  });
  
  // Calculate timing statistics
  const successfulTimings = filterTimings.filter(t => !t.error);
  const timingStats = {
    totalFiltersAttempted: validFilters.length,
    totalFiltersProcessed: processedCount,
    totalFiltersFailed: failedCount,
    totalFiltersSkipped: skippedCount,
    
    totalDuration_ms: totalDuration,
    totalDuration_seconds: (totalDuration / 1000).toFixed(2),
    totalDuration_minutes: (totalDuration / 60000).toFixed(2),
    
    averagePerFilter_ms: successfulTimings.length > 0 ? 
      Math.round(successfulTimings.reduce((sum, t) => sum + t.duration_ms, 0) / successfulTimings.length) : 0,
    averagePerFilter_seconds: successfulTimings.length > 0 ?
      (successfulTimings.reduce((sum, t) => sum + t.duration_ms, 0) / successfulTimings.length / 1000).toFixed(2) : 0,
    
    fastestFilter: successfulTimings.length > 0 ?
      successfulTimings.reduce((min, t) => t.duration_ms < min.duration_ms ? t : min) : null,
    slowestFilter: successfulTimings.length > 0 ?
      successfulTimings.reduce((max, t) => t.duration_ms > max.duration_ms ? t : max) : null,
    
    breakdown: filterTimings
  };
  
  // Prepare final output
  const output = {
    summary: {
      totalFiltersDiscovered: allFilters.length,
      totalFiltersSkipped: skippedCount,
      totalFiltersProcessed: processedCount,
      totalFiltersFailed: failedCount,
      totalProductsCaptured: allProducts.length,
      uniqueProductsFound: uniqueProductUrls.size,
      duplicateCount: allProducts.length - uniqueProductUrls.size,
      deduplicationRate: allProducts.length > 0 ? 
        ((1 - uniqueProductUrls.size / allProducts.length) * 100).toFixed(1) + '%' : '0%'
    },
    
    timing: timingStats,
    
    filterCoverage: Object.keys(productsByFilter)
      .map(filter => ({
        filterName: filter,
        productsFound: productsByFilter[filter].length
      }))
      .sort((a, b) => b.productsFound - a.productsFound),
    
    uniqueProducts: Array.from(uniqueProductUrls),
    
    skippedFilters: allFilters
      .filter(f => excludePatterns.some(pattern => pattern.test(f.label)))
      .map(f => f.label)
  };
  
  // Save to file
  const filename = `all_filters_robust_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await fs.writeFile(filename, JSON.stringify(output, null, 2));
  
  // Console output
  console.log('\n' + '='.repeat(70));
  console.log('📊 COMPLETE FILTER ANALYSIS WITH TIMING');
  console.log('='.repeat(70));
  
  console.log('\n📈 SUMMARY:');
  console.log(`   Filters Discovered: ${output.summary.totalFiltersDiscovered}`);
  console.log(`   Filters Skipped: ${output.summary.totalFiltersSkipped} (non-product filters)`);
  console.log(`   Filters Processed: ${output.summary.totalFiltersProcessed}`);
  console.log(`   Filters Failed: ${output.summary.totalFiltersFailed}`);
  console.log(`   Total Products Captured: ${output.summary.totalProductsCaptured}`);
  console.log(`   Unique Products: ${output.summary.uniqueProductsFound}`);
  console.log(`   Duplicates: ${output.summary.duplicateCount} (${output.summary.deduplicationRate} duplication)`);
  
  console.log('\n⏱️  TIMING METRICS:');
  console.log(`   Total Duration: ${timingStats.totalDuration_minutes} minutes`);
  console.log(`   Average Per Filter: ${timingStats.averagePerFilter_seconds} seconds`);
  if (timingStats.fastestFilter) {
    console.log(`   Fastest Filter: "${timingStats.fastestFilter.filterName}" - ${timingStats.fastestFilter.duration_seconds}s`);
    console.log(`   Slowest Filter: "${timingStats.slowestFilter.filterName}" - ${timingStats.slowestFilter.duration_seconds}s`);
  }
  
  console.log('\n🏆 TOP 10 FILTERS BY PRODUCTS:');
  output.filterCoverage.slice(0, 10).forEach((filter, idx) => {
    console.log(`   ${idx + 1}. ${filter.filterName}: ${filter.productsFound} products`);
  });
  
  console.log('\n💾 Full results saved to:', filename);
  console.log('\n✅ Test complete!');
}

testAllFiltersRobust().catch(console.error);