/**
 * Extract Product URLs from Navigation Pages
 * 
 * Use our perfect navigation data to extract individual product URLs from category pages
 */

const { logger } = require('../../../utils/logger');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function extractProductsFromNavigation() {
  let browser = null;

  try {
    logger.info('🛍️ Extracting Product URLs from Navigation Categories');
    
    // Use some of our perfect navigation URLs from the JSON data
    const navigationUrls = [
      {
        category: "Women's Activewear & Workout",
        url: "https://www.macys.com/shop/womens/clothing/activewear?id=29891"
      },
      {
        category: "Men's Casual Shoes", 
        url: "https://www.macys.com/shop/mens/shop-all-mens-shoes/mens-casual-shoes?id=59851"
      }
    ];

    console.log(`📋 Testing ${navigationUrls.length} navigation categories for product extraction`);

    browser = await chromium.launch({ 
      headless: false,
      devtools: false
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    
    const results = {
      metadata: {
        extractedAt: new Date().toISOString(),
        site: 'macys.com',
        categoriesTested: navigationUrls.length
      },
      categories: {}
    };

    // Extract products from each navigation URL
    for (const navItem of navigationUrls) {
      console.log(`\n🎯 EXTRACTING PRODUCTS FROM: ${navItem.category}`);
      console.log(`📋 URL: ${navItem.url}`);
      
      try {
        // Navigate to category page
        await page.goto(navItem.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log('✅ Page loaded');
        
        // Wait for products to load
        try {
          await page.waitForLoadState('networkidle', { timeout: 15000 });
          console.log('✅ Network idle achieved');
        } catch (error) {
          console.log('⚠️ Network idle timeout, continuing anyway');
        }
        
        await page.waitForTimeout(3000);
        console.log('✅ Additional wait complete');

        // Try different product selectors (Macy's pattern analysis)
        const productSelectors = [
          'a[data-auto="product-title"]',           // Common Macy's product link
          '.productThumbnail a',                   // Product thumbnail links
          '[data-auto="product-image"] a',         // Product image links
          '.product-item a',                       // Generic product item
          'a[href*="/shop/product/"]',             // Macy's product URL pattern
          '.productDetails a[href*="/shop/product/"]', // Product details links
          'a[href*="ID="]',                        // Alternative product ID pattern
        ];

        let productLinks = [];
        
        // Try each selector pattern
        for (const selector of productSelectors) {
          try {
            const links = await page.evaluate((sel) => {
              const elements = document.querySelectorAll(sel);
              const results = [];
              
              elements.forEach(element => {
                const href = element.href;
                const text = element.textContent?.trim() || '';
                const img = element.querySelector('img');
                const imgSrc = img ? img.src : null;
                
                // Only include product URLs
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
              console.log(`✅ Found ${links.length} products with selector: ${selector}`);
              productLinks.push(...links);
            }
            
          } catch (error) {
            console.log(`❌ Selector failed: ${selector} - ${error.message}`);
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
          totalProducts: uniqueProducts.length,
          products: uniqueProducts.slice(0, 10), // First 10 for inspection
          extractionMethods: [...new Set(productLinks.map(p => p.selector))]
        };

        console.log(`📊 EXTRACTION COMPLETE:`);
        console.log(`   Total products found: ${uniqueProducts.length}`);
        console.log(`   Unique URLs: ${seenUrls.size}`);
        console.log(`   Working selectors: ${[...new Set(productLinks.map(p => p.selector))].length}`);
        
        // Sample products for verification
        if (uniqueProducts.length > 0) {
          console.log(`\n📋 SAMPLE PRODUCTS (First 3):`);
          uniqueProducts.slice(0, 3).forEach((product, index) => {
            console.log(`   [${index + 1}] "${product.title}"`);
            console.log(`       URL: ${product.url}`);
            console.log(`       Selector: ${product.selector}`);
            if (product.imageUrl) {
              console.log(`       Image: ${product.imageUrl}`);
            }
          });
        } else {
          console.log(`❌ No products extracted - may need different selectors`);
          
          // Debug: Show what's actually on the page
          const pageAnalysis = await page.evaluate(() => {
            return {
              title: document.title,
              productDivs: document.querySelectorAll('[class*="product"]').length,
              linkCount: document.querySelectorAll('a').length,
              imageCount: document.querySelectorAll('img').length,
              sampleLinks: Array.from(document.querySelectorAll('a')).slice(0, 5).map(a => ({
                href: a.href,
                text: a.textContent?.trim()?.substring(0, 50),
                classes: a.className
              }))
            };
          });
          
          console.log(`🔍 PAGE ANALYSIS:`, JSON.stringify(pageAnalysis, null, 2));
        }

      } catch (error) {
        logger.error(`❌ Failed to extract products from ${navItem.category}: ${error.message}`);
        results.categories[navItem.category] = {
          navigationUrl: navItem.url,
          extractionSuccess: false,
          error: error.message,
          totalProducts: 0,
          products: []
        };
      }
    }

    // Summary
    const totalProducts = Object.values(results.categories).reduce((sum, cat) => sum + (cat.totalProducts || 0), 0);
    const successfulCategories = Object.values(results.categories).filter(cat => cat.extractionSuccess).length;
    
    results.summary = {
      totalProducts,
      successfulCategories,
      totalCategories: navigationUrls.length,
      successRate: (successfulCategories / navigationUrls.length) * 100
    };

    console.log(`\n📊 FINAL SUMMARY:`);
    console.log(`   Categories tested: ${navigationUrls.length}`);
    console.log(`   Successful extractions: ${successfulCategories}`);
    console.log(`   Total products found: ${totalProducts}`);
    console.log(`   Success rate: ${results.summary.successRate.toFixed(1)}%`);

    // Export results
    const outputDir = path.join(__dirname, '../../../../data/output/data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `macys_product_extraction_${timestamp}.json`;
    const filepath = path.join(outputDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
    console.log(`\n📁 Results exported to: ${filepath}`);

    return {
      success: totalProducts > 0,
      totalProducts,
      successfulCategories,
      filepath,
      results
    };

  } catch (error) {
    logger.error('❌ Product extraction failed:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the extraction
if (require.main === module) {
  extractProductsFromNavigation()
    .then(result => {
      console.log('\n🏁 PRODUCT EXTRACTION TEST COMPLETE');
      
      if (result.success) {
        console.log(`✅ Extraction successful!`);
        console.log(`📊 Total products: ${result.totalProducts}`);
        console.log(`📊 Successful categories: ${result.successfulCategories}`);
        console.log(`📁 Results file: ${result.filepath}`);
        
        if (result.totalProducts > 50) {
          console.log(`🎯 EXCELLENT: Found substantial product inventory`);
        } else if (result.totalProducts > 20) {
          console.log(`🟡 GOOD: Decent product count found`);  
        } else if (result.totalProducts > 0) {
          console.log(`🟠 FAIR: Some products found, may need selector optimization`);
        }
      } else {
        console.log(`❌ Extraction failed: ${result.error}`);
      }
    })
    .catch(error => {
      console.error('💥 Extraction execution failed:', error.message);
      process.exit(1);
    });
}

module.exports = extractProductsFromNavigation;