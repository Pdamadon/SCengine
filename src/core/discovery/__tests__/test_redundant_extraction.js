/**
 * Test Redundant Navigation Extraction
 * 
 * Validates that our extracted pattern-based system works as well as Test 4
 * Should achieve same results: 188 navigation items from glasswingshop.com
 */

const { logger } = require('../../../utils/logger');
const { chromium } = require('playwright');
const { extractNavigationWithFallbacks } = require('../RedundantNavigationExtractor');

async function testRedundantExtraction() {
  const targetUrl = 'https://glasswingshop.com';
  let browser = null;

  try {
    logger.info('🎯 Testing Redundant Navigation Extraction System');
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
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    
    // Use our new redundant extraction system
    const extractionResult = await extractNavigationWithFallbacks(page, targetUrl, {
      maxPatterns: 3,
      minSuccessRate: 0.8,
      minNavigationItems: 5
    });

    console.log('\n🎯 REDUNDANT EXTRACTION RESULTS:');
    console.log(`Success: ${extractionResult.success}`);
    console.log(`Pattern used: ${extractionResult.patternUsed}`);
    console.log(`Attempts needed: ${extractionResult.attemptCount}`);
    console.log(`Fallbacks needed: ${extractionResult.fallbacksNeeded}`);
    console.log(`Execution time: ${extractionResult.executionTime}ms`);

    if (extractionResult.success) {
      const result = extractionResult.result;
      
      console.log('\n📊 NAVIGATION BREAKDOWN:');
      console.log(`Main navigation items: ${result.mainNavigation.count}`);
      console.log(`Dropdown items extracted: ${result.dropdownExtraction.totalItems}`);
      console.log(`Total navigation items: ${result.summary.totalNavigationItems}`);
      console.log(`Success rate: ${Math.round(result.dropdownExtraction.successRate * 100)}%`);

      console.log('\n🔧 EXTRACTION METHOD BREAKDOWN:');
      console.log(`✅ Hover successful: ${result.summary.extractionMethods.hover}`);
      console.log(`🔧 Force-visibility successful: ${result.summary.extractionMethods.forceVisibility}`);
      console.log(`❌ Failed: ${result.summary.extractionMethods.failed}`);

      console.log('\n📁 NAVIGATION HIERARCHY:');
      result.mainNavigation.items.forEach((navItem, i) => {
        const dropdownData = result.dropdownExtraction.results[navItem.text];
        console.log(`[${i}] 📁 ${navItem.text} (${dropdownData.method}) - ${dropdownData.count} items`);
        if (dropdownData.items && dropdownData.items.length > 0) {
          dropdownData.items.slice(0, 3).forEach(item => {
            console.log(`   • ${item.text}`);
          });
          if (dropdownData.items.length > 3) {
            console.log(`   ... and ${dropdownData.items.length - 3} more`);
          }
        }
      });

      // Compare with Test 4 expected results (188 total items)
      const expectedTotal = 188;
      const actualTotal = result.summary.totalNavigationItems;
      const accuracy = Math.round((actualTotal / expectedTotal) * 100);

      console.log('\n🏁 COMPARISON WITH TEST 4:');
      console.log(`Expected items (Test 4): ${expectedTotal}`);
      console.log(`Actual items (Redundant): ${actualTotal}`);
      console.log(`Accuracy: ${accuracy}%`);

      if (accuracy >= 95) {
        console.log('✅ SUCCESS: Redundant extraction matches Test 4 results (95%+ accuracy)');
      } else if (accuracy >= 80) {
        console.log('⚠️ PARTIAL: Good extraction but below target accuracy');
      } else {
        console.log('❌ POOR: Extraction significantly below Test 4 performance');
      }

      return {
        success: true,
        patternUsed: extractionResult.patternUsed,
        totalItems: actualTotal,
        expectedItems: expectedTotal,
        accuracy: accuracy,
        performance: extractionResult.executionTime
      };
    } else {
      console.log(`❌ Extraction failed: ${extractionResult.error}`);
      return {
        success: false,
        error: extractionResult.error
      };
    }

  } catch (error) {
    logger.error('❌ Redundant extraction test failed:', error);
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
  testRedundantExtraction()
    .then(result => {
      console.log('\n🏁 REDUNDANT EXTRACTION TEST SUMMARY:');
      
      if (result.success) {
        console.log(`✅ Test passed with ${result.accuracy}% accuracy`);
        console.log(`Pattern used: ${result.patternUsed}`);
        console.log(`Items extracted: ${result.totalItems}/${result.expectedItems}`);
        console.log(`Performance: ${result.performance}ms`);
        
        if (result.accuracy >= 95) {
          console.log('🎯 EXCELLENT: Ready for production use');
          process.exit(0);
        } else {
          console.log('⚠️ GOOD: May need pattern refinement');
          process.exit(0);
        }
      } else {
        console.log(`❌ Test failed: ${result.error}`);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 Test execution failed:', error.message);
      process.exit(1);
    });
}

module.exports = testRedundantExtraction;