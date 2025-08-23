#!/usr/bin/env node

/**
 * Test ALL filters with detailed timing metrics
 */

require('dotenv').config();

const FilterBasedExplorationStrategy = require('./src/core/discovery/strategies/exploration/FilterBasedExplorationStrategy');
const FilterDiscoveryStrategy = require('./src/core/discovery/strategies/exploration/FilterDiscoveryStrategy');
const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const { logger } = require('./src/utils/logger');
const fs = require('fs').promises;

async function testAllFiltersWithTiming() {
  const browserManager = new BrowserManagerBrowserless();
  
  // Create discovery strategy first
  const filterDiscovery = new FilterDiscoveryStrategy(browserManager, {
    logger: logger,
    maxFilters: 100 // Get ALL filters
  });
  
  // Create exploration strategy with discovery
  const filterExplorer = new FilterBasedExplorationStrategy(browserManager, {
    logger: logger,
    maxFilters: 100, // Process ALL filters
    filterDiscoveryStrategy: filterDiscovery,
    useDiscoveredFilters: true,
    captureFilterCombinations: false, // Skip combinations for speed
    // Keep delays for anti-bot
    pageLoadDelay: 3000,
    filterClickDelay: 1000,
    filterProcessDelay: 2000,
    filterRemovalDelay: 1000
  });
  
  try {
    const categoryUrl = 'https://glasswingshop.com/collections/mens-collection';
    
    console.log(`🚀 Testing ALL filters on: ${categoryUrl}\n`);
    console.log('This will process every single filter and track timing...\n');
    
    const startTime = Date.now();
    
    // Override exploreWithFilters to add detailed timing
    const originalProcessFilter = filterExplorer.processFilter.bind(filterExplorer);
    const filterTimings = [];
    
    filterExplorer.processFilter = async function(page, filter, categoryName, categoryUrl) {
      const filterStart = Date.now();
      console.log(`\n⏱️  Processing filter: "${filter.text}"`);
      
      const result = await originalProcessFilter(page, filter, categoryName, categoryUrl);
      
      const filterDuration = Date.now() - filterStart;
      const timing = {
        filterName: filter.text,
        filterType: filter.type,
        duration_ms: filterDuration,
        duration_seconds: (filterDuration / 1000).toFixed(2)
      };
      
      filterTimings.push(timing);
      console.log(`   ✓ Completed in ${timing.duration_seconds}s`);
      
      return result;
    };
    
    // Run exploration
    const results = await filterExplorer.exploreWithFilters(categoryUrl, 'mens-collection');
    
    const totalDuration = Date.now() - startTime;
    
    // Calculate timing statistics
    const timingStats = {
      totalFiltersProcessed: filterTimings.length,
      totalDuration_ms: totalDuration,
      totalDuration_seconds: (totalDuration / 1000).toFixed(2),
      totalDuration_minutes: (totalDuration / 60000).toFixed(2),
      
      averagePerFilter_ms: Math.round(totalDuration / filterTimings.length),
      averagePerFilter_seconds: (totalDuration / filterTimings.length / 1000).toFixed(2),
      
      fastestFilter: filterTimings.reduce((min, t) => t.duration_ms < min.duration_ms ? t : min),
      slowestFilter: filterTimings.reduce((max, t) => t.duration_ms > max.duration_ms ? t : max),
      
      breakdown: filterTimings
    };
    
    // Strip query params to get unique products
    const uniqueProductUrls = new Set();
    const productsByFilter = {};
    
    results.products.forEach(product => {
      const cleanUrl = product.url.split('?')[0];
      uniqueProductUrls.add(cleanUrl);
      
      product.filters.forEach(filter => {
        if (!productsByFilter[filter]) {
          productsByFilter[filter] = new Set();
        }
        productsByFilter[filter].add(cleanUrl);
      });
    });
    
    // Prepare final output
    const output = {
      summary: {
        totalFiltersDiscovered: results.filterPaths.length,
        totalProductsCaptured: results.totalProducts,
        uniqueProductsFound: uniqueProductUrls.size,
        duplicateCount: results.totalProducts - uniqueProductUrls.size,
        deduplicationRate: ((1 - uniqueProductUrls.size / results.totalProducts) * 100).toFixed(1) + '%'
      },
      
      timing: timingStats,
      
      filterCoverage: Object.keys(productsByFilter).map(filter => ({
        filterName: filter,
        productsFound: productsByFilter[filter].size
      })).sort((a, b) => b.productsFound - a.productsFound),
      
      uniqueProducts: Array.from(uniqueProductUrls),
      
      rawResults: {
        totalProducts: results.totalProducts,
        filterPaths: results.filterPaths,
        stats: results.stats
      }
    };
    
    // Save to file
    const filename = `all_filters_timing_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await fs.writeFile(filename, JSON.stringify(output, null, 2));
    
    // Console output
    console.log('\n' + '='.repeat(70));
    console.log('📊 COMPLETE FILTER ANALYSIS WITH TIMING');
    console.log('='.repeat(70));
    
    console.log('\n📈 SUMMARY:');
    console.log(`   Filters Processed: ${output.summary.totalFiltersDiscovered}`);
    console.log(`   Total Products Captured: ${output.summary.totalProductsCaptured}`);
    console.log(`   Unique Products: ${output.summary.uniqueProductsFound}`);
    console.log(`   Duplicates: ${output.summary.duplicateCount} (${output.summary.deduplicationRate} duplication)`);
    
    console.log('\n⏱️  TIMING METRICS:');
    console.log(`   Total Duration: ${timingStats.totalDuration_minutes} minutes (${timingStats.totalDuration_seconds} seconds)`);
    console.log(`   Average Per Filter: ${timingStats.averagePerFilter_seconds} seconds`);
    console.log(`   Fastest Filter: "${timingStats.fastestFilter.filterName}" - ${timingStats.fastestFilter.duration_seconds}s`);
    console.log(`   Slowest Filter: "${timingStats.slowestFilter.filterName}" - ${timingStats.slowestFilter.duration_seconds}s`);
    
    console.log('\n🏆 TOP 10 FILTERS BY PRODUCTS:');
    output.filterCoverage.slice(0, 10).forEach((filter, idx) => {
      console.log(`   ${idx + 1}. ${filter.filterName}: ${filter.productsFound} products`);
    });
    
    console.log('\n💾 Full results saved to:', filename);
    console.log('\n✅ Test complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testAllFiltersWithTiming().catch(console.error);