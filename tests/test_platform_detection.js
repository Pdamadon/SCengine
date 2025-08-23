/**
 * Test Platform Detection and Patterns
 * Week 1 Day 5: Verify platform-specific patterns work
 */

require('dotenv').config();

const PlatformPatterns = require('../src/core/discovery/PlatformPatterns');
const BrowserManagerBrowserless = require('../src/common/BrowserManagerBrowserless');
const { logger } = require('../src/utils/logger');

async function testPlatformDetection() {
  console.log('\n=== Testing Platform Detection ===\n');
  
  const platformPatterns = new PlatformPatterns();
  const browserManager = new BrowserManagerBrowserless();
  
  // Test sites for each platform
  const testSites = [
    { url: 'https://glasswingshop.com', expected: 'shopify', name: 'Glasswing Shop' },
    { url: 'https://www.allbirds.com', expected: 'shopify', name: 'Allbirds' },
    { url: 'https://shop.polymer-project.org', expected: 'custom', name: 'Polymer Shop (Demo)' },
    // Add more test sites as needed
  ];
  
  try {
    // Create browser session
    const session = await browserManager.createBrowser('stealth', {
      site: 'platform-detection-test',
      useBQL: false,
      timeout: 60000
    });
    
    console.log('Testing platform detection on multiple sites...\n');
    
    for (const site of testSites) {
      console.log(`\n📍 Testing: ${site.name}`);
      console.log(`   URL: ${site.url}`);
      console.log(`   Expected: ${site.expected}`);
      
      try {
        // Navigate to site
        await session.page.goto(site.url, { 
          waitUntil: 'networkidle',
          timeout: 30000 
        });
        
        // Detect platform
        const detectedPlatform = await platformPatterns.detectPlatform(session.page);
        
        // Get patterns for platform
        const patterns = platformPatterns.getPlatformPatterns(detectedPlatform);
        
        // Results
        const match = detectedPlatform === site.expected;
        console.log(`   Detected: ${detectedPlatform} ${match ? '✅' : '❌'}`);
        
        // Show pattern details
        console.log(`\n   Platform Details:`);
        console.log(`   - Name: ${patterns.name}`);
        console.log(`   - Navigation patterns: ${patterns.navigation.patterns.length}`);
        console.log(`   - Product selectors: ${patterns.products?.productCards?.length || 0}`);
        
        // Test navigation extraction with platform patterns
        if (patterns.navigation.patterns.length > 0) {
          const navPattern = patterns.navigation.patterns[0];
          console.log(`\n   Testing navigation with pattern: ${navPattern.name}`);
          
          // Check if navigation elements exist
          const hasNav = await session.page.evaluate((selectors) => {
            const containers = document.querySelectorAll(selectors.container);
            return {
              found: containers.length > 0,
              count: containers.length,
              sample: containers.length > 0 ? containers[0].textContent.trim() : null
            };
          }, navPattern.selectors);
          
          if (hasNav.found) {
            console.log(`   ✅ Found ${hasNav.count} navigation items`);
            if (hasNav.sample) {
              console.log(`   Sample: "${hasNav.sample.substring(0, 50)}..."`);
            }
          } else {
            console.log(`   ⚠️ No navigation found with this pattern`);
          }
        }
        
        // Test product detection
        if (patterns.products?.productCards) {
          console.log(`\n   Testing product detection...`);
          
          // Try to find products on homepage or navigate to a collection
          let foundProducts = false;
          
          for (const selector of patterns.products.productCards) {
            const products = await session.page.$$(selector);
            if (products.length > 0) {
              console.log(`   ✅ Found ${products.length} products with selector: ${selector}`);
              foundProducts = true;
              break;
            }
          }
          
          if (!foundProducts) {
            console.log(`   ℹ️ No products on homepage (may need to navigate to collection)`);
          }
        }
        
      } catch (error) {
        console.error(`   ❌ Error testing ${site.name}: ${error.message}`);
      }
      
      console.log('\n' + '='.repeat(60));
    }
    
    // Test extraction selectors
    console.log('\n\n=== Testing Extraction Selectors ===\n');
    
    // Navigate to a product page for testing extraction
    const productUrl = 'https://glasswingshop.com/products/3-stripes-jacket';
    console.log(`Testing product extraction on: ${productUrl}\n`);
    
    await session.page.goto(productUrl, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    const platform = await platformPatterns.detectPlatform(session.page);
    const extractionSelectors = platformPatterns.getExtractionSelectors(platform);
    
    console.log(`Platform: ${platform}\n`);
    
    // Test title extraction
    for (const selector of extractionSelectors.title) {
      const title = await session.page.$(selector);
      if (title) {
        const text = await session.page.evaluate(el => el.textContent.trim(), title);
        console.log(`✅ Title found with "${selector}": ${text}`);
        break;
      }
    }
    
    // Test price extraction
    for (const selector of extractionSelectors.price) {
      const price = await session.page.$(selector);
      if (price) {
        const text = await session.page.evaluate(el => el.textContent.trim(), price);
        console.log(`✅ Price found with "${selector}": ${text}`);
        break;
      }
    }
    
    // Test image extraction
    for (const selector of extractionSelectors.image) {
      const image = await session.page.$(selector);
      if (image) {
        const src = await session.page.evaluate(el => el.src || el.getAttribute('src'), image);
        console.log(`✅ Image found with "${selector}": ${src?.substring(0, 50)}...`);
        break;
      }
    }
    
    // Get browser stats
    const stats = browserManager.getStats();
    console.log('\n\n📊 Session Statistics:');
    console.log(`   Sessions created: ${stats.sessions.created}`);
    console.log(`   Estimated cost: $${browserManager.calculateCost().toFixed(4)}`);
    
    // Close session
    await session.close();
    console.log('\n✅ Test completed successfully\n');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
  
  process.exit(0);
}

console.log('Starting platform detection test...\n');
testPlatformDetection();