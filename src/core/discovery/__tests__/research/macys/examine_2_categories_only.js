/**
 * Examine Extracted Data Quality - ONLY 2 Categories
 * 
 * Modified version that only extracts from 2 categories for speed
 */

const { logger } = require('../../../utils/logger');
const { chromium } = require('playwright');
const { extractUsingPattern } = require('../NavigationPatternExtractor');
const { getPatternsForSite } = require('../NavigationPatterns');

async function examineOnly2Categories() {
  const targetUrl = 'https://www.macys.com';
  let browser = null;

  try {
    logger.info('🔍 Examining Quality of Extracted Navigation Data (2 Categories Only)');
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

    // Get Macy's pattern and extract just first 2 categories
    console.log('\n🎯 EXTRACTING NAVIGATION DATA (First 2 Categories Only):');
    const patterns = getPatternsForSite(targetUrl);
    const macysPattern = patterns[0]; // Should be macys-megamenu
    
    console.log(`Using pattern: ${macysPattern.name}`);
    
    // Get main navigation items first
    await page.waitForSelector(macysPattern.selectors.container, { 
      state: 'visible', 
      timeout: 10000 
    });

    const mainNavItems = await page.evaluate((selectors) => {
      const items = [];
      const containerElements = document.querySelectorAll(selectors.container);
      
      containerElements.forEach((container, index) => {
        const titleElement = container.querySelector(selectors.trigger);
        if (titleElement) {
          items.push({
            text: titleElement.textContent.trim(),
            index: index,
            selectors: {
              container: `${selectors.container}:nth-child(${index + 1})`,
              trigger: `${selectors.container}:nth-child(${index + 1}) ${selectors.trigger}`,
              dropdown: selectors.dropdown === 'dynamic-flyout' ? 'dynamic-flyout' : `${selectors.container}:nth-child(${index + 1}) ${selectors.dropdown}`
            }
          });
        }
      });
      
      return items;
    }, macysPattern.selectors);

    console.log(`Found ${mainNavItems.length} main navigation items`);
    console.log(`Will extract from first 2: "${mainNavItems[0]?.text}", "${mainNavItems[1]?.text}"`);

    // Extract from only first 2 categories
    const limitedNavItems = mainNavItems.slice(0, 2);
    const results = {
      mainNavigation: { items: limitedNavItems, count: limitedNavItems.length },
      dropdownExtraction: { results: {} }
    };

    // Extract dropdown content for first 2 categories only
    for (const item of limitedNavItems) {
      console.log(`\n🎯 Extracting: "${item.text}"`);
      
      // Reset state
      const randomX = Math.floor(Math.random() * 300) + 50;
      const randomY = Math.floor(Math.random() * 200) + 400;
      await page.mouse.move(randomX, randomY);
      await page.waitForTimeout(300);
      
      // Hover on container
      const targetElement = await page.locator(item.selectors.container).first();
      await targetElement.hover({ timeout: 3000 });
      await page.waitForTimeout(3000);

      // Extract links
      const dropdownContent = await page.evaluate((params) => {
        let dropdown = null;
        
        if (params.selector === 'dynamic-flyout' && params.navItemText) {
          dropdown = document.querySelector(`#${params.navItemText}.flyout-container`) ||
                    document.querySelector(`[id*="${params.navItemText}"].flyout-container`) ||
                    document.querySelector('.flyout-container:not([style*="display: none"]):not([style*="visibility: hidden"])');
        } else {
          dropdown = document.querySelector(params.selector);
        }
        
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
        })).filter(linkItem => linkItem.text.length > 0 && linkItem.href && linkItem.href !== '#');
      }, { 
        selector: item.selectors.dropdown, 
        navItemText: item.text 
      });

      results.dropdownExtraction.results[item.text] = {
        method: 'hover',
        success: dropdownContent.length > 0,
        items: dropdownContent,
        count: dropdownContent.length
      };

      console.log(`✅ ${item.text}: ${dropdownContent.length} items extracted`);
    }

    // Now analyze the data quality
    console.log('\n📊 DROPDOWN DATA QUALITY ANALYSIS:');
    Object.entries(results.dropdownExtraction.results).forEach(([category, categoryResult]) => {
      console.log(`\n🔍 [${category}] - ${categoryResult.count} items (${categoryResult.method})`);
      
      if (categoryResult.success && categoryResult.items.length > 0) {
        console.log(`  ✅ Success: ${categoryResult.items.length} links extracted`);
        
        // Sample first 5 items for quality check
        console.log(`  📋 Sample items (first 5):`);
        categoryResult.items.slice(0, 5).forEach((item, index) => {
          const url = item.href || 'NO URL';
          const text = item.text || 'NO TEXT';
          const isValidUrl = url.startsWith('http') && !url.includes('#');
          const hasGoodText = text.length > 2 && !text.includes('undefined');
          
          console.log(`    [${index}] ${hasGoodText ? '✅' : '❌'} "${text}"`);
          console.log(`        ${isValidUrl ? '✅' : '❌'} ${url}`);
        });
        
        // Quality metrics
        const validUrls = categoryResult.items.filter(item => 
          item.href && item.href.startsWith('http') && !item.href.includes('#')
        ).length;
        const validText = categoryResult.items.filter(item => 
          item.text && item.text.length > 2 && !item.text.includes('undefined')
        ).length;
        const uniqueUrls = new Set(categoryResult.items.map(item => item.href)).size;
        
        console.log(`  📊 Quality Metrics:`);
        console.log(`      Valid URLs: ${validUrls}/${categoryResult.items.length} (${((validUrls/categoryResult.items.length)*100).toFixed(1)}%)`);
        console.log(`      Valid Text: ${validText}/${categoryResult.items.length} (${((validText/categoryResult.items.length)*100).toFixed(1)}%)`);
        console.log(`      Unique URLs: ${uniqueUrls}/${categoryResult.items.length} (${((uniqueUrls/categoryResult.items.length)*100).toFixed(1)}%)`);
        
        // Sample URLs
        console.log(`  📋 Sample URLs:`);
        categoryResult.items.slice(0, 3).forEach((item, index) => {
          console.log(`    [${index}] "${item.text}" -> ${item.href}`);
        });
        
      } else {
        console.log(`  ❌ Failed: ${categoryResult.error || 'Unknown error'}`);
      }
    });

    return {
      success: true,
      categoriesTested: Object.keys(results.dropdownExtraction.results),
      totalItems: Object.values(results.dropdownExtraction.results).reduce((sum, r) => sum + r.count, 0)
    };

  } catch (error) {
    logger.error('❌ Data examination failed:', error);
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

// Run the examination
if (require.main === module) {
  examineOnly2Categories()
    .then(result => {
      console.log('\n🏁 DATA QUALITY EXAMINATION COMPLETE (2 Categories)');
      
      if (result.success) {
        console.log(`✅ Examination successful!`);
        console.log(`📊 Categories tested: ${result.categoriesTested.join(', ')}`);
        console.log(`📊 Total items from 2 categories: ${result.totalItems}`);
      } else {
        console.log(`❌ Examination failed: ${result.error}`);
      }
    })
    .catch(error => {
      console.error('💥 Examination execution failed:', error.message);
      process.exit(1);
    });
}

module.exports = examineOnly2Categories;