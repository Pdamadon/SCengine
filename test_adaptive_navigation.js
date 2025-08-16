#!/usr/bin/env node

const AdaptiveNavigationStrategy = require('./src/intelligence/navigation/strategies/AdaptiveNavigationStrategy');
const { chromium } = require('playwright');

const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args)
};

// Mock Redis cache for testing
const mockCache = {
  data: new Map(),
  async get(key) {
    return this.data.get(key) || null;
  },
  async setex(key, ttl, value) {
    this.data.set(key, value);
    // In real implementation, would set TTL
  }
};

// Enterprise test sites - expanded to test diverse business models
const testSites = [
  // Fashion & Department Stores
  {
    name: 'Nordstrom',
    url: 'https://www.nordstrom.com',
    expectedCategories: 8,
    timeout: 10000,
    category: 'Fashion'
  },
  {
    name: 'Macy\'s',
    url: 'https://www.macys.com',
    expectedCategories: 6,
    timeout: 10000,
    category: 'Fashion'
  },
  {
    name: 'Zara',
    url: 'https://www.zara.com',
    expectedCategories: 4,
    timeout: 8000,
    category: 'Fashion'
  },
  
  // General Retail
  {
    name: 'Target',
    url: 'https://www.target.com',
    expectedCategories: 10,
    timeout: 8000,
    category: 'General Retail'
  },
  {
    name: 'Walmart',
    url: 'https://www.walmart.com',
    expectedCategories: 8,
    timeout: 10000,
    category: 'General Retail'
  },
  {
    name: 'Amazon',
    url: 'https://www.amazon.com',
    expectedCategories: 12,
    timeout: 8000,
    category: 'General Retail'
  },
  
  // Home Improvement & Electronics
  {
    name: 'Home Depot',
    url: 'https://www.homedepot.com',
    expectedCategories: 8,
    timeout: 12000,
    category: 'Home Improvement'
  },
  {
    name: 'Lowe\'s',
    url: 'https://www.lowes.com',
    expectedCategories: 8,
    timeout: 10000,
    category: 'Home Improvement'
  },
  {
    name: 'Best Buy',
    url: 'https://www.bestbuy.com',
    expectedCategories: 8,
    timeout: 10000,
    category: 'Electronics'
  },
  
  // Sports & Lifestyle
  {
    name: 'Nike',
    url: 'https://www.nike.com',
    expectedCategories: 6,
    timeout: 10000,
    category: 'Sports'
  },
  {
    name: 'REI',
    url: 'https://www.rei.com',
    expectedCategories: 8,
    timeout: 10000,
    category: 'Outdoor'
  },
  
  // Specialty & Beauty
  {
    name: 'Sephora',
    url: 'https://www.sephora.com',
    expectedCategories: 6,
    timeout: 10000,
    category: 'Beauty'
  },
  {
    name: 'IKEA',
    url: 'https://www.ikea.com',
    expectedCategories: 8,
    timeout: 12000,
    category: 'Furniture'
  },
  
  // Baseline (known working)
  {
    name: 'Glasswing (baseline)',
    url: 'https://glasswingshop.com',
    expectedCategories: 5,
    timeout: 6000,
    category: 'Baseline'
  }
];

async function testAdaptiveStrategy() {
  console.log('🧭 Testing AdaptiveNavigationStrategy on Enterprise Sites\n');
  
  const results = [];
  
  for (const site of testSites) {
    console.log(`\n🔍 Testing ${site.name} (${site.url})`);
    console.log('='.repeat(50));
    
    const result = await testSingleSite(site);
    results.push({
      site: site.name,
      ...result
    });
    
    // Brief pause between sites
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary report grouped by category
  console.log('\n📊 ENTERPRISE NAVIGATION DISCOVERY RESULTS');
  console.log('==========================================');
  
  // Group results by category
  const byCategory = {};
  results.forEach((result, index) => {
    const siteConfig = testSites[index];
    const category = siteConfig.category || 'Unknown';
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push({ ...result, category: siteConfig.category });
  });
  
  // Display results by category
  Object.entries(byCategory).forEach(([category, categoryResults]) => {
    console.log(`\n🏷️  ${category.toUpperCase()}`);
    console.log('-'.repeat(category.length + 4));
    
    categoryResults.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const coverage = result.itemsFound >= result.expectedCategories ? '🎯' : '📊';
      
      console.log(`${status} ${coverage} ${result.site}: ${result.itemsFound} items in ${result.duration}ms`);
      
      if (result.metadata) {
        console.log(`    Strategy: ${result.metadata.strategy}`);
        console.log(`    Header: ${result.metadata.headerUsed}`);
        console.log(`    Interaction: ${result.metadata.siteInteractionMode || 'unknown'}`);
        
        if (result.metadata.failure_reason) {
          console.log(`    Failure: ${result.metadata.failure_reason}`);
        }
      }
      
      if (result.sampleItems && result.sampleItems.length > 0) {
        console.log(`    Sample: ${result.sampleItems.slice(0, 4).join(', ')}${result.sampleItems.length > 4 ? '...' : ''}`);
      }
    });
  });
  
  // Calculate success metrics
  const successCount = results.filter(r => r.success).length;
  const totalSites = results.length;
  const averageItems = results.reduce((sum, r) => sum + r.itemsFound, 0) / totalSites;
  const averageTime = results.reduce((sum, r) => sum + r.duration, 0) / totalSites;
  
  console.log(`\n📈 SUMMARY METRICS:`);
  console.log(`Success Rate: ${successCount}/${totalSites} (${((successCount/totalSites) * 100).toFixed(1)}%)`);
  console.log(`Average Items: ${averageItems.toFixed(1)}`);
  console.log(`Average Time: ${averageTime.toFixed(0)}ms`);
  
  // Identify improvement areas
  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    console.log(`\n🔧 IMPROVEMENT OPPORTUNITIES:`);
    failed.forEach(result => {
      console.log(`- ${result.site}: ${result.metadata?.failure_reason || 'unknown failure'}`);
    });
  }
  
  return results;
}

