#!/usr/bin/env node

const GlasswingScraper = require('../../src/scrapers/GlasswingScraper');

const logger = {
  info: (...args) => console.log('[TEST]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  debug: (...args) => {}
};

async function testEnhancedScraper() {
  const scraper = new GlasswingScraper(logger);
  
  try {
    console.log('🧪 Testing enhanced scraper with descriptions...\n');
    
    // Test with just first 3 products to validate functionality
    const result = await scraper.scrapeFirstProducts('/collections/all-products-no-sale', 3);
    
    console.log('\n📊 SCRAPING RESULTS:');
    console.log(`Total products found on page: ${result.summary.totalProductsFound}`);
    console.log(`Products detailed: ${result.summary.detailedProductPages}`);
    console.log(`Successful scrapes: ${result.summary.successfulScrapes}`);
    
    console.log('\n🛍️ SAMPLE PRODUCTS WITH DESCRIPTIONS:');
    console.log('='.repeat(60));
    
    result.productAnalysis.forEach((product, index) => {
      if (!product.error) {
        console.log(`\n${index + 1}. ${product.productData?.title}`);
        console.log(`   Price: ${product.productData?.price}`);
        console.log(`   URL: ${product.url}`);
        
        if (product.productData?.description) {
          const desc = product.productData.description;
          const shortDesc = desc.length > 100 ? desc.substring(0, 100) + '...' : desc;
          console.log(`   Description (${product.productData.descriptionLength} chars): ${shortDesc}`);
        } else {
          console.log(`   Description: No description found`);
        }
        
        if (product.variants && product.variants.length > 0) {
          console.log(`   Variants: ${product.variants[0].options?.length || 0} options`);
        }
      } else {
        console.log(`\n${index + 1}. ERROR: ${product.error}`);
      }
    });
    
    console.log('\n✅ Enhanced scraper test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await scraper.close();
  }
}

if (require.main === module) {
  testEnhancedScraper()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Script crashed:', error);
      process.exit(1);
    });
}