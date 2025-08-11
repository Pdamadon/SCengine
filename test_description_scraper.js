#!/usr/bin/env node

const GlasswingScraper = require('./src/scrapers/GlasswingScraper');

const logger = {
  info: (...args) => console.log('[TEST]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args)
};

async function testDescriptionExtraction() {
  const scraper = new GlasswingScraper(logger);
  
  try {
    console.log('🧪 Testing enhanced product description extraction...\n');
    
    // Test with a sample product from our previous results
    const testProduct = 'https://glasswingshop.com/products/engineered-garments-long-scarf-green-stripe';
    
    console.log(`Testing product: ${testProduct}`);
    console.log('='.repeat(60));
    
    const result = await scraper.scrapeProductPage(testProduct);
    
    console.log('\n📋 EXTRACTED DATA:');
    console.log(`Title: ${result.productData?.title}`);
    console.log(`Price: ${result.productData?.price}`);
    console.log(`Description Length: ${result.productData?.descriptionLength || 0} characters`);
    
    if (result.productData?.description) {
      console.log('\n📝 DESCRIPTION:');
      console.log('─'.repeat(40));
      console.log(result.productData.description);
      console.log('─'.repeat(40));
    } else {
      console.log('\n❌ No description extracted');
    }
    
    if (result.productData?.descriptionHtml) {
      console.log('\n🏗️ HTML STRUCTURE:');
      console.log(result.productData.descriptionHtml.substring(0, 200) + '...');
    }
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await scraper.close();
  }
}

if (require.main === module) {
  testDescriptionExtraction()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Script crashed:', error);
      process.exit(1);
    });
}

module.exports = { testDescriptionExtraction };