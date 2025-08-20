/**
 * Test 4: Combined Strategy
 * 
 * Purpose: Use the best approaches from Tests 1-3
 * Strategy: Start with main nav extraction, try hover, fall back to force-visibility
 * Returns: Most complete results possible
 */

const { logger } = require('../../../utils/logger');
const { chromium } = require('playwright');

async function testCombinedStrategy() {
  const targetUrl = 'https://glasswingshop.com';
  let browser = null;

  try {
    logger.info('🎯 Test 4: Combined Strategy (Best of All Tests)');

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
    
    logger.info('🔍 Phase 1: Main Navigation Extraction (Test 1 Approach)');
    
    // Phase 1: Extract main navigation (Test 1 success)
    await page.waitForSelector('li.dropdown-toggle', { state: 'visible', timeout: 10000 });
    
    const mainNavItems = await page.evaluate(() => {
      const items = [];
      const dropdownItems = document.querySelectorAll('li.dropdown-toggle');
      
      dropdownItems.forEach((li, index) => {
        const titleElement = li.querySelector('p.dropdown-title');
        if (titleElement) {
          const boundingBox = titleElement.getBoundingClientRect();
          
          items.push({
            text: titleElement.textContent.trim(),
            index: index,
            selectors: {
              liElement: `li.dropdown-toggle:nth-child(${index + 1})`,
              titleElement: `li.dropdown-toggle:nth-child(${index + 1}) > p.dropdown-title`,
              dropdownContent: `li.dropdown-toggle:nth-child(${index + 1}) > .dropdown-content`
            },
            boundingBox: {
              x: Math.round(boundingBox.x),
              y: Math.round(boundingBox.y),
              width: Math.round(boundingBox.width),
              height: Math.round(boundingBox.height)
            },
            isVisible: titleElement.offsetParent !== null
          });
        }
      });
      
      return items;
    });

    logger.info(`✅ Phase 1 Complete: Found ${mainNavItems.length} main navigation items`);

    if (mainNavItems.length === 0) {
      throw new Error('No main navigation items found');
    }

    logger.info('🎯 Phase 2: Dropdown Content Extraction (Test 2 Approach)');

    const dropdownExtractionResults = {};
    let totalDropdownItems = 0;
    let successfulExtractions = 0;
    let failedExtractions = 0;

    // Phase 2: Try hover extraction for each item (Test 2 success)
    for (const item of mainNavItems) {
      try {
        logger.info(`🎯 Extracting dropdown for: "${item.text}"`);
        
        // Reset state with random mouse position and scroll
        const randomX = Math.floor(Math.random() * 300) + 50;
        const randomY = Math.floor(Math.random() * 200) + 400;
        await page.mouse.move(randomX, randomY);
        await page.waitForTimeout(600);
        
        // Small scroll reset
        await page.evaluate(() => window.scrollBy(0, 10));
        await page.waitForTimeout(300);
        await page.evaluate(() => window.scrollBy(0, -10));
        await page.waitForTimeout(300);

        // Verify dropdown is closed
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
          await page.mouse.click(randomX, randomY);
          await page.waitForTimeout(800);
        }

        // Try hover on li element (Test 2 successful approach)
        const targetElement = await page.locator(item.selectors.liElement).first();
        await targetElement.hover({ timeout: 2000 });
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
            visible: link.offsetParent !== null,
            parent: contentSelector
          })).filter(linkItem => linkItem.text.length > 0);
        }, item.selectors.dropdownContent);

        dropdownExtractionResults[item.text] = {
          method: 'hover',
          success: dropdownContent.length > 0,
          items: dropdownContent,
          count: dropdownContent.length,
          error: null
        };

        if (dropdownContent.length > 0) {
          successfulExtractions++;
          totalDropdownItems += dropdownContent.length;
          logger.info(`✅ ${item.text}: ${dropdownContent.length} dropdown items via hover`);
        } else {
          failedExtractions++;
          logger.warn(`❌ ${item.text}: No dropdown content via hover`);
          
          // Phase 3: Fallback to force-visibility (if hover failed)
          logger.info(`🔄 Trying force-visibility fallback for ${item.text}`);
          
          // Try force-visibility strategies from Test 3
          const forceVisibilityStrategies = [
            { name: 'css-flex', apply: (dropdown) => {
              dropdown.style.display = 'flex';
              dropdown.style.visibility = 'visible';
              dropdown.style.opacity = '1';
            }},
            { name: 'css-combined', apply: (dropdown) => {
              dropdown.style.display = 'block';
              dropdown.style.visibility = 'visible';
              dropdown.style.opacity = '1';
            }}
          ];

          let forceVisibilityWorked = false;
          for (const strategy of forceVisibilityStrategies) {
            try {
              await page.evaluate((params) => {
                const dropdown = document.querySelector(params.contentSelector);
                if (!dropdown) return;
                
                // Reset first
                dropdown.style.display = 'none';
                dropdown.style.visibility = 'hidden';
                dropdown.style.opacity = '0';
                
                // Apply strategy
                if (params.strategyName === 'css-flex') {
                  dropdown.style.display = 'flex';
                  dropdown.style.visibility = 'visible';
                  dropdown.style.opacity = '1';
                } else if (params.strategyName === 'css-combined') {
                  dropdown.style.display = 'block';
                  dropdown.style.visibility = 'visible';
                  dropdown.style.opacity = '1';
                }
              }, {
                contentSelector: item.selectors.dropdownContent,
                strategyName: strategy.name
              });

              await page.waitForTimeout(500);

              const forcedContent = await page.evaluate((contentSelector) => {
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
                  visible: link.offsetParent !== null,
                  parent: contentSelector
                })).filter(linkItem => linkItem.text.length > 0);
              }, item.selectors.dropdownContent);

              if (forcedContent.length > 0) {
                dropdownExtractionResults[item.text] = {
                  method: 'force-visibility',
                  strategy: strategy.name,
                  success: true,
                  items: forcedContent,
                  count: forcedContent.length,
                  error: null
                };
                totalDropdownItems += forcedContent.length;
                successfulExtractions++;
                failedExtractions--;
                forceVisibilityWorked = true;
                logger.info(`✅ ${item.text}: ${forcedContent.length} dropdown items via ${strategy.name}`);
                break;
              }
            } catch (error) {
              logger.debug(`Force-visibility ${strategy.name} failed for ${item.text}: ${error.message}`);
            }
          }

          if (!forceVisibilityWorked) {
            dropdownExtractionResults[item.text] = {
              method: 'failed',
              success: false,
              items: [],
              count: 0,
              error: 'Both hover and force-visibility failed'
            };
          }
        }

      } catch (error) {
        logger.error(`❌ Failed to extract dropdown for ${item.text}: ${error.message}`);
        dropdownExtractionResults[item.text] = {
          method: 'error',
          success: false,
          items: [],
          count: 0,
          error: error.message
        };
        failedExtractions++;
      }
    }

    // Phase 3: Results compilation
    logger.info('📊 Phase 3: Results Compilation');

    const results = {
      mainNavigation: {
        items: mainNavItems,
        count: mainNavItems.length,
        success: mainNavItems.length > 0
      },
      dropdownExtraction: {
        results: dropdownExtractionResults,
        totalItems: totalDropdownItems,
        successfulExtractions: successfulExtractions,
        failedExtractions: failedExtractions,
        successRate: mainNavItems.length > 0 ? (successfulExtractions / mainNavItems.length) : 0
      },
      summary: {
        totalNavigationItems: mainNavItems.length + totalDropdownItems,
        mainNavItems: mainNavItems.length,
        dropdownItems: totalDropdownItems,
        extractionMethods: {
          hover: Object.values(dropdownExtractionResults).filter(r => r.method === 'hover' && r.success).length,
          forceVisibility: Object.values(dropdownExtractionResults).filter(r => r.method === 'force-visibility' && r.success).length,
          failed: Object.values(dropdownExtractionResults).filter(r => !r.success).length
        }
      }
    };

    console.log('\n🎯 COMBINED STRATEGY RESULTS:');
    console.log(`Main navigation items: ${results.mainNavigation.count}`);
    console.log(`Dropdown items extracted: ${results.dropdownExtraction.totalItems}`);
    console.log(`Total navigation items: ${results.summary.totalNavigationItems}`);
    console.log(`Success rate: ${Math.round(results.dropdownExtraction.successRate * 100)}%`);

    console.log('\n📊 EXTRACTION METHOD BREAKDOWN:');
    console.log(`✅ Hover successful: ${results.summary.extractionMethods.hover}`);
    console.log(`🔧 Force-visibility successful: ${results.summary.extractionMethods.forceVisibility}`);
    console.log(`❌ Failed: ${results.summary.extractionMethods.failed}`);

    console.log('\n📁 NAVIGATION HIERARCHY:');
    mainNavItems.forEach((navItem, i) => {
      const dropdownData = dropdownExtractionResults[navItem.text];
      console.log(`[${i}] 📁 ${navItem.text} (${dropdownData.method}) - ${dropdownData.count} items`);
      if (dropdownData.items.length > 0) {
        dropdownData.items.slice(0, 3).forEach(item => {
          console.log(`   • ${item.text}`);
        });
        if (dropdownData.items.length > 3) {
          console.log(`   ... and ${dropdownData.items.length - 3} more`);
        }
      }
    });

    await page.waitForTimeout(2000);
    
    return results;

  } catch (error) {
    logger.error('❌ Test 4 failed:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the test
if (require.main === module) {
  testCombinedStrategy()
    .then(results => {
      console.log('\n🏁 TEST 4 SUMMARY: Combined Strategy');
      console.log(`Main navigation success: ${results.mainNavigation.success}`);
      console.log(`Dropdown extraction success rate: ${Math.round(results.dropdownExtraction.successRate * 100)}%`);
      console.log(`Total navigation items: ${results.summary.totalNavigationItems}`);
      console.log(`Extraction methods used: Hover(${results.summary.extractionMethods.hover}), Force-visibility(${results.summary.extractionMethods.forceVisibility}), Failed(${results.summary.extractionMethods.failed})`);
      
      const overallSuccess = results.mainNavigation.success && results.dropdownExtraction.successRate >= 0.8;
      
      if (overallSuccess) {
        console.log('✅ Test 4 PASSED - Combined strategy successful');
        process.exit(0);
      } else {
        console.log('⚠️ Test 4 PARTIAL - Some extractions failed');
        process.exit(0);
      }
    })
    .catch(error => {
      console.error('💥 Test 4 failed:', error.message);
      process.exit(1);
    });
}

module.exports = testCombinedStrategy;