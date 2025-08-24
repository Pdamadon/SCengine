#!/usr/bin/env node

require('dotenv').config();

const ProductDiscoveryProcessor = require('../../src/core/discovery/processors/ProductDiscoveryProcessor');
const BrowserManagerBrowserless = require('../../src/common/browser/managers/BrowserManagerBrowserless');
const { logger } = require('../../src/utils/logger');

async function testPaginationMultiSite() {
  console.log('🧪 Testing Pagination Across Multiple Sites');
  console.log('==========================================\n');

  const sites = [
    {
      name: 'Fig & Willow',
      url: 'https://shopfigandwillow.com/collections/tops',
      platform: 'Shopify'
    },
    {
      name: 'Allbirds',
      url: 'https://www.allbirds.com/collections/womens-shoes',
      platform: 'Shopify'
    },
    {
      name: 'Glossier',
      url: 'https://www.glossier.com/products',
      platform: 'Shopify'
    }
  ];

  const browserManager = new BrowserManagerBrowserless({
    logger: logger,
    maxConcurrentPages: 1,
    browserTimeout: 30000
  });

  const processor = new ProductDiscoveryProcessor({
    maxProductsPerCategory: 50,
    enablePagination: true,
    maxPaginationDepth: 2 // Test 2 pages per site
  });

  const results = [];

  try {
    const { page, close } = await browserManager.createBrowser('stealth');
    
    for (const site of sites) {
      console.log(`\n📄 Testing ${site.name} (${site.platform})`);
      console.log('=' + '='.repeat(site.name.length + 20));
      
      try {
        await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        
        // Extract products from page 1
        const page1Products = await processor.extractProductsFromPage(page);
        console.log(`Page 1: ${page1Products.length} products`);
        
        if (page1Products.length === 0) {
          console.log('❌ No products found on page 1 - skipping pagination test');
          results.push({
            site: site.name,
            status: 'failed',
            reason: 'no_products_page_1',
            page1Count: 0,
            paginationCount: 0
          });
          continue;
        }
        
        // Test pagination
        console.log('🔄 Testing pagination...');
        const paginatedProducts = await processor.handlePagination(page, 1);
        
        // Analysis
        const uniquePaginated = [...new Set(paginatedProducts)];
        const page1Set = new Set(page1Products);
        const newFromPagination = uniquePaginated.filter(p => !page1Set.has(p));
        
        console.log(`Paginated products: ${paginatedProducts.length}`);
        console.log(`Unique paginated: ${uniquePaginated.length}`);
        console.log(`New from pagination: ${newFromPagination.length}`);
        
        const success = newFromPagination.length > 0;
        console.log(success ? '✅ Pagination SUCCESS' : '❌ Pagination FAILED');
        
        results.push({
          site: site.name,
          status: success ? 'success' : 'failed',
          reason: success ? 'pagination_working' : 'no_new_products',
          page1Count: page1Products.length,
          paginationCount: uniquePaginated.length,
          newProducts: newFromPagination.length
        });
        
      } catch (error) {
        console.log(`❌ Error testing ${site.name}: ${error.message}`);
        results.push({
          site: site.name,
          status: 'error',
          reason: error.message,
          page1Count: 0,
          paginationCount: 0
        });
      }
    }
    
    await close();
    
    // Summary
    console.log('\n📊 Multi-Site Pagination Results');
    console.log('=================================');
    
    const successful = results.filter(r => r.status === 'success');
    const failed = results.filter(r => r.status !== 'success');
    
    console.log(`✅ Successful: ${successful.length}/${results.length} sites`);
    console.log(`❌ Failed: ${failed.length}/${results.length} sites`);
    
    successful.forEach(r => {
      console.log(`  ✅ ${r.site}: ${r.newProducts} new products from pagination`);
    });
    
    failed.forEach(r => {
      console.log(`  ❌ ${r.site}: ${r.reason}`);
    });
    
    const successRate = Math.round(100 * successful.length / results.length);
    console.log(`\nSuccess Rate: ${successRate}%`);
    
    return successRate >= 66; // 2/3 success rate considered good
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    return false;
  }
}

// Run the test
if (require.main === module) {
  testPaginationMultiSite()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test crashed:', error);
      process.exit(1);
    });
}

module.exports = { testPaginationMultiSite };