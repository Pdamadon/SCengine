/**
 * Test Browser Toggle - Demonstrates HyperBrowser/Chromium switching
 * 
 * This test shows how the enhanced BrowserManager intelligently selects
 * between HyperBrowser and local Chromium based on site requirements
 */

const BrowserManagerEnhanced = require('../BrowserManagerEnhanced');
const { logger } = require('../../utils/logger');

async function testBrowserToggle() {
  const browserManager = new BrowserManagerEnhanced({
    defaultBackend: 'auto',
    costTracking: true,
    fallbackEnabled: true
  });

  try {
    logger.info('🧪 Testing Browser Toggle System\n');

    // Test 1: Simple site - should use Chromium
    logger.info('Test 1: Glasswing (simple site)');
    const glass = await browserManager.createBrowser('stealth', {
      site: 'glasswingshop.com'
    });
    logger.info(`✅ Backend selected: ${glass.backend}`);
    await glass.page.goto('https://glasswingshop.com');
    await glass.page.waitForTimeout(2000);
    await glass.close();

    // Test 2: Protected site - should use HyperBrowser (if enabled)
    logger.info('\nTest 2: Toast Tab (Cloudflare protected)');
    const toast = await browserManager.createBrowser('stealth', {
      site: 'toasttab.com'
    });
    logger.info(`✅ Backend selected: ${toast.backend}`);
    if (toast.backend === 'hyperbrowser') {
      await toast.page.goto('https://www.toasttab.com/local/restaurants');
      await toast.page.waitForTimeout(2000);
      logger.info('✅ Successfully loaded Toast Tab with HyperBrowser!');
    } else {
      logger.info('⚠️ HyperBrowser not enabled, using Chromium fallback');
    }
    await toast.close();

    // Test 3: Explicit backend selection
    logger.info('\nTest 3: Force Chromium backend');
    const forced = await browserManager.createBrowser('stealth', {
      backend: 'chromium',
      site: 'example.com'
    });
    logger.info(`✅ Backend selected: ${forced.backend}`);
    await forced.page.goto('https://example.com');
    await forced.close();

    // Test 4: Parallel operations - should prefer HyperBrowser
    logger.info('\nTest 4: Parallel extraction scenario');
    const parallel = await browserManager.createBrowser('stealth', {
      parallel: true,
      site: 'target.com'
    });
    logger.info(`✅ Backend selected: ${parallel.backend} (optimized for parallel)`);
    await parallel.close();

    // Print statistics
    logger.info('\n📊 Session Statistics:');
    const stats = browserManager.getStats();
    console.log(JSON.stringify(stats, null, 2));

    // Cleanup
    await browserManager.cleanup();
    logger.info('\n✅ All tests completed successfully!');

  } catch (error) {
    logger.error('❌ Test failed:', error);
    await browserManager.cleanup();
    process.exit(1);
  }
}

// Configuration helper
function printConfiguration() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           Browser Toggle Configuration Guide              ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  To enable HyperBrowser:                                  ║
║  1. Set environment variables:                            ║
║     export ENABLE_HYPERBROWSER=true                       ║
║     export HYPERBROWSER_API_KEY=your_key_here            ║
║                                                            ║
║  2. Install dependencies:                                 ║
║     npm install @hyperbrowser/sdk playwright-core         ║
║                                                            ║
║  Site Configuration (in BrowserManagerEnhanced.js):       ║
║  - toasttab.com → HyperBrowser (Cloudflare)              ║
║  - glasswingshop.com → Chromium (cost savings)           ║
║  - macys.com → Chromium (works with headless:false)      ║
║                                                            ║
║  Backend Selection Logic:                                 ║
║  1. Explicit: options.backend = 'hyperbrowser'           ║
║  2. Site-based: Protected sites use HyperBrowser         ║
║  3. Auto: Simple sites use Chromium (cost optimization)  ║
║  4. Parallel: HyperBrowser for scaling                   ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
}

// Run test
if (require.main === module) {
  printConfiguration();
  
  if (!process.env.ENABLE_HYPERBROWSER) {
    console.log('\n⚠️  HyperBrowser not enabled. Tests will use Chromium only.');
    console.log('   Set ENABLE_HYPERBROWSER=true to test HyperBrowser integration.\n');
  }
  
  testBrowserToggle();
}