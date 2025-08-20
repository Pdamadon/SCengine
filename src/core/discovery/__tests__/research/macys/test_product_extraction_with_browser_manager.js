/**
 * Test Product Extraction with BrowserManager
 * 
 * Refactored version of product extraction using centralized BrowserManager
 * This should bypass Macy's bot detection that was blocking us before
 */

const BrowserManager = require('../../../common/BrowserManager');
const { logger } = require('../../../utils/logger');
const fs = require('fs');
const path = require('path');

async function testProductExtractionWithBrowserManager() {
  const browserManager = new BrowserManager();

  try {
    logger.info('🛍️ Testing Product Extraction with BrowserManager Anti-Bot Detection');
    
    // Use our perfect navigation URLs from previous tests
    const navigationUrls = [
      {
        category: "Women's Activewear & Workout",
        url: "https://www.macys.com/shop/womens/clothing/activewear?id=29891"
      }
    ];

    console.log(`📋 Testing ${navigationUrls.length} navigation categories for product extraction`);
    console.log(`🛡️  Using BrowserManager with stealth profile to bypass bot detection`);

    // OLD WAY (commented for comparison):
    /*
    browser = await chromium.launch({ headless: false, devtools: false });  // ❌ Bot trigger
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },                              // ❌ Always same
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'  // ❌ Incomplete
    });
    const page = await context.newPage();  // ❌ No anti-bot detection
    */

    // NEW WAY with BrowserManager:
    const { page, close } = await browserManager.createBrowser('stealth');
    console.log(`✅ Browser created with stealth profile and anti-bot detection`);
    
    const results = {
      metadata: {
        extractedAt: new Date().toISOString(),
        site: 'macys.com',
        browserManager: 'stealth_profile',
        antiBot: true,
        categoriesTested: navigationUrls.length
      },
      categories: {}
    };

    // Test navigation to Macy's with anti-bot detection
    for (const navItem of navigationUrls) {
      console.log(`\n🎯 EXTRACTING PRODUCTS FROM: ${navItem.category}`);
      console.log(`📋 URL: ${navItem.url}`);
      
      try {
        // Navigate to category page with human-like behavior
        console.log(`🌐 Navigating with anti-bot detection...`);
        await page.goto(navItem.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log('✅ Page loaded - checking for bot detection...');
        
        // Check if we got blocked
        const title = await page.title();
        const content = await page.textContent('body').catch(() => '');
        
        if (title.includes('Access Denied') || content.includes('Access Denied')) {
          console.log(`❌ Still got blocked by anti-bot detection`);
          results.categories[navItem.category] = {
            navigationUrl: navItem.url,
            extractionSuccess: false,
            blocked: true,
            error: 'Access Denied - bot detection triggered',
            totalProducts: 0,
            products: []
          };
          continue;
        }

        console.log(`✅ Successfully bypassed bot detection!`);
        console.log(`   Page title: ${title}`);
        
        // Add human-like delay before extracting
        await browserManager.humanDelay(2000, 0.3);
        
        // Wait for products to load with human timing
        try {
          await page.waitForLoadState('networkidle', { timeout: 15000 });
          console.log('✅ Network idle achieved');
        } catch (error) {
          console.log('⚠️ Network idle timeout, continuing anyway');
        }
        
        await browserManager.humanDelay(1500, 0.2);
        console.log('✅ Human-like delays completed');

        // Try product selectors (improved for Macy's)
        const productSelectors = [
          'a[data-auto="product-title"]',           // Macy's product title links
          '.productThumbnail a',                   // Product thumbnail links
          '[data-auto="product-image"] a',         // Product image links
          'a[href*="/shop/product/"]',             // Macy's product URL pattern
          '.productDetails a[href*="/shop/product/"]', // Product details links
          'a[href*="ID="]',                        // Alternative product ID pattern
          '.product-item a',                       // Generic product item
          '.product-tile a',                       // Product tile links
          '[class*="product"] a[href*="/shop/"]'   // Any product-related link
        ];

        let productLinks = [];
        
        // Try each selector with human-like timing
        for (const selector of productSelectors) {
          try {
            console.log(`  🔍 Trying selector: ${selector}`);
            
            const links = await page.evaluate((sel) => {
              const elements = document.querySelectorAll(sel);
              const results = [];
              
              elements.forEach(element => {
                const href = element.href;
                const text = element.textContent?.trim() || '';
                const img = element.querySelector('img');
                const imgSrc = img ? img.src : null;
                
                // Only include valid product URLs
                if (href && (href.includes('/shop/product/') || href.includes('ID='))) {
                  results.push({
                    url: href,
                    title: text,
                    imageUrl: imgSrc,
                    selector: sel
                  });
                }
              });
              
              return results;
            }, selector);
            
            if (links.length > 0) {
              console.log(`    ✅ Found ${links.length} products`);
              productLinks.push(...links);
            } else {
              console.log(`    ➡️  No products found with this selector`);
            }
            
            // Human-like delay between selector attempts
            await browserManager.humanDelay(300, 0.4);
            
          } catch (error) {
            console.log(`    ❌ Selector failed: ${error.message}`);
          }
        }

        // Remove duplicates based on URL
        const uniqueProducts = [];
        const seenUrls = new Set();
        
        for (const product of productLinks) {
          if (!seenUrls.has(product.url)) {
            seenUrls.add(product.url);
            uniqueProducts.push(product);
          }
        }

        // Store results
        results.categories[navItem.category] = {
          navigationUrl: navItem.url,
          extractionSuccess: uniqueProducts.length > 0,
          blocked: false,
          totalProducts: uniqueProducts.length,
          products: uniqueProducts.slice(0, 10), // First 10 for inspection
          extractionMethods: [...new Set(productLinks.map(p => p.selector))],
          browserProfile: 'stealth',
          antiBotBypass: true
        };

        console.log(`\n📊 EXTRACTION RESULTS:`);
        console.log(`   🛡️  Anti-bot detection: BYPASSED ✅`);
        console.log(`   📦 Total products found: ${uniqueProducts.length}`);
        console.log(`   🔗 Unique URLs: ${seenUrls.size}`);
        console.log(`   🎯 Working selectors: ${[...new Set(productLinks.map(p => p.selector))].length}`);
        
        // Sample products for verification
        if (uniqueProducts.length > 0) {
          console.log(`\n📋 SAMPLE PRODUCTS (First 3):`);
          uniqueProducts.slice(0, 3).forEach((product, index) => {
            console.log(`   [${index + 1}] "${product.title}"`);
            console.log(`       URL: ${product.url}`);
            console.log(`       Selector: ${product.selector}`);
            if (product.imageUrl) {
              console.log(`       Image: ${product.imageUrl.substring(0, 80)}...`);
            }
          });
        }

      } catch (error) {
        logger.error(`❌ Failed to extract products from ${navItem.category}: ${error.message}`);
        results.categories[navItem.category] = {
          navigationUrl: navItem.url,
          extractionSuccess: false,
          blocked: false,
          error: error.message,
          totalProducts: 0,
          products: []
        };
      }
    }

    // Summary
    const totalProducts = Object.values(results.categories).reduce((sum, cat) => sum + (cat.totalProducts || 0), 0);
    const successfulCategories = Object.values(results.categories).filter(cat => cat.extractionSuccess).length;
    const blockedCategories = Object.values(results.categories).filter(cat => cat.blocked).length;
    
    results.summary = {
      totalProducts,
      successfulCategories,
      blockedCategories,
      totalCategories: navigationUrls.length,
      successRate: (successfulCategories / navigationUrls.length) * 100,
      antiBotBypassRate: ((navigationUrls.length - blockedCategories) / navigationUrls.length) * 100
    };

    console.log(`\n📊 FINAL SUMMARY:`);
    console.log(`   Categories tested: ${navigationUrls.length}`);
    console.log(`   Successful extractions: ${successfulCategories}`);
    console.log(`   Blocked by anti-bot: ${blockedCategories}`);
    console.log(`   Total products found: ${totalProducts}`);
    console.log(`   Success rate: ${results.summary.successRate.toFixed(1)}%`);
    console.log(`   Anti-bot bypass rate: ${results.summary.antiBotBypassRate.toFixed(1)}%`);

    // Export results
    const outputDir = path.join(__dirname, '../../../../data/output/data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `macys_product_extraction_browsermanager_${timestamp}.json`;
    const filepath = path.join(outputDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
    console.log(`\n📁 Results exported to: ${filepath}`);

    // Clean up
    await close();
    console.log(`✅ Browser closed with proper cleanup`);

    return {
      success: totalProducts > 0,
      bypassedBotDetection: blockedCategories === 0,
      totalProducts,
      successfulCategories,
      blockedCategories,
      filepath,
      results
    };

  } catch (error) {
    logger.error('❌ Product extraction test failed:', error);
    return {
      success: false,
      bypassedBotDetection: false,
      error: error.message
    };
  } finally {
    await browserManager.closeAll();
  }
}

// Run the test
if (require.main === module) {
  testProductExtractionWithBrowserManager()
    .then(result => {
      console.log('\n🏁 PRODUCT EXTRACTION WITH BROWSER MANAGER TEST COMPLETE');
      console.log('=' .repeat(65));
      
      if (result.success) {
        console.log(`✅ Extraction successful!`);
        console.log(`📊 Total products: ${result.totalProducts}`);
        console.log(`📊 Successful categories: ${result.successfulCategories}`);
        console.log(`📊 Blocked categories: ${result.blockedCategories}`);
        
        if (result.bypassedBotDetection) {
          console.log(`🛡️  EXCELLENT: Successfully bypassed anti-bot detection!`);
        } else {
          console.log(`⚠️  Some categories still blocked by anti-bot detection`);
        }
        
        if (result.totalProducts > 50) {
          console.log(`🎯 EXCELLENT: Found substantial product inventory`);
        } else if (result.totalProducts > 20) {
          console.log(`🟡 GOOD: Decent product count found`);  
        } else if (result.totalProducts > 0) {
          console.log(`🟠 FAIR: Some products found`);
        }
        
        console.log(`📁 Results file: ${result.filepath}`);
      } else {
        console.log(`❌ Extraction failed: ${result.error}`);
        if (!result.bypassedBotDetection) {
          console.log(`🚫 Bot detection still blocking access`);
        }
      }
    })
    .catch(error => {
      console.error('💥 Test execution failed:', error.message);
      process.exit(1);
    });
}

module.exports = testProductExtractionWithBrowserManager;