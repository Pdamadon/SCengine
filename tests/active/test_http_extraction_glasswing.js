/**
 * Test HTTP-first extraction on Glasswing products
 * Validates that HTTPJsonLdExtractor works correctly and falls back to browser when needed
 */

const UniversalProductExtractor = require('../../src/core/extraction/UniversalProductExtractor');
const BrowserManagerBrowserless = require('../../src/common/BrowserManagerBrowserless');
const logger = require('../../src/utils/logger');

const testUrls = [
  'https://glasswingshop.com/products/7115-signature-carry-all-commuter-heavy-canvas-bag-sand-gray',
  'https://glasswingshop.com/products/7115-by-szeki-cocoon-dress-shirt-off-white',
  'https://glasswingshop.com/products/lauren-manoogian-raw-slide-gris',
  'https://glasswingshop.com/products/brain-dead-terra-former-liquid-castille-soap-green'
];

async function testHTTPExtraction() {
  logger.info('=== Testing HTTP-first extraction on Glasswing ===');
  
  const browserManager = new BrowserManagerBrowserless(logger, {
    maxInstances: 1,
    headless: true
  });
  
  const extractor = new UniversalProductExtractor(logger);
  
  const results = {
    httpSuccesses: 0,
    browserFallbacks: 0,
    totalFailures: 0,
    products: []
  };
  
  for (const url of testUrls) {
    try {
      logger.info(`Testing extraction for: ${url}`);
      
      const startTime = Date.now();
      const product = await extractor.extract(null, { url });
      const extractionTime = Date.now() - startTime;
      
      if (product) {
        logger.info(`✅ Product extracted successfully in ${extractionTime}ms`, {
          title: product.title,
          price: product.price,
          method: product.extractionMethod,
          hasImages: !!(product.images && product.images.length > 0)
        });
        
        if (product.extractionMethod === 'http_jsonld') {
          results.httpSuccesses++;
        } else {
          results.browserFallbacks++;
        }
        
        results.products.push({
          url,
          title: product.title,
          price: product.price,
          method: product.extractionMethod,
          extractionTime,
          success: true
        });
      } else {
        logger.error(`❌ Failed to extract product from: ${url}`);
        results.totalFailures++;
        results.products.push({
          url,
          success: false,
          extractionTime
        });
      }
      
    } catch (error) {
      logger.error(`❌ Error extracting from ${url}: ${error.message}`);
      results.totalFailures++;
      results.products.push({
        url,
        success: false,
        error: error.message
      });
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Note: BrowserManagerBrowserless doesn't have cleanup method
  
  // Summary
  logger.info('=== HTTP Extraction Test Results ===', {
    totalUrls: testUrls.length,
    httpSuccesses: results.httpSuccesses,
    browserFallbacks: results.browserFallbacks,
    totalFailures: results.totalFailures,
    httpSuccessRate: `${Math.round((results.httpSuccesses / testUrls.length) * 100)}%`,
    overallSuccessRate: `${Math.round(((results.httpSuccesses + results.browserFallbacks) / testUrls.length) * 100)}%`
  });
  
  // Show per-product results
  results.products.forEach(result => {
    const status = result.success ? '✅' : '❌';
    const method = result.method || 'failed';
    logger.info(`${status} ${result.url} - ${method} (${result.extractionTime}ms)`);
  });
  
  return results;
}

if (require.main === module) {
  testHTTPExtraction()
    .then(results => {
      if (results.httpSuccesses > 0) {
        logger.info('🎉 HTTP extraction working! Ready for full MVP test.');
      } else if (results.browserFallbacks > 0) {
        logger.info('⚠️ HTTP extraction not working, but browser fallback successful.');
      } else {
        logger.error('💥 Both HTTP and browser extraction failed.');
        process.exit(1);
      }
    })
    .catch(error => {
      logger.error('Test failed:', error.message);
      logger.error('Stack:', error.stack);
      process.exit(1);
    });
}

module.exports = { testHTTPExtraction };