async function testSingleSite(siteConfig) {
  // Use headful mode for problematic sites that might have anti-bot detection
  const problematicSites = []; // Sites that need headful mode
  const skipSites = ['walmart.com']; // Sites with dynamic content rotation - skip for now
  const mobileOnlySites = ['macys.com', 'homedepot.com', 'amazon.com', 'bestbuy.com', 'lowes.com']; // Sites that need mobile user agent
  const isProblematic = problematicSites.some(site => siteConfig.url.includes(site));
  const shouldSkip = skipSites.some(site => siteConfig.url.includes(site));
  const needsMobile = mobileOnlySites.some(site => siteConfig.url.includes(site));
  
  // Skip sites with dynamic content rotation
  if (shouldSkip) {
    console.log(`⏭️ Skipping ${siteConfig.name} (dynamic content rotation)`);
    return {
      success: false,
      itemsFound: 0,
      expectedCategories: siteConfig.expectedCategories,
      duration: 0,
      confidence: 0,
      metadata: { failure_reason: 'skipped_dynamic_content' },
      sampleItems: []
    };
  }
  
  const launchOptions = {
    headless: !isProblematic, // headful for problematic sites
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };
  
  // Enhanced stealth for problematic sites
  if (isProblematic) {
    launchOptions.args.push(
      '--disable-blink-features=AutomationControlled',
      '--disable-features=VizDisplayCompositor',
      '--disable-web-security',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection'
    );
  }
  
  const browser = await chromium.launch(launchOptions);
  
  const contextOptions = {
    viewport: needsMobile ? { width: 375, height: 812 } : { width: 1366, height: 900 },
    userAgent: needsMobile ? 
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1' :
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
  
  // Enhanced stealth context for problematic sites
  if (isProblematic) {
    contextOptions.locale = 'en-US';
    contextOptions.timezoneId = 'America/New_York';
    contextOptions.extraHTTPHeaders = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };
  }
  
  const context = await browser.newContext(contextOptions);
  
  const page = await context.newPage();
  
  // Block unnecessary resources for speed
  await page.route('**/*', (route) => {
    const resourceType = route.request().resourceType();
    if (['image', 'font', 'media'].includes(resourceType)) {
      route.abort();
    } else {
      route.continue();
    }
  });
  
  try {
    const startTime = Date.now();
    
    // Navigate to site with better waiting
    await page.goto(siteConfig.url, { 
      waitUntil: 'domcontentloaded',
      timeout: siteConfig.timeout 
    });
    
    // For problematic sites, wait for network activity to settle
    if (isProblematic) {
      try {
        await page.waitForLoadState('networkidle', { timeout: 5000 });
      } catch (e) {
        // Continue if networkidle times out
      }
    }
    
    // Wait for any initial animations and dynamic content
    await page.waitForTimeout(isProblematic ? 2000 : 1000);
    
    // Dismiss any popups/modals
    await dismissPopups(page);
    
    // Create and test adaptive strategy
    const strategy = new AdaptiveNavigationStrategy(logger, {
      hintCache: mockCache,
      maxSiteTime: 6000,
      maxTogglersToSample: 2
    });
    
    const result = await strategy.execute(page);
    const duration = Date.now() - startTime;
    
    // Extract sample item names
    const sampleItems = result.items.slice(0, 6).map(item => item.name);
    
    return {
      success: result.items.length >= Math.min(5, siteConfig.expectedCategories),
      itemsFound: result.items.length,
      expectedCategories: siteConfig.expectedCategories,
      duration: duration,
      confidence: result.confidence,
      metadata: result.metadata,
      sampleItems: sampleItems
    };
    
  } catch (error) {
    console.log(`❌ Error testing ${siteConfig.name}: ${error.message}`);
    
    return {
      success: false,
      itemsFound: 0,
      expectedCategories: siteConfig.expectedCategories,
      duration: 0,
      confidence: 0,
      metadata: { failure_reason: error.message },
      sampleItems: []
    };
    
  } finally {
    await browser.close();
  }
}

async function dismissPopups(page) {
  try {
    // Common popup dismissal patterns
    const dismissSelectors = [
      'button[aria-label*="close"]',
      'button[aria-label*="Close"]',
      '.modal-close',
      '.popup-close',
      '[data-dismiss="modal"]',
      '.close-button',
      'button:has-text("Close")',
      'button:has-text("No Thanks")',
      'button:has-text("Continue")'
    ];
    
    for (const selector of dismissSelectors) {
      try {
        const button = await page.locator(selector).first();
        if (await button.isVisible({ timeout: 500 })) {
          await button.click();
          await page.waitForTimeout(300);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    // Try clicking outside if modal overlay exists
    const overlay = await page.locator('.modal-backdrop, .overlay, [class*="modal"]').first();
    if (await overlay.isVisible({ timeout: 500 })) {
      await page.click('body', { position: { x: 10, y: 10 } });
      await page.waitForTimeout(300);
    }
    
  } catch (error) {
    // Ignore popup dismissal errors
  }
}

if (require.main === module) {
  testAdaptiveStrategy()
    .then((results) => {
      console.log('\n✅ Enterprise navigation testing completed');
      
      // Exit with appropriate code
      const successRate = results.filter(r => r.success).length / results.length;
      process.exit(successRate >= 0.7 ? 0 : 1); // 70% success threshold
    })
    .catch(error => {
      console.error('\n💥 Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = { testAdaptiveStrategy, testSingleSite };