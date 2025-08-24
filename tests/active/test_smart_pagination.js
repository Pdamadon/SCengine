#!/usr/bin/env node

require('dotenv').config();

const ProductDiscoveryProcessor = require('../../src/core/discovery/processors/ProductDiscoveryProcessor');
const BrowserManagerBrowserless = require('../../src/common/browser/managers/BrowserManagerBrowserless');
const { logger } = require('../../src/utils/logger');

async function testSmartPagination() {
  console.log('🧪 Testing Smart Pagination Handler');
  console.log('===================================\n');

  const sites = [
    {
      name: 'Fig & Willow (Numbered)',
      url: 'https://shopfigandwillow.com/collections/tops',
      expectedType: 'numbered'
    },
    {
      name: 'Target (Load-More)', 
      url: 'https://www.target.com/c/women-s-clothing/-/N-4y6l9',
      expectedType: 'load-more'
    }
  ];

  const browserManager = new BrowserManagerBrowserless({
    logger: logger,
    maxConcurrentPages: 1,
    browserTimeout: 30000
  });

  const processor = new ProductDiscoveryProcessor({
    maxProductsPerCategory: 30,
    enablePagination: true,
    maxPaginationDepth: 2
  });

  const results = [];

  for (const site of sites) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🔍 Testing ${site.name}`);
    console.log('=' + '='.repeat(site.name.length + 10));
    
    try {
      const { page, close } = await browserManager.createBrowser('stealth');
      
      await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      
      // Test pagination type detection
      const detectedType = await processor.paginationHandler.detectPaginationType(page);
      console.log(`Expected type: ${site.expectedType}`);
      console.log(`Detected type: ${detectedType}`);
      
      // Extract products from page 1
      const page1Products = await processor.extractProductsFromPage(page);
      console.log(`Page 1 products: ${page1Products.length}`);
      
      if (page1Products.length > 0) {
        console.log(`Sample: ${page1Products.slice(0, 2).join(', ')}\n`);
        
        // Test smart pagination
        console.log('🔄 Testing smart pagination...');
        const paginatedProducts = await processor.handlePagination(page, 1);
        
        const uniquePaginated = [...new Set(paginatedProducts)];
        const page1Set = new Set(page1Products);
        const newFromPagination = uniquePaginated.filter(p => !page1Set.has(p));
        
        console.log(`Total paginated products: ${paginatedProducts.length}`);
        console.log(`Unique paginated products: ${uniquePaginated.length}`);
        console.log(`New from pagination: ${newFromPagination.length}`);
        
        const success = newFromPagination.length > 0 || detectedType === 'single-page';
        console.log(success ? '✅ SUCCESS' : '❌ FAIL');
        
        if (newFromPagination.length > 0) {
          console.log(`Sample new products: ${newFromPagination.slice(0, 2).join(', ')}`);
        }
        
        results.push({
          site: site.name,
          success: success,
          detectedType: detectedType,
          expectedType: site.expectedType,
          typeMatch: detectedType === site.expectedType,
          page1Count: page1Products.length,
          totalProducts: uniquePaginated.length,
          newProducts: newFromPagination.length
        });
        
      } else {
        console.log('❌ No products found on page 1');
        results.push({
          site: site.name,
          success: false,
          detectedType: detectedType,
          expectedType: site.expectedType,
          typeMatch: false,
          page1Count: 0,
          totalProducts: 0,
          newProducts: 0
        });
      }
      
      await close();
      
    } catch (error) {
      console.log(`❌ Error testing ${site.name}: ${error.message}`);
      results.push({
        site: site.name,
        success: false,
        error: error.message
      });
    }
    
    // Wait between tests
    if (results.length < sites.length) {
      console.log('\n⏳ Waiting 3 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Final summary
  console.log(`\n${'='.repeat(50)}`);
  console.log('📊 Smart Pagination Test Results');
  console.log('=================================');
  
  const successful = results.filter(r => r.success);
  const typeMatches = results.filter(r => r.typeMatch);
  
  console.log(`✅ Successful pagination: ${successful.length}/${results.length} sites`);
  console.log(`🎯 Correct type detection: ${typeMatches.length}/${results.length} sites`);
  
  results.forEach(r => {
    if (r.error) {
      console.log(`  ❌ ${r.site}: ${r.error}`);
    } else {
      const typeIcon = r.typeMatch ? '🎯' : '❌';
      const paginationIcon = r.success ? '✅' : '❌';
      console.log(`  ${paginationIcon} ${typeIcon} ${r.site}: ${r.detectedType} (${r.newProducts} new products)`);
    }
  });
  
  const overallSuccess = successful.length >= Math.ceil(results.length / 2);
  console.log(`\n${overallSuccess ? '✅' : '❌'} Overall: Smart pagination ${overallSuccess ? 'working' : 'needs improvement'}`);
  
  return overallSuccess;
}

// Run the test
if (require.main === module) {
  testSmartPagination()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test crashed:', error);
      process.exit(1);
    });
}

module.exports = { testSmartPagination };