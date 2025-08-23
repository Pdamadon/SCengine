#!/usr/bin/env node

/**
 * Dump ALL 50 products with full data for analysis
 */

require('dotenv').config();

const PipelineOrchestrator = require('./src/core/PipelineOrchestrator');
const { logger } = require('./src/utils/logger');
const fs = require('fs').promises;

async function dumpAllProducts() {
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
    
    // Extract all products from filterResults
    let allProducts = [];
    
    if (results.filterResults && results.filterResults.categories) {
      results.filterResults.categories.forEach((cat, catIndex) => {
        console.log(`Category ${catIndex}: ${cat.name} - ${cat.filterProducts ? cat.filterProducts.length : 0} products`);
        if (cat.filterProducts) {
          cat.filterProducts.forEach((product, idx) => {
            allProducts.push({
              index: allProducts.length + 1,
              url: product.url,
              title: product.title,
              filters: product.filters || [],
              categoryName: product.categoryName,
              price: product.price,
              image: product.image,
              metadata: product.metadata
            });
          });
        }
      });
    }
    
    // Create analysis
    const uniqueUrls = [...new Set(allProducts.map(p => p.url))];
    const duplicates = allProducts.length - uniqueUrls.length;
    
    const output = {
      summary: {
        totalFound: allProducts.length,
        uniqueUrls: uniqueUrls.length,
        duplicates: duplicates
      },
      allProducts: allProducts
    };
    
    // Save to file
    const filename = 'all_50_products.json';
    await fs.writeFile(filename, JSON.stringify(output, null, 2));
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Total products in results: ${allProducts.length}`);
    console.log(`Unique URLs: ${uniqueUrls.length}`);
    console.log(`Duplicates: ${duplicates}`);
    console.log(`\nFull data saved to: ${filename}`);
    
    // Print all 50 products to console
    console.log('\n=== ALL 50 PRODUCTS ===\n');
    console.log(JSON.stringify(output, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

dumpAllProducts().catch(console.error);