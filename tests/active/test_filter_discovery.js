#!/usr/bin/env node

/**
 * Test FilterDiscoveryStrategy on Glasswing category page
 * Tests Phase 1 of the two-phase filter approach: Discovery and Classification
 */

// Load environment variables for browserless protection
require('dotenv').config();

const FilterDiscoveryStrategy = require('./src/core/discovery/strategies/exploration/FilterDiscoveryStrategy');
const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const { logger } = require('./src/utils/logger');

async function testFilterDiscovery() {
  console.log('🔍 Testing FilterDiscoveryStrategy - Phase 1 of filter approach...\n');
  
  const browserManager = new BrowserManagerBrowserless();
  const filterDiscovery = new FilterDiscoveryStrategy({
    logger: logger,
    maxFiltersPerGroup: 15,
    minFiltersToConsiderGroup: 2,
    trackFilterMetadata: true
  });

  const { page, close } = await browserManager.createBrowser('stealth');

  try {
    // Test on Glasswing men's collection page that has filters shown in screenshot
    const categoryUrl = 'https://glasswingshop.com/collections/mens-collection';
    
    console.log(`📍 Testing filter discovery on: ${categoryUrl}`);
    console.log(`🎯 Looking for filter groups like brands, categories, etc.\n`);
    
    // Navigate to the page
    console.log('🌐 Navigating to page...');
    await page.goto(categoryUrl, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('✅ Page loaded\n');
    
    const startTime = performance.now();
    
    // Run filter discovery
    console.log('🔍 Starting filter discovery...');
    const filterResults = await filterDiscovery.discoverFilterCandidates(page, categoryUrl);
    
    const duration = Math.round(performance.now() - startTime);
    
    // Display discovery results
    console.log('🎯 Filter Discovery Results:');
    console.log('=====================================');
    console.log(`⏱️  Discovery Duration: ${duration}ms`);
    console.log(`🎯 Total Candidates Found: ${filterResults.totalCandidates}`);
    console.log(`🌐 Page Title: ${filterResults.metadata?.pageTitle || 'Unknown'}`);
    console.log(`📊 Types Found: ${Object.keys(filterResults.stats?.byType || {}).join(', ')}`);
    console.log(`📊 Containers: ${Object.keys(filterResults.stats?.byContainer || {}).join(', ')}`);
    
    // Show candidate details
    if (filterResults.totalCandidates > 0) {
      console.log('\n🎯 Filter Candidates:');
      filterResults.candidates.slice(0, 10).forEach((candidate, index) => {
        console.log(`\n  ${index + 1}. "${candidate.label}" (${candidate.elementType})`);
        console.log(`     Score: ${candidate.score}`);
        console.log(`     Selector: ${candidate.selector}`);
        console.log(`     Container: ${candidate.containerHint || 'unknown'}`);
        console.log(`     Visibility: ${candidate.visibility}`);
        
        if (candidate.elementType === 'checkbox' || candidate.elementType === 'radio') {
          console.log(`     Name: ${candidate.name}, Value: ${candidate.value}, Checked: ${candidate.checked}`);
        }
        
        if (candidate.href) {
          console.log(`     URL: ${candidate.href}`);
        }
      });
      
      if (filterResults.candidates.length > 10) {
        console.log(`\n   ... and ${filterResults.candidates.length - 10} more candidates`);
      }
    } else {
      console.log('\n⚠️  No filter candidates discovered');
      console.log('   This could mean:');
      console.log('   - No filters on this page');
      console.log('   - Filters use different patterns than expected');
      console.log('   - Score threshold too high');
    }
    
    // Validate the discovered candidates
    console.log('\n🔬 Validation Results:');
    const validation = filterDiscovery.validateCandidates(filterResults);
    console.log(`✅ Is Valid: ${validation.isValid}`);
    
    if (validation.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      validation.warnings.forEach(warning => {
        console.log(`   - ${warning}`);
      });
    }
    
    if (validation.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      validation.recommendations.forEach(rec => {
        console.log(`   - ${rec}`);
      });
    }
    
    // Show statistics
    console.log('\n📊 Statistics:');
    console.log(`   By Type: ${JSON.stringify(filterResults.stats?.byType || {})}`);
    console.log(`   Score Distribution: ${JSON.stringify(filterResults.stats?.scoreDistribution || {})}`);
    
    console.log('\n✅ Filter discovery test completed successfully!');
    
    return filterResults;
    
  } catch (error) {
    console.error('❌ Filter discovery test failed:', error);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    await close();
  }
}

// Run the test
if (require.main === module) {
  testFilterDiscovery()
    .then(results => {
      console.log('\n🎉 Discovery test completed!');
      console.log(`📊 Summary: ${results.totalGroups} groups, ${results.totalFilters} filters`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Discovery test failed:', error.message);
      process.exit(1);
    });
}

module.exports = testFilterDiscovery;