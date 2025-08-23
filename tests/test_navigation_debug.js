/**
 * Test with debug options passed directly
 */

require('dotenv').config();
const NavigationMapperBrowserless = require('../src/core/discovery/NavigationMapperBrowserless');
const logger = require('../src/utils/logger');

async function testWithDebugOptions() {
  console.log('\n=== Testing with Debug Options ===\n');
  
  const mapper = new NavigationMapperBrowserless(logger, null);
  
  try {
    await mapper.initialize();
    
    // We need to modify how extractNavigation is called
    // Since the debug option needs to be passed to BrowserManagerBrowserless
    // Let's check the current implementation...
    
    const testUrl = 'https://glasswing.shop';
    
    // The extractNavigation method would need to pass debug:true to browserOptions
    // Currently it doesn't expose this, but we can work around it
    
    // Monkey-patch the browser creation to force debug mode
    const originalExtract = mapper.extractNavigation.bind(mapper);
    mapper.extractNavigation = async function(url, options = {}) {
      // Force debug mode
      console.log('🔧 Injecting debug mode into browser options...');
      
      // We need to modify the browserOptions inside extractNavigation
      // This is a bit hacky but works for testing
      const oldEnv = process.env.BROWSERLESS_DEBUG;
      process.env.BROWSERLESS_DEBUG = 'true';
      
      try {
        const result = await originalExtract(url, options);
        return result;
      } finally {
        process.env.BROWSERLESS_DEBUG = oldEnv;
      }
    };
    
    console.log(`Testing: ${testUrl} with visible browser\n`);
    
    const result = await mapper.mapSiteTaxonomy(testUrl);
    
    if (result && result.navigation) {
      console.log(`✓ Extraction completed`);
      console.log(`  Categories found: ${result.navigation.length}`);
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  } finally {
    await mapper.close();
    process.exit(0);
  }
}

testWithDebugOptions();