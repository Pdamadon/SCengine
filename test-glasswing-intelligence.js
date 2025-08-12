/**
 * Test GlasswingScraper with intelligence system - direct execution
 */

const { logger } = require('./src/utils/logger');

async function testGlasswingIntelligence() {
  const GlasswingScraper = require('./src/scrapers/GlasswingScraper');
  
  console.log('🧠 Testing Glasswing Intelligence System');
  console.log('==========================================');
  
  const scraper = new GlasswingScraper(logger);
  
  try {
    console.log('1️⃣ Initializing scraper...');
    await scraper.initialize();
    
    console.log('2️⃣ Running category-based scraping with intelligence...');
    const startTime = Date.now();
    
    // Progress callback to see what's happening
    const progressCallback = (progress) => {
      console.log(`📊 ${progress.stage}: ${progress.message} (${progress.progress}%)`);
    };
    
    // Run the intelligent scraping - limit to 5 products for testing
    const results = await scraper.scrapeWithCategories(5, progressCallback);
    
    const duration = Date.now() - startTime;
    
    console.log('3️⃣ Results Summary:');
    console.log(`⏱️  Duration: ${Math.round(duration / 1000)}s`);
    console.log(`🔍 Intelligence Score: ${results.intelligence.intelligence_score}/100`);
    console.log(`📁 Categories discovered: ${results.categories.discovered}`);
    console.log(`📁 Categories processed: ${results.categories.processed}`);
    console.log(`🛍️  Products scraped: ${results.products.total_scraped}`);
    console.log(`✅ Intelligence system used: ${results.summary.intelligence_used}`);
    
    console.log('\n4️⃣ Sample Products:');
    if (results.allProducts && results.allProducts.length > 0) {
      results.allProducts.slice(0, 3).forEach((product, i) => {
        console.log(`${i + 1}. ${product.productData?.title || 'Unknown'} - ${product.productData?.price || 'No price'}`);
        console.log(`   Category: ${product.category}`);
        console.log(`   URL: ${product.url}`);
      });
    } else {
      console.log('❌ No products found');
    }
    
    console.log('\n5️⃣ Category Discovery Details:');
    if (results.categoryResults) {
      results.categoryResults.forEach((cat, i) => {
        if (!cat.error) {
          console.log(`${i + 1}. ${cat.category.name} (${cat.category.type})`);
          console.log(`   Products found: ${cat.products_found}`);
          console.log(`   Products scraped: ${cat.products_scraped}`);
        } else {
          console.log(`${i + 1}. ${cat.category.name} - ERROR: ${cat.error}`);
        }
      });
    }
    
    console.log('\n🎉 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await scraper.close();
  }
}

testGlasswingIntelligence();