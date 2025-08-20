/**
 * Multi-Site Redundant Navigation Extractor Test
 * 
 * Tests our redundant pattern approach across different e-commerce sites
 * Goal: Validate 95% accuracy claim across diverse site architectures
 */

const { logger } = require('../../../utils/logger');
const { chromium } = require('playwright');
const { extractNavigationWithFallbacks, quickNavigationExtract } = require('../RedundantNavigationExtractor');

// Test sites with different navigation patterns
const TEST_SITES = [
  {
    name: 'GlasswingShop (Shopify)',
    url: 'https://glasswingshop.com',
    expectedPattern: 'shopify-dropdown',
    minItems: 150,
    description: 'Known working site - baseline test'
  },
  {
    name: 'Macy\'s (Custom)',
    url: 'https://www.macys.com',
    expectedPattern: 'macys-megamenu',
    minItems: 100,
    description: 'Large department store with mega menus'
  },
  {
    name: 'Target (Corporate)',
    url: 'https://www.target.com',
    expectedPattern: ['bootstrap-dropdown', 'simple-nav-ul'],
    minItems: 50,
    description: 'Major retailer with standard navigation'
  },
  {
    name: 'Home Depot (B2C)',
    url: 'https://www.homedepot.com',
    expectedPattern: ['bootstrap-dropdown', 'simple-nav-ul'],
    minItems: 30,
    description: 'Home improvement with department navigation'
  },
  {
    name: 'Nordstrom (Luxury)',
    url: 'https://www.nordstrom.com',
    expectedPattern: ['bootstrap-dropdown', 'simple-nav-ul'],
    minItems: 80,
    description: 'Luxury retailer with brand-focused navigation'
  }
];

