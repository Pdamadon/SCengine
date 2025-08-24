#!/usr/bin/env node

require('dotenv').config();

const FilterBasedExplorationStrategy = require('../../src/core/discovery/strategies/exploration/FilterBasedExplorationStrategy');
const BrowserManagerBrowserless = require('../../src/common/browser/managers/BrowserManagerBrowserless');
const { logger } = require('../../src/utils/logger');
const fs = require('fs');
const path = require('path');

async function testMultiCategoryExport() {
  console.log('🧪 Testing Multi-Category Export with Refactored Strategy');
  console.log('======================================================\n');

  // Test categories from Fig & Willow
  const categories = [
    {
      name: 'Tops',
      url: 'https://shopfigandwillow.com/collections/tops',
      categoryId: 'figwillow_tops'
    },
    {
      name: 'Bottoms', 
      url: 'https://shopfigandwillow.com/collections/bottoms',
      categoryId: 'figwillow_bottoms'
    },
    {
      name: 'Dresses',
      url: 'https://shopfigandwillow.com/collections/dresses', 
      categoryId: 'figwillow_dresses'
    }
  ];

  const browserManager = new BrowserManagerBrowserless({
    logger: logger,
    maxConcurrentPages: 1,
    browserTimeout: 300000 // 5 minutes
  });

  const strategy = new FilterBasedExplorationStrategy(browserManager, {
    maxFilters: 5, // Limit for testing
    maxProductsPerCategory: 100,
    filterTimeout: 5000,
    pageLoadDelay: 2000,
    filterClickDelay: 1000,
    filterProcessDelay: 2000,
    features: {
      canonicalizedDedup: true,
      filterExclusions: true
    }
  });

  const exportData = {
    exportMetadata: {
      timestamp: new Date().toISOString(),
      site: 'shopfigandwillow.com',
      strategy: 'FilterBasedExplorationStrategy',
      processor: 'ProductDiscoveryProcessor',
      version: '2.1.0',
      totalCategories: categories.length
    },
    categories: [],
    products: [],
    summary: {
      totalProducts: 0,
      totalUniqueProducts: 0,
      totalFiltersProcessed: 0,
      avgProductsPerCategory: 0,
      processingTime: 0
    }
  };

  const startTime = Date.now();

  try {
    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📂 Processing Category ${i + 1}/${categories.length}: ${category.name}`);
      console.log(`🌐 URL: ${category.url}`);
      console.log(`${'='.repeat(60)}`);

      const categoryStartTime = Date.now();

      try {
        // Run filter-based exploration
        const results = await strategy.exploreWithFilters(category.url, category.name);
        const categoryDuration = Date.now() - categoryStartTime;

        console.log(`\n📊 Category Results for ${category.name}:`);
        console.log('=====================================');
        console.log(`Products found: ${results.totalProducts}`);
        console.log(`Filters processed: ${results.stats.uniqueFilters}`);
        console.log(`Processing time: ${Math.round(categoryDuration / 1000)}s`);

        // Build category data structure
        const categoryData = {
          categoryId: category.categoryId,
          name: category.name,
          url: category.url,
          discoveredAt: new Date().toISOString(),
          processingTime: categoryDuration,
          stats: {
            totalProducts: results.totalProducts,
            uniqueFilters: results.stats.uniqueFilters,
            filterCombinations: results.stats.filterCombinations,
            avgProductsPerFilter: results.stats.avgProductsPerFilter,
            paginationDetected: results.stats.paginationDetected || false
          },
          filterPaths: results.filterPaths || [],
          utilityStats: results.stats.utilityStats || {}
        };

        exportData.categories.push(categoryData);

        // Process products into database structure
        if (results.products && results.products.length > 0) {
          results.products.forEach((productUrl, index) => {
            const product = {
              productId: `${category.categoryId}_${index + 1}`,
              url: productUrl,
              categoryId: category.categoryId,
              categoryName: category.name,
              siteId: 'shopfigandwillow',
              siteName: 'Fig & Willow',
              discoveredAt: new Date().toISOString(),
              extractionMethod: 'FilterBasedExplorationStrategy',
              filters: Array.isArray(productUrl) ? ['baseline'] : 
                      (results.products.find(p => p.url === productUrl)?.filters || ['baseline']),
              metadata: {
                discoveryOrder: index + 1,
                categoryUrl: category.url,
                extractedVia: 'ProductDiscoveryProcessor'
              }
            };

            exportData.products.push(product);
          });

          console.log(`✅ Exported ${results.products.length} products from ${category.name}`);
        } else {
          console.log(`⚠️  No products found for ${category.name}`);
        }

        // Show sample products
        if (results.products && results.products.length > 0) {
          console.log(`\n🔗 Sample products from ${category.name}:`);
          const sampleProducts = results.products.slice(0, 3);
          sampleProducts.forEach((product, idx) => {
            const url = typeof product === 'string' ? product : product.url;
            console.log(`  ${idx + 1}. ${url}`);
          });
        }

      } catch (categoryError) {
        console.error(`❌ Failed to process ${category.name}:`, categoryError.message);
        
        // Add error category to export
        exportData.categories.push({
          categoryId: category.categoryId,
          name: category.name,
          url: category.url,
          error: categoryError.message,
          discoveredAt: new Date().toISOString(),
          stats: { totalProducts: 0, uniqueFilters: 0 }
        });
      }
    }

    // Calculate summary statistics
    const totalDuration = Date.now() - startTime;
    exportData.summary = {
      totalProducts: exportData.products.length,
      totalUniqueProducts: [...new Set(exportData.products.map(p => p.url))].length,
      totalFiltersProcessed: exportData.categories.reduce((sum, cat) => sum + (cat.stats?.uniqueFilters || 0), 0),
      avgProductsPerCategory: Math.round(exportData.products.length / categories.length),
      processingTime: totalDuration,
      processingTimeSeconds: Math.round(totalDuration / 1000),
      categoriesSuccessful: exportData.categories.filter(cat => !cat.error).length,
      categoriesFailed: exportData.categories.filter(cat => cat.error).length
    };

    // Export to JSON file
    const outputPath = path.join(__dirname, '../../data/results');
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const filename = `multi_category_export_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(outputPath, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));

    // Display final results
    console.log(`\n${'='.repeat(60)}`);
    console.log('🎉 MULTI-CATEGORY EXPORT COMPLETE');
    console.log(`${'='.repeat(60)}`);
    console.log(`📊 Final Summary:`);
    console.log(`  Categories processed: ${exportData.summary.categoriesSuccessful}/${categories.length}`);
    console.log(`  Total products: ${exportData.summary.totalProducts}`);
    console.log(`  Unique products: ${exportData.summary.totalUniqueProducts}`);
    console.log(`  Total filters: ${exportData.summary.totalFiltersProcessed}`);
    console.log(`  Processing time: ${exportData.summary.processingTimeSeconds}s`);
    console.log(`  Avg per category: ${exportData.summary.avgProductsPerCategory} products`);
    console.log(`\n💾 Data exported to: ${filepath}`);
    console.log(`📁 File size: ${Math.round(fs.statSync(filepath).size / 1024)} KB`);

    // Show database structure preview
    console.log(`\n📋 Database Structure Preview:`);
    console.log('===============================');
    console.log('Categories collection:', exportData.categories.length, 'documents');
    console.log('Products collection:', exportData.products.length, 'documents');
    console.log('Sample category:', exportData.categories[0]?.name || 'N/A');
    console.log('Sample product:', exportData.products[0]?.url?.split('/').pop() || 'N/A');

    return {
      success: true,
      filepath: filepath,
      summary: exportData.summary,
      categories: exportData.categories.length,
      products: exportData.products.length
    };

  } catch (error) {
    console.error('💥 Multi-category test failed:', error.message);
    console.error('Stack:', error.stack);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
if (require.main === module) {
  testMultiCategoryExport()
    .then(result => {
      console.log(`\n${'='.repeat(60)}`);
      if (result.success) {
        console.log('🎉 MULTI-CATEGORY EXPORT TEST: PASSED');
        console.log(`📈 Results: ${result.categories} categories, ${result.products} products`);
        console.log(`📁 Export: ${result.filepath}`);
      } else {
        console.log('❌ MULTI-CATEGORY EXPORT TEST: FAILED');
        if (result.error) {
          console.log(`Error: ${result.error}`);
        }
      }
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test crashed:', error);
      process.exit(1);
    });
}

module.exports = { testMultiCategoryExport };