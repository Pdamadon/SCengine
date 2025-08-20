/**
 * Test ProductCatalogStrategy with site-specific selectors
 * This should actually find real products, not navigation links
 */

require('dotenv').config();
const BrowserManager = require('./src/common/BrowserManager');
const { getSelectorsForDomain, shouldExcludeUrl } = require('./src/config/SiteSpecificSelectors');
const { logger } = require('./src/utils/logger');

async function testWithSiteSelectors() {
  console.log('🚀 Testing Product Collection with Site-Specific Selectors');
  console.log('=' .repeat(60));
  
  const browserManager = new BrowserManager();
  const testUrl = 'https://glasswingshop.com/collections/mens-collection';
  
  try {
    // Get site-specific config
    const siteConfig = getSelectorsForDomain(testUrl);
    console.log(`\n📋 Using config: ${siteConfig.name} (${siteConfig.platform})`);
    console.log('Exclude patterns:', siteConfig.excludePatterns);
    
    // Create optimized browser
    const browser = await browserManager.createBrowser('stealth', {
      skipResourceBlocking: false
    });
    
    console.log('\n🎯 Navigating to:', testUrl);
    const startTime = Date.now();
    await browser.page.goto(testUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });
    
    // Wait for content if specified
    if (siteConfig.waitForSelector) {
      await browser.page.waitForSelector(siteConfig.waitForSelector, { timeout: 10000 })
        .catch(() => console.log('Warning: waitForSelector timed out'));
    }
    
    const loadTime = Date.now() - startTime;
    console.log(`✅ Page loaded in ${loadTime}ms`);
    
    // Collect products using site-specific selectors
    const products = await browser.page.evaluate((config) => {
      const products = [];
      const processedUrls = new Set();
      
      // Find all links that match product patterns
      const productLinks = document.querySelectorAll(config.patterns.links.join(', '));
      
      productLinks.forEach(link => {
        const url = link.href;
        
        // Skip if already processed
        if (processedUrls.has(url)) return;
        
        // Skip if matches exclude pattern
        if (config.excludePatterns.some(pattern => url.includes(pattern))) {
          return;
        }
        
        processedUrls.add(url);
        
        // Get the container element
        const container = link.closest('div, article, li, section') || link.parentElement;
        
        // Extract product info
        const product = {
          url: url,
          title: link.textContent.trim() || 
                 link.getAttribute('title') || 
                 link.querySelector('img')?.alt || 
                 'Unknown',
          
          // Try to find price
          price: (() => {
            // Look in container first
            for (const selector of config.patterns.indicators) {
              const priceEl = container.querySelector(selector);
              if (priceEl && priceEl.textContent.includes('$')) {
                return priceEl.textContent.trim();
              }
            }
            // Look in whole document for this product's price
            const productId = url.split('/').pop();
            const priceEl = document.querySelector(`[data-product-id="${productId}"] .price`);
            return priceEl?.textContent.trim() || null;
          })(),
          
          // Get image
          image: link.querySelector('img')?.src || 
                 container.querySelector('img')?.src || 
                 null,
          
          // Container info for debugging
          containerClass: container.className,
          linkClass: link.className
        };
        
        products.push(product);
      });
      
      return products;
    }, siteConfig);
    
    console.log(`\n📦 Found ${products.length} products`);
    
    // Separate actual products from navigation
    const actualProducts = products.filter(p => p.url.includes('/products/'));
    const navigationLinks = products.filter(p => !p.url.includes('/products/'));
    
    console.log(`  ✅ Actual products: ${actualProducts.length}`);
    console.log(`  ❌ Navigation/other links: ${navigationLinks.length}`);
    
    // Display sample products
    if (actualProducts.length > 0) {
      console.log('\n🛍️ Sample Products:');
      actualProducts.slice(0, 5).forEach((product, i) => {
        console.log(`\n${i + 1}. ${product.title}`);
        console.log(`   URL: ${product.url}`);
        console.log(`   Price: ${product.price || 'N/A'}`);
        console.log(`   Image: ${product.image ? '✓' : '✗'}`);
      });
    }
    
    // Check for duplicates
    const uniqueUrls = new Set(actualProducts.map(p => p.url));
    const duplicates = actualProducts.length - uniqueUrls.size;
    if (duplicates > 0) {
      console.log(`\n⚠️ Found ${duplicates} duplicate products`);
    }
    
    // Performance metrics
    console.log('\n📊 Performance:');
    console.log(`  Page load: ${loadTime}ms`);
    console.log(`  Products found: ${actualProducts.length}`);
    console.log(`  Time per product: ${actualProducts.length > 0 ? Math.round(loadTime / actualProducts.length) : 0}ms`);
    
    // Save results
    const fs = require('fs').promises;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `data/output/data/site_specific_products_${timestamp}.json`;
    
    await fs.writeFile(
      filename,
      JSON.stringify({
        url: testUrl,
        config: siteConfig.name,
        stats: {
          loadTime,
          totalProducts: actualProducts.length,
          navigationLinks: navigationLinks.length,
          duplicates
        },
        products: actualProducts
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
testWithSiteSelectors().catch(console.error);