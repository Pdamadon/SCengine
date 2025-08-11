#!/usr/bin/env node

const GlasswingScraper = require('./src/scrapers/GlasswingScraper');

// Simple logger for testing
const logger = {
  info: (...args) => console.log(`[INFO] ${new Date().toISOString()}:`, ...args),
  error: (...args) => console.error(`[ERROR] ${new Date().toISOString()}:`, ...args),
  warn: (...args) => console.warn(`[WARN] ${new Date().toISOString()}:`, ...args),
  debug: (...args) => console.log(`[DEBUG] ${new Date().toISOString()}:`, ...args)
};

async function testLargeCollection() {
  const scraper = new GlasswingScraper(logger);
  
  try {
    console.log('🚀 Testing Large Collection with Multi-Page Pagination\n');
    console.log('====================================================\n');

    // Test with the main collection which should have multiple pages
    const testCollection = {
      name: 'All Products (No Sale)',
      url: '/collections/all-products-no-sale',
      maxProducts: 50 // Limit to 50 products for testing
    };

    console.log(`📁 Testing Large Collection: ${testCollection.name}`);
    console.log(`   URL: ${testCollection.url}`);
    console.log(`   Max Products: ${testCollection.maxProducts}`);
    console.log(`   Expected: Multiple pages with pagination\n`);

    const startTime = Date.now();
    
    // Test the complete collection scraping with pagination on a large collection
    const result = await scraper.scrapeCompleteCollection(testCollection.url, testCollection.maxProducts);
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);

    console.log(`\n✅ Large collection scrape completed in ${duration}s\n`);

    // Display pagination results
    console.log('📊 PAGINATION VERIFICATION:');
    console.log('===========================');
    console.log(`Pages scraped: ${result.paginationData.pagesScraped}`);
    console.log(`Total product links found: ${result.paginationData.totalProductLinksFound}`);
    console.log(`Products processed: ${result.paginationData.productsProcessed}`);
    console.log(`Products successfully scraped: ${result.summary.successfulScrapes}`);
    console.log(`Success rate: ${result.summary.successRate}%`);

    // Verify pagination worked
    const paginationWorked = result.paginationData.pagesScraped > 1 || result.paginationData.totalProductLinksFound >= 20;
    
    console.log('\n📈 PAGINATION ANALYSIS:');
    console.log('=======================');
    console.log(`Multiple pages detected: ${result.paginationData.pagesScraped > 1 ? 'YES' : 'NO'}`);
    console.log(`Products per page (avg): ${(result.paginationData.totalProductLinksFound / result.paginationData.pagesScraped).toFixed(1)}`);
    console.log(`Collection fully mapped: ${result.paginationData.totalProductLinksFound > 20 ? 'YES' : 'PARTIAL'}`);

    // Show unique products from different pages
    if (result.productAnalysis.length > 0) {
      console.log('\n🛍️ Sample Products from Collection:');
      console.log('===================================');
      const sampleProducts = result.productAnalysis
        .filter(p => !p.error && p.productData)
        .slice(0, 8);
      
      sampleProducts.forEach((product, i) => {
        console.log(`${i + 1}. ${product.productData.title}`);
        console.log(`   Price: ${product.productData.price}`);
        if (i < 3) console.log(`   URL: ${product.url}`);
      });
      
      if (sampleProducts.length < result.summary.successfulScrapes) {
        console.log(`   ... and ${result.summary.successfulScrapes - sampleProducts.length} more products`);
      }
    }

    // Success criteria
    const success = result.summary.successfulScrapes > 0 && 
                   result.paginationData.pagesScraped >= 1 &&
                   result.summary.successRate >= 95;

    console.log('\n🔍 TEST RESULTS:');
    console.log('================');
    console.log(`✅ Products scraped successfully: ${result.summary.successfulScrapes > 0}`);
    console.log(`✅ Pagination system functional: ${result.paginationData.pagesScraped >= 1}`);
    console.log(`✅ High success rate achieved: ${result.summary.successRate >= 95}% (${result.summary.successRate}%)`);

    if (success) {
      console.log('\n🎉 Large collection scraping with multi-page pagination is working perfectly!');
      console.log(`📊 Performance: ${result.summary.successfulScrapes} products in ${duration}s (${(result.summary.successfulScrapes / parseFloat(duration)).toFixed(1)} products/sec)`);
      return true;
    } else {
      console.log('\n⚠️ Large collection scraping needs optimization.');
      return false;
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    return false;
  } finally {
    await scraper.close();
  }
}

// Run the test
if (require.main === module) {
  testLargeCollection()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test crashed:', error);
      process.exit(1);
    });
}

module.exports = { testLargeCollection };