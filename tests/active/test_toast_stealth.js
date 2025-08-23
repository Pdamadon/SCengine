/**
 * Test Toast Tab with maximum stealth settings
 * Opens the page and waits to see if we get blocked by Cloudflare
 */

require('dotenv').config();
const { chromium } = require('playwright');
const ProxyBrowserManagerResidential = require('./src/common/ProxyBrowserManagerResidential');
const { logger } = require('./src/utils/logger');

// Set rebrowser patches environment variables
process.env.REBROWSER_PATCHES_RUNTIME_FIX_MODE = 'addBinding';
process.env.REBROWSER_PATCHES_SOURCE_URL = 'app.js';
process.env.REBROWSER_PATCHES_UTILITY_WORLD_NAME = 'util';

async function testToastStealth() {
  const testUrl = "https://www.toasttab.com/local/order/biang-biang-noodles-601-e-pike-st";
  
  console.log('🍜 Testing Toast Tab with maximum stealth...');
  console.log('URL:', testUrl);
  console.log('\n📋 Stealth measures enabled:');
  console.log('✅ rebrowser-playwright patches (Runtime.Enable fix)');
  console.log('✅ Residential proxy via BrightData');
  console.log('✅ Anti-bot detection browser settings');
  console.log('✅ Human-like timing and behavior');
  console.log('✅ Resource blocking for speed');
  console.log('\n');

  let manager;
  
  try {
    // Create browser with residential proxy and maximum stealth
    manager = new ProxyBrowserManagerResidential({
      retryOnBlock: false,  // Don't retry, just show what happens
      maxRetries: 1
    });
    
    console.log('🔄 Creating stealth browser with residential proxy...');
    const browser = await manager.createBrowserWithRetry('stealth', {
      skipIPCheck: false,  // Check IP to confirm proxy is working
      headless: true       // Test in headless mode like Railway
    });
    
    console.log('✅ Browser created successfully');
    console.log('\n🎯 Navigating to Toast Tab...\n');
    
    const { page } = browser;
    
    // Add listeners to detect Cloudflare challenges
    page.on('response', response => {
      const url = response.url();
      const status = response.status();
      
      if (url.includes('challenge') || url.includes('turnstile')) {
        console.log('⚠️  Cloudflare challenge detected:', url);
      }
      
      if (status === 403) {
        console.log('🚫 403 Forbidden response from:', url);
      }
    });
    
    // Navigate with human-like delay first
    console.log('⏱️  Adding human-like delay before navigation...');
    await page.waitForTimeout(2000 + Math.random() * 2000);
    
    // Navigate to the page
    console.log('🌐 Navigating to page...');
    const response = await page.goto(testUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log(`📊 Response status: ${response.status()}`);
    
    // Wait a bit for any redirects or challenges to complete
    console.log('⏱️  Waiting for page to settle...');
    await page.waitForTimeout(5000);
    
    // Check current URL - did we get redirected?
    const currentUrl = page.url();
    if (currentUrl !== testUrl) {
      console.log(`🔄 Redirected to: ${currentUrl}`);
    }
    
    // Check page content for Cloudflare blocks
    const pageContent = await page.content();
    
    // Look for Toast Tab specific elements
    const hasMenuSections = await page.$$eval('[data-testid*="menu"]', els => els.length).catch(() => 0);
    const hasMenuCategories = await page.$$eval('[class*="category"]', els => els.length).catch(() => 0);
    const hasAddToCart = await page.$$eval('button[aria-label*="Add"]', els => els.length).catch(() => 0);
    
    console.log('\n📊 Page Analysis:');
    console.log(`   Menu sections found: ${hasMenuSections}`);
    console.log(`   Category elements found: ${hasMenuCategories}`);
    console.log(`   Add to cart buttons found: ${hasAddToCart}`);
    
    if (pageContent.includes('cf-turnstile') || pageContent.includes('challenge-platform')) {
      console.log('\n⚠️  Cloudflare challenge scripts detected in page');
      
      // Check if we're actually blocked or if scripts just loaded
      const isBlocked = pageContent.includes('Checking your browser') || 
                       pageContent.includes('Verify you are human');
      
      if (isBlocked) {
        console.log('❌ BLOCKED: Cloudflare is showing a challenge');
      } else {
        console.log('✅ Challenge scripts present but page loaded!');
      }
    }
    
    if (hasMenuSections > 0 || hasMenuCategories > 5) {
      console.log('\n✅ SUCCESS: Menu content detected!');
      console.log('The page loaded successfully with menu items.');
    } else if (pageContent.includes('Access denied') || pageContent.includes('Error 1020')) {
      console.log('\n❌ BLOCKED: Cloudflare Access Denied');
    } else {
      console.log('\n⚠️  UNKNOWN: Page loaded but no clear menu content found');
      console.log('Check the browser window to see what loaded.');
    }
    
    // Try scrolling to trigger lazy loading
    console.log('\n🖱️  Scrolling to check for content loading...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    
    // Recheck for content after scroll
    const hasContentAfterScroll = await page.$$eval('[class*="menu"], [class*="category"], [class*="item"]', 
      els => els.length).catch(() => 0);
    console.log(`   Elements after scroll: ${hasContentAfterScroll}`);
    
    // Wait a bit for user to see the result
    console.log('\n⏸️  Keeping browser open for 15 seconds to inspect...');
    await page.waitForTimeout(15000);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('ERR_PROXY_CONNECTION_FAILED')) {
      console.log('💡 Proxy connection failed - check your residential proxy credentials');
    } else if (error.message.includes('ERR_INVALID_AUTH_CREDENTIALS')) {
      console.log('💡 Proxy authentication failed - verify BRIGHTDATA credentials in .env');
    }
    
  } finally {
    console.log('\n🧹 Cleaning up...');
    if (manager) {
      await manager.closeAll();
    }
    console.log('✅ Test complete');
  }
}

// Run the test
testToastStealth().catch(console.error);