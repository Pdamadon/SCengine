/**
 * Test Shopify Detection with Weighted Signals
 * Uses the new ShopifyDetector class with comprehensive signal detection
 */

require('dotenv').config();

const ShopifyDetector = require('../src/core/discovery/ShopifyDetector');
const BrowserManagerBrowserless = require('../src/common/BrowserManagerBrowserless');
const { logger } = require('../src/utils/logger');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testShopifyWeightedDetection() {
  console.log('\n=== Testing Shopify Detection with Weighted Signals ===\n');
  
  const detector = new ShopifyDetector();
  
  // All 20 Shopify sites from user
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
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0,
    details: []
  };
  
  console.log(`Testing ${shopifySites.length} Shopify sites with weighted signal detection\n`);
  console.log('Signal Weights:');
  console.log('- Shopify Header: 35%');
  console.log('- Window.Shopify: 25%');
  console.log('- Checkout URL: 30%');
  console.log('- Asset Host: 20%');
  console.log('- API Endpoints: 25%');
  console.log('- Analytics: 15%');
  console.log('- Other signals: 5-15% each\n');
  console.log('='.repeat(80) + '\n');
  
  // Test in batches to avoid overwhelming the system
  const batchSize = 5;
  const batches = [];
  for (let i = 0; i < shopifySites.length; i += batchSize) {
    batches.push(shopifySites.slice(i, i + batchSize));
  }
  
  let siteIndex = 0;
  
  for (const batch of batches) {
    console.log(`\n📦 Testing batch ${batches.indexOf(batch) + 1}/${batches.length}\n`);
    
    for (const site of batch) {
      siteIndex++;
      console.log(`\n📍 [${siteIndex}/${shopifySites.length}] Testing: ${site.name}`);
      console.log(`   URL: ${site.url}`);
      
      const browserManager = new BrowserManagerBrowserless();
      
      try {
        // Create fresh browser session
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
        
        // Small delay for JavaScript to load
        await session.page.waitForTimeout(2000);
        
        // Use the quick detection method
        const detection = await detector.detectQuick(session.page);
        
        if (detection.isShopify) {
          results.detected++;
          console.log(`   ✅ Detected as Shopify`);
        } else {
          results.failed++;
          console.log(`   ❌ Not detected as Shopify`);
        }
        
        // Categorize confidence
        if (detection.confidence >= 70) {
          results.highConfidence++;
          console.log(`   Confidence: ${detection.confidence}% (HIGH)`);
        } else if (detection.confidence >= 40) {
          results.mediumConfidence++;
          console.log(`   Confidence: ${detection.confidence}% (MEDIUM)`);
        } else {
          results.lowConfidence++;
          console.log(`   Confidence: ${detection.confidence}% (LOW)`);
        }
        
        // Show signals found
        console.log(`   Signals found: ${detection.signals.join(', ') || 'None'}`);
        
        // Show theme if detected
        if (detection.theme) {
          console.log(`   Theme: ${detection.theme}`);
        }
        
        // Show top evidence
        if (detection.evidence && detection.evidence.length > 0) {
          console.log(`   Evidence:`);
          detection.evidence.slice(0, 3).forEach(e => {
            console.log(`     - ${e.signal}: ${e.detail}`);
          });
        }
        
        // Close session
        await session.close();
        
        results.details.push({
          name: site.name,
          url: site.url,
          isShopify: detection.isShopify,
          confidence: detection.confidence,
          signals: detection.signals,
          theme: detection.theme
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
        const stats = browserManager.getStats();
        console.log(`   Cost: $${browserManager.calculateCost().toFixed(4)}`);
      }
      
      // Small delay between sites
      if (siteIndex < shopifySites.length) {
        const delayTime = 2000 + Math.random() * 3000; // 2-5 seconds
        console.log(`\n⏳ Waiting ${(delayTime/1000).toFixed(1)}s before next site...`);
        await delay(delayTime);
      }
    }
    
    // Longer delay between batches
    if (batches.indexOf(batch) < batches.length - 1) {
      console.log(`\n⏳ Waiting 10s before next batch...`);
      await delay(10000);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 SUMMARY\n');
  console.log(`Total sites tested: ${results.total}`);
  console.log(`✅ Correctly detected as Shopify: ${results.detected}`);
  console.log(`❌ Failed to detect: ${results.failed}`);
  console.log(`Success rate: ${((results.detected / results.total) * 100).toFixed(1)}%`);
  
  console.log('\n📈 Confidence Distribution:');
  console.log(`   High (70%+): ${results.highConfidence} sites`);
  console.log(`   Medium (40-69%): ${results.mediumConfidence} sites`);
  console.log(`   Low (<40%): ${results.lowConfidence} sites`);
  
  // Show failures
  const failures = results.details.filter(d => !d.isShopify && !d.error);
  if (failures.length > 0) {
    console.log('\n⚠️ Sites not detected as Shopify:');
    failures.forEach(f => {
      console.log(`   - ${f.name} (confidence: ${f.confidence}%)`);
      console.log(`     Signals: ${f.signals?.join(', ') || 'None'}`);
    });
  }
  
  // Show high performers
  const highPerformers = results.details.filter(d => d.confidence >= 80);
  if (highPerformers.length > 0) {
    console.log('\n🌟 Highest confidence detections (80%+):');
    highPerformers.sort((a, b) => b.confidence - a.confidence).slice(0, 5).forEach(h => {
      console.log(`   - ${h.name}: ${h.confidence}%`);
    });
  }
  
  // Signal analysis
  console.log('\n📊 Signal Analysis:');
  const signalCounts = {};
  results.details.forEach(d => {
    if (d.signals) {
      d.signals.forEach(s => {
        signalCounts[s] = (signalCounts[s] || 0) + 1;
      });
    }
  });
  
  const sortedSignals = Object.entries(signalCounts)
    .sort((a, b) => b[1] - a[1]);
  
  console.log('Most common signals found:');
  sortedSignals.slice(0, 5).forEach(([signal, count]) => {
    const percentage = ((count / results.total) * 100).toFixed(1);
    console.log(`   - ${signal}: ${count} sites (${percentage}%)`);
  });
  
  // Theme analysis
  const themes = {};
  results.details.forEach(d => {
    if (d.theme) {
      themes[d.theme] = (themes[d.theme] || 0) + 1;
    }
  });
  
  if (Object.keys(themes).length > 0) {
    console.log('\n🎨 Themes detected:');
    Object.entries(themes).sort((a, b) => b[1] - a[1]).forEach(([theme, count]) => {
      console.log(`   - ${theme}: ${count} sites`);
    });
  }
  
  console.log('\n✅ Test completed successfully\n');
  process.exit(0);
}

console.log('Starting Shopify weighted detection test...\n');
console.log('⚠️  This test uses:');
console.log('   - Weighted signal scoring for accuracy');
console.log('   - Fresh browser per site for safety');
console.log('   - Batch processing with delays');
console.log('   - Comprehensive signal analysis\n');

testShopifyWeightedDetection();