/**
 * Test the robust ToastExtractor with GPT-5's dual-mode approach
 * Demonstrates anti-bot protection and comprehensive extraction
 */

require('dotenv').config();
const ProxyBrowserManagerResidential = require('./src/common/ProxyBrowserManagerResidential');
const ToastExtractor = require('./src/extractors/ToastExtractor');
const fs = require('fs').promises;

async function testRobustToastExtraction() {
  console.log('🍜 Testing Robust Toast Extractor (GPT-5 Enhanced)');
  console.log('=' .repeat(60));
  console.log('🏠 Using RESIDENTIAL proxy for Cloudflare-protected site');
  console.log('=' .repeat(60));
  
  const manager = new ProxyBrowserManagerResidential({
    retryOnBlock: true,
    maxRetries: 2
  });
  
  // Test restaurants with different Toast implementations
  const testRestaurants = [
    {
      name: "Biang Biang Noodles",
      url: "https://www.toasttab.com/local/order/biang-biang-noodles-601-e-pike-st",
      expectedItems: ["Pad Thai", "Dan Dan Noodles", "Beef Noodle Soup"]
    },
    // Add more Toast restaurants to test different layouts
    // {
    //   name: "Thai Tom",
    //   url: "https://www.toasttab.com/local/order/thai-tom-4543-university-way-ne",
    //   expectedItems: ["Pad Thai", "Pad See Ew", "Tom Yum"]
    // }
  ];
  
  const results = [];
  
  try {
    // Create browser with anti-bot protections
    console.log('\n📦 Creating stealth browser with proxy...');
    const browser = await manager.createBrowserWithRetry('stealth', {
      // Additional stealth options
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
      skipIPCheck: true  // Skip the failing IP check
    });
    
    const extractor = new ToastExtractor();
    
    for (const restaurant of testRestaurants) {
      console.log(`\n🎯 Testing: ${restaurant.name}`);
      console.log(`URL: ${restaurant.url}`);
      console.log('-'.repeat(40));
      
      try {
        const startTime = Date.now();
        
        // Extract with the robust dual-mode approach
        const menuData = await extractor.extract(browser.page, restaurant.url);
        
        const duration = Date.now() - startTime;
        
        // Display results
        if (menuData.status === 'closed') {
          console.log(`⚠️ Restaurant closed: ${menuData.message}`);
        } else {
          console.log(`✅ Extraction successful in ${duration}ms`);
          console.log(`📂 Total items extracted: ${menuData.itemCount}`);
          
          // Analyze categories
          const categories = {};
          menuData.items.forEach(item => {
            if (!categories[item.category]) {
              categories[item.category] = [];
            }
            categories[item.category].push(item);
          });
          
          console.log(`\n📋 Categories found: ${Object.keys(categories).length}`);
          Object.entries(categories).slice(0, 3).forEach(([cat, items]) => {
            console.log(`\n  ${cat} (${items.length} items):`);
            items.slice(0, 2).forEach(item => {
              console.log(`    • ${item.name}`);
              console.log(`      Base: ${item.basePrice || 'N/A'}`);
              if (item.modifiers && item.modifiers.length > 0) {
                console.log(`      Modifiers: ${item.modifiers.length} groups`);
                // Show first modifier group
                const firstMod = item.modifiers[0];
                console.log(`        - ${firstMod.groupName}: ${firstMod.options.length} options`);
              }
              if (item.soldOut) console.log(`      ⚠️ SOLD OUT`);
            });
          });
          
          // Find Pad Thai variants for testing
          const padThaiItems = menuData.items.filter(item => 
            item.name.toLowerCase().includes('pad thai')
          );
          
          if (padThaiItems.length > 0) {
            console.log('\n🎯 Found Pad Thai variants:');
            padThaiItems.forEach(item => {
              console.log(`  • ${item.name}: ${item.basePrice}`);
              if (item.modifiers && item.modifiers.length > 0) {
                // Calculate potential price range with modifiers
                let minAddOn = 0;
                let maxAddOn = 0;
                
                item.modifiers.forEach(mod => {
                  if (mod.required && mod.options.length > 0) {
                    // Find cheapest required option
                    const prices = mod.options
                      .map(opt => {
                        const match = opt.priceDelta?.match(/\+?\$?([\d.]+)/);
                        return match ? parseFloat(match[1]) : 0;
                      })
                      .filter(p => !isNaN(p));
                    
                    if (prices.length > 0) {
                      minAddOn += Math.min(...prices);
                      maxAddOn += Math.max(...prices);
                    }
                  }
                });
                
                const baseNum = parseFloat(item.basePrice.replace('$', ''));
                if (!isNaN(baseNum)) {
                  const minTotal = baseNum + minAddOn;
                  const maxTotal = baseNum + maxAddOn;
                  console.log(`    Price range: $${minTotal.toFixed(2)} - $${maxTotal.toFixed(2)}`);
                }
              }
            });
          }
          
          // Price analysis
          const allPrices = menuData.items
            .map(item => {
              const priceStr = item.basePrice?.replace('$', '').replace(',', '');
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
            console.log(`  Items with modifiers: ${menuData.items.filter(i => i.modifiers?.length > 0).length}`);
          }
        }
        
        // Store result
        results.push({
          restaurant: restaurant.name,
          url: restaurant.url,
          extraction: menuData,
          duration: duration,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`❌ Failed to extract ${restaurant.name}:`, error.message);
        results.push({
          restaurant: restaurant.name,
          url: restaurant.url,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
      
      // Add delay between restaurants to appear more human
      if (testRestaurants.indexOf(restaurant) < testRestaurants.length - 1) {
        console.log('\n⏳ Waiting before next restaurant...');
        await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));
      }
    }
    
    // Save detailed results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `data/output/data/toast_robust_extraction_${timestamp}.json`;
    
    await fs.writeFile(
      filename,
      JSON.stringify(results, null, 2)
    );
    
    console.log(`\n💾 Detailed results saved to: ${filename}`);
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 EXTRACTION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total restaurants tested: ${testRestaurants.length}`);
    console.log(`Successful extractions: ${results.filter(r => !r.error).length}`);
    console.log(`Failed extractions: ${results.filter(r => r.error).length}`);
    
    const successfulResults = results.filter(r => !r.error && r.extraction?.items);
    if (successfulResults.length > 0) {
      const totalItems = successfulResults.reduce((sum, r) => sum + r.extraction.items.length, 0);
      const avgDuration = successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length;
      
      console.log(`\nTotal items extracted: ${totalItems}`);
      console.log(`Average extraction time: ${Math.round(avgDuration)}ms`);
      
      // Count items with modifiers
      const itemsWithModifiers = successfulResults.reduce((sum, r) => 
        sum + r.extraction.items.filter(i => i.modifiers && i.modifiers.length > 0).length, 0
      );
      console.log(`Items with modifiers: ${itemsWithModifiers} (${Math.round(itemsWithModifiers/totalItems*100)}%)`);
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await manager.closeAll();
    console.log('\n✅ Test complete!');
  }
}

// Run the test
testRobustToastExtraction().catch(console.error);