/**
 * Test: Focused trigger detection on glasswingshop.com
 * 
 * Tests if our updated focused selectors can find the top-level navigation:
 * CLOTHING | MAN | WOMAN | BATH & BODY | HOME | GREENHOUSE | SEATTLE
 */

const { logger } = require('../../../utils/logger');
const { chromium } = require('playwright');

async function testFocusedTriggers() {
  const targetUrl = 'https://glasswingshop.com';
  let browser = null;

  try {
    logger.info('🎯 Testing focused trigger selectors on glasswingshop.com');

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

    logger.info('📊 Testing focused trigger selectors...');

    // Test our new focused trigger selectors based on glasswingshop.com structure
    const focusedSelectors = [
      'nav > ul > li.dropdown-toggle',  // Specific glasswingshop pattern
      'nav > ul > li[class*="dropdown"]',
      'nav > ul > li', 
      'nav > li', 
      'nav > div > li',
      '[role="navigation"] > ul > li', 
      '[role="navigation"] > li',
      '[role="menubar"] > li',
      '.navigation > ul > li', 
      '.navigation > li',
      '.main-nav > ul > li', 
      '.main-nav > li',
      '.primary-nav > ul > li', 
      '.primary-nav > li',
      '.header-nav > ul > li', 
      '.header-nav > li',
    ];

    const results = await page.evaluate((selectors) => {
      const findings = {};
      
      selectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          const items = [];
          
          elements.forEach(el => {
            const text = el.textContent?.trim();
            const link = el.querySelector('a');
            const href = link?.href || el.href;
            
            if (text && text.length > 0 && text.length < 100) {
              items.push({
                text: text,
                href: href,
                hasDropdown: el.querySelector('[class*="dropdown"], [class*="mega"], [class*="menu"]') !== null,
                isVisible: el.offsetParent !== null,
                rect: el.getBoundingClientRect()
              });
            }
          });
          
          if (items.length > 0) {
            findings[selector] = items;
          }
        } catch (e) {
          console.warn(`Selector failed: ${selector}`, e.message);
        }
      });
      
      return findings;
    }, focusedSelectors);

    console.log('\n🎯 FOCUSED TRIGGER RESULTS:');
    
    // Look for our expected navigation items
    const expectedItems = ['CLOTHING', 'MAN', 'WOMAN', 'BATH & BODY', 'HOME', 'GREENHOUSE', 'SEATTLE'];
    let foundItems = new Set();
    
    Object.entries(results).forEach(([selector, items]) => {
      console.log(`\n📋 ${selector}:`);
      console.log(`  Found ${items.length} items`);
      
      items.forEach((item, i) => {
        console.log(`  [${i}] "${item.text}"`);
        console.log(`      href: ${item.href}`);
        console.log(`      visible: ${item.isVisible}, hasDropdown: ${item.hasDropdown}`);
        
        // Check if this matches any expected item
        expectedItems.forEach(expected => {
          if (item.text.toUpperCase().includes(expected.toUpperCase()) || 
              expected.toUpperCase().includes(item.text.toUpperCase())) {
            foundItems.add(expected);
          }
        });
      });
    });

    console.log('\n✅ EXPECTED NAVIGATION CHECK:');
    expectedItems.forEach(item => {
      const found = foundItems.has(item);
      console.log(`${found ? '✅' : '❌'} ${item}: ${found ? 'FOUND' : 'NOT FOUND'}`);
    });

    console.log(`\n📊 Summary: Found ${foundItems.size}/${expectedItems.length} expected navigation items`);

    if (foundItems.size >= 5) {
      logger.info('🎉 Success! Found most expected navigation items');
    } else {
      logger.warn('⚠️ Still missing key navigation items');
    }

    // Wait a moment then close
    await page.waitForTimeout(2000);
    
    return {
      totalSelectors: focusedSelectors.length,
      successfulSelectors: Object.keys(results).length,
      foundExpectedItems: foundItems.size,
      totalExpectedItems: expectedItems.length,
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
  testFocusedTriggers()
    .then(results => {
      console.log('\n🏁 TEST SUMMARY:');
      console.log(`Successful selectors: ${results.successfulSelectors}/${results.totalSelectors}`);
      console.log(`Found navigation items: ${results.foundExpectedItems}/${results.totalExpectedItems}`);
      
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

module.exports = testFocusedTriggers;