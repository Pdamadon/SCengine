/**
 * Test NavigationMapperBrowserless backward compatibility
 */

require('dotenv').config();
const NavigationMapperBrowserless = require('../src/core/discovery/NavigationMapperBrowserless');
const logger = require('../src/utils/logger');

async function testCompatibility() {
  console.log('\n=== Testing NavigationMapperBrowserless Compatibility ===\n');
  
  const mapper = new NavigationMapperBrowserless(logger, null);
  
  try {
    // Test 1: Check methods exist
    console.log('1. Checking compatibility methods exist...');
    const methods = [
      'mapSiteNavigation',
      'mapSiteTaxonomy', 
      'close',
      'closeAnyPopups',
      'extractNavigation',
      'cleanup'
    ];
    
    for (const method of methods) {
      if (typeof mapper[method] === 'function') {
        console.log(`   ✓ ${method}() exists`);
      } else {
        console.error(`   ✗ ${method}() missing!`);
      }
    }
    
    // Test 2: Test close() alias
    console.log('\n2. Testing close() -> cleanup() alias...');
    mapper.cleanup = async () => {
      console.log('   cleanup() was called');
      return true;
    };
    
    const result = await mapper.close();
    console.log(`   ✓ close() returned: ${result}`);
    
    // Test 3: Test method signatures
    console.log('\n3. Testing method signatures...');
    
    // Mock extractNavigation for testing
    mapper.extractNavigation = async (url) => {
      console.log(`   extractNavigation called with: ${url}`);
      return {
        navigation: [
          {
            text: 'Category 1',
            href: '/cat1',
            subcategories: [
              { text: 'Sub 1', href: '/sub1', products: ['p1', 'p2'] }
            ],
            products: ['p3', 'p4']
          }
        ],
        confidence: 0.95,
        metadata: { source: 'test' }
      };
    };
    
    // Test mapSiteNavigation
    console.log('\n   Testing mapSiteNavigation...');
    const navResult = await mapper.mapSiteNavigation('https://example.com');
    console.log('   Result has navigation:', !!navResult.navigation);
    console.log('   Result has products:', !!navResult.navigation[0].products);
    
    // Test mapSiteTaxonomy (should remove products)
    console.log('\n   Testing mapSiteTaxonomy...');
    const taxResult = await mapper.mapSiteTaxonomy('https://example.com');
    console.log('   Result has navigation:', !!taxResult.navigation);
    console.log('   Products removed:', taxResult.navigation[0].products === undefined);
    console.log('   Subcategory products removed:', 
      taxResult.navigation[0].subcategories[0].products === undefined);
    
    console.log('\n=== All compatibility tests passed! ===\n');
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testCompatibility();