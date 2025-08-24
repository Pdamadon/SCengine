#!/usr/bin/env node

require('dotenv').config();

const ProductDiscoveryProcessor = require('../../src/core/discovery/processors/ProductDiscoveryProcessor');
const BrowserManagerBrowserless = require('../../src/common/browser/managers/BrowserManagerBrowserless');
const { logger } = require('../../src/utils/logger');

async function testHandlePaginationDirect() {
  console.log('🧪 Testing handlePagination Method Directly');
  console.log('==========================================\n');

  const browserManager = new BrowserManagerBrowserless({
    logger: logger,
    maxConcurrentPages: 1,
    browserTimeout: 30000
  });

  const processor = new ProductDiscoveryProcessor({
    maxProductsPerCategory: 100,
    enablePagination: true,
    maxPaginationDepth: 3
  });

  try {
    const { page, close } = await browserManager.createBrowser('stealth');
    
    console.log('📄 Starting on page 1...');
    await page.goto('https://shopfigandwillow.com/collections/tops', { 
      waitUntil: 'domcontentloaded', 
      timeout: 30000 
    });
    await page.waitForTimeout(3000);
    
    // Get products from page 1 first
    console.log('🔍 Extracting products from page 1...');
    const page1Products = await processor.extractProductsFromPage(page);
    console.log(`Page 1: ${page1Products.length} products`);
    console.log(`Sample: ${page1Products.slice(0, 3).join(', ')}\n`);
    
    // Now test handlePagination starting from page 1
    console.log('🔄 Testing handlePagination (should get page 2+ products)...');
    const paginatedProducts = await processor.handlePagination(page, 1);
    
    console.log('\n📊 Pagination Results:');
    console.log('=======================');
    console.log(`Paginated products found: ${paginatedProducts.length}`);
    
    if (paginatedProducts.length > 0) {
      // Deduplicate and compare
      const uniquePaginated = [...new Set(paginatedProducts)];
      const page1Set = new Set(page1Products);
      const uniqueToPagination = uniquePaginated.filter(p => !page1Set.has(p));
      
      console.log(`Unique paginated products: ${uniquePaginated.length}`);
      console.log(`New products (not from page 1): ${uniqueToPagination.length}`);
      
      if (uniqueToPagination.length > 0) {
        console.log('✅ SUCCESS: handlePagination found new products!');
        console.log(`New products sample: ${uniqueToPagination.slice(0, 3).join(', ')}`);
      } else {
        console.log('❌ FAIL: handlePagination only returned page 1 products');
        console.log('This means pagination navigation is not working in the method');
      }
      
      // Show all unique products
      console.log(`\n🔗 All unique products found: ${uniquePaginated.slice(0, 5).join(', ')} ...`);
      
    } else {
      console.log('❌ FAIL: handlePagination returned no products');
    }
    
    await close();
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    return false;
  }
  
  console.log('\n✅ Test completed');
  return true;
}

// Run the test
if (require.main === module) {
  testHandlePaginationDirect()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test crashed:', error);
      process.exit(1);
    });
}

module.exports = { testHandlePaginationDirect };