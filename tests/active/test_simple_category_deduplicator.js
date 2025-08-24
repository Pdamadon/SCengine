#!/usr/bin/env node

require('dotenv').config();

const SimpleCategoryDeduplicator = require('../../src/common/SimpleCategoryDeduplicator');
const { logger } = require('../../src/utils/logger');

async function testSimpleCategoryDeduplicator() {
  console.log('🧪 Testing SimpleCategoryDeduplicator');
  console.log('===================================\n');

  const deduplicator = new SimpleCategoryDeduplicator({
    logger: {
      info: console.log,
      debug: console.log,
      warn: console.warn,
      error: console.error
    }
  });

  // Test Case 1: Fig & Willow dropdown scenario
  console.log('📋 Test Case 1: Fig & Willow Dropdown Categories');
  console.log('================================================');
  
  const figWillowCategories = [
    // From main nav
    { name: 'Tops', url: '/collections/tops' },
    { name: 'Dresses', url: '/collections/dresses' },
    { name: 'Bottoms', url: '/collections/bottoms' },
    
    // From "All Clothing" dropdown - includes duplicates + hidden categories
    { name: 'Tops', url: '/collections/tops' }, // DUPLICATE
    { name: 'Dresses', url: '/collections/dresses' }, // DUPLICATE  
    { name: 'Blouses', url: '/collections/blouses' }, // HIDDEN category
    { name: 'T-Shirts', url: '/collections/t-shirts' }, // HIDDEN category
    { name: 'Sweaters', url: '/collections/sweaters' }, // HIDDEN category
    
    // From "Men's" dropdown - specific versions + new categories
    { name: "Men's Tops", url: '/collections/mens-tops' }, 
    { name: "Men's Pants", url: '/collections/mens-pants' },
    { name: "Men's Jackets", url: '/collections/mens-jackets' }, // NEW category
    
    // From "Women's" dropdown
    { name: "Women's Tops", url: '/collections/womens-tops' },
    { name: "Women's Dresses", url: '/collections/womens-dresses' },
    { name: "Women's Bottoms", url: '/collections/womens-bottoms' },
    
    // Generic version discovered elsewhere
    { name: 'All Clothing', url: '/collections/all' }
  ];

  console.log(`Input categories: ${figWillowCategories.length}`);
  figWillowCategories.forEach((cat, i) => {
    console.log(`  ${i + 1}. "${cat.name}" → ${cat.url}`);
  });

  try {
    const results = await deduplicator.deduplicate(figWillowCategories);
    
    console.log('\n📊 Simple Deduplication Results:');
    console.log('=================================');
    
    const stats = deduplicator.getStats(results);
    console.log(`Total categories: ${stats.total}`);
    console.log(`Should crawl: ${stats.crawl}`);
    console.log(`Should skip: ${stats.skip}`);
    console.log(`Efficiency gain: ${stats.efficiency}%`);
    
    console.log('\n🎯 Category Decisions:');
    console.log('=====================');
    results.forEach((result, i) => {
      const icon = result.shouldCrawl ? '✅' : '❌';
      console.log(`${i + 1}. ${icon} "${result.name}"`);
      console.log(`   URL: ${result.url}`);
      console.log(`   Should crawl: ${result.shouldCrawl}`);
      console.log(`   Reason: ${result.reason}`);
      if (result.alternates) console.log(`   Alternates: ${result.alternates.join(', ')}`);
      if (result.preferredAlternate) console.log(`   Preferred: ${result.preferredAlternate}`);
      console.log('');
    });

    // Test Case 2: Real-world complexity
    console.log('\n📋 Test Case 2: Complex Hierarchy');
    console.log('=================================');
    
    const complexCategories = [
      { name: 'Shop All', url: '/shop' },
      { name: 'Clothing', url: '/clothing' },
      { name: 'Tops', url: '/clothing/tops' },
      { name: 'Men\'s Clothing', url: '/mens' },
      { name: 'Men\'s Tops', url: '/mens/tops' },
      { name: 'Men\'s Casual Tops', url: '/mens/tops/casual' },
      { name: 'Women\'s Clothing', url: '/womens' },
      { name: 'Women\'s Tops', url: '/womens/tops' },
      { name: 'Kids', url: '/kids' },
      { name: 'Boys Tops', url: '/kids/boys/tops' },
      { name: 'Girls Tops', url: '/kids/girls/tops' }
    ];

    console.log(`\nComplex categories: ${complexCategories.length}`);
    const complexResults = await deduplicator.deduplicate(complexCategories);
    const complexStats = deduplicator.getStats(complexResults);
    
    console.log(`Crawl decisions: ${complexStats.crawl}/${complexStats.total} (${100 - complexStats.efficiency}% kept)`);
    
    const shouldCrawl = complexResults.filter(r => r.shouldCrawl);
    const shouldSkip = complexResults.filter(r => !r.shouldCrawl);
    
    console.log('\n✅ Categories to crawl:');
    shouldCrawl.forEach(cat => {
      console.log(`  - "${cat.name}" (${cat.reason})`);
    });
    
    if (shouldSkip.length > 0) {
      console.log('\n❌ Categories to skip:');
      shouldSkip.forEach(cat => {
        console.log(`  - "${cat.name}" (${cat.reason})`);
      });
    }

    // Validation checks
    console.log('\n✅ Validation Checks:');
    console.log('====================');
    
    const checks = {
      'Duplicates removed': figWillowCategories.length > results.length,
      'Hidden categories preserved': results.some(r => r.name === 'Blouses' && r.shouldCrawl),
      'Specific categories kept': results.some(r => r.name.includes('Men\'s') && r.shouldCrawl),
      'All unique categories preserved': stats.crawl >= 10, // Should have most categories
      'Some deduplication occurred': stats.skip > 0
    };
    
    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`  ${passed ? '✅' : '❌'} ${check}`);
    });

    const success = Object.values(checks).every(Boolean);
    
    console.log(`\n${success ? '✅' : '❌'} Overall Test Result: ${success ? 'SUCCESS' : 'FAILED'}`);
    
    if (success) {
      console.log('\n🎉 SimpleCategoryDeduplicator working correctly!');
      console.log('📈 Key benefits:');
      console.log('  - No hardcoded thresholds');
      console.log('  - Rules-based decisions');
      console.log('  - URL pattern recognition');
      console.log('  - Taxonomy preservation');
    }

    return { success, stats, results };
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    console.error('Stack:', error.stack);
    return { success: false, error: error.message };
  }
}

// Run the test
if (require.main === module) {
  testSimpleCategoryDeduplicator()
    .then(result => {
      console.log(`\n${'='.repeat(60)}`);
      if (result.success) {
        console.log('🎉 SIMPLE CATEGORY DEDUPLICATOR TEST: PASSED');
        console.log(`📊 Efficiency: ${result.stats?.efficiency}% reduction in crawls`);
        console.log(`🎯 ${result.stats?.crawl} categories will be crawled`);
      } else {
        console.log('❌ SIMPLE CATEGORY DEDUPLICATOR TEST: FAILED');
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

module.exports = { testSimpleCategoryDeduplicator };