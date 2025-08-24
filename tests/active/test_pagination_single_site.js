#!/usr/bin/env node

require('dotenv').config();

const ProductDiscoveryProcessor = require('../../src/core/discovery/processors/ProductDiscoveryProcessor');
const BrowserManagerBrowserless = require('../../src/common/browser/managers/BrowserManagerBrowserless');
const { logger } = require('../../src/utils/logger');

async function testSingleSitePagination(siteUrl, siteName) {
  console.log(`🧪 Testing ${siteName} Pagination`);
  console.log('=' + '='.repeat(siteName.length + 20));

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
    
    console.log(`📄 Navigating to ${siteUrl}...`);
    await page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Extract products from page 1
    console.log('🔍 Extracting products from page 1...');
    const page1Products = await processor.extractProductsFromPage(page);
    console.log(`Page 1: ${page1Products.length} products`);
    console.log(`Sample: ${page1Products.slice(0, 3).join(', ')}\n`);
    
    if (page1Products.length === 0) {
      console.log('❌ No products found on page 1');
      await close();
      return false;
    }
    
    // Test pagination
    console.log('🔄 Testing pagination...');
    const paginatedProducts = await processor.handlePagination(page, 1);
    
    console.log('\n📊 Results:');
    console.log('===========');
    console.log(`Paginated products found: ${paginatedProducts.length}`);
    
    if (paginatedProducts.length > 0) {
      const uniquePaginated = [...new Set(paginatedProducts)];
      const page1Set = new Set(page1Products);
      const newFromPagination = uniquePaginated.filter(p => !page1Set.has(p));
      
      console.log(`Unique paginated products: ${uniquePaginated.length}`);
      console.log(`New products (not from page 1): ${newFromPagination.length}`);
      
      if (newFromPagination.length > 0) {
        console.log('✅ SUCCESS: Pagination working - found new products!');
        console.log(`New products sample: ${newFromPagination.slice(0, 3).join(', ')}`);
        await close();
        return true;
      } else {
        console.log('❌ FAIL: Pagination only returned page 1 products');
        await close();
        return false;
      }
    } else {
      console.log('❌ FAIL: Pagination returned no products');
      await close();
      return false;
    }
    
  } catch (error) {
    console.error(`💥 Test failed for ${siteName}:`, error.message);
    return false;
  }
}

async function runMultipleSiteTests() {
  const sites = [
    { name: 'Allbirds', url: 'https://www.allbirds.com/collections/womens-shoes' },
    { name: 'Glossier', url: 'https://www.glossier.com/products' }
  ];
  
  const results = [];
  
  for (const site of sites) {
    console.log(`\n${'='.repeat(50)}`);
    const success = await testSingleSitePagination(site.url, site.name);
    results.push({ site: site.name, success });
    
    // Wait between tests
    if (results.length < sites.length) {
      console.log('\n⏳ Waiting 5 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log('📊 Final Results Summary');
  console.log('========================');
  
  const successful = results.filter(r => r.success);
  console.log(`✅ Successful: ${successful.length}/${results.length} sites`);
  
  results.forEach(r => {
    console.log(`  ${r.success ? '✅' : '❌'} ${r.site}`);
  });
  
  return successful.length >= Math.ceil(results.length / 2);
}

// Run the test
if (require.main === module) {
  runMultipleSiteTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test crashed:', error);
      process.exit(1);
    });
}

module.exports = { testSingleSitePagination };