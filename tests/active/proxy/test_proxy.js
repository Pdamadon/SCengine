/**
 * Test BrightData proxy configuration
 * 
 * This script tests that the proxy is working by:
 * 1. Checking IP without proxy
 * 2. Checking IP with proxy
 * 3. Verifying they are different
 */

require('dotenv').config();

const BrowserManager = require('./src/common/BrowserManager');
const ProxyConfig = require('./src/config/ProxyConfig');
const { logger } = require('./src/utils/logger');

async function testProxy() {
  console.log('🔍 Testing BrightData Proxy Configuration\n');
  
  // First, check if proxy credentials are configured
  if (!process.env.BRIGHTDATA_USERNAME || process.env.BRIGHTDATA_USERNAME === 'your_username_here') {
    console.log('❌ BrightData credentials not configured in .env file');
    console.log('Please update the following in your .env file:');
    console.log('  BRIGHTDATA_USERNAME=<your_actual_username>');
    console.log('  BRIGHTDATA_PASSWORD=<your_actual_password>');
    console.log('  BRIGHTDATA_ZONE=<your_zone_name>');
    return;
  }

  const browserManager = new BrowserManager();
  
  try {
    // Test 1: Get IP without proxy
    console.log('📍 Step 1: Checking IP without proxy...');
    
    // Temporarily clear proxy env vars to ensure no proxy is used
    const savedProxyType = process.env.PROXY_TYPE;
    delete process.env.PROXY_TYPE;
    delete process.env.BRIGHTDATA_USERNAME;
    
    const { page: page1, close: close1 } = await browserManager.createBrowser('testing', {
      proxy: null // Explicitly no proxy
    });
    
    // Restore proxy env vars
    process.env.PROXY_TYPE = savedProxyType;
    process.env.BRIGHTDATA_USERNAME = 'brd-customer-hl_31129cc2-zone-residential_proxy1';
    
    try {
      // Use httpbin.org as it's more reliable for proxy testing
      await page1.goto('https://httpbin.org/ip', { timeout: 30000 });
      const response1 = await page1.textContent('body');
      const { origin: originalIP } = JSON.parse(response1);
      console.log(`✅ Original IP: ${originalIP}\n`);
      await close1();
      
      // Test 2: Get IP with BrightData proxy
      console.log('📍 Step 2: Checking IP with BrightData proxy...');
      console.log('Proxy configuration:');
      console.log(`  Type: ${process.env.PROXY_TYPE || 'residential'}`);
      console.log(`  Country: ${process.env.PROXY_COUNTRY || 'US'}`);
      console.log(`  Zone: ${process.env.BRIGHTDATA_ZONE || 'residential'}\n`);
      
      const { page: page2, close: close2 } = await browserManager.createBrowser('stealth', {
        proxyType: 'residential',
        proxyCountry: process.env.PROXY_COUNTRY || 'US'
      });
      
      try {
        await page2.goto('https://httpbin.org/ip', { timeout: 30000 });
        const response2 = await page2.textContent('body');
        const { origin: proxyIP } = JSON.parse(response2);
        console.log(`✅ Proxy IP: ${proxyIP}\n`);
        
        // Test 3: Verify proxy is working
        console.log('📍 Step 3: Verification...');
        if (originalIP !== proxyIP) {
          console.log('✅ SUCCESS: Proxy is working correctly!');
          console.log(`   Original IP: ${originalIP}`);
          console.log(`   Proxy IP:    ${proxyIP}`);
          
          // Test 4: Try accessing a real website
          console.log('\n📍 Step 4: Testing with real website (Glasswing)...');
          await page2.goto('https://glasswingshop.com', { timeout: 30000 });
          const title = await page2.title();
          console.log(`✅ Successfully accessed: ${title}`);
          
          // Check if we can see products (anti-bot bypass test)
          const hasProducts = await page2.$('.product-item, .product-card');
          if (hasProducts) {
            console.log('✅ Anti-bot measures bypassed - can see product elements');
          } else {
            console.log('⚠️  Could not detect product elements (may need investigation)');
          }
          
        } else {
          console.log('❌ FAILED: Proxy IP is the same as original IP');
          console.log('   The proxy may not be working correctly.');
          console.log('   Please check your BrightData credentials and zone configuration.');
        }
        
        await close2();
        
      } catch (error) {
        console.log('❌ Error with proxy connection:', error.message);
        await close2();
      }
      
    } catch (error) {
      console.log('❌ Error checking original IP:', error.message);
      await close1();
    }
    
    // Test 5: Show proxy configuration details
    console.log('\n📍 Step 5: Proxy Configuration Details...');
    const proxyConfig = ProxyConfig.getProxySettings({
      type: 'residential',
      country: process.env.PROXY_COUNTRY || 'US'
    });
    
    if (proxyConfig) {
      console.log('Proxy settings:');
      console.log(`  Server: ${proxyConfig.server}`);
      console.log(`  Username pattern: ${proxyConfig.username.replace(/-session-\d+/, '-session-[timestamp]')}`);
      console.log(`  Authenticated: ${!!proxyConfig.password}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browserManager.closeAll();
  }
  
  console.log('\n✅ Proxy test complete!');
}

// Run the test
(async () => {
  try {
    await testProxy();
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    process.exit(0);
  }
})();