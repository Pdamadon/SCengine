#!/usr/bin/env node

require('dotenv').config();

const SimpleCategoryDeduplicator = require('../../src/common/SimpleCategoryDeduplicator');
const FilterDiscoveryStrategy = require('../../src/core/discovery/strategies/exploration/FilterDiscoveryStrategy');
const BrowserManagerBrowserless = require('../../src/common/browser/managers/BrowserManagerBrowserless');
const { logger } = require('../../src/utils/logger');

async function testRealCategoryDeduplication() {
  console.log('🧪 Testing CategoryDeduplicator with REAL Fig & Willow Data');
  console.log('=======================================================\n');

  const browserManager = new BrowserManagerBrowserless({
    logger: logger,
    maxConcurrentPages: 1,
    browserTimeout: 60000
  });

  const filterStrategy = new FilterDiscoveryStrategy({
    logger: logger,
    maxFilters: 50 // Get lots of categories
  });

  const deduplicator = new SimpleCategoryDeduplicator({
    logger: {
      info: console.log,
      debug: console.log,
      warn: console.warn,
      error: console.error
    }
  });

  try {
    const { page, close } = await browserManager.createBrowser('stealth');
    
    // Step 1: Discover categories from main collections page
    console.log('📋 Step 1: Discovering categories from main collections page');
    console.log('==========================================================');
    
    const collectionsUrl = 'https://shopfigandwillow.com/collections';
    await page.goto(collectionsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Extract navigation categories
    console.log('🔍 Extracting main navigation categories...');
    const navCategories = await page.evaluate(() => {
      const categories = [];
      
      // Look for main navigation links
      const navSelectors = [
        'nav a[href*="/collections/"]',
        '.main-nav a[href*="/collections/"]',
        '.navigation a[href*="/collections/"]',
        'header a[href*="/collections/"]',
        '.menu a[href*="/collections/"]'
      ];
      
      navSelectors.forEach(selector => {
        try {
          const links = document.querySelectorAll(selector);
          links.forEach(link => {
            if (link.href && link.textContent.trim()) {
              categories.push({
                name: link.textContent.trim(),
                url: link.href,
                source: 'main_navigation'
              });
            }
          });
        } catch (e) {
          // Skip selector if it fails
        }
      });
      
      return categories;
    });

    console.log(`Found ${navCategories.length} navigation categories:`);
    navCategories.forEach((cat, i) => {
      console.log(`  ${i + 1}. "${cat.name}" → ${cat.url}`);
    });

    // Step 2: Discover filter categories
    console.log('\n📋 Step 2: Discovering filter dropdown categories');
    console.log('===============================================');
    
    const topsUrl = 'https://shopfigandwillow.com/collections/tops';
    await page.goto(topsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    console.log('🔍 Using FilterDiscoveryStrategy to find filter categories...');
    const filterResults = await filterStrategy.discoverFilterCandidates(page, topsUrl);
    
    // Convert filter candidates to categories
    const filterCategories = [];
    if (filterResults.candidates) {
      filterResults.candidates.forEach(candidate => {
        if (candidate.href && candidate.label) {
          filterCategories.push({
            name: candidate.label,
            url: candidate.href,
            source: 'filter_dropdown'
          });
        } else if (candidate.label && !candidate.label.toLowerCase().includes('size')) {
          // Category-type filters without direct URLs
          filterCategories.push({
            name: candidate.label,
            url: `${topsUrl}?filter=${encodeURIComponent(candidate.label)}`,
            source: 'filter_category'
          });
        }
      });
    }

    console.log(`Found ${filterCategories.length} filter categories:`);
    filterCategories.forEach((cat, i) => {
      console.log(`  ${i + 1}. "${cat.name}" → ${cat.url}`);
    });

    // Step 3: Extract categories from any dropdown menus
    console.log('\n📋 Step 3: Looking for dropdown menu categories');
    console.log('==============================================');
    
    // Check for category listings on collections page
    await page.goto('https://shopfigandwillow.com/collections', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const collectionCategories = await page.evaluate(() => {
      const categories = [];
      
      // Look for collection grid items
      const collectionSelectors = [
        '.collection-item a',
        '.collection-grid a', 
        '.collections-grid a',
        '.category-item a',
        '.collection-list a',
        'a[href*="/collections/"]:not([href$="/collections"])'
      ];
      
      collectionSelectors.forEach(selector => {
        try {
          const links = document.querySelectorAll(selector);
          links.forEach(link => {
            if (link.href && link.textContent.trim()) {
              const name = link.textContent.trim();
              // Skip if it's just "Shop" or very generic
              if (name.length > 2 && !name.toLowerCase().includes('view all')) {
                categories.push({
                  name: name,
                  url: link.href,
                  source: 'collections_page'
                });
              }
            }
          });
        } catch (e) {
          // Skip selector if it fails
        }
      });
      
      return categories;
    });

    console.log(`Found ${collectionCategories.length} collection page categories:`);
    collectionCategories.forEach((cat, i) => {
      console.log(`  ${i + 1}. "${cat.name}" → ${cat.url}`);
    });

    await close();

    // Step 4: Combine all discovered categories (with intentional duplicates)
    console.log('\n📋 Step 4: Combining all discovered categories');
    console.log('===========================================');
    
    const allCategories = [
      ...navCategories,
      ...filterCategories, 
      ...collectionCategories
    ];

    console.log(`\nTotal categories discovered: ${allCategories.length}`);
    console.log('Sources breakdown:');
    const sourceCounts = {};
    allCategories.forEach(cat => {
      sourceCounts[cat.source] = (sourceCounts[cat.source] || 0) + 1;
    });
    Object.entries(sourceCounts).forEach(([source, count]) => {
      console.log(`  ${source}: ${count} categories`);
    });

    // Look for potential duplicates
    const urlCounts = {};
    const nameCounts = {};
    allCategories.forEach(cat => {
      const normalizedUrl = cat.url.toLowerCase().split('?')[0]; // Remove query params
      const normalizedName = cat.name.toLowerCase().trim();
      
      urlCounts[normalizedUrl] = (urlCounts[normalizedUrl] || 0) + 1;
      nameCounts[normalizedName] = (nameCounts[normalizedName] || 0) + 1;
    });

    const duplicateUrls = Object.entries(urlCounts).filter(([url, count]) => count > 1);
    const duplicateNames = Object.entries(nameCounts).filter(([name, count]) => count > 1);
    
    console.log(`\nPotential duplicates found:`);
    console.log(`  Duplicate URLs: ${duplicateUrls.length}`);
    console.log(`  Duplicate names: ${duplicateNames.length}`);
    
    if (duplicateUrls.length > 0) {
      console.log('\nDuplicate URLs:');
      duplicateUrls.forEach(([url, count]) => {
        console.log(`  "${url}" appears ${count} times`);
      });
    }

    // Step 5: Apply CategoryDeduplicator
    console.log('\n📋 Step 5: Applying CategoryDeduplicator');
    console.log('======================================');
    
    const results = deduplicator.deduplicate(allCategories);
    const stats = deduplicator.getStats(results);
    
    console.log(`\nDeduplication Results:`);
    console.log(`  Input categories: ${allCategories.length}`);
    console.log(`  Output categories: ${results.length}`);
    console.log(`  Should crawl: ${stats.crawl}`);
    console.log(`  Should skip: ${stats.skip}`);
    console.log(`  Efficiency gain: ${stats.efficiency}%`);

    // Show final category list to crawl
    const shouldCrawl = results.filter(r => r.shouldCrawl);
    const shouldSkip = results.filter(r => !r.shouldCrawl);
    
    console.log(`\n✅ Final Categories to Crawl (${shouldCrawl.length}):`);
    shouldCrawl.forEach((cat, i) => {
      console.log(`  ${i + 1}. "${cat.name}" → ${cat.url} (${cat.source})`);
    });
    
    if (shouldSkip.length > 0) {
      console.log(`\n❌ Categories Skipped as Duplicates (${shouldSkip.length}):`);
      shouldSkip.forEach((cat, i) => {
        console.log(`  ${i + 1}. "${cat.name}" → ${cat.reason} (${cat.source})`);
      });
    }

    // Validation
    const success = shouldCrawl.length > 5 && stats.efficiency > 0; // Should find several categories and some efficiency
    
    console.log(`\n${success ? '✅' : '❌'} Test Result: ${success ? 'SUCCESS' : 'FAILED'}`);
    
    if (success) {
      console.log('\n🎉 Real CategoryDeduplicator test successful!');
      console.log('📈 Benefits:');
      console.log(`  - Discovered ${shouldCrawl.length} unique categories`);
      console.log(`  - Eliminated ${shouldSkip.length} duplicate crawls`);
      console.log(`  - ${stats.efficiency}% crawling efficiency gain`);
      console.log('  - Real site data validation complete');
    }

    return {
      success,
      totalDiscovered: allCategories.length,
      uniqueCategories: shouldCrawl.length,
      duplicatesRemoved: shouldSkip.length,
      efficiency: stats.efficiency,
      categories: shouldCrawl
    };

  } catch (error) {
    console.error('💥 Test failed:', error.message);
    console.error('Stack:', error.stack);
    return { success: false, error: error.message };
  }
}

// Run the test
if (require.main === module) {
  testRealCategoryDeduplication()
    .then(result => {
      console.log(`\n${'='.repeat(60)}`);
      if (result.success) {
        console.log('🎉 REAL CATEGORY DEDUPLICATION TEST: PASSED');
        console.log(`📊 Discovered ${result.totalDiscovered} → ${result.uniqueCategories} unique categories`);
        console.log(`⚡ ${result.duplicatesRemoved} duplicates eliminated (${result.efficiency}% efficiency)`);
      } else {
        console.log('❌ REAL CATEGORY DEDUPLICATION TEST: FAILED');
        if (result.error) {
          console.log(`Error: ${result.error}`);
        }
      }
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test crashed:', error);
      process.exit(1);
    });
}

module.exports = { testRealCategoryDeduplication };