/**
 * Glasswing Full Site MVP Test - Prove 40% → 70% Concept
 * 
 * Simple MVP: Extract ALL products from glasswingshop.com using existing pipeline
 * - Process ALL main categories (not just 2)
 * - Use 3 browsers to handle different categories in parallel
 * - Measure total extraction success rate
 * - Prove concept works at scale
 */

const NavigationMapperBrowserless = require('../../src/core/discovery/NavigationMapperBrowserless');
const FilterBasedExplorationStrategy = require('../../src/core/discovery/strategies/exploration/FilterBasedExplorationStrategy');
const UniversalProductExtractor = require('../../src/core/extraction/UniversalProductExtractor');
const BrowserManagerBrowserless = require('../../src/common/BrowserManagerBrowserless');
const { logger } = require('../../src/utils/logger');

class GlasswingFullMvpTest {
  constructor() {
    this.startTime = Date.now();
    this.results = {
      summary: {},
      navigation: {},
      categories: {},
      products: [],
      performance: {},
      errors: []
    };
    
    // Initialize components
    this.navigationMapper = new NavigationMapperBrowserless(logger);
    this.browserManager = new BrowserManagerBrowserless();
    
    // Create 3 filter explorers for parallel processing
    this.filterExplorers = [
      new FilterBasedExplorationStrategy(this.browserManager, { logger, maxFilters: 20 }),
      new FilterBasedExplorationStrategy(this.browserManager, { logger, maxFilters: 20 }),
      new FilterBasedExplorationStrategy(this.browserManager, { logger, maxFilters: 20 })
    ];
    
    this.universalExtractor = new UniversalProductExtractor(logger);
    
    console.log('🚀 Glasswing Full Site MVP Test Initialized');
    console.log('==========================================');
    console.log('📋 Goal: Extract ALL products from glasswingshop.com');
    console.log('🏗️  Architecture: 3 parallel browsers processing all categories');
    console.log('🎯 Success: Prove >200 products with >50% extraction success\n');
  }

