/**
 * Test NavigationMapperBrowserless with AUTO-OPEN browser debug view
 * The debug URL will automatically open in your default browser!
 */

require('dotenv').config();

// Enable debug mode and auto-open
process.env.BROWSERLESS_DEBUG = 'true';
process.env.AUTO_OPEN_DEBUG = 'true';

const NavigationMapperBrowserless = require('../src/core/discovery/NavigationMapperBrowserless');
const logger = require('../src/utils/logger');

async function testWithAutoOpen() {
  console.log('\n=== Testing with AUTO-OPEN Debug Browser ===\n');
  console.log('🖥️  Browser window will be visible in browserless.io');
  console.log('🚀 Debug URL will automatically open in your browser!');
  console.log('📺 Watch the browser automation in action!\n');
  
  const mapper = new NavigationMapperBrowserless(logger, null);
  
  try {
    await mapper.initialize();
    
    // Test with a simple site
    const testUrl = 'https://glasswing.shop';
    
    console.log(`Testing navigation extraction for: ${testUrl}`);
    console.log('Your browser should open with the debug view automatically...\n');
    
    // Give time for browser to open
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const startTime = Date.now();
    const result = await mapper.mapSiteTaxonomy(testUrl);
    const duration = Date.now() - startTime;
    
    if (result && result.navigation) {
      console.log(`\n✓ Extraction completed in ${(duration/1000).toFixed(2)}s`);
      console.log(`  Categories found: ${result.navigation.length}`);
      
      // Show categories
      console.log('\n  Categories extracted:');
      result.navigation.forEach(cat => {
        console.log(`    - ${cat.text}`);
      });
    } else {
      console.log('\n✗ No navigation data extracted');
    }
    
    console.log('\n💡 The debug browser window should have opened automatically!');
    console.log('   If not, check the URL in the logs above.\n');
    
    console.log('=== Test completed ===\n');
    
  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
  } finally {
    await mapper.close();
    process.exit(0);
  }
}

console.log('Starting test in 2 seconds...');
console.log('The browser debug view will open automatically!\n');

setTimeout(testWithAutoOpen, 2000);