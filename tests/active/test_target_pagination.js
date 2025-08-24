#!/usr/bin/env node

require('dotenv').config();

const ProductDiscoveryProcessor = require('../../src/core/discovery/processors/ProductDiscoveryProcessor');
const BrowserManagerBrowserless = require('../../src/common/browser/managers/BrowserManagerBrowserless');
const { logger } = require('../../src/utils/logger');

async function testTargetPagination() {
  console.log('🧪 Testing Target.com Pagination (Non-Shopify)');
  console.log('=============================================\n');

  const browserManager = new BrowserManagerBrowserless({
    logger: logger,
    maxConcurrentPages: 1,
    browserTimeout: 30000
  });

  const processor = new ProductDiscoveryProcessor({
    maxProductsPerCategory: 50,
    enablePagination: true,
    maxPaginationDepth: 2
  });

  try {
    const { page, close } = await browserManager.createBrowser('stealth');
    
    // Test Target's women's clothing category
    const targetUrl = 'https://www.target.com/c/women-s-clothing/-/N-4y6l9';
    
    console.log(`📄 Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000); // Target is slower to load
    
    // Extract products from page 1
    console.log('🔍 Extracting products from page 1...');
    const page1Products = await processor.extractProductsFromPage(page);
    console.log(`Page 1: ${page1Products.length} products`);
    
    if (page1Products.length > 0) {
      console.log(`Sample: ${page1Products.slice(0, 2).join(', ')}\n`);
    } else {
      console.log('❌ No products found - checking page structure');
      // Check what selectors are available
      const linkCount = await page.$$eval('a[href]', links => links.length);
      console.log(`Found ${linkCount} total links on page`);
      
      const productLinks = await page.$$eval('a[href*="/p/"]', links => 
        links.map(link => link.href).slice(0, 5)
      );
      console.log(`Target-style product links: ${productLinks.length}`);
      if (productLinks.length > 0) {
        console.log(`Sample target links: ${productLinks.join(', ')}`);
      }
    }
    
    // Test pagination detection
    console.log('🔄 Testing pagination detection...');
    const nextUrl = await processor.findNextPageUrl(page);
    if (nextUrl) {
      console.log(`✅ Next page detected: ${nextUrl}`);
      
      // Try pagination
      console.log('🔄 Testing full pagination...');
      const paginatedProducts = await processor.handlePagination(page, 1);
      console.log(`Paginated products: ${paginatedProducts.length}`);
      
      if (paginatedProducts.length > 0) {
        const uniquePaginated = [...new Set(paginatedProducts)];
        const page1Set = new Set(page1Products);
        const newFromPagination = uniquePaginated.filter(p => !page1Set.has(p));
        
        console.log(`Unique paginated: ${uniquePaginated.length}`);
        console.log(`New from pagination: ${newFromPagination.length}`);
        
        if (newFromPagination.length > 0) {
          console.log('✅ SUCCESS: Target pagination working!');
          console.log(`Sample new products: ${newFromPagination.slice(0, 2).join(', ')}`);
        } else {
          console.log('❌ FAIL: Same products on both pages');
        }
      } else {
        console.log('❌ FAIL: Pagination returned no products');
      }
    } else {
      console.log('❌ No next page found - Target might use infinite scroll or load-more');
      
      // Check for load-more buttons
      const loadMoreExists = await page.$('button[data-test*="load"], button[class*="load"]');
      if (loadMoreExists) {
        console.log('💡 Found load-more button - Target uses different pagination pattern');
      }
    }
    
    await close();
    return true;
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    return false;
  }
}

// Run the test
if (require.main === module) {
  testTargetPagination()
    .then(success => {
      console.log(`\n${success ? '✅' : '❌'} Target pagination test completed`);
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test crashed:', error);
      process.exit(1);
    });
}

module.exports = { testTargetPagination };