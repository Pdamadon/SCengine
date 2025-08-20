/**
 * Export Collected Navigation Data as JSON
 * 
 * Extract navigation data and export it as clean JSON for inspection
 */

const { logger } = require('../../../utils/logger');
const { chromium } = require('playwright');
const { getPatternsForSite } = require('../NavigationPatterns');
const fs = require('fs');
const path = require('path');

async function exportCollectedDataAsJSON() {
  const targetUrl = 'https://www.macys.com';
  let browser = null;

  try {
    logger.info('📊 Exporting Collected Navigation Data as JSON');
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

    // Get Macy's pattern and extract first 2 categories
    console.log('\n🎯 EXTRACTING NAVIGATION DATA (First 2 Categories):');
    const patterns = getPatternsForSite(targetUrl);
    const macysPattern = patterns[0]; 
    
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

    // Prepare the data structure
    const extractedData = {
      metadata: {
        site: 'macys.com',
        extractedAt: new Date().toISOString(),
        pattern: macysPattern.name,
        totalMainNavItems: mainNavItems.length,
        categoriesExtracted: 2
      },
      mainNavigation: mainNavItems.slice(0, 2).map(item => ({
        text: item.text,
        index: item.index
      })),
      categoryData: {}
    };

    // Extract dropdown content for first 2 categories only
    const limitedNavItems = mainNavItems.slice(0, 2);
    
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

      // Add to extracted data
      extractedData.categoryData[item.text] = {
        categoryName: item.text,
        extractionMethod: 'hover',
        success: dropdownContent.length > 0,
        itemCount: dropdownContent.length,
        items: dropdownContent.map((link, index) => ({
          id: index + 1,
          text: link.text,
          url: link.href,
          isVisible: link.visible
        }))
      };

      console.log(`✅ ${item.text}: ${dropdownContent.length} items extracted`);
    }

    // Add summary statistics
    const totalItems = Object.values(extractedData.categoryData).reduce((sum, cat) => sum + cat.itemCount, 0);
    const successfulCategories = Object.values(extractedData.categoryData).filter(cat => cat.success).length;
    
    extractedData.summary = {
      totalItemsExtracted: totalItems,
      categoriesSuccessful: successfulCategories,
      categoriesTotal: Object.keys(extractedData.categoryData).length,
      successRate: successfulCategories / Object.keys(extractedData.categoryData).length * 100,
      averageItemsPerCategory: totalItems / Object.keys(extractedData.categoryData).length
    };

    // Write JSON file
    const outputDir = path.join(__dirname, '../../../../data/output/data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `macys_navigation_data_${timestamp}.json`;
    const filepath = path.join(outputDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(extractedData, null, 2));
    
    console.log(`\n📁 JSON DATA EXPORTED:`);
    console.log(`File: ${filepath}`);
    console.log(`Size: ${JSON.stringify(extractedData).length} characters`);
    
    // Also output to console for immediate viewing
    console.log('\n📊 EXTRACTED DATA JSON:');
    console.log(JSON.stringify(extractedData, null, 2));

    return {
      success: true,
      filepath: filepath,
      data: extractedData,
      totalItems: totalItems
    };

  } catch (error) {
    logger.error('❌ JSON export failed:', error);
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

// Run the export
if (require.main === module) {
  exportCollectedDataAsJSON()
    .then(result => {
      console.log('\n🏁 JSON EXPORT COMPLETE');
      
      if (result.success) {
        console.log(`✅ Export successful!`);
        console.log(`📊 Total items: ${result.totalItems}`);
        console.log(`📁 File: ${result.filepath}`);
      } else {
        console.log(`❌ Export failed: ${result.error}`);
      }
    })
    .catch(error => {
      console.error('💥 Export execution failed:', error.message);
      process.exit(1);
    });
}

module.exports = exportCollectedDataAsJSON;