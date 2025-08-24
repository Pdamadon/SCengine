#!/usr/bin/env node

require('dotenv').config();

const ProductDiscoveryProcessor = require('../../src/core/discovery/processors/ProductDiscoveryProcessor');
const BrowserManagerBrowserless = require('../../src/common/browser/managers/BrowserManagerBrowserless');
const { logger } = require('../../src/utils/logger');

async function testGlasswingSmartPagination() {
  console.log('🧪 Testing Smart Pagination on Glasswing Pants Category');
  console.log('=====================================================\n');

  const glasswingUrl = 'https://glasswingshop.com/collections/mens-collection?filter.p.tag=PANTS';
  console.log(`Target URL: ${glasswingUrl}`);
  console.log('Expected: 2 pages of pants products\n');

  const browserManager = new BrowserManagerBrowserless({
    logger: logger,
    maxConcurrentPages: 1,
    browserTimeout: 30000
  });

  const processor = new ProductDiscoveryProcessor({
    maxProductsPerCategory: 100, // Allow more products
    enablePagination: true,
    maxPaginationDepth: 3 // Allow up to 3 pages
  });

  try {
    const { page, close } = await browserManager.createBrowser('stealth');
    
    console.log('📄 Navigating to Glasswing pants category...');
    await page.goto(glasswingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Test pagination type detection
    console.log('🔍 Detecting pagination type...');
    const paginationType = await processor.paginationHandler.detectPaginationType(page);
    console.log(`Detected pagination type: ${paginationType}\n`);
    
    // Extract products from page 1 only first
    console.log('📦 Extracting products from page 1...');
    const page1Products = await processor.extractProductsFromPage(page);
    console.log(`Page 1: ${page1Products.length} products found`);
    
    if (page1Products.length > 0) {
      console.log(`Sample page 1 products:`);
      page1Products.slice(0, 3).forEach((product, i) => {
        console.log(`  ${i + 1}. ${product}`);
      });
      console.log('');
    }
    
    // Now test full smart pagination
    console.log('🔄 Testing smart pagination across all pages...');
    const startTime = Date.now();
    
    // Reset to page 1
    await page.goto(glasswingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const allProducts = await processor.handlePagination(page, 1);
    const duration = Date.now() - startTime;
    
    console.log('\n📊 Smart Pagination Results:');
    console.log('============================');
    console.log(`Total products found: ${allProducts.length}`);
    console.log(`Processing time: ${Math.round(duration / 1000)}s`);
    
    // Analyze results
    const uniqueProducts = [...new Set(allProducts)];
    console.log(`Unique products: ${uniqueProducts.length}`);
    console.log(`Duplicates removed: ${allProducts.length - uniqueProducts.length}`);
    
    // Compare with page 1 only
    const page1Set = new Set(page1Products);
    const newFromPagination = uniqueProducts.filter(p => !page1Set.has(p));
    console.log(`Products from page 1: ${page1Products.length}`);
    console.log(`New products from pagination: ${newFromPagination.length}`);
    
    // Success validation
    const pagesEstimate = Math.ceil(uniqueProducts.length / (page1Products.length || 1));
    console.log(`Estimated pages processed: ${pagesEstimate}`);
    
    if (newFromPagination.length > 0) {
      console.log('\n✅ SUCCESS: Smart pagination found products from multiple pages!');
      console.log(`Sample new products from pagination:`);
      newFromPagination.slice(0, 3).forEach((product, i) => {
        console.log(`  ${i + 1}. ${product}`);
      });
      
      if (pagesEstimate >= 2) {
        console.log(`\n🎯 EXCELLENT: Successfully paginated across ${pagesEstimate} pages as expected!`);
      }
      
    } else if (paginationType === 'single-page') {
      console.log('\n✅ SUCCESS: Correctly detected single page (no pagination needed)');
      
    } else {
      console.log('\n❌ FAIL: Pagination detected but no new products found');
      console.log('This suggests pagination navigation might not be working properly');
    }
    
    // Show final sample of all products
    console.log(`\n🔗 Final product sample (first 5 of ${uniqueProducts.length}):`);
    uniqueProducts.slice(0, 5).forEach((product, i) => {
      console.log(`  ${i + 1}. ${product}`);
    });
    
    await close();
    
    return {
      success: newFromPagination.length > 0 || paginationType === 'single-page',
      paginationType: paginationType,
      totalProducts: uniqueProducts.length,
      pagesProcessed: pagesEstimate,
      newProducts: newFromPagination.length,
      processingTime: duration
    };
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
if (require.main === module) {
  testGlasswingSmartPagination()
    .then(result => {
      console.log(`\n${'='.repeat(50)}`);
      if (result.success) {
        console.log('🎉 Glasswing Smart Pagination Test: PASSED');
        console.log(`📈 Performance: ${result.totalProducts} products in ${Math.round(result.processingTime / 1000)}s`);
        console.log(`🔄 Pagination: ${result.paginationType} (${result.pagesProcessed} pages)`);
      } else {
        console.log('❌ Glasswing Smart Pagination Test: FAILED');
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

module.exports = { testGlasswingSmartPagination };