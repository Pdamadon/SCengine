/**
 * Test BQL with correct glasswingshop.com domain
 */

require('dotenv').config();

// Enable debug mode and auto-open
process.env.BROWSERLESS_DEBUG = 'true';
process.env.AUTO_OPEN_DEBUG = 'true';

const NavigationMapperBrowserless = require('../src/core/discovery/NavigationMapperBrowserless');
const logger = require('../src/utils/logger');

async function testGlasswingShop() {
  console.log('\n=== Testing glasswingshop.com with Live Debug ===\n');
  console.log('🎯 Testing correct domain: glasswingshop.com');
  console.log('🚀 Live URL will open in your browser');
  console.log('📺 Watch the automation in real-time!\n');
  
  const mapper = new NavigationMapperBrowserless(logger, null);
  
  try {
    await mapper.initialize();
    
    // Use the CORRECT URL
    const testUrl = 'https://glasswingshop.com';
    
    console.log(`Testing navigation extraction for: ${testUrl}`);
    console.log('BQL session initializing...\n');
    
    const startTime = Date.now();
    const result = await mapper.mapSiteTaxonomy(testUrl);
    const duration = Date.now() - startTime;
    
    if (result && result.navigation) {
      console.log(`\n✅ SUCCESS! Extraction completed in ${(duration/1000).toFixed(2)}s`);
      console.log(`  Categories found: ${result.navigation.length}`);
      
      // Show categories
      console.log('\n  Categories extracted:');
      result.navigation.forEach(cat => {
        console.log(`    - ${cat.text}`);
        if (cat.subcategories && cat.subcategories.length > 0) {
          cat.subcategories.forEach(sub => {
            console.log(`      • ${sub.text}`);
          });
        }
      });
    } else {
      console.log('\n⚠️ No navigation data extracted');
    }
    
    console.log('\n=== Test completed ===\n');
    
  } catch (error) {
    console.error('Test failed:', error.message);
  } finally {
    await mapper.close();
    process.exit(0);
  }
}

console.log('Starting test with correct glasswingshop.com domain...\n');
setTimeout(testGlasswingShop, 2000);