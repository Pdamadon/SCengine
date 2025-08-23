#!/usr/bin/env node

/**
 * Direct test to get all filter products
 */

require('dotenv').config();

const FilterBasedExplorationStrategy = require('./src/core/discovery/strategies/exploration/FilterBasedExplorationStrategy');
const FilterDiscoveryStrategy = require('./src/core/discovery/strategies/exploration/FilterDiscoveryStrategy');
const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const { logger } = require('./src/utils/logger');

async function testDirectFilterProducts() {
  const browserManager = new BrowserManagerBrowserless();
  
  // Create discovery strategy first
  const filterDiscovery = new FilterDiscoveryStrategy(browserManager, {
    logger: logger,
    maxFilters: 10
  });
  
  // Create exploration strategy with discovery
  const filterExplorer = new FilterBasedExplorationStrategy(browserManager, {
    logger: logger,
    maxFilters: 3,
    filterDiscoveryStrategy: filterDiscovery,
    useDiscoveredFilters: true
  });
  
  try {
    const categoryUrl = 'https://glasswingshop.com/collections/mens-collection';
    
    console.log(`Testing direct filter exploration on: ${categoryUrl}\n`);
    
    // Run exploration
    const results = await filterExplorer.exploreWithFilters(categoryUrl, 'mens-collection');
    
    console.log('=== RESULTS SUMMARY ===');
    console.log(`Total unique products: ${results.totalProducts}`);
    console.log(`Filter paths executed: ${results.filterPaths.length}`);
    console.log(`Products array length: ${results.products.length}`);
    
    // Group products by filter
    const productsByFilter = {};
    results.products.forEach(product => {
      product.filters.forEach(filter => {
        if (!productsByFilter[filter]) {
          productsByFilter[filter] = [];
        }
        productsByFilter[filter].push(product.url);
      });
    });
    
    console.log('\n=== PRODUCTS BY FILTER ===');
    Object.keys(productsByFilter).forEach(filter => {
      console.log(`\n${filter}: ${productsByFilter[filter].length} products`);
    });
    
    // Show ALL products with index
    console.log('\n=== ALL PRODUCTS (Full List) ===\n');
    const fullOutput = {
      summary: {
        totalProducts: results.totalProducts,
        uniqueUrls: results.products.length,
        filterPaths: results.filterPaths.length
      },
      products: results.products.map((p, idx) => ({
        index: idx + 1,
        url: p.url,
        title: p.title,
        filters: p.filters,
        categoryName: p.categoryName,
        price: p.price
      }))
    };
    
    console.log(JSON.stringify(fullOutput, null, 2));
    
    // Save to file
    const fs = require('fs').promises;
    await fs.writeFile('filter_products_direct.json', JSON.stringify(fullOutput, null, 2));
    console.log('\nFull data saved to: filter_products_direct.json');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testDirectFilterProducts().catch(console.error);