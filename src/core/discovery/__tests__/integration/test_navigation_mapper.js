/**
 * Test: NavigationMapper directly on glasswingshop.com
 * This uses the actual NavigationMapper which combines EnhancedMegaMenuStrategy + FallbackLinkStrategy
 */

const { logger } = require('../../../utils/logger');
const NavigationMapper = require('../NavigationMapper');
const WorldModel = require('../../../data/WorldModel');

async function testNavigationMapper() {
  const targetUrl = 'https://glasswingshop.com';
  let navigationMapper = null;

  try {
    logger.info('🗺️ Testing NavigationMapper on glasswingshop.com');

    // Initialize WorldModel and NavigationMapper
    const worldModel = new WorldModel(logger);
    navigationMapper = new NavigationMapper(logger, worldModel);
    
    // Initialize with glasswingshop.com domain
    await navigationMapper.initializeForSite(false, 'glasswingshop.com');

    logger.info('🚀 Starting navigation discovery...');

    // Map navigation using the correct method
    const results = await navigationMapper.mapSiteNavigation(targetUrl);
    
    logger.info('✅ NavigationMapper completed!', {
      itemsFound: results.items?.length || 0,
      confidence: results.confidence,
      strategy: results.metadata?.strategy
    });

    console.log('\n🎯 NAVIGATION MAPPER RESULTS:');
    console.log(JSON.stringify(results, null, 2));

    // Look for our expected navigation items
    const expectedItems = ['CLOTHING', 'MAN', 'WOMAN', 'BATH & BODY', 'HOME', 'GREENHOUSE', 'SEATTLE'];
    let foundItems = new Set();
    
    if (results.items) {
      results.items.forEach(item => {
        expectedItems.forEach(expected => {
          if (item.text?.toUpperCase().includes(expected.toUpperCase()) || 
              item.name?.toUpperCase().includes(expected.toUpperCase()) ||
              expected.toUpperCase().includes(item.text?.toUpperCase())) {
            foundItems.add(expected);
          }
        });
      });
    }

    console.log('\n✅ EXPECTED NAVIGATION CHECK:');
    expectedItems.forEach(item => {
      const found = foundItems.has(item);
      console.log(`${found ? '✅' : '❌'} ${item}: ${found ? 'FOUND' : 'NOT FOUND'}`);
    });

    console.log(`\n📊 Summary: Found ${foundItems.size}/${expectedItems.length} expected navigation items`);
    
    return {
      totalItems: results.items?.length || 0,
      foundExpectedItems: foundItems.size,
      totalExpectedItems: expectedItems.length,
      strategy: results.metadata?.strategy,
      confidence: results.confidence,
      results: results
    };

  } catch (error) {
    logger.error('❌ Test failed:', error);
    throw error;
  } finally {
    if (navigationMapper) {
      await navigationMapper.close();
    }
  }
}

// Run the test
if (require.main === module) {
  testNavigationMapper()
    .then(results => {
      console.log('\n🏁 NAVIGATION MAPPER TEST SUMMARY:');
      console.log(`Total items found: ${results.totalItems}`);
      console.log(`Expected navigation items: ${results.foundExpectedItems}/${results.totalExpectedItems}`);
      console.log(`Strategy used: ${results.strategy}`);
      console.log(`Confidence: ${results.confidence}`);
      
      if (results.foundExpectedItems >= 5) {
        console.log('✅ Test PASSED - Found most expected navigation');
        process.exit(0);
      } else {
        console.log('❌ Test FAILED - Missing key navigation items');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 Test failed:', error.message);
      process.exit(1);
    });
}

module.exports = testNavigationMapper;