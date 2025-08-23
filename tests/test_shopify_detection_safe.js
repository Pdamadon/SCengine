/**
 * Test Shopify Platform Detection (Bot-Safe Version)
 * Creates new browser session for each site to avoid detection
 */

require('dotenv').config();

const PlatformPatterns = require('../src/core/discovery/PlatformPatterns');
const BrowserManagerBrowserless = require('../src/common/BrowserManagerBrowserless');
const { logger } = require('../src/utils/logger');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testShopifyDetectionSafe() {
  console.log('\n=== Testing Shopify Platform Detection (Safe Mode) ===\n');
  
  const platformPatterns = new PlatformPatterns();
  
  // Shopify test sites - let's test fewer sites to be safer
  const shopifySites = [
    { name: "Simply Seattle", url: "https://simplyseattle.myshopify.com" },
    { name: "Glasswing Shop", url: "https://glasswingshop.com" },
    { name: "Oliver Cabell", url: "https://olivercabell.com" },
    { name: "Stanley 1913", url: "https://stanley1913.com" },
    { name: "Rad Power Bikes", url: "https://radpowerbikes.com" }
  ];
  
  // Randomize order to look more natural
  const shuffled = [...shopifySites].sort(() => Math.random() - 0.5);
  
  const results = {
    total: shuffled.length,
    detected: 0,
    failed: 0,
    details: []
  };
  
  console.log(`Testing ${shuffled.length} sites with safety measures:`);
  console.log('- New browser session for each site');
  console.log('- Random delays between tests (5-15 seconds)');
  console.log('- Randomized site order');
  console.log('- Limited test size\n');
  console.log('='.repeat(80) + '\n');
  
  for (let i = 0; i < shuffled.length; i++) {
    const site = shuffled[i];
    console.log(`\n📍 [${i + 1}/${shuffled.length}] Testing: ${site.name}`);
    console.log(`   URL: ${site.url}`);
    
    const browserManager = new BrowserManagerBrowserless();
    
    try {
      // Create fresh browser session for this site
      const session = await browserManager.createBrowser('stealth', {
        site: site.url,
        useBQL: false,
        timeout: 30000
      });
      
      // Navigate to site
      await session.page.goto(site.url, { 
        waitUntil: 'domcontentloaded',
        timeout: 20000 
      });
      
      // Wait for JavaScript to load (randomized delay)
      const loadDelay = 1500 + Math.random() * 1500; // 1.5-3 seconds
      await session.page.waitForTimeout(loadDelay);
      
      // Get Shopify indicators (simplified version)
      const indicators = await session.page.evaluate(() => {
        return {
          hasShopify: typeof window.Shopify !== 'undefined',
          hasShopifyAnalytics: typeof window.ShopifyAnalytics !== 'undefined',
          cdnShopify: Array.from(document.scripts).some(s => 
            s.src.includes('cdn.shopify.com')
          ),
          hasCartForm: document.querySelector('form[action*="/cart/add"]') !== null,
          hasShopifySection: document.querySelector('.shopify-section') !== null,
          theme: window.Shopify?.theme?.name || null
        };
      });
      
      // Detect platform
      const detectedPlatform = await platformPatterns.detectPlatform(session.page);
      
      // Calculate confidence
      let confidenceScore = 0;
      let evidenceFound = [];
      
      if (indicators.hasShopify) {
        confidenceScore += 40;
        evidenceFound.push('Shopify global');
      }
      if (indicators.hasShopifyAnalytics) {
        confidenceScore += 30;
        evidenceFound.push('Analytics');
      }
      if (indicators.cdnShopify) {
        confidenceScore += 20;
        evidenceFound.push('CDN');
      }
      if (indicators.hasCartForm || indicators.hasShopifySection) {
        confidenceScore += 10;
        evidenceFound.push('Elements');
      }
      
      const isShopify = detectedPlatform === 'shopify';
      
      if (isShopify) {
        results.detected++;
        console.log(`   ✅ Detected as: ${detectedPlatform}`);
      } else {
        results.failed++;
        console.log(`   ❌ Detected as: ${detectedPlatform}`);
      }
      
      console.log(`   Confidence: ${confidenceScore}%`);
      console.log(`   Evidence: ${evidenceFound.join(', ') || 'None'}`);
      if (indicators.theme) {
        console.log(`   Theme: ${indicators.theme}`);
      }
      
      // Close this browser session
      await session.close();
      console.log(`   Session closed`);
      
      results.details.push({
        name: site.name,
        url: site.url,
        detected: detectedPlatform,
        isCorrect: isShopify,
        confidence: confidenceScore
      });
      
    } catch (error) {
      results.failed++;
      console.log(`   ❌ Error: ${error.message}`);
      results.details.push({
        name: site.name,
        url: site.url,
        error: error.message
      });
    } finally {
      // Make sure to get stats before the manager goes out of scope
      const stats = browserManager.getStats();
      console.log(`   Cost: $${browserManager.calculateCost().toFixed(4)}`);
    }
    
    // Random delay between sites (except after last one)
    if (i < shuffled.length - 1) {
      const delayTime = 5000 + Math.random() * 10000; // 5-15 seconds
      console.log(`\n⏳ Waiting ${(delayTime/1000).toFixed(1)}s before next site...`);
      await delay(delayTime);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 SUMMARY\n');
  console.log(`Total sites tested: ${results.total}`);
  console.log(`✅ Correctly detected as Shopify: ${results.detected}`);
  console.log(`❌ Failed to detect: ${results.failed}`);
  console.log(`Success rate: ${((results.detected / results.total) * 100).toFixed(1)}%`);
  
  // Show any failures
  const failures = results.details.filter(d => !d.isCorrect && !d.error);
  if (failures.length > 0) {
    console.log('\n⚠️ Incorrect detections:');
    failures.forEach(f => {
      console.log(`   - ${f.name}: detected as "${f.detected}"`);
    });
  }
  
  console.log('\n✅ Test completed safely\n');
  process.exit(0);
}

console.log('Starting safe Shopify detection test...\n');
console.log('⚠️  This test is designed to avoid bot detection:');
console.log('   - Tests only 5 sites');
console.log('   - Creates new browser for each site');
console.log('   - Adds random delays');
console.log('   - Randomizes order\n');

testShopifyDetectionSafe();