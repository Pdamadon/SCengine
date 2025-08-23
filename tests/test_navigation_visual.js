/**
 * Test NavigationMapperBrowserless with VISIBLE browser window
 * This will show the browser in action!
 */

require('dotenv').config();

// Force debug mode to see the browser
process.env.BROWSERLESS_DEBUG = 'true';

const NavigationMapperBrowserless = require('../src/core/discovery/NavigationMapperBrowserless');
const logger = require('../src/utils/logger');

async function testWithVisibleBrowser() {
  console.log('\n=== Testing with VISIBLE Browser Window ===\n');
  console.log('🖥️  Browser window will be visible in browserless.io');
  console.log('📺 Watch the browser automation in action!\n');
  
  const mapper = new NavigationMapperBrowserless(logger, null);
  
  try {
    await mapper.initialize();
    
    // Test with a simple site
    const testUrl = 'https://glasswing.shop';
    
    console.log(`Testing navigation extraction for: ${testUrl}`);
    console.log('Browser should be visible now...\n');
    
    const startTime = Date.now();
    const result = await mapper.mapSiteTaxonomy(testUrl);
    const duration = Date.now() - startTime;
    
    if (result && result.navigation) {
      console.log(`✓ Extraction completed in ${(duration/1000).toFixed(2)}s`);
      console.log(`  Categories found: ${result.navigation.length}`);
      
      // Show categories
      console.log('\n  Categories extracted:');
      result.navigation.forEach(cat => {
        console.log(`    - ${cat.text}`);
      });
    } else {
      console.log('✗ No navigation data extracted');
    }
    
    console.log('\n=== Test completed ===\n');
    
  } catch (error) {
    console.error('Test failed:', error.message);
  } finally {
    await mapper.close();
    process.exit(0);
  }
}

testWithVisibleBrowser();