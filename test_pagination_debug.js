#!/usr/bin/env node

const GlasswingScraper = require('./src/scrapers/GlasswingScraper');

// Simple logger for testing
const logger = {
  info: (...args) => console.log(`[INFO] ${new Date().toISOString()}:`, ...args),
  error: (...args) => console.error(`[ERROR] ${new Date().toISOString()}:`, ...args),
  warn: (...args) => console.warn(`[WARN] ${new Date().toISOString()}:`, ...args),
  debug: (...args) => console.log(`[DEBUG] ${new Date().toISOString()}:`, ...args)
};

async function debugPagination() {
  const scraper = new GlasswingScraper(logger);
  
  try {
    console.log('🔍 Debugging Pagination Detection\n');
    console.log('================================\n');

    // Test with the main collection first
    const testUrl = '/collections/all-products-no-sale';
    
    console.log(`📁 Testing pagination detection for: ${testUrl}\n`);

    // Get the first page data to examine navigation
    const categoryData = await scraper.scrapeCategoryPage(testUrl);
    
    console.log('📊 Category Page Analysis:');
    console.log('==========================');
    console.log(`URL: ${categoryData.url}`);
    console.log(`Title: ${categoryData.title}`);
    console.log(`Products found: ${categoryData.productLinks.length}`);
    
    console.log('\n🔗 Navigation Analysis:');
    console.log('=======================');
    console.log(`Next page: ${categoryData.navigation?.nextPage ? 'FOUND' : 'NOT FOUND'}`);
    console.log(`Prev page: ${categoryData.navigation?.prevPage ? 'FOUND' : 'NOT FOUND'}`);
    
    if (categoryData.navigation?.nextPage) {
      console.log(`Next page URL: ${categoryData.navigation.nextPage.element?.href || 'N/A'}`);
      console.log(`Next page selector: ${categoryData.navigation.nextPage.primary}`);
    }

    // Let's test the main clothing collection which we know works
    console.log('\n\n📁 Testing with known working collection: /collections/clothing-collection\n');
    
    const clothingData = await scraper.scrapeCategoryPage('/collections/clothing-collection');
    
    console.log('📊 Clothing Collection Analysis:');
    console.log('================================');
    console.log(`URL: ${clothingData.url}`);
    console.log(`Title: ${clothingData.title}`);
    console.log(`Products found: ${clothingData.productLinks.length}`);
    
    console.log('\n🔗 Navigation Analysis:');
    console.log('=======================');
    console.log(`Next page: ${clothingData.navigation?.nextPage ? 'FOUND' : 'NOT FOUND'}`);
    console.log(`Prev page: ${clothingData.navigation?.prevPage ? 'FOUND' : 'NOT FOUND'}`);
    
    if (clothingData.navigation?.nextPage) {
      console.log(`Next page URL: ${clothingData.navigation.nextPage.element?.href || 'N/A'}`);
      console.log(`Next page selector: ${clothingData.navigation.nextPage.primary}`);
    }

    // Test with explicit pagination URL
    console.log('\n\n📁 Testing explicit pagination URL for all-products-no-sale\n');
    
    const paginatedUrl = '/collections/all-products-no-sale?page=1';
    const paginatedData = await scraper.scrapeCategoryPage(paginatedUrl);
    
    console.log('📊 Paginated Collection Analysis:');
    console.log('=================================');
    console.log(`URL: ${paginatedData.url}`);
    console.log(`Title: ${paginatedData.title}`);
    console.log(`Products found: ${paginatedData.productLinks.length}`);
    
    console.log('\n🔗 Navigation Analysis:');
    console.log('=======================');
    console.log(`Next page: ${paginatedData.navigation?.nextPage ? 'FOUND' : 'NOT FOUND'}`);
    console.log(`Prev page: ${paginatedData.navigation?.prevPage ? 'FOUND' : 'NOT FOUND'}`);
    
    if (paginatedData.navigation?.nextPage) {
      console.log(`Next page URL: ${paginatedData.navigation.nextPage.element?.href || 'N/A'}`);
      console.log(`Next page selector: ${paginatedData.navigation.nextPage.primary}`);
    }

    console.log('\n🎯 DIAGNOSIS:');
    console.log('=============');
    
    const hasWorkingPagination = categoryData.navigation?.nextPage || clothingData.navigation?.nextPage || paginatedData.navigation?.nextPage;
    
    if (hasWorkingPagination) {
      console.log('✅ Pagination detection is working on at least one collection');
    } else {
      console.log('❌ Pagination detection is not working - need to debug selectors');
      console.log('💡 This could mean:');
      console.log('   1. Collections have fewer than 20 products total');
      console.log('   2. Pagination selectors need improvement');
      console.log('   3. Site structure has changed');
    }

    return true;

  } catch (error) {
    console.error('❌ Debug failed with error:', error);
    return false;
  } finally {
    await scraper.close();
  }
}

// Run the debug
if (require.main === module) {
  debugPagination()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Debug crashed:', error);
      process.exit(1);
    });
}

module.exports = { debugPagination };