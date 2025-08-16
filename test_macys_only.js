#!/usr/bin/env node

const NavigationMapper = require('./src/intelligence/NavigationMapper');

const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args)
};

async function testMacysOnly() {
  console.log('🧠 Testing NavigationMapper on Macy\'s only\n');
  
  const navigationMapper = new NavigationMapper(logger);
  
  try {
    console.log('🔍 Testing: Macy\'s (Enterprise Site)');
    console.log('URL: https://www.macys.com');
    console.log('============================================================\n');
    
    const startTime = Date.now();
    
    // Test just navigation mapping
    const navigationIntelligence = await navigationMapper.mapSiteNavigation('https://www.macys.com');
    
    const duration = Date.now() - startTime;
    
    // Display results
    console.log('📊 NAVIGATION RESULTS:');
    console.log(`  Duration: ${Math.round(duration / 1000)}s`);
    console.log(`  Main sections: ${navigationIntelligence.main_sections?.length || 0}`);
    console.log(`  Dropdown menus: ${Object.keys(navigationIntelligence.dropdown_menus || {}).length}`);
    console.log(`  Sidebar navigation: ${navigationIntelligence.sidebar_navigation?.length || 0}`);
    console.log(`  Clickable elements: ${navigationIntelligence.clickable_elements?.length || 0}`);
    
    // Check if pipeline metadata shows successful strategies
    if (navigationIntelligence._pipeline_metadata) {
      console.log('\n🚀 Pipeline Metadata:');
      const strategies = navigationIntelligence._pipeline_metadata.strategies_used || [];
      console.log(`  Strategies used: ${strategies.join(', ')}`);
      console.log(`  Discovery confidence: ${(navigationIntelligence._pipeline_metadata.confidence * 100).toFixed(1)}%`);
      
      if (strategies.includes('AdaptiveNavigationStrategy')) {
        console.log('  ✅ AdaptiveNavigationStrategy was used!');
      } else {
        console.log('  ⚠️ AdaptiveNavigationStrategy was not used');
      }
    }
    
    // Assessment
    const totalElements = (navigationIntelligence.main_sections?.length || 0) + 
                         Object.keys(navigationIntelligence.dropdown_menus || {}).length +
                         (navigationIntelligence.sidebar_navigation?.length || 0);
    
    const success = totalElements >= 5;
    
    console.log(`\n${success ? '✅ SUCCESS' : '❌ FAILED'}: Found ${totalElements} navigation elements`);
    
  } catch (error) {
    console.error(`❌ Navigation mapping failed for Macy's:`, error.message);
    console.error('Stack:', error.stack);
  } finally {
    await navigationMapper.close();
    console.log('\n🎉 Macy\'s test completed!');
  }
}

if (require.main === module) {
  testMacysOnly().catch(error => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });
}

module.exports = { testMacysOnly };