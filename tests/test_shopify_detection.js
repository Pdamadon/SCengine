/**
 * Test Shopify Platform Detection
 * Verify we accurately identify Shopify stores through metadata and other indicators
 */

require('dotenv').config();

const PlatformPatterns = require('../src/core/discovery/PlatformPatterns');
const BrowserManagerBrowserless = require('../src/common/BrowserManagerBrowserless');
const { logger } = require('../src/utils/logger');

async function testShopifyDetection() {
  console.log('\n=== Testing Shopify Platform Detection ===\n');
  
  const platformPatterns = new PlatformPatterns();
  const browserManager = new BrowserManagerBrowserless();
  
  // Shopify test sites
  const shopifySites = [
    { name: "Simply Seattle", url: "https://simplyseattle.myshopify.com" },
    { name: "Made In Washington", url: "https://madeinwashington.myshopify.com" },
    { name: "Windthrow", url: "https://windthrow.myshopify.com" },
    { name: "Eighth Generation", url: "https://eighth-generation.myshopify.com" },
    { name: "Space Needle Gift Shop", url: "https://space-needle.myshopify.com" },
    { name: "Prism Seattle", url: "https://prism-seattle.myshopify.com" },
    { name: "Blue Owl Workshop", url: "https://blue-owl-workshop.myshopify.com" },
    { name: "For the Love of Gourmet", url: "https://fortheloveofgourmet.com" },
    { name: "Dolce Vita", url: "https://dolcevita.com" },
    { name: "Oliver Cabell", url: "https://olivercabell.com" },
    { name: "Nuun", url: "https://nuunlife.com" },
    { name: "Ebbets Field Flannels", url: "https://ebbets.com" },
    { name: "Funboy", url: "https://funboy.com" },
    { name: "Jackson Galaxy", url: "https://shop.jacksongalaxy.com" },
    { name: "Book Larder", url: "https://booklarder.com" },
    { name: "Beyond Clothing", url: "https://beyondclothing.com" },
    { name: "Kavu Inc", url: "https://kavu.com" },
    { name: "Junk Food Clothing Co", url: "https://junkfoodclothing.com" },
    { name: "Stanley 1913", url: "https://stanley1913.com" },
    { name: "Rad Power Bikes", url: "https://radpowerbikes.com" }
  ];
  
  const results = {
    total: shopifySites.length,
    detected: 0,
    failed: 0,
    details: []
  };
  
  try {
    // Create browser session
    const session = await browserManager.createBrowser('stealth', {
      site: 'shopify-detection-test',
      useBQL: false,
      timeout: 60000
    });
    
    console.log('Testing Shopify detection on ' + shopifySites.length + ' sites...\n');
    console.log('Checking multiple indicators:');
    console.log('- Meta tags (generator, shopify-checkout-api-token)');
    console.log('- JavaScript globals (window.Shopify, ShopifyAnalytics)');
    console.log('- Script sources (cdn.shopify.com)');
    console.log('- Form actions (/cart/add)');
    console.log('- Shopify-specific elements\n');
    console.log('='.repeat(80) + '\n');
    
    for (const site of shopifySites) {
      console.log(`\n📍 Testing: ${site.name}`);
      console.log(`   URL: ${site.url}`);
      
      try {
        // Navigate to site
        await session.page.goto(site.url, { 
          waitUntil: 'domcontentloaded',
          timeout: 30000 
        });
        
        // Wait a bit for JavaScript to load
        await session.page.waitForTimeout(2000);
        
        // Get comprehensive Shopify indicators
        const indicators = await session.page.evaluate(() => {
          const getMetaContent = (name) => {
            const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
            return meta ? meta.content : null;
          };
          
          return {
            // Meta tags
            meta: {
              generator: getMetaContent('generator'),
              shopifyCheckout: getMetaContent('shopify-checkout-api-token'),
              shopifyDigitalWallet: document.querySelector('meta[name*="shopify"]') !== null,
              pageNamespace: getMetaContent('page-namespace'),
              productType: getMetaContent('product:type')
            },
            
            // JavaScript globals
            js: {
              hasShopify: typeof window.Shopify !== 'undefined',
              hasShopifyAnalytics: typeof window.ShopifyAnalytics !== 'undefined',
              hasShopifyCustomer: typeof window.ShopifyCustomer !== 'undefined',
              shopifyFeatures: window.Shopify ? Object.keys(window.Shopify) : [],
              theme: window.Shopify?.theme || null
            },
            
            // Scripts
            scripts: {
              cdnShopify: Array.from(document.scripts).some(s => 
                s.src.includes('cdn.shopify.com')
              ),
              shopifyScriptCount: Array.from(document.scripts).filter(s => 
                s.src.includes('shopify')
              ).length,
              hasCheckoutJs: Array.from(document.scripts).some(s => 
                s.src.includes('/checkouts/')
              )
            },
            
            // Forms and elements
            elements: {
              hasCartForm: document.querySelector('form[action*="/cart/add"]') !== null,
              hasProductForm: document.querySelector('form[action*="/cart/add"], .product-form') !== null,
              hasShopifySection: document.querySelector('.shopify-section') !== null,
              hasShopifyPayment: document.querySelector('.shopify-payment-button') !== null
            },
            
            // Data attributes
            data: {
              hasShopifyData: document.querySelector('[data-shopify]') !== null,
              productId: document.querySelector('[data-product-id]')?.dataset.productId,
              variantId: document.querySelector('[data-variant-id]')?.dataset.variantId
            },
            
            // URL patterns
            url: {
              hasCollections: window.location.pathname.includes('/collections/'),
              hasProducts: window.location.pathname.includes('/products/'),
              hasCart: window.location.pathname.includes('/cart')
            }
          };
        });
        
        // Detect platform using our PlatformPatterns class
        const detectedPlatform = await platformPatterns.detectPlatform(session.page);
        
        // Calculate confidence score
        let confidenceScore = 0;
        let evidenceFound = [];
        
        // Check each indicator
        if (indicators.js.hasShopify) {
          confidenceScore += 30;
          evidenceFound.push('window.Shopify');
        }
        if (indicators.js.hasShopifyAnalytics) {
          confidenceScore += 20;
          evidenceFound.push('ShopifyAnalytics');
        }
        if (indicators.scripts.cdnShopify) {
          confidenceScore += 20;
          evidenceFound.push('cdn.shopify.com scripts');
        }
        if (indicators.meta.shopifyCheckout) {
          confidenceScore += 15;
          evidenceFound.push('shopify-checkout token');
        }
        if (indicators.elements.hasCartForm) {
          confidenceScore += 10;
          evidenceFound.push('/cart/add form');
        }
        if (indicators.elements.hasShopifySection) {
          confidenceScore += 5;
          evidenceFound.push('.shopify-section');
        }
        
        const isShopify = detectedPlatform === 'shopify';
        const isConfidentShopify = confidenceScore >= 30;
        
        if (isShopify) {
          results.detected++;
          console.log(`   ✅ Detected as: ${detectedPlatform}`);
        } else {
          results.failed++;
          console.log(`   ❌ Detected as: ${detectedPlatform} (should be shopify)`);
        }
        
        console.log(`   Confidence: ${confidenceScore}% (${isConfidentShopify ? 'HIGH' : 'LOW'})`);
        console.log(`   Evidence: ${evidenceFound.join(', ') || 'None found'}`);
        
        // Show detailed indicators
        if (!isShopify || confidenceScore < 50) {
          console.log('\n   Detailed Analysis:');
          console.log(`   - window.Shopify: ${indicators.js.hasShopify ? '✓' : '✗'}`);
          console.log(`   - ShopifyAnalytics: ${indicators.js.hasShopifyAnalytics ? '✓' : '✗'}`);
          console.log(`   - CDN Scripts: ${indicators.scripts.cdnShopify ? '✓' : '✗'}`);
          console.log(`   - Cart Form: ${indicators.elements.hasCartForm ? '✓' : '✗'}`);
          console.log(`   - Shopify Section: ${indicators.elements.hasShopifySection ? '✓' : '✗'}`);
          
          if (indicators.js.theme) {
            console.log(`   - Theme: ${indicators.js.theme.name || 'Unknown'}`);
          }
        }
        
        results.details.push({
          name: site.name,
          url: site.url,
          detected: detectedPlatform,
          isCorrect: isShopify,
          confidence: confidenceScore,
          evidence: evidenceFound
        });
        
      } catch (error) {
        results.failed++;
        console.log(`   ❌ Error: ${error.message}`);
        results.details.push({
          name: site.name,
          url: site.url,
          error: error.message
        });
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 SUMMARY\n');
    console.log(`Total sites tested: ${results.total}`);
    console.log(`✅ Correctly detected as Shopify: ${results.detected}`);
    console.log(`❌ Failed to detect: ${results.failed}`);
    console.log(`Success rate: ${((results.detected / results.total) * 100).toFixed(1)}%`);
    
    // Show failures in detail
    const failures = results.details.filter(d => !d.isCorrect && !d.error);
    if (failures.length > 0) {
      console.log('\n⚠️ Sites that were not detected as Shopify:');
      failures.forEach(f => {
        console.log(`   - ${f.name}: detected as "${f.detected}" (confidence: ${f.confidence}%)`);
      });
    }
    
    // Show high confidence detections
    const highConfidence = results.details.filter(d => d.confidence >= 70);
    console.log(`\n💯 High confidence detections (70%+): ${highConfidence.length}`);
    
    // Get browser stats
    const stats = browserManager.getStats();
    console.log('\n📊 Session Statistics:');
    console.log(`   Sessions created: ${stats.sessions.created}`);
    console.log(`   Estimated cost: $${browserManager.calculateCost().toFixed(4)}`);
    
    // Close session
    await session.close();
    console.log('\n✅ Test completed\n');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
  
  process.exit(0);
}

console.log('Starting Shopify detection test...\n');
testShopifyDetection();