  /**
   * Main MVP test execution
   */
  async run() {
    const testUrl = 'https://glasswingshop.com';
    
    try {
      console.log(`🎯 Target: ${testUrl}`);
      console.log(`📋 Plan: ALL categories → ALL filters → ALL products`);
      console.log(`🏗️  MVP: Prove concept works at full scale\n`);

      // Step 1: Get ALL categories
      const navigation = await this.stepGetAllCategories(testUrl);
      
      // Step 2: Process ALL categories in parallel with 3 browsers
      const allProductUrls = await this.stepProcessAllCategoriesParallel(navigation.allCategories);
      
      // Step 3: Extract ALL products using JSON-LD priority
      const extractedProducts = await this.stepExtractAllProducts(allProductUrls);
      
      // Step 4: Generate MVP results
      await this.generateMvpResults(navigation, allProductUrls, extractedProducts);
      
      return this.results;
      
    } catch (error) {
      this.logError('MAIN_EXECUTION', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Step 1: Get ALL categories from Glasswing
   */
  async stepGetAllCategories(url) {
    const stepStart = Date.now();
    console.log('📍 STEP 1: Discover ALL Categories');
    console.log('==================================');
    
    try {
      console.log(`🔍 Extracting complete navigation from ${url}`);
      
      const navigationResults = await this.navigationMapper.extractNavigation(url);
      const stepTime = Date.now() - stepStart;
      
      console.log(`✅ Navigation extraction completed in ${stepTime}ms`);
      console.log(`📊 Results:`);
      console.log(`   ├─ Strategy: ${navigationResults.strategy}`);
      console.log(`   ├─ Total navigation items: ${navigationResults.totalNavigationItems || 0}`);
      console.log(`   ├─ Main sections found: ${navigationResults.navigation?.length || 0}`);
      console.log(`   └─ Confidence: ${navigationResults.confidence}%`);
      
      // Extract ALL navigable categories
      const allCategories = [];
      if (navigationResults.navigation && navigationResults.navigation.length > 0) {
        console.log(`\n📂 ALL Categories Found:`);
        navigationResults.navigation.forEach((section, i) => {
          console.log(`   ${i + 1}. "${section.name}" (${section.children?.length || 0} subcategories)`);
          
          if (section.children && section.children.length > 0) {
            // Get first navigable subcategory from each main category
            const firstSubcategory = section.children[0];
            allCategories.push({
              name: section.name,
              url: firstSubcategory.url,
              subcategoryName: firstSubcategory.name,
              children: section.children,
              mainIndex: i
            });
            console.log(`      └─ Will process: "${firstSubcategory.name}" → ${firstSubcategory.url}`);
          } else {
            console.log(`      └─ ⚠️  No navigable subcategories`);
          }
        });
      }
      
      console.log(`\n🎯 MVP Target: Process ALL ${allCategories.length} categories`);
      
      // Store navigation results
      this.results.navigation = {
        strategy_used: navigationResults.strategy,
        total_items_found: navigationResults.totalNavigationItems || 0,
        main_sections_found: navigationResults.navigation?.length || 0,
        navigable_categories: allCategories.length,
        confidence: navigationResults.confidence,
        extraction_time_ms: stepTime
      };
      
      console.log(`\n✅ Step 1 Complete - Found ${allCategories.length} navigable categories\n`);
      
      return {
        fullResults: navigationResults,
        allCategories: allCategories
      };
      
    } catch (error) {
      this.logError('NAVIGATION_DISCOVERY', error);
      throw error;
    }
  }

  /**
   * Step 2: Process ALL categories in parallel using 3 browsers
   */
  async stepProcessAllCategoriesParallel(allCategories) {
    const stepStart = Date.now();
    console.log('🎛️  STEP 2: Process ALL Categories in Parallel');
    console.log('=============================================');
    
    try {
      console.log(`📋 Processing ${allCategories.length} categories using 3 browsers`);
      
      // Divide categories among 3 browsers
      const categoriesPerBrowser = Math.ceil(allCategories.length / 3);
      const browserBatches = [
        allCategories.slice(0, categoriesPerBrowser),
        allCategories.slice(categoriesPerBrowser, categoriesPerBrowser * 2),
        allCategories.slice(categoriesPerBrowser * 2)
      ];
      
      console.log(`\n📊 Browser Assignment:`);
      browserBatches.forEach((batch, i) => {
        console.log(`   Browser ${i + 1}: ${batch.length} categories (${batch.map(c => `"${c.name}"`).join(', ')})`);
      });
      
      // Process all browsers in parallel
      console.log(`\n🚀 Starting parallel category processing...`);
      const browserPromises = browserBatches.map((batch, browserIndex) => 
        this.processCategoriesBatch(batch, browserIndex + 1)
      );
      
      const batchResults = await Promise.all(browserPromises);
      
      // Combine all results
      const allProductUrls = [];
      const allCategoryResults = {};
      
      batchResults.forEach((batchResult, browserIndex) => {
        allProductUrls.push(...batchResult.productUrls);
        Object.assign(allCategoryResults, batchResult.categoryResults);
        console.log(`✅ Browser ${browserIndex + 1}: ${batchResult.productUrls.length} products collected`);
      });
      
      const stepTime = Date.now() - stepStart;
      console.log(`\n✅ Step 2 Complete - Collected ${allProductUrls.length} product URLs in ${stepTime}ms`);
      console.log(`📊 Category Processing Summary:`);
      console.log(`   ├─ Categories processed: ${allCategories.length}`);
      console.log(`   ├─ Total products found: ${allProductUrls.length}`);
      console.log(`   ├─ Average products per category: ${Math.round(allProductUrls.length / allCategories.length)}`);
      console.log(`   └─ Processing time: ${stepTime}ms\n`);
      
      // Store category results
      this.results.categories = {
        categories_processed: allCategories.length,
        total_products_collected: allProductUrls.length,
        extraction_time_ms: stepTime,
        browser_batches: browserBatches.map((batch, i) => ({
          browser_id: i + 1,
          categories_assigned: batch.length,
          products_collected: batchResults[i].productUrls.length
        })),
        ...allCategoryResults
      };
      
      return allProductUrls;
      
    } catch (error) {
      this.logError('PARALLEL_CATEGORY_PROCESSING', error);
      throw error;
    }
  }

  /**
   * Process a batch of categories using one browser (REUSE sessions!)
   */
  async processCategoriesBatch(categories, browserNumber) {
    console.log(`\n🏃 Browser ${browserNumber}: Processing ${categories.length} categories`);
    
    const batchProductUrls = [];
    const batchCategoryResults = {};
    
    // Create ONE browser session for this entire batch
    let batchSession = null;
    
    try {
      console.log(`\n🌐 Browser ${browserNumber}: Creating single session for batch`);
      batchSession = await this.browserManager.createBrowser('stealth', {
        site: 'glasswingshop.com',
        headless: true
      });
      
      const filterExplorer = this.filterExplorers[browserNumber - 1];
      
      for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        const categoryStart = Date.now();
        
        console.log(`\n📂 Browser ${browserNumber} - Category ${i + 1}/${categories.length}: "${category.name}"`);
        console.log(`🔗 URL: ${category.url}`);
        
        try {
          // Pass the existing session to reuse instead of creating new ones
          const filterResults = await filterExplorer.exploreWithFiltersUsingSession(
            category.url, 
            category.name,
            batchSession // REUSE THE EXISTING SESSION
          );
        
        const categoryTime = Date.now() - categoryStart;
        
        // Extract product URLs from all filters (not just first 2)
        let categoryProductUrls = [];
        
        if (filterResults.filterPaths && filterResults.filterPaths.length > 0) {
          console.log(`   ├─ Filters found: ${filterResults.filterPaths.length}`);
          
          // Take ALL products from ALL filters
          filterResults.filterPaths.forEach((filterPath, j) => {
            const filterProducts = filterPath.products || [];
            console.log(`   ├─ Filter ${j + 1}: "${filterPath.filterName}" → ${filterProducts.length} products`);
            
            filterProducts.forEach((product, k) => {
              categoryProductUrls.push({
                url: product.url,
                title: product.title,
                price: product.price,
                image: product.image,
                categoryName: category.name,
                filterName: filterPath.filterName,
                browserNumber: browserNumber
              });
            });
          });
        } else if (filterResults.products && filterResults.products.length > 0) {
          // Fallback to direct products
          console.log(`   ├─ Direct products: ${filterResults.products.length}`);
          filterResults.products.forEach((product, k) => {
            categoryProductUrls.push({
              url: product.url,
              title: product.title,
              price: product.price,
              image: product.image,
              categoryName: category.name,
              filterName: 'direct_products',
              browserNumber: browserNumber
            });
          });
        }
        
        batchProductUrls.push(...categoryProductUrls);
        
        console.log(`   └─ Browser ${browserNumber}: "${category.name}" → ${categoryProductUrls.length} products (${categoryTime}ms)`);
        
        batchCategoryResults[`category_${category.mainIndex + 1}`] = {
          name: category.name,
          url: category.url,
          browser_number: browserNumber,
          products_found: categoryProductUrls.length,
          filters_found: filterResults.filterPaths?.length || 0,
          extraction_time_ms: categoryTime
        };
        
      } catch (categoryError) {
        console.log(`   ❌ Browser ${browserNumber}: "${category.name}" failed: ${categoryError.message}`);
        this.logError(`BROWSER_${browserNumber}_CATEGORY_${i + 1}`, categoryError);
        
        batchCategoryResults[`category_${category.mainIndex + 1}`] = {
          name: category.name,
          url: category.url,
          browser_number: browserNumber,
          error: categoryError.message,
          extraction_time_ms: Date.now() - categoryStart
        };
      }
    }
    
    console.log(`✅ Browser ${browserNumber} Complete: ${batchProductUrls.length} products from ${categories.length} categories`);
    
    return {
      productUrls: batchProductUrls,
      categoryResults: batchCategoryResults
    };
  }

  /**
   * Step 3: Extract ALL products using JSON-LD priority
   */
  async stepExtractAllProducts(productUrls) {
    const stepStart = Date.now();
    console.log('📦 STEP 3: Extract ALL Products (JSON-LD Priority)');
    console.log('=================================================');
    
    try {
      console.log(`🎯 Extracting ${productUrls.length} products using JSON-LD + DOM fallback`);
      console.log(`⚡ Strategy: Speed-optimized extraction for MVP validation`);
      
      const extractedProducts = [];
      let jsonLdSuccesses = 0;
      let failures = 0;
      
      // Process in smaller concurrent batches to avoid overwhelming
      const batchSize = 3; // 3 concurrent extractions max
      
      for (let i = 0; i < productUrls.length; i += batchSize) {
        const batch = productUrls.slice(i, i + batchSize);
        console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(productUrls.length / batchSize)} (${batch.length} products)`);
        
        const batchPromises = batch.map((productInfo, batchIndex) => 
          this.extractSingleProduct(productInfo, i + batchIndex + 1, productUrls.length)
        );
        
        const batchResults = await Promise.all(batchPromises);
        extractedProducts.push(...batchResults);
        
        // Update counters
        batchResults.forEach(result => {
          if (result.error) {
            failures++;
          } else if (result.extraction_method === 'jsonLd') {
            jsonLdSuccesses++;
          }
        });
        
        // Progress update
        const completed = i + batch.length;
        const successRate = Math.round(((completed - failures) / completed) * 100);
        const jsonLdRate = Math.round((jsonLdSuccesses / completed) * 100);
        console.log(`   ✅ Progress: ${completed}/${productUrls.length} (${successRate}% success, ${jsonLdRate}% JSON-LD)`);
      }
      
      const stepTime = Date.now() - stepStart;
      const avgExtractionTime = extractedProducts.length > 0 ? Math.round(stepTime / extractedProducts.length) : 0;
      const successfulProducts = extractedProducts.filter(p => !p.error);
      
      console.log(`\n✅ Step 3 Complete - Processed ${extractedProducts.length} products in ${stepTime}ms`);
      console.log(`📊 MVP Extraction Results:`);
      console.log(`   ├─ Successful extractions: ${successfulProducts.length}/${extractedProducts.length}`);
      console.log(`   ├─ Success rate: ${Math.round((successfulProducts.length / extractedProducts.length) * 100)}%`);
      console.log(`   ├─ JSON-LD successes: ${jsonLdSuccesses} (${Math.round((jsonLdSuccesses / extractedProducts.length) * 100)}%)`);
      console.log(`   ├─ Average time per product: ${avgExtractionTime}ms`);
      console.log(`   └─ Total extraction time: ${Math.round(stepTime / 1000)}s\n`);
      
      return extractedProducts;
      
    } catch (error) {
      this.logError('PRODUCT_EXTRACTION', error);
      throw error;
    }
  }

  /**
   * Extract a single product
   */
  async extractSingleProduct(productInfo, index, total) {
    const productStart = Date.now();
    
    let session = null;
    try {
      // Create fresh session for each product
      session = await this.browserManager.createBrowser('stealth', {
        site: 'glasswingshop.com',
        headless: true
      });
      
      const page = session.page;
      await page.goto(productInfo.url, { waitUntil: 'networkidle', timeout: 10000 });
      
      // Extract using UniversalProductExtractor (JSON-LD priority)
      const productData = await Promise.race([
        this.universalExtractor.extract(page, {
          url: productInfo.url,
          includeVariants: false, // Skip variants for MVP speed
          includeImages: false     // Skip images for MVP speed
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Extraction timeout')), 8000))
      ]);
      
      const extractionTime = Date.now() - productStart;
      
      return {
        url: productInfo.url,
        title: productData.title || productInfo.title,
        price: productData.price,
        brand: productData.brand,
        description: productData.description,
        sku: productData.sku,
        
        // Context
        category_name: productInfo.categoryName,
        filter_name: productInfo.filterName,
        browser_number: productInfo.browserNumber,
        
        // Extraction metadata
        extraction_method: productData.extractionMethod,
        extraction_time_ms: extractionTime,
        index: index
      };
      
    } catch (productError) {
      return {
        url: productInfo.url,
        title: productInfo.title,
        category_name: productInfo.categoryName,
        filter_name: productInfo.filterName,
        browser_number: productInfo.browserNumber,
        error: productError.message,
        extraction_time_ms: Date.now() - productStart,
        index: index
      };
    } finally {
      if (session && session.close) {
        await session.close();
      }
    }
  }

  /**
   * Generate MVP results and prove concept
   */
  async generateMvpResults(navigation, allProductUrls, extractedProducts) {
    const totalTime = Date.now() - this.startTime;
    const successfulProducts = extractedProducts.filter(p => !p.error);
    const jsonLdSuccesses = extractedProducts.filter(p => p.extraction_method === 'jsonLd').length;
    
    console.log('\n🎯 MVP RESULTS - CONCEPT VALIDATION');
    console.log('===================================');
    console.log(`⏱️  Total test time: ${Math.round(totalTime / 1000)}s (${Math.round(totalTime / 60000)}min)`);
    console.log(`📂 Categories processed: ${navigation.allCategories.length}`);
    console.log(`🔍 Product URLs discovered: ${allProductUrls.length}`);
    console.log(`📦 Products extracted: ${successfulProducts.length}/${extractedProducts.length}`);
    console.log(`🧬 JSON-LD success rate: ${Math.round((jsonLdSuccesses / extractedProducts.length) * 100)}%`);
    console.log(`📈 Overall success rate: ${Math.round((successfulProducts.length / extractedProducts.length) * 100)}%`);
    
    // MVP Success Criteria
    const mvpSuccess = successfulProducts.length > 200 && 
                      (successfulProducts.length / extractedProducts.length) > 0.5;
    
    console.log(`\n🎯 MVP VALIDATION:`);
    console.log(`   ├─ Target: >200 products with >50% success`);
    console.log(`   ├─ Actual: ${successfulProducts.length} products with ${Math.round((successfulProducts.length / extractedProducts.length) * 100)}% success`);
    console.log(`   └─ Result: ${mvpSuccess ? '✅ MVP PROVEN!' : '❌ MVP needs refinement'}`);
    
    // Store comprehensive results
    this.results.summary = {
      mvp_goal: "Extract all products from glasswingshop.com to prove 40% → 70% concept",
      categories_processed: navigation.allCategories.length,
      product_urls_discovered: allProductUrls.length,
      products_extracted: successfulProducts.length,
      total_attempts: extractedProducts.length,
      success_rate_percent: Math.round((successfulProducts.length / extractedProducts.length) * 100),
      json_ld_success_rate_percent: Math.round((jsonLdSuccesses / extractedProducts.length) * 100),
      total_time_minutes: Math.round(totalTime / 60000),
      mvp_validation: mvpSuccess ? 'PROVEN' : 'NEEDS_REFINEMENT'
    };
    
    this.results.products = extractedProducts;
    
    this.results.performance = {
      total_time_ms: totalTime,
      navigation_time_ms: this.results.navigation.extraction_time_ms,
      category_processing_time_ms: this.results.categories.extraction_time_ms,
      product_extraction_time_ms: totalTime - this.results.navigation.extraction_time_ms - this.results.categories.extraction_time_ms,
      average_product_time_ms: Math.round(extractedProducts.reduce((sum, p) => sum + (p.extraction_time_ms || 0), 0) / extractedProducts.length)
    };
  }

  /**
   * Log errors with context
   */
  logError(context, error) {
    const errorInfo = {
      context: context,
      message: error.message,
      timestamp: new Date().toISOString()
    };
    
    this.results.errors.push(errorInfo);
    console.error(`❌ ERROR [${context}]: ${error.message}`);
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      await this.navigationMapper.cleanup();
      console.log('\n🧹 MVP test cleanup completed');
    } catch (error) {
      console.warn(`⚠️  Cleanup warning: ${error.message}`);
    }
  }
}

// Export for module use
module.exports = { GlasswingFullMvpTest };

// Run test if called directly
if (require.main === module) {
  async function runMvpTest() {
    const test = new GlasswingFullMvpTest();
    
    try {
      const results = await test.run();
      
      // Output final JSON
      console.log('\n📄 MVP RESULTS JSON:');
      console.log('===================');
      console.log(JSON.stringify(results.summary, null, 2));
      
      // Final MVP validation
      if (results.summary.mvp_validation === 'PROVEN') {
        console.log('\n🎉 MVP CONCEPT PROVEN!');
        console.log('✅ Full-site extraction works at scale');
        console.log('✅ Success rate demonstrates viability');
        console.log('✅ Ready for optimization and scaling');
      } else {
        console.log('\n⚠️  MVP needs refinement - but baseline established');
        console.log(`📊 ${results.summary.products_extracted} products extracted`);
        console.log(`📈 ${results.summary.success_rate_percent}% success rate`);
      }
      
      // Save results to file
      const fs = require('fs');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `glasswing_mvp_results_${timestamp}.json`;
      fs.writeFileSync(filename, JSON.stringify(results, null, 2));
      console.log(`\n💾 Full results saved to: ${filename}`);
      
    } catch (error) {
      console.error(`\n💥 MVP test failed: ${error.message}`);
      console.error(error.stack);
      process.exit(1);
    }
  }
  
  runMvpTest();
}