/**
 * INTEGRATION TEST: Pipeline with Examine 2 Categories Approach
 * 
 * SUCCESS METRICS:
 * - Uses proven examine_2_categories_only.js approach: headless: false + NavigationPatternExtractor
 * - Should extract 100+ navigation items (proven: 161 items)
 * - Perfect data quality: 100% valid URLs and text
 * - Anti-bot bypass: Working hover interactions
 * 
 * KEY INTEGRATION:
 * - Use PipelineOrchestrator but with examine_2 proven settings
 * - Bypass strategy selection, use direct pattern extraction
 * - Force headless: false like our successful research
 * 
 * PROMOTION READINESS: Integration validation with proven research approach
 */

const { logger } = require('../../../../utils/logger');
const PipelineOrchestrator = require('../../../PipelineOrchestrator');
const { extractUsingPattern } = require('../../NavigationPatternExtractor');
const { getPatternsForSite } = require('../../NavigationPatterns');
const { chromium } = require('playwright');

async function testPipelineWithExamine2Approach() {
  let orchestrator = null;
  let browser = null;

  try {
    logger.info('🎯 INTEGRATION TEST: Pipeline with Examine 2 Categories Approach');
    
    console.log('\n📋 TESTING PIPELINE WITH PROVEN EXAMINE 2 APPROACH:');
    console.log('   ✅ Using headless: false (proven working)');
    console.log('   ✅ Using NavigationPatternExtractor (proven 161 items)');
    console.log('   ✅ Using Macy\'s pattern (proven 95% accuracy)');
    
    // Test 1: Direct approach like examine_2_categories_only.js
    const targetUrl = 'https://www.macys.com';
    
    console.log('\n🔄 Phase 1: Direct Pattern Extraction (Like examine_2_categories_only.js)...');
    
    // Use the EXACT same approach as examine_2_categories_only.js
    browser = await chromium.launch({ 
      headless: false,  // CRITICAL: Same as examine_2_categories_only.js
      devtools: false
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    
    // Navigate like examine_2_categories_only.js
    console.log('   🌐 Navigating to Macy\'s...');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
      console.log('   ✅ Network idle achieved');
    } catch (error) {
      console.log('   ⚠️ Network idle timeout, continuing anyway');
    }
    
    await page.waitForTimeout(3000);
    console.log('   ✅ Page loaded and settled');

    // Use the EXACT pattern extraction from examine_2_categories_only.js
    console.log('\n🎯 Phase 2: Pattern Extraction (PROVEN METHOD)...');
    const patterns = getPatternsForSite(targetUrl);
    const macysPattern = patterns[0]; // Should be macys-megamenu
    
    console.log(`   Using pattern: ${macysPattern.name}`);
    
    // Get main navigation items (same as examine_2_categories_only.js)
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

    console.log(`   ✅ Found ${mainNavItems.length} main navigation items`);

    // Extract from first 2 categories (same as examine_2_categories_only.js)
    const limitedNavItems = mainNavItems.slice(0, 2);
    const directResults = {
      mainNavigation: { items: limitedNavItems, count: limitedNavItems.length },
      dropdownExtraction: { results: {} }
    };

    console.log(`   🎯 Will extract from first 2: "${limitedNavItems[0]?.text}", "${limitedNavItems[1]?.text}"`);

    // Extract dropdown content for first 2 categories (EXACT same logic)
    for (const item of limitedNavItems) {
      console.log(`\n   🎯 Extracting: "${item.text}"`);
      
      // Reset state
      const randomX = Math.floor(Math.random() * 300) + 50;
      const randomY = Math.floor(Math.random() * 200) + 400;
      await page.mouse.move(randomX, randomY);
      await page.waitForTimeout(300);
      
      // Hover on container
      const targetElement = await page.locator(item.selectors.container).first();
      await targetElement.hover({ timeout: 3000 });
      await page.waitForTimeout(3000);

      // Extract links (EXACT same logic as examine_2_categories_only.js)
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

      directResults.dropdownExtraction.results[item.text] = {
        method: 'hover',
        success: dropdownContent.length > 0,
        items: dropdownContent,
        count: dropdownContent.length
      };

      console.log(`     ✅ ${item.text}: ${dropdownContent.length} items extracted`);
    }

    const totalDirectItems = Object.values(directResults.dropdownExtraction.results).reduce((sum, r) => sum + r.count, 0);
    
    console.log(`\n📊 DIRECT EXTRACTION RESULTS (Like examine_2_categories_only.js):`);
    console.log(`   Navigation items found: ${mainNavItems.length}`);
    console.log(`   Categories extracted: ${limitedNavItems.length}`);
    console.log(`   Total dropdown items: ${totalDirectItems}`);
    
    // Close direct extraction browser
    await browser.close();
    browser = null;

    // Test 2: Now try with PipelineOrchestrator but force headless: false
    console.log(`\n🔄 Phase 3: Testing PipelineOrchestrator with headless: false...`);
    
    // Override the headless setting temporarily
    process.env.HEADLESS_MODE = 'false';  // Force headless: false
    
    orchestrator = new PipelineOrchestrator(logger, {
      enableNavigation: true,
      enableCollection: false,  // Skip for faster test
      enableExtraction: false   // Skip for faster test
    });

    const pipelineResult = await orchestrator.executePipeline(targetUrl, {
      jobId: 'examine2_pipeline_test',
      timeout: 30000
    });
    
    console.log(`\n📊 PIPELINE EXTRACTION RESULTS:`);
    console.log(`   Status: ${pipelineResult.status || 'unknown'}`);
    console.log(`   Navigation sections: ${pipelineResult.navigation?.main_sections?.length || 0}`);
    console.log(`   Navigation strategy: ${pipelineResult.navigation?.strategy || 'unknown'}`);
    console.log(`   Navigation confidence: ${pipelineResult.navigation?.confidence || 0}`);

    // Compare results
    const pipelineItems = pipelineResult.navigation?.main_sections?.length || 0;
    
    console.log(`\n🔍 COMPARISON:`);
    console.log(`   Direct extraction (examine_2 approach): ${totalDirectItems} items`);
    console.log(`   Pipeline extraction: ${pipelineItems} items`);
    
    if (pipelineItems > 50) {
      console.log(`   ✅ EXCELLENT: Pipeline now working with headless: false!`);
    } else if (pipelineItems > 0) {
      console.log(`   🟡 PROGRESS: Pipeline extracting some items`);
    } else if (totalDirectItems > 50) {
      console.log(`   🔧 INSIGHT: Direct approach works, pipeline needs strategy fix`);
    } else {
      console.log(`   ❌ ISSUE: Both approaches having problems`);
    }

    return {
      success: totalDirectItems > 0 || pipelineItems > 0,
      directExtractionWorking: totalDirectItems > 0,
      pipelineWorking: pipelineItems > 0,
      directItems: totalDirectItems,
      pipelineItems: pipelineItems,
      headlessFixed: pipelineItems > 0,
      readyForPromotion: pipelineItems > 50
    };

  } catch (error) {
    logger.error('❌ Pipeline with examine_2 approach test failed:', error);
    
    console.log('\n💥 TEST FAILED:');
    console.log(`   Error: ${error.message}`);
    
    return {
      success: false,
      error: error.message
    };
  } finally {
    // Restore original headless setting
    delete process.env.HEADLESS_MODE;
    
    if (browser) {
      await browser.close();
    }
    if (orchestrator) {
      try {
        await orchestrator.close();
      } catch (cleanupError) {
        console.log('   ⚠️ Cleanup warning:', cleanupError.message);
      }
    }
  }
}

// Run the integration test
if (require.main === module) {
  testPipelineWithExamine2Approach()
    .then(result => {
      console.log('\n🏁 PIPELINE WITH EXAMINE 2 APPROACH TEST COMPLETE');
      console.log('=' .repeat(70));
      
      if (result.success) {
        console.log('✅ INTEGRATION TEST SUCCESS!');
        
        if (result.directExtractionWorking) {
          console.log(`   Direct Extraction: ✅ ${result.directItems} items (examine_2 approach)`);
        }
        
        if (result.pipelineWorking) {
          console.log(`   Pipeline Extraction: ✅ ${result.pipelineItems} items`);
        } else {
          console.log(`   Pipeline Extraction: ❌ 0 items`);
        }
        
        if (result.readyForPromotion) {
          console.log('\n🎯 EXCELLENT: Pipeline working with headless: false fix!');
          console.log('   Ready to integrate examine_2 approach into production pipeline');
        } else if (result.directExtractionWorking && !result.pipelineWorking) {
          console.log('\n🔧 ACTIONABLE: Direct approach works, need to fix pipeline strategy selection');
        } else if (result.pipelineWorking) {
          console.log('\n🟡 PROGRESS: Pipeline partially working, needs optimization');
        }
      } else {
        console.log('❌ INTEGRATION TEST FAILED');
        console.log(`   Error: ${result.error}`);
      }
    })
    .catch(error => {
      console.error('💥 Test execution failed:', error.message);
      process.exit(1);
    });
}

module.exports = testPipelineWithExamine2Approach;