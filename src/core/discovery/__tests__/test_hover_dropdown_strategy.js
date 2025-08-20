/**
 * Test 2: Hover-Based Dropdown Strategy
 * 
 * Purpose: Try different hover approaches to reveal dropdown content
 * Uses: Main nav data from Test 1 as input
 * Tests: Different hover targets and wait strategies
 */

const { logger } = require('../../../utils/logger');
const { chromium } = require('playwright');

async function testHoverDropdownStrategy() {
  const targetUrl = 'https://glasswingshop.com';
  let browser = null;

  try {
    logger.info('🎯 Test 2: Hover-Based Dropdown Strategy');

    browser = await chromium.launch({ 
      headless: false,
      devtools: false
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    
    // Navigate and wait for dynamic content
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    
    // First, get the main navigation items (reusing Test 1 logic)
    await page.waitForSelector('li.dropdown-toggle', { state: 'visible', timeout: 10000 });
    
    const mainNavItems = await page.evaluate(() => {
      const items = [];
      const dropdownItems = document.querySelectorAll('li.dropdown-toggle');
      
      dropdownItems.forEach((li, index) => {
        const titleElement = li.querySelector('p.dropdown-title');
        if (titleElement) {
          items.push({
            text: titleElement.textContent.trim(),
            index: index,
            selectors: {
              liElement: `li.dropdown-toggle:nth-child(${index + 1})`,
              titleElement: `li.dropdown-toggle:nth-child(${index + 1}) > p.dropdown-title`,
              dropdownContent: `li.dropdown-toggle:nth-child(${index + 1}) > .dropdown-content`
            }
          });
        }
      });
      
      return items;
    });

    logger.info(`📊 Found ${mainNavItems.length} main navigation items to test`);

    const dropdownResults = [];
    const hoverStrategies = [
      { name: 'hover-on-li', target: 'li', description: 'Hover on <li> element' },
      { name: 'hover-on-title', target: 'title', description: 'Hover on <p> title element' },
      { name: 'click-on-title', target: 'title', description: 'Click on <p> title element', useClick: true },
      { name: 'hover-with-delay', target: 'li', description: 'Hover on <li> with longer delay', delay: 3000 }
    ];

    // Test the first item with different strategies
    const testItem = mainNavItems[0]; // Test with "Clothing"
    logger.info(`🎯 Testing dropdown strategies on: "${testItem.text}"`);

    for (const strategy of hoverStrategies) {
      logger.info(`📊 Testing strategy: ${strategy.description}`);
      
      try {
        // Move mouse away first (reset state)
        await page.mouse.move(100, 100);
        await page.waitForTimeout(500);

        // Get target element based on strategy
        let targetSelector;
        if (strategy.target === 'li') {
          targetSelector = testItem.selectors.liElement;
        } else {
          targetSelector = testItem.selectors.titleElement;
        }

        // Find the element
        const targetElement = await page.locator(targetSelector).first();
        
        if (!await targetElement.isVisible()) {
          throw new Error(`Target element not visible: ${targetSelector}`);
        }

        // Perform interaction
        if (strategy.useClick) {
          await targetElement.click({ timeout: 2000 });
        } else {
          await targetElement.hover({ timeout: 2000 });
        }
        
        // Wait for potential dropdown content
        const waitTime = strategy.delay || 2000;
        await page.waitForTimeout(waitTime);

        // Check if dropdown content appeared
        const dropdownVisible = await page.evaluate((contentSelector) => {
          const dropdown = document.querySelector(contentSelector);
          if (!dropdown) return { visible: false, error: 'Dropdown element not found' };
          
          const style = window.getComputedStyle(dropdown);
          const rect = dropdown.getBoundingClientRect();
          
          return {
            visible: style.display !== 'none' && 
                     style.visibility !== 'hidden' && 
                     parseFloat(style.opacity) > 0 &&
                     rect.width > 0 && rect.height > 0,
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            width: rect.width,
            height: rect.height,
            hasContent: dropdown.children.length > 0
          };
        }, testItem.selectors.dropdownContent);

        // If dropdown is visible, extract content
        let dropdownContent = null;
        if (dropdownVisible.visible) {
          dropdownContent = await page.evaluate((contentSelector) => {
            const dropdown = document.querySelector(contentSelector);
            const links = dropdown.querySelectorAll('a');
            
            return Array.from(links).map(link => ({
              text: link.textContent.trim(),
              href: link.href,
              visible: link.offsetParent !== null
            })).filter(item => item.text.length > 0);
          }, testItem.selectors.dropdownContent);
        }

        dropdownResults.push({
          strategy: strategy.name,
          description: strategy.description,
          targetSelector: targetSelector,
          success: dropdownVisible.visible,
          dropdownState: dropdownVisible,
          itemsFound: dropdownContent?.length || 0,
          items: dropdownContent || [],
          error: null
        });

        logger.info(`${dropdownVisible.visible ? '✅' : '❌'} ${strategy.description}: ${dropdownVisible.visible ? 'SUCCESS' : 'FAILED'}`);

      } catch (error) {
        logger.warn(`❌ ${strategy.description} failed: ${error.message}`);
        
        dropdownResults.push({
          strategy: strategy.name,
          description: strategy.description,
          success: false,
          error: error.message,
          itemsFound: 0,
          items: []
        });
      }

      // Reset between strategies
      await page.mouse.move(50, 50);
      await page.waitForTimeout(1000);
    }

    // Test successful strategy on all items if we found one
    const successfulStrategy = dropdownResults.find(r => r.success);
    let allDropdownsData = {};
    
    if (successfulStrategy) {
      logger.info(`🎉 Found working strategy: ${successfulStrategy.description}`);
      logger.info('📊 Testing on all navigation items...');
      
      for (const item of mainNavItems) {
        try {
          logger.info(`🎯 Testing dropdown extraction for: "${item.text}"`);
          
          // More aggressive reset - move to random neutral area
          const randomX = Math.floor(Math.random() * 300) + 50;  // 50-350px
          const randomY = Math.floor(Math.random() * 200) + 400; // 400-600px (below nav)
          await page.mouse.move(randomX, randomY);
          await page.waitForTimeout(800);
          
          // Small scroll to reset any sticky states
          await page.evaluate(() => window.scrollBy(0, 10));
          await page.waitForTimeout(500);
          await page.evaluate(() => window.scrollBy(0, -10));
          await page.waitForTimeout(500);

          // Verify current dropdown is closed before proceeding
          const isDropdownClosed = await page.evaluate((contentSelector) => {
            const dropdown = document.querySelector(contentSelector);
            if (!dropdown) return true;
            
            const style = window.getComputedStyle(dropdown);
            return style.display === 'none' || 
                   style.visibility === 'hidden' || 
                   parseFloat(style.opacity) === 0;
          }, item.selectors.dropdownContent);
          
          if (!isDropdownClosed) {
            logger.warn(`⚠️ Dropdown still open for ${item.text}, forcing close`);
            // Try clicking elsewhere to close
            await page.mouse.click(randomX, randomY);
            await page.waitForTimeout(1000);
          }

          // Use successful strategy
          let targetSelector;
          if (successfulStrategy.strategy.includes('title')) {
            targetSelector = item.selectors.titleElement;
          } else {
            targetSelector = item.selectors.liElement;
          }

          const targetElement = await page.locator(targetSelector).first();
          
          if (successfulStrategy.strategy.includes('click')) {
            await targetElement.click({ timeout: 2000 });
          } else {
            await targetElement.hover({ timeout: 2000 });
          }
          
          await page.waitForTimeout(2000);

          // Extract dropdown content
          const dropdownContent = await page.evaluate((contentSelector) => {
            const dropdown = document.querySelector(contentSelector);
            if (!dropdown) return [];
            
            const style = window.getComputedStyle(dropdown);
            const isVisible = style.display !== 'none' && 
                             style.visibility !== 'hidden' && 
                             parseFloat(style.opacity) > 0;
            
            if (!isVisible) return [];
            
            const links = dropdown.querySelectorAll('a');
            return Array.from(links).map(link => ({
              text: link.textContent.trim(),
              href: link.href,
              visible: link.offsetParent !== null
            })).filter(item => item.text.length > 0);
          }, item.selectors.dropdownContent);

          allDropdownsData[item.text] = {
            items: dropdownContent,
            count: dropdownContent.length
          };

          logger.info(`📁 ${item.text}: ${dropdownContent.length} dropdown items`);

        } catch (error) {
          logger.warn(`❌ Failed to extract dropdown for ${item.text}: ${error.message}`);
          allDropdownsData[item.text] = { items: [], count: 0, error: error.message };
        }
      }
    }

    console.log('\n🎯 HOVER DROPDOWN STRATEGY RESULTS:');
    console.log(`Strategies tested: ${hoverStrategies.length}`);
    console.log(`Test item: "${testItem.text}"`);

    console.log('\n📊 STRATEGY RESULTS:');
    dropdownResults.forEach(result => {
      const status = result.success ? '✅ SUCCESS' : '❌ FAILED';
      console.log(`${status}: ${result.description}`);
      if (result.success) {
        console.log(`  Items found: ${result.itemsFound}`);
        console.log(`  Dropdown state: display=${result.dropdownState.display}, visible=${result.dropdownState.visible}`);
      } else if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
    });

    if (successfulStrategy) {
      console.log('\n🎉 SUCCESSFUL STRATEGY APPLIED TO ALL ITEMS:');
      Object.entries(allDropdownsData).forEach(([itemName, data]) => {
        console.log(`📁 ${itemName}: ${data.count} items`);
        if (data.items.length > 0) {
          data.items.slice(0, 3).forEach(item => {
            console.log(`   • ${item.text}`);
          });
          if (data.items.length > 3) {
            console.log(`   ... and ${data.items.length - 3} more`);
          }
        }
      });
    }

    await page.waitForTimeout(2000);
    
    const totalDropdownItems = Object.values(allDropdownsData).reduce((sum, data) => sum + data.count, 0);
    
    return {
      mainNavItems: mainNavItems,
      dropdownResults: dropdownResults,
      successfulStrategy: successfulStrategy,
      allDropdownsData: allDropdownsData,
      totalDropdownItems: totalDropdownItems,
      success: !!successfulStrategy
    };

  } catch (error) {
    logger.error('❌ Test 2 failed:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the test
if (require.main === module) {
  testHoverDropdownStrategy()
    .then(results => {
      console.log('\n🏁 TEST 2 SUMMARY: Hover-Based Dropdown Strategy');
      console.log(`Main nav items: ${results.mainNavItems.length}`);
      console.log(`Strategies tested: ${results.dropdownResults.length}`);
      console.log(`Successful strategy: ${results.successfulStrategy?.description || 'None'}`);
      console.log(`Total dropdown items extracted: ${results.totalDropdownItems}`);
      console.log(`Success: ${results.success}`);
      
      if (results.success) {
        console.log('✅ Test 2 PASSED - Found working hover strategy');
        process.exit(0);
      } else {
        console.log('❌ Test 2 FAILED - No hover strategy worked');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 Test 2 failed:', error.message);
      process.exit(1);
    });
}

module.exports = testHoverDropdownStrategy;