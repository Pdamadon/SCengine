/**
 * Test Fixed Macy's Extraction with RedundantNavigationExtractor
 * 
 * Test the complete system with the fixed hover targeting
 */

const { logger } = require('../../../utils/logger');
const { chromium } = require('playwright');
const { extractNavigationWithFallbacks } = require('../RedundantNavigationExtractor');

async function testFixedMacysExtraction() {
  const targetUrl = 'https://www.macys.com';
  let browser = null;

  try {
    logger.info('🎯 Testing Fixed Macy\'s Extraction with RedundantNavigationExtractor');
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

    // Test the RedundantNavigationExtractor system
    console.log('\n🎯 RUNNING REDUNDANT NAVIGATION EXTRACTOR:');
    const result = await extractNavigationWithFallbacks(page, targetUrl);

    console.log('\n📊 REDUNDANT EXTRACTION RESULTS:');
    console.log(`Success: ${result.success}`);
    console.log(`Pattern used: ${result.patternUsed}`);
    console.log(`Confidence: ${result.confidence}`);
    console.log(`Total items: ${result.totalNavigationItems}`);
    
    if (result.mainNavigation) {
      console.log(`Main navigation items: ${result.mainNavigation.count}`);
    }

    if (result.dropdownExtraction) {
      console.log(`Dropdown items: ${result.dropdownExtraction.totalItems}`);
      console.log(`Success rate: ${(result.dropdownExtraction.successRate * 100).toFixed(1)}%`);
      console.log(`Successful extractions: ${result.dropdownExtraction.successfulExtractions}`);
      console.log(`Failed extractions: ${result.dropdownExtraction.failedExtractions}`);
    }

    if (result.summary && result.summary.extractionMethods) {
      console.log('\n📋 EXTRACTION METHODS:');
      console.log(`  Hover: ${result.summary.extractionMethods.hover}`);
      console.log(`  Force visibility: ${result.summary.extractionMethods.forceVisibility}`);
      console.log(`  Failed: ${result.summary.extractionMethods.failed}`);
    }

    // Show sample results
    if (result.dropdownExtraction && result.dropdownExtraction.results) {
      console.log('\n📁 DROPDOWN EXTRACTION DETAILS:');
      Object.entries(result.dropdownExtraction.results).forEach(([category, categoryResult]) => {
        console.log(`\n[${category}]: ${categoryResult.count} items via ${categoryResult.method}`);
        if (categoryResult.success && categoryResult.items.length > 0) {
          console.log(`  Sample items:`);
          categoryResult.items.slice(0, 3).forEach(item => {
            console.log(`    • "${item.text}" -> ${item.href}`);
          });
        } else if (!categoryResult.success) {
          console.log(`  ❌ Failed: ${categoryResult.error || 'Unknown error'}`);
        }
      });
    }

    return {
      success: result.success,
      patternUsed: result.patternUsed,
      totalItems: result.totalNavigationItems,
      dropdownItems: result.dropdownExtraction?.totalItems || 0,
      successRate: result.dropdownExtraction?.successRate || 0
    };

  } catch (error) {
    logger.error('❌ Test failed:', error);
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
  testFixedMacysExtraction()
    .then(result => {
      console.log('\n🏁 FIXED MACY\'S EXTRACTION TEST COMPLETE');
      
      if (result.success) {
        console.log(`✅ Extraction successful!`);
        console.log(`📊 Pattern: ${result.patternUsed}`);
        console.log(`📊 Total items: ${result.totalItems}`);
        console.log(`📊 Dropdown items: ${result.dropdownItems}`);
        console.log(`📊 Success rate: ${(result.successRate * 100).toFixed(1)}%`);
        
        // Compare to original MegaMenuStrategy performance
        if (result.dropdownItems > 300) {
          console.log(`🎯 SUCCESS! Matching MegaMenuStrategy performance (355 items)`);
        } else if (result.dropdownItems > 200) {
          console.log(`🟡 Good progress, close to MegaMenuStrategy performance`);
        } else if (result.dropdownItems > 0) {
          console.log(`🟠 Some items extracted, but below MegaMenuStrategy performance`);
        } else {
          console.log(`❌ No items extracted - still not working`);
        }
      } else {
        console.log(`❌ Extraction failed: ${result.error}`);
      }
    })
    .catch(error => {
      console.error('💥 Test execution failed:', error.message);
      process.exit(1);
    });
}

module.exports = testFixedMacysExtraction;