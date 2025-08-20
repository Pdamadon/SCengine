/**
 * Test scraping with automatic retry and IP rotation
 * Uses ProxyBrowserManager for resilient scraping
 */

require('dotenv').config();
const ProxyBrowserManager = require('./src/common/ProxyBrowserManager');
const { getSelectorsForDomain } = require('./src/config/SiteSpecificSelectors');
const { logger } = require('./src/utils/logger');

async function testWithAutoRetry() {
  console.log('🚀 Testing with Auto-Retry and IP Rotation');
  console.log('=' .repeat(60));
  
  const manager = new ProxyBrowserManager({
    retryOnBlock: true,
    maxRetries: 3
  });
  
  const testUrl = 'https://glasswingshop.com/collections/mens-collection';
  
  try {
    // Create browser with auto-retry
    console.log('\n📦 Creating browser with proxy...');
    const browser = await manager.createBrowserWithRetry('stealth');
    
    // Navigate with auto-retry on block
    console.log('\n🎯 Navigating with auto-retry...');
    await manager.navigateWithRetry(browser.page, testUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
      maxRetries: 3
    });
    
    console.log('✅ Successfully loaded page');
    
    // Get site config
    const siteConfig = getSelectorsForDomain(testUrl);
    console.log(`\n📋 Using config: ${siteConfig.name}`);
    
    // Extract products
    const products = await browser.page.evaluate((config) => {
      const products = [];
      const productLinks = document.querySelectorAll(config.patterns.links.join(', '));
      
      productLinks.forEach(link => {
        const url = link.href;
        if (!config.excludePatterns.some(pattern => url.includes(pattern))) {
          products.push({
            url: url,
            image: link.querySelector('img')?.src
          });
        }
      });
      
      return products;
    }, siteConfig);
    
    // Filter actual products
    const actualProducts = products.filter(p => p.url.includes('/products/'));
    
    console.log(`\n📦 Results:`);
    console.log(`  Products found: ${actualProducts.length}`);
    console.log(`  First 3 products:`);
    actualProducts.slice(0, 3).forEach((p, i) => {
      console.log(`    ${i + 1}. ${p.url.split('/').pop()}`);
    });
    
    // Test resilience - try to trigger a block
    if (process.env.TEST_BLOCK === 'true') {
      console.log('\n🧪 Testing block recovery...');
      
      // Rapid-fire requests to trigger rate limit
      for (let i = 0; i < 10; i++) {
        await browser.page.goto(testUrl, { waitUntil: 'networkidle' });
        console.log(`  Request ${i + 1}/10`);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Test failed after all retries:', error.message);
    logger.error('Auto-retry test failed', error);
  } finally {
    await manager.closeAll();
    console.log('\n✅ Test complete!');
  }
}

// Execute with error handling
testWithAutoRetry().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});