#!/usr/bin/env node

const GlasswingScraper = require('./src/scrapers/GlasswingScraper');

// Simple logger for testing
const logger = {
  info: (...args) => console.log(`[INFO] ${new Date().toISOString()}:`, ...args),
  error: (...args) => console.error(`[ERROR] ${new Date().toISOString()}:`, ...args),
  warn: (...args) => console.warn(`[WARN] ${new Date().toISOString()}:`, ...args),
  debug: (...args) => console.log(`[DEBUG] ${new Date().toISOString()}:`, ...args)
};

async function testCompleteCollection() {
  const scraper = new GlasswingScraper(logger);
  
  try {
    console.log('🚀 Testing Complete Collection Scraping with Pagination\n');
    console.log('=====================================================\n');

    // Test with a smaller collection first to verify pagination works
    const testCollection = {
      name: 'Another Feather',
      url: '/collections/another-feather',
      maxProducts: 50 // More than what's on one page to test pagination
    };

    console.log(`📁 Testing Collection: ${testCollection.name}`);
    console.log(`   URL: ${testCollection.url}`);
    console.log(`   Max Products: ${testCollection.maxProducts}\n`);

    const startTime = Date.now();
    
    // Test the complete collection scraping with pagination
    const result = await scraper.scrapeCompleteCollection(testCollection.url, testCollection.maxProducts);
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);

    console.log(`\n✅ Complete collection scrape completed in ${duration}s\n`);

    // Display results
    console.log('📊 PAGINATION RESULTS:');
    console.log('======================');
    console.log(`Pages scraped: ${result.paginationData.pagesScraped}`);
    console.log(`Total product links found: ${result.paginationData.totalProductLinksFound}`);
    console.log(`Products processed: ${result.paginationData.productsProcessed}`);
    console.log(`Products successfully scraped: ${result.summary.successfulScrapes}`);
    console.log(`Success rate: ${result.summary.successRate}%`);

    console.log('\n📈 SUMMARY:');
    console.log('============');
    console.log(`Collection: ${result.collection}`);
    console.log(`Duration: ${duration}s`);
    console.log(`Pages: ${result.paginationData.pagesScraped}`);
    console.log(`Products found: ${result.summary.totalProductsFound}`);
    console.log(`Products scraped: ${result.summary.successfulScrapes}/${result.summary.detailedProductPages}`);

    // Show some sample products
    if (result.productAnalysis.length > 0) {
      console.log('\n🛍️ Sample Products:');
      console.log('==================');
      const sampleProducts = result.productAnalysis
        .filter(p => !p.error && p.productData)
        .slice(0, 5);
      
      sampleProducts.forEach((product, i) => {
        console.log(`${i + 1}. ${product.productData.title}`);
        console.log(`   Price: ${product.productData.price}`);
        console.log(`   URL: ${product.url}`);
      });
    }

    // Test successful if we got products and pagination worked
    if (result.summary.successfulScrapes > 0 && result.paginationData.pagesScraped > 0) {
      console.log('\n🎉 Complete collection scraping with pagination is working!');
      return true;
    } else {
      console.log('\n⚠️ Complete collection scraping needs debugging.');
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
  testCompleteCollection()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test crashed:', error);
      process.exit(1);
    });
}

module.exports = { testCompleteCollection };