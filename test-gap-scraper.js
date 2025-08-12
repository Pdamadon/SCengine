/**
 * Quick test to validate Gap scraper instantiation
 */

const { logger } = require('./src/utils/logger');

async function testGapScraper() {
  try {
    console.log('Testing Gap scraper instantiation...');
    
    // Test ScraperFactory import
    const ScraperFactory = require('./src/multisite/core/ScraperFactory');
    console.log('✅ ScraperFactory imported successfully');
    
    // Test GapScraper import
    const GapScraper = require('./src/multisite/scrapers/GapScraper');
    console.log('✅ GapScraper imported successfully');
    
    // Test platform configs
    const { getPlatformConfig } = require('./src/multisite/config/platformConfigs');
    const gapConfig = getPlatformConfig('gap');
    console.log('✅ Gap platform config loaded:', gapConfig.name);
    
    // Test ScraperFactory creation
    const factory = new ScraperFactory(logger);
    await factory.initialize();
    console.log('✅ ScraperFactory initialized');
    
    // Test scraper creation for Gap URL
    const gapUrl = 'https://www.gap.com/browse/category.do?cid=15643';
    const scraperInfo = await factory.createScraper(gapUrl, {
      scraping_type: 'category_search',
      max_pages: 1,
      max_products: 3
    });
    
    console.log('✅ Gap scraper created successfully');
    console.log('Platform detected:', scraperInfo.platformInfo.platform);
    console.log('Scraper type:', scraperInfo.scraper.constructor.name);
    console.log('Confidence:', scraperInfo.platformInfo.confidence);
    
    // Test basic Gap scraper properties
    const gapScraper = scraperInfo.scraper;
    console.log('Gap scraper domain:', gapScraper.domain);
    console.log('Gap scraper base URL:', gapScraper.baseUrl);
    
    await factory.close();
    console.log('✅ All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testGapScraper();