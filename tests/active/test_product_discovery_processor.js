#!/usr/bin/env node

require('dotenv').config();

const ProductDiscoveryProcessor = require('../../src/core/discovery/processors/ProductDiscoveryProcessor');
const BrowserManagerBrowserless = require('../../src/common/browser/managers/BrowserManagerBrowserless');
const { logger } = require('../../src/utils/logger');

async function testProductDiscoveryProcessor() {
  const testUrl = 'https://shopfigandwillow.com/collections/tops';
  console.log('🧪 Testing ProductDiscoveryProcessor');
  console.log('===================================');
  console.log(`Target URL: ${testUrl}\n`);

  const browserManager = new BrowserManagerBrowserless({
    logger: logger,
    maxConcurrentPages: 1,
    browserTimeout: 30000
  });

  const processor = new ProductDiscoveryProcessor({
    maxProductsPerCategory: 50,
    enablePagination: true,
    maxPaginationDepth: 2,
    validateProductUrls: true
  });

  try {
    // Create browser page
    console.log('🌐 Creating browser page...');
    const { page, close } = await browserManager.createBrowser('stealth');
    
    console.log('📄 Navigating to category page...');
    await page.goto(testUrl, { 
      waitUntil: 'domcontentloaded', 
      timeout: 30000 
    });

    console.log('⏱️  Waiting for page to load...');
    await page.waitForTimeout(3000);

    console.log('🔍 Running ProductDiscoveryProcessor...');
    
    // Test if the processor has the expected methods
    console.log('\n📋 Available Methods:');
    console.log('- discoverProducts:', typeof processor.discoverProducts);
    console.log('- extractProductsFromPage:', typeof processor.extractProductsFromPage);
    console.log('- detectPagination:', typeof processor.detectPagination);
    console.log('- validateProductUrl:', typeof processor.validateProductUrl);
    console.log('- handlePagination:', typeof processor.handlePagination);

    // Try to extract products directly from page
    if (typeof processor.extractProductsFromPage === 'function') {
      console.log('\n🎯 Calling extractProductsFromPage...');
      const products = await processor.extractProductsFromPage(page);
      
      // Deduplicate products
      const uniqueProducts = [...new Set(products)];
      
      console.log('\n📊 Results:');
      console.log('===========');
      console.log(`Products found (raw): ${products?.length || 0}`);
      console.log(`Products found (unique): ${uniqueProducts?.length || 0}`);
      console.log(`Duplicates removed: ${(products?.length || 0) - (uniqueProducts?.length || 0)}`);
      
      if (uniqueProducts?.length > 0) {
        console.log('\n🔗 Sample Product URLs:');
        uniqueProducts.slice(0, 10).forEach((product, i) => {
          console.log(`  ${i + 1}. ${product}`);
        });
        
        if (uniqueProducts.length > 10) {
          console.log(`  ... and ${uniqueProducts.length - 10} more`);
        }
        
        // Check if products look like valid Shopify product URLs
        console.log('\n🔍 URL Pattern Analysis:');
        const shopifyPattern = /\/products\/[^\/]+$/;
        const validShopifyUrls = uniqueProducts.filter(url => shopifyPattern.test(url));
        console.log(`Shopify product URLs: ${validShopifyUrls.length}/${uniqueProducts.length} (${Math.round(100 * validShopifyUrls.length / uniqueProducts.length)}%)`);
      }
      
      // Test pagination manually since detectPagination method doesn't exist
      console.log('\n📄 Testing pagination detection manually...');
      try {
        // Check for Shopify pagination patterns
        const nextPageSelectors = [
          'a[rel="next"]',
          '.pagination .next:not(.disabled)',
          'a[aria-label*="next"]',
          'a[href*="page=2"]',
          'a:has-text("Next")',
          'a:has-text(">")'
        ];
        
        let nextPageFound = false;
        let nextPageUrl = null;
        
        for (const selector of nextPageSelectors) {
          try {
            const nextLink = await page.$(selector);
            if (nextLink) {
              nextPageUrl = await nextLink.getAttribute('href');
              if (nextPageUrl) {
                nextPageFound = true;
                console.log(`Next page found with selector: ${selector}`);
                console.log(`Next page URL: ${nextPageUrl}`);
                break;
              }
            }
          } catch (e) {
            // Try next selector
          }
        }
        
        if (!nextPageFound) {
          console.log('No pagination detected - single page collection');
          
          // Let's check how many products are actually on the page visually
          const productCount = await page.$$eval('.product-item, .product-card, [data-product-id]', els => els.length);
          console.log(`Visible product elements on page: ${productCount}`);
        } else {
          console.log('✅ Pagination detected!');
          
          // Test pagination handling with the processor
          if (typeof processor.handlePagination === 'function') {
            console.log('\n🔄 Testing handlePagination method...');
            try {
              const paginationResult = await processor.handlePagination(page);
              console.log(`Pagination handling result: ${JSON.stringify(paginationResult)}`);
            } catch (pagError) {
              console.log(`Pagination handling failed: ${pagError.message}`);
            }
          }
        }
        
      } catch (paginationError) {
        console.log(`Pagination detection error: ${paginationError.message}`);
      }
      
    } else if (typeof processor.discoverProducts === 'function') {
      console.log('\n🎯 Calling discoverProducts (expecting navigationData)...');
      const result = await processor.discoverProducts(null, page);
      console.log(`Result: ${JSON.stringify(result, null, 2)}`);
    } else {
      console.log('\n⚠️  discoverProducts method not found');
      
      // Try alternative method names
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(processor));
      console.log('\n🔧 Available methods on processor:');
      methods.forEach(method => {
        if (typeof processor[method] === 'function' && !method.startsWith('_')) {
          console.log(`  - ${method}`);
        }
      });
    }

    await close();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
  
  console.log('\n✅ Test completed');
  return true;
}

// Run the test
if (require.main === module) {
  testProductDiscoveryProcessor()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test crashed:', error);
      process.exit(1);
    });
}

module.exports = { testProductDiscoveryProcessor };