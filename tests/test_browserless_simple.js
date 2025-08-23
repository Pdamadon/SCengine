/**
 * Simple test of browserless.io connection without BQL
 * Should work with any browserless.io plan
 */

require('dotenv').config();

const BrowserManagerBrowserless = require('../src/common/BrowserManagerBrowserless');
const { logger } = require('../src/utils/logger');

async function testSimpleBrowserless() {
  console.log('\n=== Testing Simple Browserless.io Connection ===\n');
  console.log('🌐 Connecting to browserless.io (no BQL required)');
  console.log('📺 Check your session at: https://production-sfo.browserless.io/sessions\n');
  
  const browserManager = new BrowserManagerBrowserless();
  
  try {
    // Create a browserless session WITHOUT BQL
    // This should work with any plan
    const session = await browserManager.createBrowser('stealth', {
      site: 'https://glasswing.shop',
      useBQL: false,  // Explicitly disable BQL
      debug: false,   // Don't try to use debug features that need BQL
      timeout: 30000
    });
    
    console.log('✅ Connected to browserless.io successfully!');
    console.log(`   Session ID: ${session.sessionId}`);
    console.log(`   Backend: ${session.backend}`);
    
    // Navigate to the site
    await session.page.goto('https://glasswing.shop');
    console.log('✅ Navigated to glasswing.shop');
    
    // Take a screenshot as proof
    await session.page.screenshot({ path: 'browserless-test.png' });
    console.log('✅ Screenshot saved as browserless-test.png');
    
    // Get page title
    const title = await session.page.title();
    console.log(`   Page title: ${title}`);
    
    // Wait a bit so you can see it in the session viewer
    console.log('\n⏳ Keeping session open for 10 seconds...');
    console.log('   Go to https://production-sfo.browserless.io/sessions to see it');
    await session.page.waitForTimeout(10000);
    
    // Get stats
    const stats = browserManager.getStats();
    console.log('\n📊 Session Statistics:');
    console.log('   Sessions created:', stats.sessions.created);
    console.log('   CAPTCHA events:', stats.captchas.detected);
    console.log('   Estimated cost: $' + browserManager.calculateCost().toFixed(4));
    
    // Close session
    await session.close();
    console.log('\n✅ Session closed successfully');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
  }
  
  console.log('\n=== Test completed ===\n');
  process.exit(0);
}

console.log('Starting browserless.io test...\n');
testSimpleBrowserless();