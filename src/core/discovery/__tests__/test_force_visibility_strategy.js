/**
 * Test 3: Force-Visibility Strategy
 * 
 * Purpose: Use JavaScript to force dropdowns visible without hover interactions
 * Bypass: Hover interaction problems entirely
 * Compare: Results with Test 2 to see if we get the same or more content
 */

const { logger } = require('../../../utils/logger');
const { chromium } = require('playwright');

async function testForceVisibilityStrategy() {
  const targetUrl = 'https://glasswingshop.com';
  let browser = null;

  try {
    logger.info('🎯 Test 3: Force-Visibility Strategy');

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

    const forceVisibilityResults = [];
    const forceVisibilityStrategies = [
      { name: 'css-display-block', description: 'Set display: block on dropdown-content' },
      { name: 'css-visibility-visible', description: 'Set visibility: visible on dropdown-content' },
      { name: 'css-opacity-1', description: 'Set opacity: 1 on dropdown-content' },
      { name: 'css-combined', description: 'Set display: block, visibility: visible, opacity: 1' },
      { name: 'class-toggle', description: 'Add "open" or "active" class to parent li' },
      { name: 'css-flex', description: 'Set display: flex (matching hover state)' }
    ];

    // Test the first item with different force-visibility strategies
    const testItem = mainNavItems[0]; // Test with "Clothing"
    logger.info(`🎯 Testing force-visibility strategies on: "${testItem.text}"`);

    for (const strategy of forceVisibilityStrategies) {
      logger.info(`📊 Testing strategy: ${strategy.description}`);
      
      try {
        // Reset - ensure dropdown is hidden first
        await page.evaluate((contentSelector) => {
          const dropdown = document.querySelector(contentSelector);
          if (dropdown) {
            dropdown.style.display = 'none';
            dropdown.style.visibility = 'hidden';
            dropdown.style.opacity = '0';
            dropdown.parentElement.classList.remove('open', 'active', 'is-open', 'show');
          }
        }, testItem.selectors.dropdownContent);

        await page.waitForTimeout(500);

        // Apply force-visibility strategy
        let success = false;
        await page.evaluate((params) => {
          const { contentSelector, liSelector, strategy } = params;
          const dropdown = document.querySelector(contentSelector);
          const liElement = document.querySelector(liSelector);
          
          if (!dropdown) return false;

          switch (strategy) {
            case 'css-display-block':
              dropdown.style.display = 'block';
              break;
            case 'css-visibility-visible':
              dropdown.style.visibility = 'visible';
              break;
            case 'css-opacity-1':
              dropdown.style.opacity = '1';
              break;
            case 'css-combined':
              dropdown.style.display = 'block';
              dropdown.style.visibility = 'visible';
              dropdown.style.opacity = '1';
              break;
            case 'class-toggle':
              if (liElement) {
                liElement.classList.add('open', 'active', 'is-open', 'show');
              }
              break;
            case 'css-flex':
              dropdown.style.display = 'flex';
              dropdown.style.visibility = 'visible';
              dropdown.style.opacity = '1';
              break;
          }
          
          return true;
        }, {
          contentSelector: testItem.selectors.dropdownContent,
          liSelector: testItem.selectors.liElement,
          strategy: strategy.name
        });

        await page.waitForTimeout(1000);

        // Check if dropdown is now visible
        const dropdownState = await page.evaluate((contentSelector) => {
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
        if (dropdownState.visible) {
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

        forceVisibilityResults.push({
          strategy: strategy.name,
          description: strategy.description,
          success: dropdownState.visible,
          dropdownState: dropdownState,
          itemsFound: dropdownContent?.length || 0,
          items: dropdownContent || [],
          error: null
        });

        logger.info(`${dropdownState.visible ? '✅' : '❌'} ${strategy.description}: ${dropdownState.visible ? 'SUCCESS' : 'FAILED'}`);

      } catch (error) {
        logger.warn(`❌ ${strategy.description} failed: ${error.message}`);
        
        forceVisibilityResults.push({
          strategy: strategy.name,
          description: strategy.description,
          success: false,
          error: error.message,
          itemsFound: 0,
          items: []
        });
      }
    }

    // Test successful strategy on all items if we found one
    const successfulStrategy = forceVisibilityResults.find(r => r.success);
    let allDropdownsData = {};
    
    if (successfulStrategy) {
      logger.info(`🎉 Found working force-visibility strategy: ${successfulStrategy.description}`);
      logger.info('📊 Applying to all navigation items...');
      
      for (const item of mainNavItems) {
        try {
          logger.info(`🎯 Force-revealing dropdown for: "${item.text}"`);
          
          // Reset first
          await page.evaluate((contentSelector) => {
            const dropdown = document.querySelector(contentSelector);
            if (dropdown) {
              dropdown.style.display = 'none';
              dropdown.style.visibility = 'hidden';
              dropdown.style.opacity = '0';
              dropdown.parentElement.classList.remove('open', 'active', 'is-open', 'show');
            }
          }, item.selectors.dropdownContent);

          await page.waitForTimeout(300);

          // Apply successful strategy
          await page.evaluate((params) => {
            const { contentSelector, liSelector, strategy } = params;
            const dropdown = document.querySelector(contentSelector);
            const liElement = document.querySelector(liSelector);
            
            if (!dropdown) return false;

            switch (strategy) {
              case 'css-display-block':
                dropdown.style.display = 'block';
                break;
              case 'css-visibility-visible':
                dropdown.style.visibility = 'visible';
                break;
              case 'css-opacity-1':
                dropdown.style.opacity = '1';
                break;
              case 'css-combined':
                dropdown.style.display = 'block';
                dropdown.style.visibility = 'visible';
                dropdown.style.opacity = '1';
                break;
              case 'class-toggle':
                if (liElement) {
                  liElement.classList.add('open', 'active', 'is-open', 'show');
                }
                break;
              case 'css-flex':
                dropdown.style.display = 'flex';
                dropdown.style.visibility = 'visible';
                dropdown.style.opacity = '1';
                break;
            }
            
            return true;
          }, {
            contentSelector: item.selectors.dropdownContent,
            liSelector: item.selectors.liElement,
            strategy: successfulStrategy.strategy
          });

          await page.waitForTimeout(500);

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
          logger.warn(`❌ Failed to force-reveal dropdown for ${item.text}: ${error.message}`);
          allDropdownsData[item.text] = { items: [], count: 0, error: error.message };
        }
      }
    }

    console.log('\n🎯 FORCE-VISIBILITY STRATEGY RESULTS:');
    console.log(`Strategies tested: ${forceVisibilityStrategies.length}`);
    console.log(`Test item: "${testItem.text}"`);

    console.log('\n📊 STRATEGY RESULTS:');
    forceVisibilityResults.forEach(result => {
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
      forceVisibilityResults: forceVisibilityResults,
      successfulStrategy: successfulStrategy,
      allDropdownsData: allDropdownsData,
      totalDropdownItems: totalDropdownItems,
      success: !!successfulStrategy
    };

  } catch (error) {
    logger.error('❌ Test 3 failed:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the test
if (require.main === module) {
  testForceVisibilityStrategy()
    .then(results => {
      console.log('\n🏁 TEST 3 SUMMARY: Force-Visibility Strategy');
      console.log(`Main nav items: ${results.mainNavItems.length}`);
      console.log(`Strategies tested: ${results.forceVisibilityResults.length}`);
      console.log(`Successful strategy: ${results.successfulStrategy?.description || 'None'}`);
      console.log(`Total dropdown items extracted: ${results.totalDropdownItems}`);
      console.log(`Success: ${results.success}`);
      
      if (results.success) {
        console.log('✅ Test 3 PASSED - Found working force-visibility strategy');
        process.exit(0);
      } else {
        console.log('❌ Test 3 FAILED - No force-visibility strategy worked');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 Test 3 failed:', error.message);
      process.exit(1);
    });
}

module.exports = testForceVisibilityStrategy;