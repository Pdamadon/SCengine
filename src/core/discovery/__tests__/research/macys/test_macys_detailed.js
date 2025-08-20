/**
 * Detailed Macy's Navigation Test
 * 
 * Logs every step in detail to understand what's being collected and when
 * Focus on understanding the navigation structure without our working strategy
 */

const { logger } = require('../../../utils/logger');
const { chromium } = require('playwright');
const { extractUsingPattern } = require('../NavigationPatternExtractor');
const { getPatternByName } = require('../NavigationPatterns');

async function testMacysDetailed() {
  const targetUrl = 'https://www.macys.com';
  let browser = null;

  try {
    logger.info('🎯 Detailed Macy\'s Navigation Test');
    logger.info(`📋 Target: ${targetUrl}`);

    browser = await chromium.launch({ 
      headless: false,
      devtools: false
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    
    // Navigate and wait for content
    console.log('\n🌐 NAVIGATION PHASE:');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    console.log('✅ Page loaded');
    
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
      console.log('✅ Network idle achieved');
    } catch (error) {
      console.log('⚠️ Network idle timeout, continuing anyway');
    }
    
    // Wait a bit more for dynamic content
    await page.waitForTimeout(5000);
    console.log('✅ Additional wait complete');

    // Test each pattern individually with detailed logging
    const patterns = [
      getPatternByName('macys-megamenu'),
      getPatternByName('bootstrap-dropdown'),
      getPatternByName('simple-nav-ul')
    ];

    for (const pattern of patterns) {
      if (!pattern) continue;
      
      console.log(`\n🔍 TESTING PATTERN: ${pattern.name.toUpperCase()}`);
      console.log(`📋 Container selector: ${pattern.selectors.container}`);
      console.log(`📋 Trigger selector: ${pattern.selectors.trigger}`);
      console.log(`📋 Dropdown selector: ${pattern.selectors.dropdown}`);

      // Step 1: Check if container elements exist
      console.log('\n📊 STEP 1: CONTAINER DETECTION');
      const containerCheck = await page.evaluate((containerSelector) => {
        const elements = document.querySelectorAll(containerSelector);
        console.log(`Found ${elements.length} container elements with selector: ${containerSelector}`);
        
        const details = Array.from(elements).slice(0, 10).map((el, index) => {
          const rect = el.getBoundingClientRect();
          return {
            index,
            tagName: el.tagName,
            className: el.className,
            textContent: el.textContent?.trim().substring(0, 50) + '...',
            isVisible: rect.width > 0 && rect.height > 0,
            boundingBox: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            }
          };
        });
        
        return { count: elements.length, details };
      }, pattern.selectors.container);

      console.log(`   Found ${containerCheck.count} container elements`);
      if (containerCheck.details.length > 0) {
        console.log('   First 10 containers:');
        containerCheck.details.forEach(detail => {
          console.log(`   [${detail.index}] ${detail.tagName}.${detail.className}`);
          console.log(`       Text: "${detail.textContent}"`);
          console.log(`       Visible: ${detail.isVisible}`);
          console.log(`       Box: ${detail.boundingBox.width}x${detail.boundingBox.height} at (${detail.boundingBox.x}, ${detail.boundingBox.y})`);
        });
      }

      if (containerCheck.count === 0) {
        console.log(`❌ No containers found for ${pattern.name}, skipping to next pattern`);
        continue;
      }

      // Step 2: Check trigger elements within containers
      console.log('\n📊 STEP 2: TRIGGER DETECTION');
      const triggerCheck = await page.evaluate((selectors) => {
        const containers = document.querySelectorAll(selectors.container);
        const triggers = [];
        
        containers.forEach((container, containerIndex) => {
          const triggerElements = container.querySelectorAll(selectors.trigger);
          triggerElements.forEach((trigger, triggerIndex) => {
            const rect = trigger.getBoundingClientRect();
            triggers.push({
              containerIndex,
              triggerIndex,
              tagName: trigger.tagName,
              className: trigger.className,
              textContent: trigger.textContent?.trim(),
              isVisible: rect.width > 0 && rect.height > 0,
              hasHref: trigger.hasAttribute('href'),
              href: trigger.getAttribute('href')
            });
          });
        });
        
        return triggers.slice(0, 15); // First 15 triggers
      }, pattern.selectors);

      console.log(`   Found ${triggerCheck.length} trigger elements`);
      if (triggerCheck.length > 0) {
        console.log('   Triggers found:');
        triggerCheck.forEach((trigger, index) => {
          console.log(`   [${index}] Container ${trigger.containerIndex} -> ${trigger.tagName}.${trigger.className}`);
          console.log(`       Text: "${trigger.textContent}"`);
          console.log(`       Visible: ${trigger.isVisible}`);
          console.log(`       Has href: ${trigger.hasHref}`);
          if (trigger.href) {
            console.log(`       Href: ${trigger.href}`);
          }
        });
      }

      if (triggerCheck.length === 0) {
        console.log(`❌ No triggers found for ${pattern.name}, skipping to next pattern`);
        continue;
      }

      // Step 3: Check dropdown elements
      console.log('\n📊 STEP 3: DROPDOWN DETECTION');
      const dropdownCheck = await page.evaluate((selectors) => {
        const containers = document.querySelectorAll(selectors.container);
        const dropdowns = [];
        
        containers.forEach((container, containerIndex) => {
          const dropdownElements = container.querySelectorAll(selectors.dropdown);
          dropdownElements.forEach((dropdown, dropdownIndex) => {
            const style = window.getComputedStyle(dropdown);
            const rect = dropdown.getBoundingClientRect();
            const links = dropdown.querySelectorAll('a');
            
            dropdowns.push({
              containerIndex,
              dropdownIndex,
              tagName: dropdown.tagName,
              className: dropdown.className,
              isVisible: style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0,
              computedStyle: {
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity
              },
              boundingBox: {
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              },
              linkCount: links.length,
              firstFewLinks: Array.from(links).slice(0, 5).map(link => link.textContent?.trim())
            });
          });
        });
        
        return dropdowns.slice(0, 10); // First 10 dropdowns
      }, pattern.selectors);

      console.log(`   Found ${dropdownCheck.length} dropdown elements`);
      if (dropdownCheck.length > 0) {
        console.log('   Dropdowns found:');
        dropdownCheck.forEach((dropdown, index) => {
          console.log(`   [${index}] Container ${dropdown.containerIndex} -> ${dropdown.tagName}.${dropdown.className}`);
          console.log(`       Currently visible: ${dropdown.isVisible}`);
          console.log(`       Display: ${dropdown.computedStyle.display}, Visibility: ${dropdown.computedStyle.visibility}, Opacity: ${dropdown.computedStyle.opacity}`);
          console.log(`       Size: ${dropdown.boundingBox.width}x${dropdown.boundingBox.height}`);
          console.log(`       Links inside: ${dropdown.linkCount}`);
          if (dropdown.firstFewLinks.length > 0) {
            console.log(`       Sample links: ${dropdown.firstFewLinks.join(', ')}`);
          }
        });
      }

      // Step 4: If we found containers and triggers, run the actual extraction
      if (containerCheck.count > 0 && triggerCheck.length > 0) {
        console.log(`\n🎯 STEP 4: RUNNING EXTRACTION WITH ${pattern.name.toUpperCase()}`);
        
        try {
          const extractionResult = await extractUsingPattern(page, pattern);
          
          console.log('📊 EXTRACTION RESULTS:');
          console.log(`   Success: ${extractionResult.success}`);
          
          if (extractionResult.success) {
            console.log(`   Main nav items: ${extractionResult.mainNavigation.count}`);
            console.log(`   Total items: ${extractionResult.summary.totalNavigationItems}`);
            console.log(`   Success rate: ${Math.round(extractionResult.dropdownExtraction.successRate * 100)}%`);
            
            console.log('\n📁 MAIN NAVIGATION ITEMS:');
            extractionResult.mainNavigation.items.forEach((item, index) => {
              console.log(`   [${index}] "${item.text}" (visible: ${item.isVisible})`);
              console.log(`       Selectors: container="${item.selectors.container}"`);
              console.log(`                  trigger="${item.selectors.trigger}"`);
              console.log(`                  dropdown="${item.selectors.dropdown}"`);
            });

            console.log('\n🔧 DROPDOWN EXTRACTION RESULTS:');
            Object.entries(extractionResult.dropdownExtraction.results).forEach(([navItem, result]) => {
              console.log(`   "${navItem}": ${result.method} -> ${result.success ? `${result.count} items` : 'FAILED'}`);
              if (result.success && result.items.length > 0) {
                console.log(`       First 3 items: ${result.items.slice(0, 3).map(item => item.text).join(', ')}`);
              }
              if (result.error) {
                console.log(`       Error: ${result.error}`);
              }
            });
          } else {
            console.log(`   Error: ${extractionResult.error}`);
          }
          
          // If extraction was successful, we can stop here
          if (extractionResult.success) {
            console.log(`\n🎯 SUCCESS WITH PATTERN: ${pattern.name}`);
            return {
              success: true,
              pattern: pattern.name,
              result: extractionResult
            };
          }
          
        } catch (error) {
          console.log(`❌ Extraction failed: ${error.message}`);
        }
      }

      console.log(`\n❌ Pattern ${pattern.name} did not work, trying next...`);
    }

    console.log('\n❌ All patterns failed for Macy\'s');
    return {
      success: false,
      error: 'All patterns failed'
    };

  } catch (error) {
    logger.error('❌ Macy\'s detailed test failed:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the test
if (require.main === module) {
  testMacysDetailed()
    .then(result => {
      console.log('\n🏁 MACY\'S DETAILED TEST COMPLETE');
      
      if (result.success) {
        console.log(`✅ Successfully extracted navigation using: ${result.pattern}`);
        console.log(`📊 Total items: ${result.result.summary.totalNavigationItems}`);
      } else {
        console.log(`❌ All patterns failed: ${result.error}`);
      }
    })
    .catch(error => {
      console.error('💥 Test execution failed:', error.message);
      process.exit(1);
    });
}

module.exports = testMacysDetailed;