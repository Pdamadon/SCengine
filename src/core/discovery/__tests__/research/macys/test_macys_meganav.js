/**
 * Test: Original MegaMenuStrategy on macys.com
 * This tests if the original MegaMenuStrategy is working on a known site
 */

const { logger } = require('../../../utils/logger');
const MegaMenuStrategy = require('../strategies/MegaMenuStrategy');
const { chromium } = require('playwright');

async function testMacysMegaNav() {
  const targetUrl = 'https://macys.com';
  let browser = null;

  try {
    logger.info('🧪 Testing original MegaMenuStrategy on macys.com');

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

    logger.info('📊 Testing original MegaMenuStrategy execution...');

    // Initialize and execute original MegaMenuStrategy
    const strategy = new MegaMenuStrategy(logger, {
      maxDepth: 3,
      maxUrlsPerDomain: 100,
      enableMobileFallback: true
    });

    const results = await strategy.execute(page);
    
    logger.info('✅ Original MegaMenuStrategy completed!', {
      itemsFound: results.items?.length || 0,
      confidence: results.confidence,
      strategy: results.metadata?.strategy
    });

    console.log('\n🎯 MACYS MEGANAV STRATEGY RESULTS:');
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

    // Look for typical department store categories
    const expectedDepartments = ['Women', 'Men', 'Kids', 'Home', 'Beauty', 'Shoes', 'Handbags'];
    let foundDepartments = new Set();
    
    if (results.items) {
      results.items.forEach(item => {
        expectedDepartments.forEach(dept => {
          if (item.text?.toLowerCase().includes(dept.toLowerCase()) || 
              item.name?.toLowerCase().includes(dept.toLowerCase())) {
            foundDepartments.add(dept);
          }
        });
      });
    }

    console.log('\n✅ DEPARTMENT CHECK:');
    expectedDepartments.forEach(dept => {
      const found = foundDepartments.has(dept);
      console.log(`${found ? '✅' : '❌'} ${dept}: ${found ? 'FOUND' : 'NOT FOUND'}`);
    });

    console.log(`\n📊 Summary: Found ${foundDepartments.size}/${expectedDepartments.length} expected departments`);

    await page.waitForTimeout(2000);
    
    return {
      totalItems: results.items?.length || 0,
      foundDepartments: foundDepartments.size,
      totalDepartments: expectedDepartments.length,
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
  testMacysMegaNav()
    .then(results => {
      console.log('\n🏁 MACYS MEGANAV TEST SUMMARY:');
      console.log(`Total items found: ${results.totalItems}`);
      console.log(`Expected departments: ${results.foundDepartments}/${results.totalDepartments}`);
      console.log(`Confidence: ${results.confidence}`);
      
      if (results.foundDepartments >= 4) {
        console.log('✅ Test PASSED - Found most expected departments');
        process.exit(0);
      } else {
        console.log('❌ Test FAILED - Missing key departments');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 Test failed:', error.message);
      process.exit(1);
    });
}

module.exports = testMacysMegaNav;