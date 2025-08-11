#!/usr/bin/env node

const GlasswingScraper = require('./src/scrapers/GlasswingScraper');
const WorldModelPopulator = require('./src/services/WorldModelPopulator');

// Simple logger for testing
const logger = {
  info: (...args) => console.log(`[INFO] ${new Date().toISOString()}:`, ...args),
  error: (...args) => console.error(`[ERROR] ${new Date().toISOString()}:`, ...args),
  warn: (...args) => console.warn(`[WARN] ${new Date().toISOString()}:`, ...args),
  debug: (...args) => console.log(`[DEBUG] ${new Date().toISOString()}:`, ...args)
};

async function testDynamicCollections() {
  const scraper = new GlasswingScraper(logger);
  
  try {
    console.log('🚀 Testing Dynamic Collection Support\n');
    console.log('=====================================\n');

    // Test different collections
    const testCollections = [
      {
        name: 'Accessories For Her',
        url: '/collections/accessories-for-her',
        maxProducts: 5
      },
      {
        name: 'All Shoes', 
        url: '/collections/all-shoes',
        maxProducts: 5
      },
      {
        name: 'Another Feather',
        url: '/collections/another-feather', 
        maxProducts: 5
      }
    ];

    const results = [];

    for (let i = 0; i < testCollections.length; i++) {
      const collection = testCollections[i];
      
      console.log(`\n📁 Testing Collection ${i + 1}/${testCollections.length}: ${collection.name}`);
      console.log(`   URL: ${collection.url}`);
      console.log(`   Max Products: ${collection.maxProducts}\n`);

      try {
        const startTime = Date.now();
        
        // Test the scraping with dynamic collection
        const result = await scraper.scrapeFirstProducts(collection.url, collection.maxProducts);
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(1);

        console.log(`✅ Collection "${collection.name}" completed in ${duration}s`);
        console.log(`   Products found: ${result.summary.totalProductsFound}`);
        console.log(`   Products scraped: ${result.summary.detailedProductPages}`);
        console.log(`   Success rate: ${result.summary.successfulScrapes}/${result.summary.detailedProductPages} (${((result.summary.successfulScrapes / result.summary.detailedProductPages) * 100).toFixed(1)}%)`);

        results.push({
          collection: collection.name,
          url: collection.url,
          duration: duration,
          ...result.summary
        });

        // Short delay between collections
        if (i < testCollections.length - 1) {
          console.log('   Waiting 3 seconds before next collection...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

      } catch (error) {
        console.error(`❌ Failed to scrape collection "${collection.name}":`, error.message);
        results.push({
          collection: collection.name,
          url: collection.url,
          error: error.message
        });
      }
    }

    // Summary
    console.log('\n📊 DYNAMIC COLLECTION TEST RESULTS');
    console.log('==================================\n');

    const successful = results.filter(r => !r.error);
    const failed = results.filter(r => r.error);

    console.log(`Collections tested: ${results.length}`);
    console.log(`Successful: ${successful.length}`);
    console.log(`Failed: ${failed.length}\n`);

    if (successful.length > 0) {
      console.log('✅ Successful Collections:');
      successful.forEach(result => {
        console.log(`   • ${result.collection}: ${result.successfulScrapes}/${result.detailedProductPages} products (${result.duration}s)`);
      });
    }

    if (failed.length > 0) {
      console.log('\n❌ Failed Collections:');
      failed.forEach(result => {
        console.log(`   • ${result.collection}: ${result.error}`);
      });
    }

    const totalProducts = successful.reduce((sum, r) => sum + r.successfulScrapes, 0);
    const totalTime = successful.reduce((sum, r) => sum + parseFloat(r.duration), 0);

    console.log(`\n📈 Overall Statistics:`);
    console.log(`   Total products scraped: ${totalProducts}`);
    console.log(`   Total time: ${totalTime.toFixed(1)}s`);
    console.log(`   Average time per collection: ${(totalTime / successful.length).toFixed(1)}s`);
    console.log(`   Average products per collection: ${(totalProducts / successful.length).toFixed(1)}`);

    // Test successful if all collections worked
    if (failed.length === 0) {
      console.log('\n🎉 All collections tested successfully! Dynamic collection support is working.');
      return true;
    } else {
      console.log('\n⚠️  Some collections failed. Dynamic collection support needs debugging.');
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
  testDynamicCollections()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test crashed:', error);
      process.exit(1);
    });
}

module.exports = { testDynamicCollections };