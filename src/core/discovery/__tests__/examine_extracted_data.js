/**
 * Examine Extracted Data Quality
 * 
 * Look at the actual navigation items collected to ensure they're valid
 */

const { logger } = require('../../../utils/logger');
const { chromium } = require('playwright');
const { extractNavigationWithFallbacks } = require('../RedundantNavigationExtractor');

async function examineExtractedData() {
  const targetUrl = 'https://www.macys.com';
  let browser = null;

  try {
    logger.info('🔍 Examining Quality of Extracted Navigation Data');
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

    // Extract navigation data
    console.log('\n🎯 EXTRACTING NAVIGATION DATA:');
    const result = await extractNavigationWithFallbacks(page, targetUrl);

    if (!result.success) {
      console.log('❌ Extraction failed');
      return;
    }

    console.log(`✅ Extraction successful!`);
    console.log(`📊 Raw result:`, JSON.stringify(result, null, 2));

    // Examine main navigation
    console.log('\n📊 MAIN NAVIGATION ITEMS:');
    if (result.mainNavigation && result.mainNavigation.items) {
      result.mainNavigation.items.forEach((item, index) => {
        console.log(`[${index}] "${item.text}" - Visible: ${item.isVisible}`);
      });
    }

    // Examine dropdown data quality (limit to first 2 categories for speed)
    console.log('\n📊 DROPDOWN DATA QUALITY ANALYSIS (First 2 Categories):');
    if (result.dropdownExtraction && result.dropdownExtraction.results) {
      Object.entries(result.dropdownExtraction.results).slice(0, 2).forEach(([category, categoryResult]) => {
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
          
          // Check for common issues
          const emptyText = categoryResult.items.filter(item => !item.text || item.text.trim() === '').length;
          const duplicateUrls = categoryResult.items.length - uniqueUrls;
          const invalidUrls = categoryResult.items.filter(item => 
            !item.href || !item.href.startsWith('http') || item.href.includes('#')
          ).length;
          
          if (emptyText > 0) console.log(`      ⚠️ Empty text items: ${emptyText}`);
          if (duplicateUrls > 0) console.log(`      ⚠️ Duplicate URLs: ${duplicateUrls}`);
          if (invalidUrls > 0) console.log(`      ⚠️ Invalid URLs: ${invalidUrls}`);
          
        } else {
          console.log(`  ❌ Failed: ${categoryResult.error || 'Unknown error'}`);
        }
      });
    }

    // Overall quality summary
    const allItems = [];
    if (result.dropdownExtraction && result.dropdownExtraction.results) {
      Object.values(result.dropdownExtraction.results).forEach(categoryResult => {
        if (categoryResult.success && categoryResult.items) {
          allItems.push(...categoryResult.items);
        }
      });
    }

    console.log('\n📊 OVERALL QUALITY SUMMARY:');
    console.log(`Total items collected: ${allItems.length}`);
    
    if (allItems.length > 0) {
      const validUrls = allItems.filter(item => 
        item.href && item.href.startsWith('http') && !item.href.includes('#')
      ).length;
      const validText = allItems.filter(item => 
        item.text && item.text.length > 2
      ).length;
      const uniqueUrls = new Set(allItems.map(item => item.href)).size;
      
      console.log(`Valid URLs: ${validUrls}/${allItems.length} (${((validUrls/allItems.length)*100).toFixed(1)}%)`);
      console.log(`Valid Text: ${validText}/${allItems.length} (${((validText/allItems.length)*100).toFixed(1)}%)`);
      console.log(`Unique URLs: ${uniqueUrls}/${allItems.length} (${((uniqueUrls/allItems.length)*100).toFixed(1)}%)`);
      
      // Sample of different types
      console.log('\n📋 SAMPLE OF DIFFERENT ITEM TYPES:');
      const sampleUrls = [...new Set(allItems.map(item => item.href))].slice(0, 10);
      sampleUrls.forEach((url, index) => {
        const item = allItems.find(i => i.href === url);
        console.log(`[${index}] "${item.text}" -> ${url}`);
      });
    }

    return {
      success: true,
      totalItems: allItems.length,
      validData: allItems.length > 0,
      qualityScore: allItems.length > 0 ? 
        (allItems.filter(item => item.href && item.text && item.href.startsWith('http')).length / allItems.length) : 0
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
  examineExtractedData()
    .then(result => {
      console.log('\n🏁 DATA QUALITY EXAMINATION COMPLETE');
      
      if (result.success) {
        console.log(`✅ Examination successful!`);
        console.log(`📊 Total items: ${result.totalItems}`);
        console.log(`📊 Quality score: ${(result.qualityScore * 100).toFixed(1)}%`);
        
        if (result.qualityScore > 0.9) {
          console.log(`🎯 EXCELLENT: High quality navigation data collected`);
        } else if (result.qualityScore > 0.7) {
          console.log(`🟡 GOOD: Decent quality data with some issues`);
        } else if (result.qualityScore > 0.5) {
          console.log(`🟠 FAIR: Data collected but quality concerns`);
        } else {
          console.log(`❌ POOR: Low quality data collected`);
        }
      } else {
        console.log(`❌ Examination failed: ${result.error}`);
      }
    })
    .catch(error => {
      console.error('💥 Examination execution failed:', error.message);
      process.exit(1);
    });
}

module.exports = examineExtractedData;