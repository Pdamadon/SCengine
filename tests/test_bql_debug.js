/**
 * Test BQL integration with liveURL for debug viewing
 * This test uses BrowserQL to get a proper live viewing URL
 */

require('dotenv').config();

// Enable debug mode and auto-open
process.env.BROWSERLESS_DEBUG = 'true';
process.env.AUTO_OPEN_DEBUG = 'true';

const NavigationMapperBrowserless = require('../src/core/discovery/NavigationMapperBrowserless');
const logger = require('../src/utils/logger');

async function testBQLDebug() {
  console.log('\n=== Testing BQL Integration with Live Debug URL ===\n');
  console.log('🎯 Using BrowserQL for enhanced debug capabilities');
  console.log('🚀 Live URL will automatically open in your browser!');
  console.log('📺 Watch the browser automation in real-time!\n');
  
  const mapper = new NavigationMapperBrowserless(logger, null);
  
  try {
    await mapper.initialize();
    
    // Test with a simple site
    const testUrl = 'https://glasswing.shop';
    
    console.log(`Testing navigation extraction for: ${testUrl}`);
    console.log('BQL will initialize the session and provide a liveURL...\n');
    
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
      console.log('  (This is expected - the extraction strategies need work)');
    }
    
    console.log('\n💡 The live debug browser window should have opened automatically!');
    console.log('   This URL can be shared with others (no token needed).\n');
    
    console.log('=== BQL Test completed ===\n');
    
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

console.log('Starting BQL test in 2 seconds...');
console.log('The browser live view will open automatically!\n');

setTimeout(testBQLDebug, 2000);