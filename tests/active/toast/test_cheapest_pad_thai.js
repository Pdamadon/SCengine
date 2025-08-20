/**
 * Test finding cheapest Pad Thai across restaurants
 * Demonstrates the natural language ordering flow
 */

require('dotenv').config();
const ProxyBrowserManager = require('./src/common/ProxyBrowserManager');
const RestaurantPriceFinder = require('./src/services/RestaurantPriceFinder');

async function findCheapestPadThai() {
  console.log('🍜 Finding Cheapest Pad Thai');
  console.log('=' .repeat(60));
  console.log('User query: "I want the cheapest pad thai from the highest');
  console.log('            rated Thai restaurant in Seattle"');
  console.log('=' .repeat(60));
  
  const browserManager = new ProxyBrowserManager({
    retryOnBlock: true,
    maxRetries: 2
  });
  
  // Simulated restaurant database (normally from your DB)
  // These would be the top-rated Thai restaurants you support
  const topThaiRestaurants = [
    {
      name: "Biang Biang Noodles",
      platform: "toast",
      url: "https://www.toasttab.com/local/order/biang-biang-noodles-601-e-pike-st",
      rating: 4.7,
      cuisine: "thai"
    },
    // Add more restaurants as you onboard them
    // {
    //   name: "Thai Tom",
    //   platform: "toast", 
    //   url: "https://www.toasttab.com/local/order/thai-tom",
    //   rating: 4.5,
    //   cuisine: "thai"
    // }
  ];
  
  try {
    const finder = new RestaurantPriceFinder(browserManager);
    
    // Find cheapest Pad Thai
    const result = await finder.findCheapestItem(
      'pad thai',
      topThaiRestaurants,
      'seattle'
    );
    
    // Display results
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESULTS');
    console.log('='.repeat(60));
    
    if (result.found) {
      console.log('\n✅ ' + result.message);
      
      if (result.allResults.length > 1) {
        console.log('\n📋 Price Comparison:');
        result.allResults.forEach((r, i) => {
          console.log(`${i + 1}. ${r.restaurant}: $${r.basePrice} (+ $${r.tax} tax = $${r.estimatedTotal})`);
        });
      }
      
      // Simulate user response
      console.log('\n👤 User: "7:30 PM please"');
      console.log('\n🤖 Assistant: Perfect! I\'ll prepare your order for pickup at 7:30 PM.');
      console.log('   You\'ll complete payment at the restaurant.');
      console.log(`   [Continue to ${result.winner.restaurant} checkout →]`);
      
    } else {
      console.log('\n❌ ' + result.message);
    }
    
    // Save results
    const fs = require('fs').promises;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `data/output/data/cheapest_pad_thai_${timestamp}.json`;
    
    await fs.writeFile(
      filename,
      JSON.stringify(result, null, 2)
    );
    
    console.log(`\n💾 Results saved to: ${filename}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await browserManager.closeAll();
    console.log('\n✅ Test complete!');
  }
}

// Run the test
findCheapestPadThai().catch(console.error);