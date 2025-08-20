/**
 * Restaurant Price Finder Service
 * Finds the cheapest item across multiple restaurants
 * Handles Toast, Square, and other platforms
 */

const { extractToastMenu } = require('../config/ToastSelectors');
const { logger } = require('../utils/logger');

class RestaurantPriceFinder {
  constructor(browserManager) {
    this.browserManager = browserManager;
    this.taxRates = {
      // Washington state tax rates by city
      'seattle': 0.101,  // 10.1% (state + local)
      'tacoma': 0.102,
      'spokane': 0.089,
      'bellevue': 0.10,
      // Add more cities as needed
      'default': 0.065  // WA state minimum
    };
  }
  
  /**
   * Find cheapest item across restaurants
   * @param {string} itemName - Item to search for (e.g., "pad thai")
   * @param {Array} restaurants - List of restaurant configs
   * @param {string} city - City for tax calculation
   */
  async findCheapestItem(itemName, restaurants, city = 'seattle') {
    console.log(`\n🔍 Finding cheapest "${itemName}" in ${city}`);
    console.log('=' .repeat(60));
    
    const results = [];
    const searchTerms = this.normalizeSearchTerms(itemName);
    
    // Create browser
    const browser = await this.browserManager.createBrowserWithRetry('stealth');
    
    try {
      for (const restaurant of restaurants) {
        console.log(`\n📍 Checking ${restaurant.name}...`);
        
        try {
          // Extract menu based on platform
          let menuData;
          if (restaurant.platform === 'toast') {
            menuData = await extractToastMenu(browser.page, restaurant.url);
          } else {
            // Add other platforms as needed
            console.log(`⚠️ Platform ${restaurant.platform} not yet supported`);
            continue;
          }
          
          // Find matching items
          const matches = this.findMatchingItems(menuData, searchTerms);
          
          if (matches.length > 0) {
            // Get the cheapest match at this restaurant
            const cheapest = matches.reduce((min, item) => 
              item.numericPrice < min.numericPrice ? item : min
            );
            
            // Calculate total with tax
            const taxRate = this.taxRates[city.toLowerCase()] || this.taxRates.default;
            const tax = cheapest.numericPrice * taxRate;
            const total = cheapest.numericPrice + tax;
            
            results.push({
              restaurant: restaurant.name,
              restaurantUrl: restaurant.url,
              platform: restaurant.platform,
              item: cheapest.name,
              category: cheapest.category,
              basePrice: cheapest.numericPrice,
              tax: Math.round(tax * 100) / 100,
              estimatedTotal: Math.round(total * 100) / 100,
              verifiedAt: new Date().toISOString()
            });
            
            console.log(`  ✅ Found: ${cheapest.name} - $${cheapest.numericPrice}`);
          } else {
            console.log(`  ❌ No "${itemName}" found`);
          }
          
        } catch (error) {
          console.error(`  ❌ Error: ${error.message}`);
        }
      }
      
    } finally {
      await this.browserManager.closeBrowser(browser);
    }
    
    // Sort by price and return analysis
    results.sort((a, b) => a.basePrice - b.basePrice);
    
    return this.formatResults(results, itemName, city);
  }
  
  /**
   * Normalize search terms for matching
   */
  normalizeSearchTerms(itemName) {
    const base = itemName.toLowerCase().trim();
    const variations = [base];
    
    // Common variations
    if (base.includes(' ')) {
      variations.push(base.replace(/\s+/g, ''));  // Remove spaces
      variations.push(base.replace(/\s+/g, '-')); // Replace with dash
    }
    
    // Specific food variations
    if (base.includes('pad thai')) {
      variations.push('padthai', 'phad thai', 'pad-thai');
    }
    
    return variations;
  }
  
  /**
   * Find items matching search terms
   */
  findMatchingItems(menuData, searchTerms) {
    const matches = [];
    
    if (menuData.status !== 'success' || !menuData.categories) {
      return matches;
    }
    
    menuData.categories.forEach(category => {
      category.items.forEach(item => {
        const itemNameLower = item.name.toLowerCase();
        
        // Check if item matches any search term
        const isMatch = searchTerms.some(term => 
          itemNameLower.includes(term)
        );
        
        if (isMatch && item.price && !item.soldOut) {
          // Parse price
          const priceStr = item.price.replace('$', '').replace(',', '');
          const numericPrice = parseFloat(priceStr);
          
          if (!isNaN(numericPrice)) {
            matches.push({
              name: item.name,
              category: category.name,
              price: item.price,
              numericPrice: numericPrice,
              description: item.description
            });
          }
        }
      });
    });
    
    return matches;
  }
  
  /**
   * Format results for display
   */
  formatResults(results, itemName, city) {
    if (results.length === 0) {
      return {
        found: false,
        message: `No "${itemName}" found at the restaurants checked.`,
        results: []
      };
    }
    
    const cheapest = results[0];
    const savings = results.length > 1 
      ? results[1].basePrice - cheapest.basePrice 
      : 0;
    
    return {
      found: true,
      query: itemName,
      city: city,
      winner: {
        restaurant: cheapest.restaurant,
        item: cheapest.item,
        basePrice: cheapest.basePrice,
        estimatedTotal: cheapest.estimatedTotal,
        savings: savings > 0 ? savings : null
      },
      message: this.generateMessage(cheapest, results[1], savings),
      allResults: results,
      scrapedAt: new Date().toISOString()
    };
  }
  
  /**
   * Generate user-friendly message
   */
  generateMessage(cheapest, secondCheapest, savings) {
    let message = `${cheapest.restaurant} has ${cheapest.item} for $${cheapest.basePrice}`;
    
    if (secondCheapest && savings > 0) {
      message += ` — that's $${savings.toFixed(2)} cheaper than ${secondCheapest.restaurant}`;
    }
    
    message += `. Est. total at pickup: $${cheapest.estimatedTotal} (includes local tax).`;
    message += ` What time would you like for pickup?`;
    
    return message;
  }
}

module.exports = RestaurantPriceFinder;