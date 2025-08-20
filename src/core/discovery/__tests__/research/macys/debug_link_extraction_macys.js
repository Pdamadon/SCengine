/**
 * Debug Link Extraction on Macy's
 * 
 * Test what extractLinksFromDropdown() actually finds when menus open
 * to understand why we get 0 items vs MegaMenuStrategy's 355 items
 */

const { logger } = require('../../../utils/logger');
const { chromium } = require('playwright');
const { extractUsingPattern } = require('../NavigationPatternExtractor');
const { getPatternByName } = require('../NavigationPatterns');

async function debugMacysLinkExtraction() {
  const targetUrl = 'https://www.macys.com';
  let browser = null;

  try {
    logger.info('🔍 Debugging Macy\'s Link Extraction Process');
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
    
    await page.waitForTimeout(3000);
    console.log('✅ Additional wait complete');

    // Get the Macy's pattern
    const pattern = getPatternByName('macys-megamenu');
    console.log('\n🎯 USING PATTERN:');
    console.log(`Name: ${pattern.name}`);
    console.log(`Container: ${pattern.selectors.container}`);
    console.log(`Trigger: ${pattern.selectors.trigger}`);
    console.log(`Dropdown: ${pattern.selectors.dropdown}`);

    // Find main navigation items first
    console.log('\n🔍 FINDING MAIN NAVIGATION ITEMS:');
    const mainNavItems = await page.evaluate((selectors) => {
      const items = [];
      const containerElements = document.querySelectorAll(selectors.container);
      console.log(`Found ${containerElements.length} container elements`);
      
      containerElements.forEach((container, index) => {
        const titleElement = container.querySelector(selectors.trigger);
        if (titleElement) {
          const boundingBox = titleElement.getBoundingClientRect();
          
          items.push({
            text: titleElement.textContent.trim(),
            index: index,
            selectors: {
              container: `${selectors.container}:nth-child(${index + 1})`,
              trigger: `${selectors.container}:nth-child(${index + 1}) ${selectors.trigger}`,
              dropdown: `${selectors.container}:nth-child(${index + 1}) ${selectors.dropdown}`
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
    }, pattern.selectors);

    console.log(`✅ Found ${mainNavItems.length} main navigation items:`);
    mainNavItems.forEach((item, index) => {
      console.log(`[${index}] "${item.text}" - Visible: ${item.isVisible}`);
    });

    if (mainNavItems.length === 0) {
      console.log('❌ No main navigation items found - cannot proceed');
      return;
    }

    // Test on first navigation item (Women)
    const testItem = mainNavItems[0];
    console.log(`\n🎯 DEBUGGING EXTRACTION FOR: "${testItem.text}"`);

    // Reset state
    console.log('\n🔄 RESETTING NAVIGATION STATE:');
    const randomX = Math.floor(Math.random() * 300) + 50;
    const randomY = Math.floor(Math.random() * 200) + 400;
    await page.mouse.move(randomX, randomY);
    await page.waitForTimeout(300);
    console.log(`✅ Mouse moved to random position: (${randomX}, ${randomY})`);

    // Hover on the container element (current approach)
    console.log('\n🎯 HOVERING ON CONTAINER ELEMENT:');
    const targetElement = await page.locator(testItem.selectors.container).first();
    await targetElement.hover({ timeout: 3000 });
    console.log(`✅ Hovered on: ${testItem.selectors.container}`);
    
    // Wait for menu to appear
    await page.waitForTimeout(3000);
    console.log('✅ Wait for menu complete');

    // Debug what flyout containers exist
    console.log('\n🔍 SEARCHING FOR FLYOUT CONTAINERS:');
    const flyoutDebug = await page.evaluate((navText) => {
      const results = {
        navText: navText,
        containers: []
      };

      // Try all the selectors our code uses
      const selectors = [
        `#${navText}.flyout-container`,
        `[id*="${navText}"].flyout-container`,
        '.flyout-container:not([style*="display: none"]):not([style*="visibility: hidden"])',
        '.flyout-container',
        '.mega-menu',
        '.dropdown-content'
      ];

      selectors.forEach((selector, index) => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach((element, elemIndex) => {
            const style = window.getComputedStyle(element);
            const isVisible = style.display !== 'none' && 
                             style.visibility !== 'hidden' && 
                             parseFloat(style.opacity) > 0;
            
            const links = element.querySelectorAll('a');
            
            results.containers.push({
              selectorIndex: index,
              selector: selector,
              elementIndex: elemIndex,
              id: element.id,
              className: element.className,
              isVisible: isVisible,
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
              linkCount: links.length,
              firstFewLinks: Array.from(links).slice(0, 5).map(link => ({
                text: link.textContent.trim(),
                href: link.href,
                visible: link.offsetParent !== null
              }))
            });
          });
        } catch (e) {
          results.containers.push({
            selectorIndex: index,
            selector: selector,
            error: e.message
          });
        }
      });

      return results;
    }, testItem.text);

    console.log(`\n📊 FLYOUT CONTAINER DEBUG RESULTS for "${testItem.text}":`);
    flyoutDebug.containers.forEach((container, index) => {
      console.log(`\n[Container ${index}]:`);
      console.log(`  Selector: ${container.selector}`);
      if (container.error) {
        console.log(`  ❌ Error: ${container.error}`);
      } else {
        console.log(`  ID: ${container.id || 'none'}`);
        console.log(`  ClassName: ${container.className || 'none'}`);
        console.log(`  Visible: ${container.isVisible}`);
        console.log(`  CSS - display: ${container.display}, visibility: ${container.visibility}, opacity: ${container.opacity}`);
        console.log(`  Link count: ${container.linkCount}`);
        if (container.firstFewLinks.length > 0) {
          console.log(`  Sample links:`);
          container.firstFewLinks.forEach(link => {
            console.log(`    • "${link.text}" -> ${link.href} (visible: ${link.visible})`);
          });
        }
      }
    });

    // Now test our actual extractLinksFromDropdown function
    console.log('\n🔍 TESTING extractLinksFromDropdown() FUNCTION:');
    const extractedLinks = await page.evaluate((params) => {
      let dropdown = null;
      const debug = {
        navItemText: params.navItemText,
        selector: params.selector,
        searchAttempts: []
      };
      
      // Handle dynamic flyout containers (Macy's style) - exactly as in our code
      if (params.selector === 'dynamic-flyout' && params.navItemText) {
        // Try multiple approaches to find the flyout container
        const attempts = [
          { method: 'exact-match', selector: `#${params.navItemText}.flyout-container` },
          { method: 'partial-match', selector: `[id*="${params.navItemText}"].flyout-container` },
          { method: 'visible-any', selector: '.flyout-container:not([style*="display: none"]):not([style*="visibility: hidden"])' }
        ];

        attempts.forEach(attempt => {
          try {
            const found = document.querySelector(attempt.selector);
            debug.searchAttempts.push({
              method: attempt.method,
              selector: attempt.selector,
              found: !!found,
              id: found?.id,
              className: found?.className,
              visible: found ? window.getComputedStyle(found).display !== 'none' : false
            });
            
            if (found && !dropdown) {
              dropdown = found;
            }
          } catch (e) {
            debug.searchAttempts.push({
              method: attempt.method,
              selector: attempt.selector,
              error: e.message
            });
          }
        });
      } else {
        // Standard selector lookup
        dropdown = document.querySelector(params.selector);
        debug.searchAttempts.push({
          method: 'standard',
          selector: params.selector,
          found: !!dropdown
        });
      }
      
      debug.dropdownFound = !!dropdown;
      debug.dropdownId = dropdown?.id;
      debug.dropdownClass = dropdown?.className;

      if (!dropdown) {
        return { debug, links: [], error: 'No dropdown found' };
      }
      
      const style = window.getComputedStyle(dropdown);
      const isVisible = style.display !== 'none' && 
                       style.visibility !== 'hidden' && 
                       parseFloat(style.opacity) > 0;
      
      debug.dropdownVisible = isVisible;
      debug.dropdownStyle = {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity
      };
      
      if (!isVisible) {
        return { debug, links: [], error: 'Dropdown not visible' };
      }
      
      const links = dropdown.querySelectorAll('a');
      debug.totalLinksFound = links.length;
      
      const extractedLinks = Array.from(links).map(link => ({
        text: link.textContent.trim(),
        href: link.href,
        visible: link.offsetParent !== null,
        parent: params.selector
      })).filter(linkItem => linkItem.text.length > 0);
      
      debug.filteredLinksCount = extractedLinks.length;
      
      return { debug, links: extractedLinks };
    }, { 
      selector: 'dynamic-flyout', 
      navItemText: testItem.text 
    });

    console.log(`\n📊 EXTRACT LINKS FROM DROPDOWN RESULTS:`);
    console.log(`Debug info:`, JSON.stringify(extractedLinks.debug, null, 2));
    console.log(`Extracted ${extractedLinks.links.length} links:`);
    extractedLinks.links.slice(0, 10).forEach((link, index) => {
      console.log(`[${index}] "${link.text}" -> ${link.href} (visible: ${link.visible})`);
    });

    if (extractedLinks.links.length === 0) {
      console.log(`\n❌ ZERO LINKS EXTRACTED - This explains the 0 item result!`);
      if (extractedLinks.debug.error) {
        console.log(`Error: ${extractedLinks.debug.error}`);
      }
    } else {
      console.log(`\n✅ Successfully extracted ${extractedLinks.links.length} links`);
    }

    return {
      success: extractedLinks.links.length > 0,
      linksFound: extractedLinks.links.length,
      debug: extractedLinks.debug,
      mainNavItems: mainNavItems.length
    };

  } catch (error) {
    logger.error('❌ Debug test failed:', error);
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

// Run the debug test
if (require.main === module) {
  debugMacysLinkExtraction()
    .then(result => {
      console.log('\n🏁 MACY\'S LINK EXTRACTION DEBUG COMPLETE');
      
      if (result.success) {
        console.log(`✅ Found ${result.linksFound} links`);
      } else {
        console.log(`❌ Zero links extracted`);
        if (result.error) {
          console.log(`Error: ${result.error}`);
        }
      }
    })
    .catch(error => {
      console.error('💥 Debug test execution failed:', error.message);
      process.exit(1);
    });
}

module.exports = debugMacysLinkExtraction;