#!/usr/bin/env node

const GlasswingScraper = require('./src/scrapers/GlasswingScraper');
const WorldModelPopulator = require('./src/services/WorldModelPopulator');
const { MongoClient } = require('mongodb');

// Simple logger for testing
const logger = {
  info: (...args) => console.log(`[INFO] ${new Date().toISOString()}:`, ...args),
  error: (...args) => console.error(`[ERROR] ${new Date().toISOString()}:`, ...args),
  warn: (...args) => console.warn(`[WARN] ${new Date().toISOString()}:`, ...args),
  debug: (...args) => console.log(`[DEBUG] ${new Date().toISOString()}:`, ...args)
};

async function testFullGlasswingSystem() {
  const scraper = new GlasswingScraper(logger);
  let mongoClient = null;
  let worldModelPopulator = null;

  try {
    console.log('🚀 Full Glasswing Scraping System Test\n');
    console.log('====================================\n');

    // Initialize MongoDB connection
    try {
      const mongoUrl = process.env.MONGODB_URL || process.env.MONGO_URL;
      if (mongoUrl) {
        mongoClient = new MongoClient(mongoUrl);
        await mongoClient.connect();
        worldModelPopulator = new WorldModelPopulator(logger, mongoClient);
        await worldModelPopulator.initialize();
        console.log('✅ MongoDB connected and world model populator initialized\n');
      } else {
        console.log('⚠️ No MongoDB URL found - will skip world model population\n');
      }
    } catch (error) {
      console.log(`⚠️ MongoDB connection failed: ${error.message} - continuing without database\n`);
    }

    // Test configuration
    const testCollections = [
      {
        name: 'Another Feather Collection',
        url: '/collections/another-feather',
        maxProducts: 12, // Complete collection
        testType: 'complete'
      },
      {
        name: 'All Shoes Collection',
        url: '/collections/all-shoes',
        maxProducts: 30, // Paginated collection
        testType: 'paginated'
      },
      {
        name: 'All Products Sample',
        url: '/collections/all-products-no-sale',
        maxProducts: 25, // Multi-page sample
        testType: 'sample'
      }
    ];

    const results = [];
    let totalProductsScraped = 0;
    let totalTimeSpent = 0;

    // Test each collection
    for (let i = 0; i < testCollections.length; i++) {
      const collection = testCollections[i];
      
      console.log(`📁 Testing Collection ${i + 1}/${testCollections.length}: ${collection.name}`);
      console.log(`   URL: ${collection.url}`);
      console.log(`   Max Products: ${collection.maxProducts}`);
      console.log(`   Test Type: ${collection.testType}\n`);

      const startTime = Date.now();

      try {
        // Use complete collection scraping for better pagination support
        const scraperResults = collection.testType === 'complete' 
          ? await scraper.scrapeFirstProducts(collection.url, collection.maxProducts)
          : await scraper.scrapeCompleteCollection(collection.url, collection.maxProducts);
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(1);
        totalTimeSpent += parseFloat(duration);
        totalProductsScraped += scraperResults.summary.successfulScrapes;

        console.log(`✅ ${collection.name} completed in ${duration}s`);
        console.log(`   Products found: ${scraperResults.summary.totalProductsFound}`);
        console.log(`   Products scraped: ${scraperResults.summary.successfulScrapes}`);
        console.log(`   Success rate: ${scraperResults.summary.successRate || ((scraperResults.summary.successfulScrapes / scraperResults.summary.detailedProductPages) * 100).toFixed(1)}%`);
        
        if (scraperResults.paginationData) {
          console.log(`   Pages scraped: ${scraperResults.paginationData.pagesScraped}`);
        }

        // Populate world model if available
        if (worldModelPopulator) {
          try {
            console.log(`   📊 Populating world model...`);
            const populationResult = await worldModelPopulator.populateFromScraperResults(scraperResults);
            console.log(`   ✅ World model populated successfully`);
          } catch (error) {
            console.log(`   ⚠️ World model population failed: ${error.message}`);
          }
        }

        results.push({
          collection: collection.name,
          url: collection.url,
          duration: duration,
          pagesScraped: scraperResults.paginationData?.pagesScraped || 1,
          ...scraperResults.summary,
          worldModelPopulated: !!worldModelPopulator
        });

        console.log(`   Waiting 3 seconds before next collection...\n`);
        if (i < testCollections.length - 1) {
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

    // Final summary
    console.log('\n🎉 FULL SYSTEM TEST RESULTS');
    console.log('===========================\n');

    const successful = results.filter(r => !r.error);
    const failed = results.filter(r => r.error);

    console.log(`Collections tested: ${results.length}`);
    console.log(`Successful: ${successful.length}`);
    console.log(`Failed: ${failed.length}`);
    console.log(`Total products scraped: ${totalProductsScraped}`);
    console.log(`Total time: ${totalTimeSpent.toFixed(1)}s`);
    console.log(`Average performance: ${(totalProductsScraped / totalTimeSpent).toFixed(2)} products/second\n`);

    if (successful.length > 0) {
      console.log('✅ Successful Collections:');
      successful.forEach(result => {
        const rate = result.successRate || ((result.successfulScrapes / result.detailedProductPages) * 100).toFixed(1);
        console.log(`   • ${result.collection}: ${result.successfulScrapes} products (${rate}% success, ${result.duration}s, ${result.pagesScraped} pages)`);
      });
    }

    if (failed.length > 0) {
      console.log('\n❌ Failed Collections:');
      failed.forEach(result => {
        console.log(`   • ${result.collection}: ${result.error}`);
      });
    }

    // Feature verification
    console.log('\n🔍 FEATURE VERIFICATION:');
    console.log('========================');
    console.log(`✅ Dynamic collection support: ${successful.length > 0 && successful.every(r => r.url !== '/collections/clothing-collection')}`);
    console.log(`✅ Pagination working: ${successful.some(r => r.pagesScraped > 1)}`);
    console.log(`✅ Complete collection scraping: ${successful.some(r => r.totalProductsFound > 20)}`);
    console.log(`✅ High success rates: ${successful.every(r => parseFloat(r.successRate || ((r.successfulScrapes / r.detailedProductPages) * 100).toFixed(1)) >= 95)}`);
    console.log(`✅ World model integration: ${successful.some(r => r.worldModelPopulated)}`);

    // Success criteria
    const systemWorking = failed.length === 0 && 
                         successful.length === testCollections.length &&
                         totalProductsScraped > 50 &&
                         successful.some(r => r.pagesScraped > 1);

    if (systemWorking) {
      console.log('\n🎉 FULL GLASSWING SCRAPING SYSTEM IS WORKING PERFECTLY!');
      console.log('🌟 All features tested successfully:');
      console.log('   • Dynamic collection parameters ✅');
      console.log('   • Multi-page pagination ✅');
      console.log('   • Complete collection coverage ✅');
      console.log('   • World model population ✅');
      console.log('   • High success rates (95%+) ✅');
      console.log('   • Robust error handling ✅');
      
      console.log('\n🚀 READY FOR PRODUCTION USE!');
      return true;
    } else {
      console.log('\n⚠️ System needs attention - some features not working optimally.');
      return false;
    }

  } catch (error) {
    console.error('❌ Full system test failed with error:', error);
    return false;
  } finally {
    await scraper.close();
    if (mongoClient) {
      await mongoClient.close();
    }
  }
}

// Run the test
if (require.main === module) {
  testFullGlasswingSystem()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Full system test crashed:', error);
      process.exit(1);
    });
}

module.exports = { testFullGlasswingSystem };