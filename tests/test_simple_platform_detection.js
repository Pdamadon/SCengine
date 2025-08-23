/**
 * Simple Platform Detection Test
 * Based on Zen analysis - using only 2-3 strong signals instead of complex weighted system
 */

require('dotenv').config();

const BrowserManagerBrowserless = require('../src/common/BrowserManagerBrowserless');
const { logger } = require('../src/utils/logger');

async function simpleShopifyDetection(page) {
  return await page.evaluate(() => {
    // Rule 1: Check for window.Shopify + CDN assets
    const hasShopify = typeof window.Shopify !== 'undefined';
    const hasShopifyCDN = Array.from(document.scripts).some(s => 
      s.src && (s.src.includes('cdn.shopify.com') || s.src.includes('shopifycdn.net'))
    );
    
    // Rule 2: Check for cart.js endpoint (we'll test this separately)
    const hasCartForm = document.querySelector('form[action*="/cart/add"]') !== null;
    
    // Rule 3: Check for checkout links
    const hasCheckoutLink = Array.from(document.querySelectorAll('a[href]')).some(a =>
      a.href.includes('checkout.shopify.com') || a.href.includes('myshopify.com')
    );
    
    // Simple decision tree (no weighted scoring)
    const isShopify = hasShopify && hasShopifyCDN ||
                     hasCartForm ||
                     hasCheckoutLink;
    
    return {
      isShopify,
      signals: {
        hasShopify,
        hasShopifyCDN,
        hasCartForm,
        hasCheckoutLink
      },
      theme: window.Shopify?.theme?.name || null
    };
  });
}

async function testCartEndpoint(page) {
  try {
    const response = await page.evaluate(async () => {
      try {
        const res = await fetch('/cart.js', { 
          credentials: 'same-origin',
          cache: 'no-store'
        });
        return {
          ok: res.ok,
          status: res.status,
          contentType: res.headers.get('content-type') || '',
          isJson: res.ok && (res.headers.get('content-type') || '').includes('application/json')
        };
      } catch (e) {
        return { error: e.message };
      }
    });
    return response;
  } catch (error) {
    return { error: error.message };
  }
}

async function testSimplePlatformDetection() {
  console.log('\n=== Simple Platform Detection Test ===\n');
  console.log('Using 2-3 strong signals instead of weighted scoring:\n');
  console.log('Rule 1: window.Shopify + CDN assets');
  console.log('Rule 2: /cart.js returns JSON');
  console.log('Rule 3: Cart form or checkout links\n');
  console.log('='.repeat(60) + '\n');
  
  // Test sites
  const testSites = [
    { name: "Glasswing Shop", url: "https://glasswingshop.com", expected: "shopify" },
    { name: "Simply Seattle", url: "https://simplyseattle.myshopify.com", expected: "shopify" },
    { name: "Oliver Cabell", url: "https://olivercabell.com", expected: "shopify" },
    { name: "Stanley 1913", url: "https://stanley1913.com", expected: "shopify" },
    { name: "Rad Power Bikes", url: "https://radpowerbikes.com", expected: "shopify" }
  ];
  
  const results = {
    total: testSites.length,
    detected: 0,
    failed: 0
  };
  
  const browserManager = new BrowserManagerBrowserless();
  
  try {
    const session = await browserManager.createBrowser('stealth', {
      site: 'simple-platform-test',
      useBQL: false,
      timeout: 60000
    });
    
    for (const site of testSites) {
      console.log(`📍 Testing: ${site.name}`);
      console.log(`   URL: ${site.url}`);
      
      try {
        await session.page.goto(site.url, { 
          waitUntil: 'domcontentloaded',
          timeout: 20000 
        });
        
        // Wait for JS to load
        await session.page.waitForTimeout(2000);
        
        // Test simple detection
        const detection = await simpleShopifyDetection(session.page);
        
        // Test cart.js endpoint
        const cartTest = await testCartEndpoint(session.page);
        
        // Final decision
        const isShopify = detection.isShopify || cartTest.isJson;
        
        if (isShopify) {
          results.detected++;
          console.log(`   ✅ Detected as Shopify`);
        } else {
          results.failed++;
          console.log(`   ❌ Not detected as Shopify`);
        }
        
        // Show which signals fired
        const signals = [];
        if (detection.signals.hasShopify) signals.push('window.Shopify');
        if (detection.signals.hasShopifyCDN) signals.push('CDN assets');
        if (detection.signals.hasCartForm) signals.push('cart form');
        if (detection.signals.hasCheckoutLink) signals.push('checkout link');
        if (cartTest.isJson) signals.push('/cart.js JSON');
        
        console.log(`   Signals: ${signals.join(', ') || 'None'}`);
        
        if (detection.theme) {
          console.log(`   Theme: ${detection.theme}`);
        }
        
        if (cartTest.ok) {
          console.log(`   /cart.js: ${cartTest.status} ${cartTest.contentType}`);
        }
        
      } catch (error) {
        results.failed++;
        console.log(`   ❌ Error: ${error.message}`);
      }
      
      console.log('');
    }
    
    await session.close();
    
    // Summary
    console.log('='.repeat(60));
    console.log(`\n📊 Results: ${results.detected}/${results.total} detected correctly`);
    console.log(`Success rate: ${((results.detected / results.total) * 100).toFixed(1)}%`);
    
    const stats = browserManager.getStats();
    console.log(`Cost: $${browserManager.calculateCost().toFixed(4)}\n`);
    
    console.log('✅ Simple detection test completed\n');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
  
  process.exit(0);
}

console.log('Starting simple platform detection test...\n');
testSimplePlatformDetection();