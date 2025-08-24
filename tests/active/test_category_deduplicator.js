#!/usr/bin/env node

require('dotenv').config();

const CategoryDeduplicator = require('../../src/common/CategoryDeduplicator');
const { logger } = require('../../src/utils/logger');

async function testCategoryDeduplicator() {
  console.log('🧪 Testing CategoryDeduplicator with Fashion Site Scenarios');
  console.log('=======================================================\n');

  const deduplicator = new CategoryDeduplicator({
    sampleSize: 10, // Small sample for testing
    aliasThreshold: 0.9,
    supersetThreshold: 0.6, // Lower threshold for testing
    logger: {
      info: console.log,
      debug: console.log,
      warn: console.warn,
      error: console.error
    }
  });

  // Test Case 1: Fig & Willow scenario from dropdown screenshots
  console.log('📋 Test Case 1: Fig & Willow Dropdown Deduplication');
  console.log('==================================================');
  
  const figWillowCategories = [
    // From "All Clothing" dropdown
    { name: 'Blouses', url: '/collections/blouses', products: ['blouse1.html', 'blouse2.html', 'blouse3.html'] },
    { name: 'Bodysuits', url: '/collections/bodysuits', products: ['bodysuit1.html', 'bodysuit2.html'] },
    { name: 'Cardigans', url: '/collections/cardigans', products: ['cardigan1.html', 'cardigan2.html', 'cardigan3.html'] },
    
    // Generic "Tops" that should become structural-only
    { name: 'Tops', url: '/collections/tops', products: ['mens-top1.html', 'mens-top2.html', 'womens-top1.html', 'womens-top2.html'] },
    
    // Generic "Dresses" with high overlap with women's variant  
    { name: 'Dresses', url: '/collections/dresses', products: ['womens-dress1.html', 'womens-dress2.html', 'womens-dress3.html', 'unique-dress1.html'] },
    
    // From "Mens" dropdown (hypothetical)
    { name: "Men's Tops", url: '/collections/mens-tops', products: ['mens-top1.html', 'mens-top2.html', 'mens-top3.html'] },
    { name: "Men's Pants", url: '/collections/mens-pants', products: ['mens-pant1.html', 'mens-pant2.html'] },
    
    // From "Womens" dropdown
    { name: "Women's Tops", url: '/collections/womens-tops', products: ['womens-top1.html', 'womens-top2.html', 'womens-top4.html'] },
    { name: "Women's Dresses", url: '/collections/womens-dresses', products: ['womens-dress1.html', 'womens-dress2.html', 'womens-dress3.html'] },
    
    // Generic "All Clothing" that should be structural-only (superset)
    { name: 'All Clothing', url: '/collections/all', products: ['mens-top1.html', 'womens-top1.html', 'dress1.html', 'blouse1.html', 'cardigan1.html', 'unique-item1.html'] }
  ];

  try {
    console.log(`Input categories: ${figWillowCategories.length}`);
    figWillowCategories.forEach((cat, i) => {
      console.log(`  ${i + 1}. "${cat.name}" (${cat.products.length} products)`);
    });

    const results = await deduplicator.deduplicate(figWillowCategories);
    
    console.log('\n📊 Deduplication Results:');
    console.log('========================');
    
    const stats = deduplicator.getStats(results);
    console.log(`Total categories: ${stats.total}`);
    console.log(`Products crawl: ${stats.products}`);
    console.log(`Structural only: ${stats.structuralOnly}`);
    console.log(`Aliases: ${stats.aliases}`);
    
    console.log('\n🎯 Category Processing Results:');
    console.log('==============================');
    results.forEach((result, i) => {
      console.log(`${i + 1}. "${result.name}"`);
      console.log(`   Slug: ${result.slug}`);
      console.log(`   Qualifiers: ${JSON.stringify(result.qualifiers)}`);
      console.log(`   Crawl Mode: ${result.crawlMode}`);
      console.log(`   Reason: ${result.deduplicationReason}`);
      if (result.children) console.log(`   Children: ${result.children.join(', ')}`);
      if (result.aliasOf) console.log(`   Alias of: ${result.aliasOf}`);
      if (result.maxOverlap) console.log(`   Max overlap: ${(result.maxOverlap * 100).toFixed(1)}%`);
      console.log('');
    });

    // Test Case 2: Slug grouping validation
    console.log('\n📋 Test Case 2: Slug Grouping Analysis');
    console.log('=====================================');
    
    const slugGroups = {};
    results.forEach(result => {
      if (!slugGroups[result.slug]) slugGroups[result.slug] = [];
      slugGroups[result.slug].push(result.name);
    });
    
    Object.entries(slugGroups).forEach(([slug, names]) => {
      console.log(`Slug "${slug}": ${names.join(', ')}`);
    });

    // Test Case 3: Crawl efficiency analysis
    console.log('\n📋 Test Case 3: Crawl Efficiency Analysis');
    console.log('========================================');
    
    const productsCrawl = results.filter(r => r.crawlMode === 'products');
    const avoided = results.filter(r => r.crawlMode !== 'products');
    
    console.log(`Categories to crawl for products: ${productsCrawl.length}/${results.length}`);
    console.log(`Crawling avoided: ${avoided.length} categories`);
    console.log(`Efficiency gain: ${((avoided.length / results.length) * 100).toFixed(1)}%`);
    
    if (avoided.length > 0) {
      console.log('\nCrawling avoided for:');
      avoided.forEach(cat => {
        console.log(`  - "${cat.name}" (${cat.crawlMode}: ${cat.deduplicationReason})`);
      });
    }

    // Validation checks
    console.log('\n✅ Validation Checks:');
    console.log('====================');
    
    const checks = {
      'Specific categories preserved': results.some(r => r.qualifiers.gender === 'men' && r.crawlMode === 'products'),
      'Generic categories handled': results.some(r => r.name.includes('All') && r.crawlMode !== 'products'),
      'Taxonomy maintained': new Set(results.map(r => r.qualifiers.gender)).size > 1,
      'Slug deduplication working': Object.keys(slugGroups).length < figWillowCategories.length,
      'No products mode categories exist': productsCrawl.length > 0
    };
    
    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`  ${passed ? '✅' : '❌'} ${check}`);
    });

    const success = Object.values(checks).every(Boolean);
    
    console.log(`\n${success ? '✅' : '❌'} Overall Test Result: ${success ? 'SUCCESS' : 'FAILED'}`);
    
    if (success) {
      console.log('\n🎉 CategoryDeduplicator working correctly!');
      console.log('📈 Key benefits:');
      console.log('  - Taxonomy preserved (Men\'s vs Women\'s maintained)');
      console.log('  - Generic categories handled intelligently');
      console.log('  - Crawl efficiency improved');
      console.log('  - Ready for MegaNav dropdown integration');
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
  testCategoryDeduplicator()
    .then(result => {
      console.log(`\n${'='.repeat(60)}`);
      if (result.success) {
        console.log('🎉 CATEGORY DEDUPLICATOR TEST: PASSED');
        console.log(`📊 Processed ${result.stats?.total} categories`);
        console.log(`🎯 ${result.stats?.products} will be crawled for products`);
        console.log(`⚡ ${result.stats?.structuralOnly + result.stats?.aliases} avoided duplicate crawling`);
      } else {
        console.log('❌ CATEGORY DEDUPLICATOR TEST: FAILED');
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

module.exports = { testCategoryDeduplicator };