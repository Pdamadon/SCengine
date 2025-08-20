/**
 * Test ProductCatalogStrategy with full BrowserManager optimizations
 * - ISP proxy
 * - Resource blocking
 * - Anti-bot measures
 * - Fast page loading
 */

require('dotenv').config();
const BrowserManager = require('./src/common/BrowserManager');
const ProductCatalogStrategy = require('./src/core/collection/strategies/ProductCatalogStrategy');
const { logger } = require('./src/utils/logger');

async function testProductCatalog() {
  console.log('🚀 Testing ProductCatalogStrategy with Optimized Browser');
  console.log('=' .repeat(60));
  console.log('Target: https://glasswingshop.com/collections/mens-collection');
  console.log('=' .repeat(60));
  
  const browserManager = new BrowserManager();
  const strategy = new ProductCatalogStrategy(logger);
  
  try {
    // Create browser with all optimizations
    console.log('\n📦 Setting up browser with optimizations...');
    const browser = await browserManager.createBrowser('stealth', {
      skipResourceBlocking: false  // Enable resource blocking!
    });
    
    console.log('✅ Browser created with:');
    console.log('  - ISP Proxy: ENABLED');
    console.log('  - Resource Blocking: ENABLED');
    console.log('  - Anti-bot measures: ENABLED');
    
    // Navigate to men's collection
    const testUrl = 'https://glasswingshop.com/collections/mens-collection';
    console.log(`\n🎯 Navigating to ${testUrl}`);
    
    const startTime = Date.now();
    await browser.page.goto(testUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });
    const loadTime = Date.now() - startTime;
    console.log(`✅ Page loaded in ${loadTime}ms`);
    
    // Wait a bit for any dynamic content
    await browser.page.waitForTimeout(2000);
    
    // Test 1: Analyze page for products
    console.log('\n📊 Step 1: Analyzing page for products...');
    console.log('-'.repeat(40));
    
    const analysis = await strategy.analyzePageForProducts(browser.page);
    console.log('Analysis Results:');
    console.log(`  Is Product Rich: ${analysis.isProductRich}`);
    console.log(`  Product Score: ${analysis.productScore}`);
    console.log(`  Platform Detected: ${analysis.platform}`);
    console.log(`  Product Density: ${analysis.productDensity}`);
    console.log('  Indicators:');
    console.log(`    - Product Containers: ${analysis.indicators.productContainers}`);
    console.log(`    - Price Elements: ${analysis.indicators.priceElements}`);
    console.log(`    - Add to Cart Buttons: ${analysis.indicators.addToCartButtons}`);
    console.log(`    - Grid Layouts: ${analysis.indicators.gridLayouts}`);
    console.log(`  Reason: ${analysis.reason}`);
    
    // Test 2: Collect product URLs
    console.log('\n📦 Step 2: Collecting product URLs...');
    console.log('-'.repeat(40));
    
    const products = await strategy.collectProductURLs(browser.page, analysis.platform);
    console.log(`Found ${products.length} products`);
    
    // Display first 5 products
    if (products.length > 0) {
      console.log('\nFirst 5 products:');
      products.slice(0, 5).forEach((product, index) => {
        console.log(`\n${index + 1}. ${product.title}`);
        console.log(`   URL: ${product.url}`);
        console.log(`   Price: ${product.price || 'N/A'}`);
        console.log(`   Availability: ${product.availability}`);
        console.log(`   Platform: ${product.platform}`);
      });
    }
    
    // Test 3: Check pagination
    console.log('\n📄 Step 3: Checking for pagination...');
    console.log('-'.repeat(40));
    
    const paginationType = await strategy.detectPaginationType(browser.page);
    console.log(`Pagination Type: ${paginationType.type}`);
    
    // Test 4: Full execution
    console.log('\n🔥 Step 4: Running full strategy execution...');
    console.log('-'.repeat(40));
    
    const fullResult = await strategy.execute(browser.page);
    console.log(`Strategy Confidence: ${fullResult.confidence}`);
    console.log(`Total Items Found: ${fullResult.items.length}`);
    console.log('Metadata:', JSON.stringify(fullResult.metadata, null, 2));
    
    // Verify what we're getting
    console.log('\n🔍 Verification:');
    console.log('-'.repeat(40));
    
    // Check if we're getting actual products or navigation links
    const sampleUrls = fullResult.items.slice(0, 3).map(item => item.url);
    console.log('Sample URLs:');
    sampleUrls.forEach(url => console.log(`  - ${url}`));
    
    // Check for product indicators in URLs
    const hasProductUrls = fullResult.items.some(item => 
      item.url.includes('/products/') || 
      item.url.includes('/product/') ||
      item.url.includes('/p/')
    );
    const hasCollectionUrls = fullResult.items.some(item => 
      item.url.includes('/collections/') && !item.url.includes('/products/')
    );
    
    console.log(`\nContains product URLs: ${hasProductUrls}`);
    console.log(`Contains collection URLs: ${hasCollectionUrls}`);
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Page Load Time: ${loadTime}ms`);
    console.log(`Products Found: ${fullResult.items.length}`);
    console.log(`Platform: ${analysis.platform}`);
    console.log(`Strategy Confidence: ${(fullResult.confidence * 100).toFixed(1)}%`);
    
    // Performance metrics
    const timePerProduct = fullResult.items.length > 0 
      ? Math.round(loadTime / fullResult.items.length) 
      : 0;
    console.log(`Time per product: ${timePerProduct}ms`);
    
    // Save results
    const fs = require('fs').promises;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `data/output/data/product_catalog_test_${timestamp}.json`;
    
    await fs.writeFile(
      filename,
      JSON.stringify({
        url: testUrl,
        analysis,
        products: fullResult.items.slice(0, 10), // Save first 10 for review
        metadata: fullResult.metadata,
        performance: {
          loadTime,
          productCount: fullResult.items.length,
          timePerProduct
        }
      }, null, 2)
    );
    
    console.log(`\n💾 Results saved to: ${filename}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    logger.error('Test failed', error);
  } finally {
    await browserManager.closeAll();
    console.log('\n✅ Test complete!');
  }
}

// Run the test
testProductCatalog().catch(console.error);