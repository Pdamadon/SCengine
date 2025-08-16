#!/usr/bin/env node

const { chromium } = require('playwright');
const AdaptiveNavigationStrategy = require('./src/intelligence/navigation/strategies/AdaptiveNavigationStrategy');

const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args)
};

async function debugPipelineIntegration() {
  console.log('🔍 Debugging AdaptiveNavigationStrategy Pipeline Integration\n');
  
  const browser = await chromium.launch({ 
    headless: true  // Test headless mode like NavigationMapper - no args
  });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  
  try {
    // Test on Macy's like the pipeline does
    console.log('📱 Testing AdaptiveNavigationStrategy on Macy\'s (mobile viewport)');
    await page.goto('https://www.macys.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    console.log('\n1️⃣ DIRECT INSTANTIATION TEST (how our tests work):');
    const directStrategy = new AdaptiveNavigationStrategy(logger);
    const directResult = await directStrategy.execute(page);
    
    console.log('Direct result:', {
      itemsFound: directResult.items?.length || 0,
      confidence: directResult.confidence || 0,
      metadataKeys: Object.keys(directResult.metadata || {}),
      sampleItems: directResult.items?.slice(0, 3).map(item => ({ name: item.name, type: item.type })) || []
    });
    
    console.log('\n2️⃣ PIPELINE CONTEXT TEST (how NavigationMapper calls it):');
    
    // Simulate exactly what NavigationDiscoveryPipeline does
    const pipelineStrategy = new AdaptiveNavigationStrategy(logger);
    console.log('Strategy created, calling execute...');
    
    const pipelineResult = await Promise.race([
      pipelineStrategy.execute(page),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 5000ms')), 5000))
    ]);
    
    console.log('Pipeline result:', {
      itemsFound: pipelineResult.items?.length || 0,
      confidence: pipelineResult.confidence || 0,
      metadataKeys: Object.keys(pipelineResult.metadata || {}),
      sampleItems: pipelineResult.items?.slice(0, 3).map(item => ({ name: item.name, type: item.type })) || []
    });
    
    console.log('\n3️⃣ COMPARISON:');
    const directItems = directResult.items?.length || 0;
    const pipelineItems = pipelineResult.items?.length || 0;
    
    if (directItems === pipelineItems && directItems > 0) {
      console.log('✅ Results match! Strategy works correctly in both contexts');
    } else if (directItems > 0 && pipelineItems === 0) {
      console.log('❌ PROBLEM: Direct call works, pipeline call fails');
      console.log('This suggests a pipeline integration issue');
    } else if (directItems === 0 && pipelineItems === 0) {
      console.log('❌ PROBLEM: Both calls fail');
      console.log('This suggests the strategy itself has an issue with this site');
    } else {
      console.log('⚠️ Inconsistent results between direct and pipeline calls');
    }
    
    console.log(`Direct items: ${directItems}, Pipeline items: ${pipelineItems}`);
    
    // Check the page state
    console.log('\n4️⃣ PAGE STATE CHECK:');
    const pageInfo = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      linkCount: document.querySelectorAll('a').length,
      mobileNavExists: !!document.querySelector('#mobile-nav, .mobile-nav'),
      hamburgerExists: !!document.querySelector('[aria-label*="menu"], [aria-label*="Menu"]')
    }));
    
    console.log('Page info:', pageInfo);
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  debugPipelineIntegration().catch(console.error);
}

module.exports = { debugPipelineIntegration };