/**
 * Test 1: Main Navigation Extraction Only
 * 
 * Purpose: Simple, reliable extraction of the 7 main navigation items
 * Target: li.dropdown-toggle > p.dropdown-title elements specifically
 * No interaction - just identification and location mapping
 */

const { logger } = require('../../../utils/logger');
const { chromium } = require('playwright');

async function testMainNavExtraction() {
  const targetUrl = 'https://glasswingshop.com';
  let browser = null;

  try {
    logger.info('🎯 Test 1: Main Navigation Extraction Only');

    browser = await chromium.launch({ 
      headless: false,
      devtools: false
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    
    // Navigate and wait for network idle (dynamic content loading)
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    
    logger.info('📊 Waiting for navigation elements to load...');
    
    // Wait specifically for our target elements
    try {
      await page.waitForSelector('li.dropdown-toggle', { 
        state: 'visible',
        timeout: 10000 
      });
      logger.info('✅ Found li.dropdown-toggle elements');
    } catch (error) {
      logger.warn('⚠️ li.dropdown-toggle not found, trying alternative selectors');
    }

    // Extract main navigation data
    const mainNavData = await page.evaluate(() => {
      const items = [];
      
      // Primary strategy: Look for dropdown-toggle items
      const dropdownItems = document.querySelectorAll('li.dropdown-toggle');
      
      dropdownItems.forEach((li, index) => {
        const titleElement = li.querySelector('p.dropdown-title');
        if (titleElement) {
          const boundingBox = titleElement.getBoundingClientRect();
          
          items.push({
            text: titleElement.textContent.trim(),
            originalText: titleElement.textContent,
            hasDropdown: true,
            index: index,
            selectors: {
              liElement: `li.dropdown-toggle:nth-child(${index + 1})`,
              titleElement: `li.dropdown-toggle:nth-child(${index + 1}) > p.dropdown-title`,
              dropdownContent: `li.dropdown-toggle:nth-child(${index + 1}) > .dropdown-content`
            },
            xpath: {
              liElement: `//li[@class='dropdown-toggle'][${index + 1}]`,
              titleElement: `//li[@class='dropdown-toggle'][${index + 1}]/p[@class='dropdown-title']`
            },
            boundingBox: {
              x: boundingBox.x,
              y: boundingBox.y,
              width: boundingBox.width,
              height: boundingBox.height
            },
            attributes: {
              liClasses: li.className,
              titleClasses: titleElement.className,
              liId: li.id || null
            },
            isVisible: titleElement.offsetParent !== null,
            parentContainer: 'nav#nav-menu'
          });
        }
      });
      
      // Fallback strategy: Look for other main nav patterns
      if (items.length === 0) {
        logger.info('🔄 Fallback: Looking for alternative nav patterns');
        
        // Try direct nav links
        const navLinks = document.querySelectorAll('nav#nav-menu > ul > li > a');
        navLinks.forEach((link, index) => {
          if (link.textContent.trim()) {
            items.push({
              text: link.textContent.trim(),
              originalText: link.textContent,
              hasDropdown: false,
              index: index,
              href: link.href,
              selectors: {
                linkElement: `nav#nav-menu > ul > li:nth-child(${index + 1}) > a`
              },
              isVisible: link.offsetParent !== null,
              parentContainer: 'nav#nav-menu'
            });
          }
        });
      }
      
      return {
        items: items,
        metadata: {
          totalFound: items.length,
          withDropdowns: items.filter(i => i.hasDropdown).length,
          withoutDropdowns: items.filter(i => !i.hasDropdown).length,
          extractionMethod: items.length > 0 && items[0].hasDropdown ? 'dropdown-toggle' : 'fallback',
          navContainerFound: !!document.querySelector('nav#nav-menu'),
          timestamp: new Date().toISOString()
        }
      };
    });
    
    logger.info('✅ Main navigation extraction completed!', {
      itemsFound: mainNavData.items.length,
      extractionMethod: mainNavData.metadata.extractionMethod
    });

    console.log('\n🎯 MAIN NAVIGATION EXTRACTION RESULTS:');
    console.log(`Items found: ${mainNavData.items.length}`);
    console.log(`Extraction method: ${mainNavData.metadata.extractionMethod}`);
    console.log(`Items with dropdowns: ${mainNavData.metadata.withDropdowns}`);
    console.log(`Items without dropdowns: ${mainNavData.metadata.withoutDropdowns}`);

    // Show detailed results
    if (mainNavData.items.length > 0) {
      console.log('\n📋 MAIN NAVIGATION ITEMS:');
      mainNavData.items.forEach((item, i) => {
        const dropdownIcon = item.hasDropdown ? '📁' : '🔗';
        console.log(`[${i}] ${dropdownIcon} "${item.text}"`);
        console.log(`    Li Selector: ${item.selectors.liElement || item.selectors.linkElement}`);
        if (item.hasDropdown) {
          console.log(`    Title Selector: ${item.selectors.titleElement}`);
          console.log(`    Dropdown Selector: ${item.selectors.dropdownContent}`);
        }
        if (item.href) {
          console.log(`    URL: ${item.href}`);
        }
        console.log(`    Visible: ${item.isVisible}`);
        console.log(`    Position: ${Math.round(item.boundingBox?.x || 0)}, ${Math.round(item.boundingBox?.y || 0)}`);
        console.log('');
      });
    }

    // Check for expected navigation items
    const expectedItems = ['CLOTHING', 'MAN', 'WOMAN', 'BATH & BODY', 'HOME', 'GREENHOUSE', 'SEATTLE'];
    let foundItems = new Set();
    
    mainNavData.items.forEach(item => {
      expectedItems.forEach(expected => {
        if (item.text.toUpperCase().includes(expected.toUpperCase()) || 
            expected.toUpperCase().includes(item.text.toUpperCase())) {
          foundItems.add(expected);
        }
      });
    });

    console.log('\n✅ EXPECTED NAVIGATION CHECK:');
    expectedItems.forEach(item => {
      const found = foundItems.has(item);
      console.log(`${found ? '✅' : '❌'} ${item}: ${found ? 'FOUND' : 'NOT FOUND'}`);
    });

    console.log(`\n📊 Summary: Found ${foundItems.size}/${expectedItems.length} expected navigation items`);

    await page.waitForTimeout(2000);
    
    return {
      mainNavData: mainNavData,
      foundExpectedItems: foundItems.size,
      totalExpectedItems: expectedItems.length,
      success: mainNavData.items.length > 0
    };

  } catch (error) {
    logger.error('❌ Test 1 failed:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the test
if (require.main === module) {
  testMainNavExtraction()
    .then(results => {
      console.log('\n🏁 TEST 1 SUMMARY: Main Navigation Extraction');
      console.log(`Total items found: ${results.mainNavData.items.length}`);
      console.log(`Expected navigation items: ${results.foundExpectedItems}/${results.totalExpectedItems}`);
      console.log(`Success: ${results.success}`);
      
      if (results.success && results.foundExpectedItems >= 5) {
        console.log('✅ Test 1 PASSED - Successfully extracted main navigation');
        process.exit(0);
      } else if (results.success) {
        console.log('⚠️ Test 1 PARTIAL - Found navigation but missing expected items');
        process.exit(0);
      } else {
        console.log('❌ Test 1 FAILED - Could not extract main navigation');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 Test 1 failed:', error.message);
      process.exit(1);
    });
}

module.exports = testMainNavExtraction;