/**
 * Test ProductCatalogStrategy on Glasswing
 */

require('dotenv').config();
const ProductCatalogStrategy = require('./src/core/collection/strategies/ProductCatalogStrategy');
const BrowserManager = require('./src/common/BrowserManager');
const { logger } = require('./src/utils/logger');

async function testProductCatalog() {
  console.log('🧪 Testing ProductCatalogStrategy');
  console.log('=' .repeat(60));
  
  const browserManager = new BrowserManager();
  const strategy = new ProductCatalogStrategy(logger, {
    productDetectionThreshold: 2,
    maxProductsPerPage: 100,
    paginationTimeout: 30000,
    enableInfiniteScroll: true,
    enableLoadMoreButtons: true,
    enableTraditionalPagination: true
  });
  
  try {
    // Test on Glasswing Women's Collection
    const testUrl = 'https://glasswingshop.com/collections/womens-collection';
    console.log(`\n📦 Testing URL: ${testUrl}`);
    console.log('-'.repeat(60));
    
    // Create browser
    const browser = await browserManager.createBrowser({ headless: false });
    const page = browser.page;
    
    // Navigate to the page
    console.log('🌐 Navigating to page...');
    await page.goto(testUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Wait for content to load
    await browserManager.humanDelay(3000, 0.3);
    
    // Analyze page for products
    console.log('🔍 Analyzing page for products...');
    const productAnalysis = await strategy.analyzePageForProducts(page);
    console.log(`   Is product-rich page: ${productAnalysis.isProductRich ? '✅ YES' : '❌ NO'}`);
    console.log(`   Detected platform: ${productAnalysis.detectedPlatform || 'generic'}`);
    console.log(`   Container count: ${productAnalysis.containerCount}`);
    
    // Collect product URLs
    console.log('\n📊 Collecting product URLs...');
    const products = await strategy.collectProductURLs(page, productAnalysis.detectedPlatform);
    
    console.log(`\n✅ Products found: ${products.length}`);
    
    if (products.length > 0) {
      console.log('\n📝 Sample products:');
      products.slice(0, 5).forEach((product, i) => {
        console.log(`   ${i + 1}. ${product.title || 'Untitled'}`);
        console.log(`      URL: ${product.url}`);
        console.log(`      Price: ${product.price || 'N/A'}`);
      });
    }
    
    // Check for pagination
    console.log('\n🔄 Checking for pagination...');
    try {
      const paginationInfo = await strategy.detectPaginationType(page);
      console.log(`   Pagination type: ${paginationInfo.type}`);
      if (paginationInfo.totalPages) {
        console.log(`   Total pages: ${paginationInfo.totalPages}`);
      }
    } catch (e) {
      console.log(`   Pagination detection error: ${e.message}`);
    }
    
    await browserManager.closeBrowser(browser);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    logger.error('Test failed', error);
  } finally {
    await browserManager.closeAll();
    console.log('\n✅ Test complete!');
  }
}

// Run the test
testProductCatalog().catch(console.error);