/**
 * Test: Original MegaMenuStrategy on glasswingshop.com
 * Testing the working original strategy vs the broken enhanced one
 */

const { logger } = require('../../../utils/logger');
const MegaMenuStrategy = require('../strategies/MegaMenuStrategy');
const { chromium } = require('playwright');

async function testGlasswingOriginalMegaNav() {
  const targetUrl = 'https://glasswingshop.com';
  let browser = null;

  try {
    logger.info('🧪 Testing ORIGINAL MegaMenuStrategy on glasswingshop.com');

    browser = await chromium.launch({ 
      headless: false,
      devtools: false
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    logger.info('📊 Testing ORIGINAL MegaMenuStrategy execution...');

    // Initialize and execute original MegaMenuStrategy
    const strategy = new MegaMenuStrategy(logger, {
      maxMenusToCapture: 10,
      hoverDelay: 1000, // Shorter delay for glasswingshop
      enableMobileFallback: true
    });

    const results = await strategy.execute(page);
    
    logger.info('✅ ORIGINAL MegaMenuStrategy completed!', {
      itemsFound: results.items?.length || 0,
      confidence: results.confidence,
      strategy: results.metadata?.strategy
    });

    console.log('\n🎯 GLASSWING ORIGINAL MEGANAV RESULTS:');
    console.log(`Items found: ${results.items?.length || 0}`);
    console.log(`Confidence: ${results.confidence}`);
    console.log(`Strategy: ${results.metadata?.strategy}`);

    // Show first 10 items to see what we're getting
    if (results.items && results.items.length > 0) {
      console.log('\n📋 FIRST 10 NAVIGATION ITEMS:');
      results.items.slice(0, 10).forEach((item, i) => {
        console.log(`[${i}] "${item.text || item.name}" -> ${item.url}`);
      });
    }

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

    await page.waitForTimeout(2000);
    
    return {
      totalItems: results.items?.length || 0,
      foundExpectedItems: foundItems.size,
      totalExpectedItems: expectedItems.length,
      confidence: results.confidence,
      results: results
    };

  } catch (error) {
    logger.error('❌ Test failed:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the test
if (require.main === module) {
  testGlasswingOriginalMegaNav()
    .then(results => {
      console.log('\n🏁 GLASSWING ORIGINAL MEGANAV TEST SUMMARY:');
      console.log(`Total items found: ${results.totalItems}`);
      console.log(`Expected navigation items: ${results.foundExpectedItems}/${results.totalExpectedItems}`);
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

module.exports = testGlasswingOriginalMegaNav;