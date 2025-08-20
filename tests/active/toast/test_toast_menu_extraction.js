/**
 * Test Toast Tab menu extraction
 * Extracts menu items with prices from Toast-powered restaurants
 */

require('dotenv').config();
const ProxyBrowserManager = require('./src/common/ProxyBrowserManager');
const { extractToastMenu } = require('./src/config/ToastSelectors');
const { logger } = require('./src/utils/logger');
const fs = require('fs').promises;

async function testToastExtraction() {
  console.log('🍜 Testing Toast Tab Menu Extraction');
  console.log('=' .repeat(60));
  
  const manager = new ProxyBrowserManager({
    retryOnBlock: true,
    maxRetries: 2
  });
  
  // Test restaurants
  const testUrls = [
    {
      name: "Biang Biang Noodles",
      url: "https://www.toasttab.com/local/order/biang-biang-noodles-601-e-pike-st",
      expectedCategories: ["Appetizers", "Noodles", "Rice", "Beverages"]
    },
    // Add more Toast restaurants as needed
  ];
  
  const results = [];
  
  try {
    // Create browser with proxy
    console.log('\n📦 Creating browser with proxy...');
    const browser = await manager.createBrowserWithRetry('stealth');
    
    for (const restaurant of testUrls) {
      console.log(`\n🎯 Testing: ${restaurant.name}`);
      console.log(`URL: ${restaurant.url}`);
      console.log('-'.repeat(40));
      
      try {
        // Extract menu
        const startTime = Date.now();
        const menuData = await extractToastMenu(browser.page, restaurant.url);
        const duration = Date.now() - startTime;
        
        // Display results
        if (menuData.status === 'closed') {
          console.log(`⚠️ Restaurant closed: ${menuData.message}`);
        } else {
          console.log(`✅ Extraction successful in ${duration}ms`);
          console.log(`📂 Categories found: ${menuData.categories.length}`);
          console.log(`🍽️ Total items: ${menuData.totalItems}`);
          
          // Show sample items
          if (menuData.categories.length > 0) {
            console.log('\nSample items by category:');
            menuData.categories.slice(0, 3).forEach(category => {
              console.log(`\n  ${category.name} (${category.itemCount} items):`);
              category.items.slice(0, 2).forEach(item => {
                console.log(`    • ${item.name}`);
                console.log(`      Price: ${item.price || 'N/A'}`);
                if (item.soldOut) console.log(`      ⚠️ SOLD OUT`);
              });
            });
          }
          
          // Price analysis
          const allPrices = menuData.categories
            .flatMap(cat => cat.items)
            .map(item => {
              const priceStr = item.price?.replace('$', '').replace(',', '');
              return parseFloat(priceStr) || 0;
            })
            .filter(p => p > 0);
          
          if (allPrices.length > 0) {
            const avgPrice = (allPrices.reduce((a, b) => a + b, 0) / allPrices.length).toFixed(2);
            const minPrice = Math.min(...allPrices).toFixed(2);
            const maxPrice = Math.max(...allPrices).toFixed(2);
            
            console.log('\n💰 Price Analysis:');
            console.log(`  Average: $${avgPrice}`);
            console.log(`  Range: $${minPrice} - $${maxPrice}`);
          }
        }
        
        // Store result
        results.push({
          restaurant: restaurant.name,
          url: restaurant.url,
          extraction: menuData,
          duration: duration
        });
        
      } catch (error) {
        console.error(`❌ Failed to extract ${restaurant.name}:`, error.message);
        results.push({
          restaurant: restaurant.name,
          url: restaurant.url,
          error: error.message
        });
      }
    }
    
    // Save all results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `data/output/data/toast_menus_${timestamp}.json`;
    
    await fs.writeFile(
      filename,
      JSON.stringify(results, null, 2)
    );
    
    console.log(`\n💾 Results saved to: ${filename}`);
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 EXTRACTION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total restaurants tested: ${testUrls.length}`);
    console.log(`Successful extractions: ${results.filter(r => !r.error).length}`);
    console.log(`Failed extractions: ${results.filter(r => r.error).length}`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    logger.error('Toast extraction test failed', error);
  } finally {
    await manager.closeAll();
    console.log('\n✅ Test complete!');
  }
}

// Run the test
testToastExtraction().catch(console.error);