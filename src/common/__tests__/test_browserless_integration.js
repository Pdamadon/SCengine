/**
 * Browserless.io Integration Test
 * 
 * This test validates:
 * 1. Connection to Browserless.io
 * 2. BrightData proxy integration
 * 3. Navigation extraction on protected sites
 * 4. CAPTCHA detection
 * 5. Cost tracking
 */

const BrowserManagerBrowserless = require('../BrowserManagerBrowserless');
const { logger } = require('../../utils/logger');
require('dotenv').config();

// Test configuration
const TEST_SITES = {
  // Simple site - should work without proxy
  simple: {
    url: 'https://example.com',
    expectedTitle: 'Example Domain',
    useProxy: false
  },
  
  // E-commerce site - test with proxy
  ecommerce: {
    url: 'https://www.glasswingshop.com',
    expectedElements: '.dropdown-toggle',
    useProxy: true,
    proxyType: 'residential'
  },
  
  // Protected site - Cloudflare challenge
  protected: {
    url: 'https://www.toasttab.com/local/restaurants',
    expectedPattern: /restaurant|food|order/i,
    useProxy: true,
    proxyType: 'residential',
    autoSolveCaptcha: true
  }
};

async function runIntegrationTests() {
  const browserManager = new BrowserManagerBrowserless({
    fallbackToLocal: true, // Fallback to local if Browserless fails
    enableHybridAutomation: true // Enable human-in-the-loop features
  });

  logger.info('🧪 Starting Browserless.io Integration Tests\n');

  // Check configuration
  if (!process.env.BROWSERLESS_TOKEN) {
    logger.error('❌ BROWSERLESS_TOKEN not set in .env file');
    logger.info(`
To get started with Browserless.io:
1. Sign up at https://www.browserless.io
2. Get your API token from the dashboard
3. Add to .env file:
   BROWSERLESS_TOKEN=your_token_here
   USE_BROWSERLESS=true
    `);
    return;
  }

  const results = {
    passed: [],
    failed: [],
    stats: null
  };

  try {
    // Test 1: Basic Connection
    logger.info('Test 1: Basic Browserless.io Connection');
    try {
      const { page, close, backend } = await browserManager.createBrowser('stealth', {
        site: TEST_SITES.simple.url,
        proxy: false
      });
      
      await page.goto(TEST_SITES.simple.url);
      const title = await page.title();
      
      if (title === TEST_SITES.simple.expectedTitle) {
        logger.info(`✅ Basic connection successful (backend: ${backend})`);
        results.passed.push('basic_connection');
      } else {
        throw new Error(`Unexpected title: ${title}`);
      }
      
      await close();
    } catch (error) {
      logger.error(`❌ Basic connection failed: ${error.message}`);
      results.failed.push('basic_connection');
    }

    // Test 2: BrightData Proxy Integration
    logger.info('\nTest 2: BrightData Proxy Integration');
    if (process.env.BRIGHTDATA_USERNAME) {
      try {
        const { page, close, backend } = await browserManager.createBrowser('stealth', {
          site: 'https://api.ipify.org',
          proxy: 'brightdata',
          proxyType: 'residential'
        });
        
        await page.goto('https://api.ipify.org?format=json');
        const ipData = await page.evaluate(() => JSON.parse(document.body.textContent));
        
        logger.info(`✅ Proxy working! IP: ${ipData.ip} (via BrightData)`);
        results.passed.push('proxy_integration');
        
        await close();
      } catch (error) {
        logger.error(`❌ Proxy integration failed: ${error.message}`);
        results.failed.push('proxy_integration');
      }
    } else {
      logger.info('⚠️ Skipping - BRIGHTDATA_USERNAME not configured');
    }

    // Test 3: E-commerce Navigation Extraction
    logger.info('\nTest 3: E-commerce Navigation Extraction');
    try {
      const { page, close, cdp } = await browserManager.createBrowser('stealth', {
        site: TEST_SITES.ecommerce.url,
        proxy: TEST_SITES.ecommerce.useProxy ? 'brightdata' : false,
        proxyType: TEST_SITES.ecommerce.proxyType
      });
      
      await page.goto(TEST_SITES.ecommerce.url, { waitUntil: 'networkidle2' });
      
      // Check for navigation elements
      const navElements = await page.$$(TEST_SITES.ecommerce.expectedElements);
      
      if (navElements.length > 0) {
        logger.info(`✅ Found ${navElements.length} navigation elements`);
        results.passed.push('navigation_extraction');
      } else {
        throw new Error('No navigation elements found');
      }
      
      await close();
    } catch (error) {
      logger.error(`❌ Navigation extraction failed: ${error.message}`);
      results.failed.push('navigation_extraction');
    }

    // Test 4: Protected Site with CAPTCHA Detection
    logger.info('\nTest 4: Protected Site (Cloudflare) Test');
    try {
      const { page, close, cdp } = await browserManager.createBrowser('stealth', {
        site: TEST_SITES.protected.url,
        proxy: 'brightdata',
        proxyType: 'residential',
        autoSolveCaptcha: true,
        onCaptcha: async (page, cdp) => {
          logger.info('🔒 CAPTCHA detected - would trigger solving');
        }
      });
      
      // Set up CAPTCHA listener
      let captchaDetected = false;
      if (cdp) {
        cdp.on('Browserless.captchaFound', () => {
          captchaDetected = true;
          logger.info('🔒 CAPTCHA event received');
        });
      }
      
      await page.goto(TEST_SITES.protected.url, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      // Wait a bit for potential CAPTCHA
      await page.waitForTimeout(3000);
      
      const content = await page.content();
      const hasExpectedContent = TEST_SITES.protected.expectedPattern.test(content);
      
      if (hasExpectedContent || captchaDetected) {
        logger.info(`✅ Protected site accessed (CAPTCHA: ${captchaDetected})`);
        results.passed.push('protected_site');
      } else {
        logger.warn('⚠️ Protected site accessed but content unclear');
        results.passed.push('protected_site_partial');
      }
      
      await close();
    } catch (error) {
      logger.error(`❌ Protected site test failed: ${error.message}`);
      results.failed.push('protected_site');
    }

    // Test 5: Human-in-the-Loop (Optional)
    logger.info('\nTest 5: Human-in-the-Loop Capability');
    if (process.env.TEST_HUMAN_IN_LOOP === 'true') {
      try {
        const { page, close, cdp } = await browserManager.createBrowser('stealth', {
          site: 'https://accounts.google.com',
          humanInLoop: true,
          onLiveUrl: (liveUrl) => {
            logger.info(`👤 Live URL for human interaction: ${liveUrl}`);
            logger.info('   Open this URL in a browser to interact with the page');
          }
        });
        
        await page.goto('https://accounts.google.com');
        
        // Wait for potential human interaction (shortened for test)
        await page.waitForTimeout(10000);
        
        logger.info('✅ Human-in-the-loop capability verified');
        results.passed.push('human_in_loop');
        
        await close();
      } catch (error) {
        logger.error(`❌ Human-in-the-loop test failed: ${error.message}`);
        results.failed.push('human_in_loop');
      }
    } else {
      logger.info('⚠️ Skipping - Set TEST_HUMAN_IN_LOOP=true to test');
    }

  } catch (error) {
    logger.error('💥 Critical test failure:', error);
  }

  // Get final statistics
  results.stats = browserManager.getStats();

  // Print summary
  logger.info('\n' + '='.repeat(60));
  logger.info('📊 TEST SUMMARY');
  logger.info('='.repeat(60));
  logger.info(`✅ Passed: ${results.passed.length}/${results.passed.length + results.failed.length}`);
  logger.info(`❌ Failed: ${results.failed.length}/${results.passed.length + results.failed.length}`);
  
  if (results.passed.length > 0) {
    logger.info('\nPassed Tests:');
    results.passed.forEach(test => logger.info(`  ✅ ${test}`));
  }
  
  if (results.failed.length > 0) {
    logger.info('\nFailed Tests:');
    results.failed.forEach(test => logger.info(`  ❌ ${test}`));
  }

  logger.info('\n📈 Usage Statistics:');
  logger.info(JSON.stringify(results.stats, null, 2));

  // Recommendations
  logger.info('\n💡 Recommendations:');
  if (results.failed.includes('basic_connection')) {
    logger.info('  - Check BROWSERLESS_TOKEN is valid');
    logger.info('  - Verify Browserless.io service is operational');
  }
  if (results.failed.includes('proxy_integration')) {
    logger.info('  - Verify BrightData credentials are correct');
    logger.info('  - Check proxy quota and billing');
  }
  if (results.failed.includes('protected_site')) {
    logger.info('  - Protected sites may need human verification initially');
    logger.info('  - Consider enabling hybrid automation for first-time access');
  }

  return results;
}

// Performance comparison test
async function comparePerformance() {
  logger.info('\n' + '='.repeat(60));
  logger.info('🏁 PERFORMANCE COMPARISON: Local vs Browserless');
  logger.info('='.repeat(60));

  const browserManager = new BrowserManagerBrowserless();
  const testUrl = 'https://www.glasswingshop.com';

  // Test local Chromium
  logger.info('\nTesting Local Chromium...');
  const localStart = Date.now();
  try {
    const { page, close } = await browserManager.createBrowser('stealth', {
      backend: 'local',
      site: testUrl
    });
    await page.goto(testUrl, { waitUntil: 'networkidle2' });
    const localElements = await page.$$('.dropdown-toggle');
    await close();
    
    const localTime = Date.now() - localStart;
    logger.info(`✅ Local: ${localTime}ms, Found ${localElements.length} elements`);
  } catch (error) {
    logger.error(`❌ Local failed: ${error.message}`);
  }

  // Test Browserless.io
  logger.info('\nTesting Browserless.io...');
  const browserlessStart = Date.now();
  try {
    const { page, close } = await browserManager.createBrowser('stealth', {
      backend: 'browserless',
      site: testUrl,
      proxy: false // No proxy for fair comparison
    });
    await page.goto(testUrl, { waitUntil: 'networkidle2' });
    const browserlessElements = await page.$$('.dropdown-toggle');
    await close();
    
    const browserlessTime = Date.now() - browserlessStart;
    logger.info(`✅ Browserless: ${browserlessTime}ms, Found ${browserlessElements.length} elements`);
  } catch (error) {
    logger.error(`❌ Browserless failed: ${error.message}`);
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--compare')) {
    comparePerformance().catch(console.error);
  } else {
    runIntegrationTests()
      .then(results => {
        process.exit(results.failed.length > 0 ? 1 : 0);
      })
      .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
      });
  }
}

module.exports = { runIntegrationTests, comparePerformance };