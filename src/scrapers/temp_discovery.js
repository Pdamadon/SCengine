
const GlasswingScraper = require('../../src/scrapers/GlasswingScraper');

const logger = {
  info: (...args) => console.log('[DISCOVERY]', ...args),
  error: (...args) => console.error('[DISCOVERY]', ...args),
  warn: (...args) => console.warn('[DISCOVERY]', ...args),
  debug: (...args) => {}
};

async function discoverAllProducts() {
  const scraper = new GlasswingScraper(logger);
  
  try {
    console.log('Discovering all products from main collection...');
    const result = await scraper.scrapeCompleteCollection('/collections/all-products-no-sale', null);
    
    const productUrls = [];
    result.productAnalysis.forEach(product => {
      if (product.url && !product.error) {
        productUrls.push(product.url);
      }
    });
    
    console.log('DISCOVERY_RESULT_START');
    console.log(JSON.stringify({
      totalFound: productUrls.length,
      productUrls: productUrls,
      paginationData: result.paginationData
    }));
    console.log('DISCOVERY_RESULT_END');
    
    await scraper.close();
    process.exit(0);
  } catch (error) {
    console.error('DISCOVERY_ERROR:', error.message);
    await scraper.close();
    process.exit(1);
  }
}

discoverAllProducts();
