#!/usr/bin/env node

/**
 * Dump all products found to JSON for analysis
 */

require('dotenv').config();

const PipelineOrchestrator = require('./src/core/PipelineOrchestrator');
const { logger } = require('./src/utils/logger');
const fs = require('fs').promises;

async function dumpProducts() {
  const orchestrator = new PipelineOrchestrator({
    logger: logger,
    mode: 'category',
    maxFilters: 3,
    useDiscoveredFilters: true,
    filterScoreThreshold: 2,
    maxFiltersPerGroup: 10,
    enableNavigation: false,
    enableSubcategories: false,
    enableFilters: true,
    enableCollection: true,
    enableExtraction: false
  });

  try {
    const categoryUrl = 'https://glasswingshop.com/collections/mens-collection';
    const siteDomain = 'glasswingshop.com';
    
    console.log(`Fetching products from: ${categoryUrl}\n`);
    
    const results = await orchestrator.execute(categoryUrl, {
      domain: siteDomain,
      categoryName: 'mens-collection'
    });
    
    // Extract all products
    let allProducts = [];
    
    // Check various places products might be stored
    if (results.filterResults && results.filterResults.categories) {
      results.filterResults.categories.forEach(cat => {
        if (cat.filterProducts) {
          allProducts = allProducts.concat(cat.filterProducts);
        }
      });
    }
    
    if (results.products) {
      allProducts = allProducts.concat(results.products);
    }
    
    // Create output object with all product URLs and titles
    const output = {
      totalFound: allProducts.length,
      uniqueUrls: [...new Set(allProducts.map(p => p.url))].length,
      products: allProducts.map(p => ({
        url: p.url,
        title: p.title
      }))
    };
    
    // Save to file
    const filename = 'products_dump.json';
    await fs.writeFile(filename, JSON.stringify(output, null, 2));
    
    console.log(`Saved ${output.totalFound} products to ${filename}`);
    console.log(`Unique URLs: ${output.uniqueUrls}`);
    
    // Also print to console
    console.log('\n' + JSON.stringify(output, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

dumpProducts().catch(console.error);