async function testMultiSiteRedundantExtraction() {
  let browser = null;
  const results = [];
  let totalSites = 0;
  let successfulSites = 0;

  try {
    logger.info('🎯 Starting Multi-Site Redundant Navigation Test');
    logger.info(`📋 Testing ${TEST_SITES.length} different e-commerce sites`);

    browser = await chromium.launch({ 
      headless: false,
      devtools: false
    });

    for (const site of TEST_SITES) {
      totalSites++;
      logger.info(`\n🎯 Testing Site ${totalSites}/${TEST_SITES.length}: ${site.name}`);
      logger.info(`📋 URL: ${site.url}`);
      logger.info(`📋 Expected: ${Array.isArray(site.expectedPattern) ? site.expectedPattern.join(' or ') : site.expectedPattern}`);

      const siteStartTime = Date.now();

      try {
        const context = await browser.newContext({
          viewport: { width: 1920, height: 1080 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
        
        const page = await context.newPage();
        
        // Navigate with timeout handling
        try {
          await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch (navError) {
          logger.warn(`⚠️ Navigation timeout for ${site.name}, continuing with partial load`);
          await page.waitForTimeout(3000);
        }

        // Test with redundant extraction
        const extractionResult = await extractNavigationWithFallbacks(page, site.url, {
          maxPatterns: 5,
          minSuccessRate: 0.5,  // Lower bar for diverse sites
          minNavigationItems: 1 // At least something
        });

        const siteResult = {
          site: site.name,
          url: site.url,
          expectedPattern: site.expectedPattern,
          minItems: site.minItems,
          executionTime: Date.now() - siteStartTime,
          ...extractionResult
        };

        if (extractionResult.success) {
          const totalItems = extractionResult.result.summary.totalNavigationItems;
          const successRate = extractionResult.result.dropdownExtraction.successRate;
          
          logger.info(`✅ ${site.name} SUCCESS:`);
          logger.info(`   Pattern used: ${extractionResult.patternUsed}`);
          logger.info(`   Total items: ${totalItems}`);
          logger.info(`   Success rate: ${Math.round(successRate * 100)}%`);
          logger.info(`   Fallbacks needed: ${extractionResult.fallbacksNeeded}`);
          logger.info(`   Time: ${extractionResult.executionTime}ms`);

          // Check if meets minimum criteria
          if (totalItems >= site.minItems) {
            siteResult.meetsExpectations = true;
            successfulSites++;
            logger.info(`🎯 MEETS EXPECTATIONS (${totalItems} >= ${site.minItems} items)`);
          } else {
            siteResult.meetsExpectations = false;
            logger.warn(`⚠️ BELOW EXPECTATIONS (${totalItems} < ${site.minItems} items)`);
          }
        } else {
          siteResult.meetsExpectations = false;
          logger.error(`❌ ${site.name} FAILED: ${extractionResult.error}`);
        }

        results.push(siteResult);
        await context.close();

      } catch (error) {
        logger.error(`💥 ${site.name} threw error: ${error.message}`);
        results.push({
          site: site.name,
          url: site.url,
          success: false,
          error: error.message,
          meetsExpectations: false,
          executionTime: Date.now() - siteStartTime
        });
      }

      // Delay between sites to be respectful
      if (totalSites < TEST_SITES.length) {
        logger.info('⏳ Waiting between sites...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Calculate overall success rate
    const overallSuccessRate = (successfulSites / totalSites) * 100;
    const targetSuccessRate = 95;

    console.log('\n🏁 MULTI-SITE TEST RESULTS SUMMARY:');
    console.log('=' .repeat(60));
    console.log(`Total sites tested: ${totalSites}`);
    console.log(`Successful extractions: ${successfulSites}`);
    console.log(`Failed extractions: ${totalSites - successfulSites}`);
    console.log(`Overall success rate: ${Math.round(overallSuccessRate)}%`);
    console.log(`Target success rate: ${targetSuccessRate}%`);

    if (overallSuccessRate >= targetSuccessRate) {
      console.log(`🎯 TARGET ACHIEVED: ${Math.round(overallSuccessRate)}% >= ${targetSuccessRate}%`);
    } else {
      console.log(`⚠️ BELOW TARGET: ${Math.round(overallSuccessRate)}% < ${targetSuccessRate}%`);
    }

    console.log('\n📊 DETAILED RESULTS:');
    results.forEach((result, index) => {
      console.log(`\n[${index + 1}] ${result.site}`);
      console.log(`   URL: ${result.url}`);
      console.log(`   Success: ${result.success}`);
      
      if (result.success) {
        console.log(`   Pattern: ${result.patternUsed}`);
        console.log(`   Items: ${result.result.summary.totalNavigationItems}`);
        console.log(`   Meets expectations: ${result.meetsExpectations}`);
        console.log(`   Time: ${result.executionTime}ms`);
        
        const methods = result.result.summary.extractionMethods;
        console.log(`   Methods: Hover(${methods.hover}), Force(${methods.forceVisibility}), Failed(${methods.failed})`);
      } else {
        console.log(`   Error: ${result.error}`);
        console.log(`   Time: ${result.executionTime}ms`);
      }
    });

    console.log('\n📈 PATTERN USAGE ANALYSIS:');
    const patternUsage = {};
    results.filter(r => r.success).forEach(result => {
      const pattern = result.patternUsed;
      patternUsage[pattern] = (patternUsage[pattern] || 0) + 1;
    });
    
    Object.entries(patternUsage).forEach(([pattern, count]) => {
      console.log(`   ${pattern}: ${count} sites (${Math.round((count / successfulSites) * 100)}%)`);
    });

    return {
      totalSites,
      successfulSites,
      overallSuccessRate,
      targetMet: overallSuccessRate >= targetSuccessRate,
      results,
      patternUsage
    };

  } catch (error) {
    logger.error('❌ Multi-site test failed:', error);
    return {
      totalSites: 0,
      successfulSites: 0,
      overallSuccessRate: 0,
      targetMet: false,
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
  testMultiSiteRedundantExtraction()
    .then(summary => {
      console.log('\n🏁 FINAL SUMMARY:');
      
      if (summary.error) {
        console.log(`❌ Test suite failed: ${summary.error}`);
        process.exit(1);
      } else if (summary.targetMet) {
        console.log(`🎯 SUCCESS: ${Math.round(summary.overallSuccessRate)}% success rate achieves 95% target`);
        console.log('✅ Redundant navigation extractor ready for production use');
        process.exit(0);
      } else {
        console.log(`⚠️ NEEDS IMPROVEMENT: ${Math.round(summary.overallSuccessRate)}% success rate below 95% target`);
        console.log('🔧 Review pattern definitions and add missing patterns for failed sites');
        process.exit(0);
      }
    })
    .catch(error => {
      console.error('💥 Test execution failed:', error.message);
      process.exit(1);
    });
}

module.exports = testMultiSiteRedundantExtraction;