const axios = require('axios');

// Configure axios with longer timeouts
axios.defaults.timeout = 300000; // 5 minutes timeout per request
axios.defaults.headers.common['Content-Type'] = 'application/json';

// Major collections to scrape (avoiding the massive "all products" ones)
const collectionsToScrape = [
  { handle: '7115-by-szeki-1', name: '7115 by Szeki', products: 93 },
  { handle: '7115-by-szeki-archive', name: '7115 by Szeki Archive', products: 96 }, 
  { handle: 'accessories-for-her', name: 'Accessories For Her', products: 145 },
  { handle: 'mens-accessories', name: 'Accessories', products: 123 },
  { handle: 'aleph-geddis', name: 'Aleph Geddis', products: 65 },
  { handle: 'all-shoes', name: 'All Shoes', products: 64 },
  // Add a few more manageable collections
  { handle: 'agmes', name: 'Agmes', products: 34 },
  { handle: 'another-feather', name: 'Another Feather', products: 12 }
];

async function runComprehensiveScraping() {
  console.log('🚀 Starting comprehensive GlassWing scraping...');
  console.log(`📊 Target: ${collectionsToScrape.length} collections with ${collectionsToScrape.reduce((sum, c) => sum + c.products, 0)} total products`);
  
  const results = [];
  let totalProcessed = 0;
  let totalSuccessful = 0;
  
  for (const collection of collectionsToScrape) {
    console.log(`\n🛍️  Processing collection: ${collection.name} (${collection.products} products)`);
    console.log(`📋 Handle: /collections/${collection.handle}`);
    
    try {
      // For now, we'll use the existing API which scrapes clothing-collection
      // In a real implementation, we'd modify the scraper to accept collection parameter
      const maxProducts = Math.min(collection.products, 30); // Limit to 30 per collection for stability
      console.log(`⚙️  Requesting ${maxProducts} products with 5-minute timeout...`);
      
      const response = await axios.post('http://localhost:3000/api/scraping/scrape-and-populate', {
        site: 'glasswing',
        maxProducts: maxProducts
      }, {
        timeout: 300000, // 5-minute timeout per collection
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.data.success) {
        const result = {
          collection: collection.name,
          handle: collection.handle,
          processed: response.data.scraping_summary.detailedProductPages,
          successful: response.data.scraping_summary.successfulScrapes,
          found: response.data.scraping_summary.totalProductsFound,
          world_model_records: response.data.population_result.recordsProcessed,
          scraped_at: response.data.scraped_at
        };
        
        results.push(result);
        totalProcessed += result.processed;
        totalSuccessful += result.successful;
        
        console.log(`✅ Success: ${result.successful}/${result.processed} products scraped`);
        console.log(`📦 World Model: ${result.world_model_records} records processed`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to scrape ${collection.name}:`, error.message);
      results.push({
        collection: collection.name,
        handle: collection.handle,
        error: error.message,
        scraped_at: new Date().toISOString()
      });
    }
    
    // Delay between collections to avoid overwhelming the site  
    if (collectionsToScrape.indexOf(collection) < collectionsToScrape.length - 1) {
      console.log('⏱️  Waiting 10 seconds before next collection...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  
  console.log('\n🎉 COMPREHENSIVE SCRAPING COMPLETE!');
  console.log('📊 Final Statistics:');
  console.log(`   • Collections processed: ${results.length}`);
  console.log(`   • Total products processed: ${totalProcessed}`);
  console.log(`   • Total successful scrapes: ${totalSuccessful}`);
  console.log(`   • Success rate: ${((totalSuccessful/totalProcessed) * 100).toFixed(1)}%`);
  
  console.log('\n📋 Detailed Results:');
  results.forEach(result => {
    if (result.error) {
      console.log(`   ❌ ${result.collection}: ${result.error}`);
    } else {
      console.log(`   ✅ ${result.collection}: ${result.successful}/${result.processed} (${result.world_model_records} records)`);
    }
  });
  
  return results;
}

// Run the comprehensive scraping
if (require.main === module) {
  runComprehensiveScraping()
    .then(results => {
      console.log('\n💾 Saving results to comprehensive_scrape_results.json...');
      require('fs').writeFileSync('comprehensive_scrape_results.json', JSON.stringify(results, null, 2));
      console.log('✅ Results saved successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Comprehensive scraping failed:', error);
      process.exit(1);
    });
}

module.exports = { runComprehensiveScraping };