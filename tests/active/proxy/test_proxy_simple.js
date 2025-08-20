/**
 * Simple BrightData proxy test
 * Tests proxy connection without SSL issues
 */

require('dotenv').config();
const { chromium } = require('playwright');

async function testProxySimple() {
  console.log('🔍 Testing BrightData Proxy Configuration\n');
  
  // Check credentials
  const username = process.env.BRIGHTDATA_USERNAME;
  const password = process.env.BRIGHTDATA_PASSWORD;
  const zone = process.env.BRIGHTDATA_ZONE;
  
  console.log('Credentials check:');
  console.log(`  Username: ${username ? username.substring(0, 20) + '...' : 'NOT SET'}`);
  console.log(`  Password: ${password ? '***' : 'NOT SET'}`);
  console.log(`  Zone: ${zone || 'NOT SET'}\n`);
  
  if (!username || !password) {
    console.log('❌ Missing BrightData credentials');
    return;
  }
  
  try {
    // Test 1: Without proxy
    console.log('📍 Test 1: Getting IP without proxy...');
    const browser1 = await chromium.launch({
      headless: false,
      args: ['--ignore-certificate-errors']
    });
    const context1 = await browser1.newContext({
      ignoreHTTPSErrors: true
    });
    const page1 = await context1.newPage();
    
    await page1.goto('http://icanhazip.com');
    const originalIP = (await page1.textContent('body')).trim();
    console.log(`✅ Original IP: ${originalIP}`);
    await browser1.close();
    
    // Test 2: With BrightData proxy
    console.log('\n📍 Test 2: Getting IP with BrightData proxy...');
    
    // Build proxy URL with credentials
    const proxyServer = 'http://zproxy.lum-superproxy.io:22225';
    const fullUsername = `${username}-country-us`;
    
    console.log(`  Proxy server: ${proxyServer}`);
    console.log(`  Full username: ${fullUsername}\n`);
    
    const browser2 = await chromium.launch({
      headless: false,
      args: ['--ignore-certificate-errors'],
      proxy: {
        server: proxyServer,
        username: fullUsername,
        password: password
      }
    });
    
    const context2 = await browser2.newContext({
      ignoreHTTPSErrors: true
    });
    const page2 = await context2.newPage();
    
    try {
      await page2.goto('http://icanhazip.com', { timeout: 30000 });
      const proxyIP = (await page2.textContent('body')).trim();
      console.log(`✅ Proxy IP: ${proxyIP}`);
      
      // Verify proxy is working
      if (originalIP !== proxyIP) {
        console.log('\n✅ SUCCESS: Proxy is working!');
        console.log(`   Changed from ${originalIP} to ${proxyIP}`);
        
        // Test with real site
        console.log('\n📍 Test 3: Accessing Glasswing through proxy...');
        await page2.goto('https://glasswingshop.com', { timeout: 30000 });
        const title = await page2.title();
        console.log(`✅ Successfully loaded: ${title}`);
        
        // Check for product elements
        const hasProducts = await page2.$$('.product-item, .product-card, [class*="product"]');
        console.log(`✅ Found ${hasProducts.length} product elements`);
        
      } else {
        console.log('\n❌ FAILED: IP did not change');
        console.log('   Proxy may not be working correctly');
      }
    } catch (error) {
      console.log('❌ Error with proxy:', error.message);
      console.log('\nPossible issues:');
      console.log('  1. Check if your BrightData account is active');
      console.log('  2. Verify the zone name is correct');
      console.log('  3. Check if you have residential proxy access');
      console.log('  4. Ensure your IP is whitelisted in BrightData dashboard');
    }
    
    await browser2.close();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
  
  console.log('\n✅ Test complete!');
}

// Run test
testProxySimple().catch(console.error).finally(() => process.exit(0));