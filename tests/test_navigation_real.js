/**
 * Test NavigationMapperBrowserless with real navigation extraction
 */

require('dotenv').config();
const NavigationMapperBrowserless = require('../src/core/discovery/NavigationMapperBrowserless');
const logger = require('../src/utils/logger');

async function testRealExtraction() {
  console.log('\n=== Testing NavigationMapperBrowserless Real Extraction ===\n');
  
  const mapper = new NavigationMapperBrowserless(logger, null);
  
  try {
    await mapper.initialize();
    
    // Test with a simple site that doesn't block scrapers
    const testUrl = 'https://glasswing.shop';
    
    console.log(`Testing navigation extraction for: ${testUrl}`);
    console.log('Using compatibility method: mapSiteTaxonomy()\n');
    
    const startTime = Date.now();
    const result = await mapper.mapSiteTaxonomy(testUrl);
    const duration = Date.now() - startTime;
    
    if (result && result.navigation) {
      console.log(`✓ Extraction successful in ${(duration/1000).toFixed(2)}s`);
      console.log(`  Categories found: ${result.navigation.length}`);
      console.log(`  Confidence: ${result.confidence || 'N/A'}`);
      
      // Show first few categories
      console.log('\n  Sample categories:');
      result.navigation.slice(0, 5).forEach(cat => {
        console.log(`    - ${cat.text} (${cat.href})`);
        if (cat.subcategories && cat.subcategories.length > 0) {
          console.log(`      └─ ${cat.subcategories.length} subcategories`);
        }
      });
      
      // Verify products were removed (taxonomy only)
      const hasProducts = result.navigation.some(nav => 
        nav.products !== undefined || 
        (nav.subcategories && nav.subcategories.some(sub => sub.products !== undefined))
      );
      console.log(`\n  Products removed (taxonomy only): ${!hasProducts}`);
      
    } else {
      console.log('✗ No navigation data extracted');
    }
    
    console.log('\n=== Test completed successfully ===\n');
    
  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  } finally {
    await mapper.close();
    process.exit(0);
  }
}

testRealExtraction();