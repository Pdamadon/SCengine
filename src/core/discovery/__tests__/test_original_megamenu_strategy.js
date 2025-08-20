/**
 * Test Original MegaMenuStrategy on Macy's
 * 
 * Run the working MegaMenuStrategy to see exactly how it succeeds
 * so we can understand what our new approach is missing
 */

const { logger } = require('../../../utils/logger');
const { chromium } = require('playwright');
const MegaMenuStrategy = require('../strategies/MegaMenuStrategy');

async function testOriginalMegaMenuStrategy() {
  const targetUrl = 'https://www.macys.com';
  let browser = null;

  try {
    logger.info('🎯 Testing Original MegaMenuStrategy on Macy\'s');
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
    await page.waitForTimeout(3000);
    console.log('✅ Additional wait complete');

    // Create and run the original MegaMenuStrategy
    console.log('\n🎯 RUNNING ORIGINAL MEGAMENUSTRATEGY:');
    const strategy = new MegaMenuStrategy(logger, {
      maxMenusToCapture: 5,
      hoverDelay: 2000,
      dismissDelay: 500
    });

    const result = await strategy.execute(page);

    console.log('\n📊 MEGAMENUSTRATEGY RESULTS:');
    console.log(`Success: ${result.confidence > 0}`);
    console.log(`Confidence: ${result.confidence}`);
    console.log(`Total items: ${result.items.length}`);
    console.log(`Dropdown menus captured: ${Object.keys(result.dropdownMenus).length}`);

    if (result.metadata) {
      console.log('\n📋 METADATA:');
      console.log(`Strategy: ${result.metadata.strategy}`);
      console.log(`Triggers found: ${result.metadata.triggersFound}`);
      console.log(`Menus captured: ${result.metadata.menusCaptured}`);
      console.log(`Capture method: ${result.metadata.captureMethod}`);
      console.log(`Desktop mode: ${result.metadata.desktopMode}`);
      if (result.metadata.error) {
        console.log(`Error: ${result.metadata.error}`);
      }
    }

    console.log('\n📁 CAPTURED MEGA-MENUS:');
    Object.entries(result.dropdownMenus).forEach(([menuKey, menuData]) => {
      console.log(`\n[${menuKey}]:`);
      console.log(`  Category: ${menuData.navigation.category}`);
      console.log(`  Columns: ${menuData.navigation.summary?.total_columns || 0}`);
      console.log(`  Groups: ${menuData.navigation.summary?.total_groups || 0}`);
      console.log(`  Items: ${menuData.navigation.summary?.total_items || 0}`);
      
      if (menuData.navigation.columns && menuData.navigation.columns.length > 0) {
        console.log(`  Sample groups in first column:`);
        const firstColumn = menuData.navigation.columns[0];
        firstColumn.groups.slice(0, 3).forEach(group => {
          console.log(`    - ${group.title}: ${group.items.length} items`);
          if (group.items.length > 0) {
            console.log(`      • ${group.items.slice(0, 2).map(item => item.title).join(', ')}`);
          }
        });
      }
    });

    console.log('\n🔧 SAMPLE ITEMS (first 10):');
    result.items.slice(0, 10).forEach((item, index) => {
      console.log(`[${index}] ${item.name} (${item.category})`);
      console.log(`    URL: ${item.url}`);
      console.log(`    Group: ${item.group}`);
    });

    return {
      success: result.confidence > 0,
      confidence: result.confidence,
      totalItems: result.items.length,
      menusCaptured: Object.keys(result.dropdownMenus).length,
      metadata: result.metadata,
      fullResult: result
    };

  } catch (error) {
    logger.error('❌ Original MegaMenuStrategy test failed:', error);
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
  testOriginalMegaMenuStrategy()
    .then(result => {
      console.log('\n🏁 ORIGINAL MEGAMENUSTRATEGY TEST COMPLETE');
      
      if (result.success) {
        console.log(`✅ Original strategy worked perfectly!`);
        console.log(`📊 Confidence: ${result.confidence}`);
        console.log(`📊 Total items extracted: ${result.totalItems}`);
        console.log(`📊 Mega-menus captured: ${result.menusCaptured}`);
        console.log(`🎯 This proves the original approach works - we need to match this behavior`);
      } else {
        console.log(`❌ Original strategy failed: ${result.error}`);
      }
    })
    .catch(error => {
      console.error('💥 Test execution failed:', error.message);
      process.exit(1);
    });
}

module.exports = testOriginalMegaMenuStrategy;