/**
 * Modular Glasswing Pipeline Test with Exhaustive Logging
 * 
 * Tests each pipeline component independently:
 * 1. NavigationMapperBrowserless → Get first 2 main categories
 * 2. FilterBasedExplorationStrategy → Apply first 2 filters per category
 * 3. Hybrid Product Extraction → Extract 2 products per filter (8 total)
 * 
 * Features:
 * - Exhaustive console logging at each step
 * - Detailed JSON output for analysis
 * - Performance timing per operation
 * - Success/failure tracking with context
 */

const NavigationMapperBrowserless = require('../../src/core/discovery/NavigationMapperBrowserless');
const FilterBasedExplorationStrategy = require('../../src/core/discovery/strategies/exploration/FilterBasedExplorationStrategy');
const UniversalProductExtractor = require('../../src/core/extraction/UniversalProductExtractor');
const SelectorDiscovery = require('../../src/common/SelectorDiscovery');
const BrowserManagerBrowserless = require('../../src/common/BrowserManagerBrowserless');
const { logger } = require('../../src/utils/logger');

class GlasswingModularTest {
  constructor() {
    this.startTime = Date.now();
    this.results = {
      summary: {},
      navigation: {},
      filters: {},
      products: [],
      performance: {},
      errors: []
    };
    
    // Initialize components
    this.navigationMapper = new NavigationMapperBrowserless(logger);
    this.browserManager = new BrowserManagerBrowserless();
    this.filterExplorer = new FilterBasedExplorationStrategy(this.browserManager, {
      logger: logger,
      maxFilters: 10,
      filterTimeout: 5000
    });
    this.universalExtractor = new UniversalProductExtractor(logger);
    this.selectorDiscovery = new SelectorDiscovery(logger);
    
    // Browser session management
    this.browserSession = null;
    
    console.log('🚀 Glasswing Modular Pipeline Test Initialized');
    console.log('==============================================');
  }

  /**
   * Main test execution
   */
  async run() {
    const testUrl = 'https://glasswingshop.com';
    
    try {
      console.log(`🎯 Target: ${testUrl}`);
      console.log(`📋 Plan: First 2 categories → First 2 filters each → 2 products per filter`);
      console.log(`🏗️  Architecture: Modular components with data passing\n`);

      // Initialize browser session
      console.log('🌐 Creating browser session...');
      this.browserSession = await this.browserManager.createBrowser('stealth', {
        site: 'glasswingshop.com',
        headless: true
      });
      console.log('✅ Browser session created\n');

      // Step 1: Navigation Discovery
      const navigation = await this.stepNavigationDiscovery(testUrl);
      
      // Step 2: Filter-Based Product Collection
      const filterResults = await this.stepFilterBasedCollection(navigation.selectedCategories);
      
      // Step 3: Hybrid Product Extraction
      const extractedProducts = await this.stepHybridExtraction(filterResults.productUrls);
      
      // Step 4: Generate Results
      await this.generateResults(navigation, filterResults, extractedProducts);
      
      return this.results;
      
    } catch (error) {
      this.logError('MAIN_EXECUTION', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Step 1: Navigation Discovery using NavigationMapperBrowserless
   */
  async stepNavigationDiscovery(url) {
    const stepStart = Date.now();
    console.log('📍 STEP 1: Navigation Discovery');
    console.log('================================');
    
    try {
      console.log(`🔍 Calling NavigationMapperBrowserless.extractNavigation("${url}")`);
      
      const navigationResults = await this.navigationMapper.extractNavigation(url);
      const stepTime = Date.now() - stepStart;
      
      console.log(`✅ Navigation extraction completed in ${stepTime}ms`);
      console.log(`📊 Results:`);
      console.log(`   ├─ Strategy used: ${navigationResults.strategy}`);
      console.log(`   ├─ Total navigation items: ${navigationResults.totalNavigationItems || 0}`);
      console.log(`   ├─ Main sections found: ${navigationResults.navigation?.length || 0}`);
      console.log(`   └─ Confidence: ${navigationResults.confidence}%`);
      
      // Show all main sections
      if (navigationResults.navigation && navigationResults.navigation.length > 0) {
        console.log(`\n📂 All Main Categories Found:`);
        navigationResults.navigation.forEach((section, i) => {
          console.log(`   ${i + 1}. "${section.name}" → ${section.url}`);
          if (section.children && section.children.length > 0) {
            console.log(`      └─ ${section.children.length} subcategories`);
          }
        });
      }
      
      // Select first 2 categories and extract navigable URLs from children
      const mainCategories = navigationResults.navigation?.slice(0, 2) || [];
      const selectedCategories = [];
      
      console.log(`\n🎯 Processing First 2 Categories for Navigable URLs:`);
      mainCategories.forEach((category, i) => {
        console.log(`   ${i + 1}. "${category.name}" (${category.children?.length || 0} subcategories)`);
        
        // Find first navigable subcategory URL
        if (category.children && category.children.length > 0) {
          const firstSubcategory = category.children[0];
          selectedCategories.push({
            name: category.name,
            url: firstSubcategory.url,
            originalCategory: category.name,
            subcategoryName: firstSubcategory.name,
            children: category.children
          });
          console.log(`      └─ Using: "${firstSubcategory.name}" → ${firstSubcategory.url}`);
        } else {
          console.log(`      └─ ⚠️  No navigable subcategories found`);
        }
      });
      
      console.log(`\n🎯 Selected Categories with Navigable URLs:`);
      selectedCategories.forEach((category, i) => {
        console.log(`   ${i + 1}. "${category.originalCategory}" via "${category.subcategoryName}" → ${category.url}`);
      });
      
      // Store results
      this.results.navigation = {
        strategy_used: navigationResults.strategy,
        total_items_found: navigationResults.totalNavigationItems || 0,
        main_sections_found: navigationResults.navigation?.length || 0,
        confidence: navigationResults.confidence,
        categories_selected: selectedCategories.length,
        selected_categories: selectedCategories.map(c => ({
          name: c.originalCategory,
          url: c.url,
          subcategory_name: c.subcategoryName,
          children_count: c.children?.length || 0
        })),
        extraction_time_ms: stepTime
      };
      
      console.log(`\n✅ Step 1 Complete - Selected ${selectedCategories.length} categories\n`);
      
      return {
        fullResults: navigationResults,
        selectedCategories: selectedCategories
      };
      
    } catch (error) {
      this.logError('NAVIGATION_DISCOVERY', error);
      throw error;
    }
  }

  /**
   * Step 2: Filter-Based Product Collection
   */
  async stepFilterBasedCollection(selectedCategories) {
    const stepStart = Date.now();
    console.log('🎛️  STEP 2: Filter-Based Product Collection');
    console.log('==========================================');
    
    const allProductUrls = [];
    const categoryResults = {};
    
    try {
      console.log(`📋 Processing ${selectedCategories.length} categories with filter exploration`);
      
      for (let i = 0; i < selectedCategories.length; i++) {
        const category = selectedCategories[i];
        const categoryStart = Date.now();
        
        console.log(`\n📂 Category ${i + 1}: "${category.name}"`);
        console.log(`🔗 URL: ${category.url}`);
        console.log(`🔍 Calling FilterBasedExplorationStrategy.exploreWithFilters()`);
        
        try {
          const filterResults = await this.filterExplorer.exploreWithFilters(
            category.url, 
            category.name
          );
          
          const categoryTime = Date.now() - categoryStart;
          console.log(`✅ Filter exploration completed in ${categoryTime}ms`);
          
          // Log filter results
          console.log(`📊 Filter Results:`);
          console.log(`   ├─ Total products found: ${filterResults.totalProducts || 0}`);
          console.log(`   ├─ Filter paths explored: ${filterResults.filterPaths?.length || 0}`);
          console.log(`   ├─ Unique filters used: ${filterResults.stats?.uniqueFilters || 0}`);
          console.log(`   └─ Direct products: ${filterResults.products?.length || 0}`);
          
          // Show filter paths details
          if (filterResults.filterPaths && filterResults.filterPaths.length > 0) {
            console.log(`\n🎛️  Filter Paths Found:`);
            filterResults.filterPaths.slice(0, 4).forEach((path, j) => {
              console.log(`   ${j + 1}. Filter: "${path.filterName}" (${path.products?.length || 0} products)`);
              if (path.filterSelector) {
                console.log(`      └─ Selector: ${path.filterSelector}`);
              }
            });
          }
          
          // Extract product URLs - check both filterPaths and direct products
          let categoryProductUrls = [];
          let selectedFilterResults = [];
          
          if (filterResults.filterPaths && filterResults.filterPaths.length > 0) {
            // Use filter paths if available
            selectedFilterResults = filterResults.filterPaths.slice(0, 2);
            console.log(`\n🎯 Selecting First 2 Filters for Product Extraction:`);
            
            selectedFilterResults.forEach((filterPath, j) => {
              const filterProducts = filterPath.products?.slice(0, 2) || []; // 2 products per filter
              console.log(`   Filter ${j + 1}: "${filterPath.filterName}" → ${filterProducts.length} products selected`);
              
              filterProducts.forEach((product, k) => {
                console.log(`     Product ${k + 1}: ${product.title || 'No title'} → ${product.url}`);
                categoryProductUrls.push({
                  url: product.url,
                  title: product.title,
                  price: product.price,
                  image: product.image,
                  categoryName: category.name,
                  filterName: filterPath.filterName,
                  filterIndex: j,
                  productIndex: k
                });
              });
            });
          } else if (filterResults.products && filterResults.products.length > 0) {
            // Fallback to direct products if no filters found
            console.log(`\n🎯 No filters found, using direct products for extraction:`);
            const directProducts = filterResults.products.slice(0, 1); // Take 1 product only to prevent hanging
            
            directProducts.forEach((product, k) => {
              console.log(`   Product ${k + 1}: ${product.title || 'No title'} → ${product.url}`);
              categoryProductUrls.push({
                url: product.url,
                title: product.title,
                price: product.price,
                image: product.image,
                categoryName: category.name,
                filterName: 'direct_products',
                filterIndex: 0,
                productIndex: k
              });
            });
            
            // Create pseudo filter results for tracking
            selectedFilterResults = [{
              filterName: 'direct_products',
              products: directProducts
            }];
          } else {
            console.log(`\n⚠️  No products found in filter results`);
          }
          
          allProductUrls.push(...categoryProductUrls);
          
          // Store category results
          categoryResults[`category_${i + 1}`] = {
            name: category.name,
            url: category.url,
            filters_found: filterResults.filterPaths?.length || 0,
            filters_selected: selectedFilterResults.length,
            products_found_total: filterResults.totalProducts || 0,
            products_selected: categoryProductUrls.length,
            filter_details: selectedFilterResults.map((path, j) => ({
              filter_name: path.filterName,
              filter_selector: path.filterSelector,
              products_available: path.products?.length || 0,
              products_selected: Math.min(2, path.products?.length || 0)
            })),
            extraction_time_ms: categoryTime
          };
          
          console.log(`✅ Category "${category.name}" - Selected ${categoryProductUrls.length} products`);
          
        } catch (categoryError) {
          this.logError(`FILTER_CATEGORY_${i + 1}`, categoryError);
          categoryResults[`category_${i + 1}`] = {
            name: category.name,
            url: category.url,
            error: categoryError.message,
            extraction_time_ms: Date.now() - categoryStart
          };
        }
      }
      
      const stepTime = Date.now() - stepStart;
      console.log(`\n✅ Step 2 Complete - Collected ${allProductUrls.length} product URLs in ${stepTime}ms\n`);
      
      // Store filter results
      this.results.filters = {
        categories_processed: selectedCategories.length,
        total_products_collected: allProductUrls.length,
        extraction_time_ms: stepTime,
        ...categoryResults
      };
      
      return {
        productUrls: allProductUrls,
        categoryResults: categoryResults
      };
      
    } catch (error) {
      this.logError('FILTER_BASED_COLLECTION', error);
      throw error;
    }
  }

  /**
   * Step 3: Hybrid Product Extraction (JSON-LD + SelectorDiscovery sampling)
   */
  async stepHybridExtraction(productUrls) {
    const stepStart = Date.now();
    console.log('📦 STEP 3: Hybrid Product Extraction');
    console.log('====================================');
    
    try {
      console.log(`🎯 Extracting ${productUrls.length} products using hybrid approach`);
      console.log(`🔧 Strategy: JSON-LD for all + SelectorDiscovery sampling`);
      
      const extractedProducts = [];
      let jsonLdSuccesses = 0;
      let selectorDiscoveryValidations = 0;
      
      // Group products by filter for sampling
      const productsByFilter = {};
      productUrls.forEach(product => {
        const key = `${product.categoryName}_${product.filterName}`;
        if (!productsByFilter[key]) productsByFilter[key] = [];
        productsByFilter[key].push(product);
      });
      
      console.log(`\n📊 Product Groups (for sampling strategy):`);
      Object.keys(productsByFilter).forEach(key => {
        console.log(`   ${key}: ${productsByFilter[key].length} products`);
      });
      
      // Process each product
      for (let i = 0; i < productUrls.length; i++) {
        const productInfo = productUrls[i];
        const productStart = Date.now();
        
        console.log(`\n🎯 Product ${i + 1}/${productUrls.length}: "${productInfo.title || 'Unknown'}"`);
        console.log(`🔗 URL: ${productInfo.url}`);
        console.log(`📂 Category: ${productInfo.categoryName} / Filter: ${productInfo.filterName}`);
        
        let freshSession = null;
        try {
          // Create fresh page since components manage their own sessions independently
          freshSession = await this.browserManager.createBrowser('stealth', {
            site: 'glasswingshop.com',
            headless: true
          });
          const page = freshSession.page;
          await page.goto(productInfo.url, { waitUntil: 'networkidle', timeout: 15000 });
          
          // Step 3A: JSON-LD + DOM Fallback Extraction
          console.log(`   🔍 Running JSON-LD + DOM fallback extraction...`);
          const basicExtractionStart = Date.now();
          
          const basicData = await Promise.race([
            this.universalExtractor.extract(page, {
              url: productInfo.url,
              includeVariants: true,
              includeImages: true
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Extraction timeout')), 10000))
          ]);
          
          const basicExtractionTime = Date.now() - basicExtractionStart;
          const jsonLdSuccess = basicData.extractionMethod === 'jsonLd';
          if (jsonLdSuccess) jsonLdSuccesses++;
          
          console.log(`   ✅ Basic extraction completed in ${basicExtractionTime}ms`);
          console.log(`      ├─ Method used: ${basicData.extractionMethod || 'unknown'}`);
          console.log(`      ├─ Title: ${basicData.title || 'N/A'}`);
          console.log(`      ├─ Price: ${basicData.price ? `$${(basicData.price / 100).toFixed(2)}` : 'N/A'}`);
          console.log(`      ├─ Brand: ${basicData.brand || 'N/A'}`);
          console.log(`      ├─ Variants: ${basicData.variants?.length || 0}`);
          console.log(`      └─ Images: ${basicData.images?.length || 0}`);
          
          // Step 3B: SelectorDiscovery Sampling (1 per filter group)
          let interactionData = null;
          let selectorDiscoveryTime = 0;
          const isFirstInFilter = productInfo.productIndex === 0; // Sample first product in each filter
          
          if (isFirstInFilter) {
            console.log(`   🎯 SAMPLE: Running SelectorDiscovery validation (first in filter)...`);
            const selectorStart = Date.now();
            
            try {
              interactionData = await Promise.race([
                this.selectorDiscovery.discoverPatterns(page, productInfo.url),
                new Promise((_, reject) => setTimeout(() => reject(new Error('SelectorDiscovery timeout')), 8000))
              ]);
              selectorDiscoveryTime = Date.now() - selectorStart;
              selectorDiscoveryValidations++;
              
              console.log(`   ✅ SelectorDiscovery completed in ${selectorDiscoveryTime}ms`);
              console.log(`      ├─ Variant groups found: ${interactionData.variantGroups?.length || 0}`);
              console.log(`      ├─ Cart button found: ${interactionData.cartButton ? 'Yes' : 'No'}`);
              console.log(`      ├─ Price selector: ${interactionData.priceSelector ? 'Yes' : 'No'}`);
              console.log(`      └─ Availability selector: ${interactionData.availabilitySelector ? 'Yes' : 'No'}`);
              
              if (interactionData.variantGroups && interactionData.variantGroups.length > 0) {
                console.log(`      Variant details:`);
                interactionData.variantGroups.forEach((group, j) => {
                  console.log(`        ${j + 1}. ${group.type}: ${group.options?.length || 0} options`);
                });
              }
              
            } catch (selectorError) {
              console.log(`   ⚠️  SelectorDiscovery failed: ${selectorError.message}`);
              this.logError(`SELECTOR_DISCOVERY_PRODUCT_${i + 1}`, selectorError);
            }
          } else {
            console.log(`   ⏭️  Skipping SelectorDiscovery (using sampling strategy)`);
          }
          
          // Step 3C: Merge and Build Final Product
          const productExtractionTime = Date.now() - productStart;
          const confidenceScore = this.calculateConfidenceScore(basicData, interactionData, isFirstInFilter);
          
          const finalProduct = {
            url: productInfo.url,
            title: basicData.title || productInfo.title,
            price: basicData.price,
            brand: basicData.brand,
            description: basicData.description,
            sku: basicData.sku,
            categories: basicData.categories,
            variants: this.mergeVariantData(basicData.variants, interactionData?.variantGroups),
            images: basicData.images,
            
            // Extraction metadata
            extraction_method: basicData.extractionMethod,
            extraction_mode: 'hybrid',
            selector_discovery_validated: !!interactionData,
            is_sample: isFirstInFilter,
            
            // Context
            category_name: productInfo.categoryName,
            filter_name: productInfo.filterName,
            filter_index: productInfo.filterIndex,
            product_index: productInfo.productIndex,
            
            // Performance
            extraction_time_ms: productExtractionTime,
            basic_extraction_time_ms: basicExtractionTime,
            selector_discovery_time_ms: selectorDiscoveryTime,
            confidence_score: confidenceScore,
            
            // Interaction patterns (if validated)
            interaction_patterns: interactionData ? {
              variant_selectors: interactionData.variantGroups || [],
              cart_button: interactionData.cartButton,
              price_selector: interactionData.priceSelector,
              availability_selector: interactionData.availabilitySelector
            } : null
          };
          
          extractedProducts.push(finalProduct);
          
          console.log(`   ✅ Product extraction complete - Confidence: ${confidenceScore}%`);
          
        } catch (productError) {
          console.log(`   ❌ Product extraction failed: ${productError.message}`);
          this.logError(`PRODUCT_EXTRACTION_${i + 1}`, productError);
          
          // Add error product
          extractedProducts.push({
            url: productInfo.url,
            title: productInfo.title,
            category_name: productInfo.categoryName,
            filter_name: productInfo.filterName,
            error: productError.message,
            extraction_time_ms: Date.now() - productStart
          });
        } finally {
          // Close the fresh session
          if (freshSession && freshSession.close) {
            await freshSession.close();
          }
        }
      }
      
      const stepTime = Date.now() - stepStart;
      const avgExtractionTime = extractedProducts.length > 0 ? Math.round(stepTime / extractedProducts.length) : 0;
      
      console.log(`\n✅ Step 3 Complete - Extracted ${extractedProducts.length} products in ${stepTime}ms`);
      console.log(`📊 Extraction Summary:`);
      console.log(`   ├─ JSON-LD successes: ${jsonLdSuccesses}/${extractedProducts.length} (${Math.round((jsonLdSuccesses / extractedProducts.length) * 100)}%)`);
      console.log(`   ├─ SelectorDiscovery validations: ${selectorDiscoveryValidations}`);
      console.log(`   ├─ Average time per product: ${avgExtractionTime}ms`);
      console.log(`   └─ Hybrid extraction efficiency: ${extractedProducts.filter(p => !p.error).length}/${extractedProducts.length}`);
      
      return extractedProducts;
      
    } catch (error) {
      this.logError('HYBRID_EXTRACTION', error);
      throw error;
    }
  }

  /**
   * Generate final results JSON
   */
  async generateResults(navigation, filterResults, extractedProducts) {
    const totalTime = Date.now() - this.startTime;
    const successfulProducts = extractedProducts.filter(p => !p.error);
    const jsonLdSuccesses = extractedProducts.filter(p => p.extraction_method === 'jsonLd').length;
    const selectorValidations = extractedProducts.filter(p => p.selector_discovery_validated).length;
    
    console.log('\n📊 FINAL RESULTS SUMMARY');
    console.log('========================');
    console.log(`⏱️  Total test time: ${totalTime}ms`);
    console.log(`📂 Categories processed: ${navigation.selectedCategories.length}`);
    console.log(`🎛️  Filters applied: ${Object.keys(filterResults.categoryResults).length * 2}`);
    console.log(`📦 Products extracted: ${successfulProducts.length}/${extractedProducts.length}`);
    console.log(`🧬 JSON-LD success rate: ${Math.round((jsonLdSuccesses / extractedProducts.length) * 100)}%`);
    console.log(`🔍 SelectorDiscovery validations: ${selectorValidations}`);
    console.log(`🎯 Test goal achievement: ${successfulProducts.length >= 8 ? '✅ SUCCESS' : '❌ PARTIAL'}`);
    
    // Build comprehensive results
    this.results.summary = {
      test_goal: "Extract 2 products from first 2 filters in first 2 categories",
      target_products: 8,
      actual_products: successfulProducts.length,
      success_rate: Math.round((successfulProducts.length / 8) * 100),
      json_ld_success_rate: Math.round((jsonLdSuccesses / extractedProducts.length) * 100),
      selector_discovery_samples: selectorValidations,
      total_time_ms: totalTime,
      test_result: successfulProducts.length >= 8 ? 'SUCCESS' : 'PARTIAL'
    };
    
    this.results.products = extractedProducts;
    
    this.results.performance = {
      navigation_ms: this.results.navigation.extraction_time_ms,
      filter_discovery_ms: this.results.filters.extraction_time_ms,
      product_extraction_ms: extractedProducts.reduce((sum, p) => sum + (p.extraction_time_ms || 0), 0),
      average_product_extraction_ms: Math.round(extractedProducts.reduce((sum, p) => sum + (p.extraction_time_ms || 0), 0) / extractedProducts.length),
      json_ld_average_ms: Math.round(extractedProducts.reduce((sum, p) => sum + (p.basic_extraction_time_ms || 0), 0) / extractedProducts.length),
      selector_discovery_average_ms: selectorValidations > 0 ? Math.round(extractedProducts.reduce((sum, p) => sum + (p.selector_discovery_time_ms || 0), 0) / selectorValidations) : 0
    };
    
    console.log('\n📄 Complete JSON results available in return value');
  }

  /**
   * Merge variant data from JSON-LD and SelectorDiscovery
   */
  mergeVariantData(jsonLdVariants, discoveredGroups) {
    if (!discoveredGroups || discoveredGroups.length === 0) {
      return jsonLdVariants || [];
    }

    if (!jsonLdVariants || jsonLdVariants.length === 0) {
      return discoveredGroups.map(group => ({
        type: group.type,
        options: group.options || []
      }));
    }

    // Merge both sources
    const merged = [...jsonLdVariants];
    for (const group of discoveredGroups) {
      const existing = merged.find(v => v.type?.toLowerCase() === group.type?.toLowerCase());
      if (!existing) {
        merged.push({
          type: group.type,
          options: group.options || []
        });
      }
    }

    return merged;
  }

  /**
   * Calculate confidence score
   */
  calculateConfidenceScore(basicData, interactionData, isSample) {
    let score = 0;
    
    // Basic data quality (0-70 points)
    if (basicData.title) score += 20;
    if (basicData.price) score += 20;
    if (basicData.brand) score += 10;
    if (basicData.variants?.length > 0) score += 10;
    if (basicData.extractionMethod === 'jsonLd') score += 10;
    
    // Interaction validation (0-30 points)
    if (isSample && interactionData) {
      if (interactionData.cartButton) score += 15;
      if (interactionData.variantGroups?.length > 0) score += 10;
      if (interactionData.priceSelector) score += 5;
    } else if (!isSample) {
      // Non-samples get partial credit based on category validation
      score += 15;
    }
    
    return Math.min(100, score);
  }

  /**
   * Log errors with context
   */
  logError(context, error) {
    const errorInfo = {
      context: context,
      message: error.message,
      timestamp: new Date().toISOString(),
      stack: error.stack
    };
    
    this.results.errors.push(errorInfo);
    console.error(`❌ ERROR [${context}]: ${error.message}`);
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      if (this.browserSession && this.browserSession.close) {
        await this.browserSession.close();
      }
      await this.navigationMapper.close();
      console.log('\n🧹 Test cleanup completed');
    } catch (error) {
      console.warn(`⚠️  Cleanup warning: ${error.message}`);
    }
  }
}

// Export for module use
module.exports = { GlasswingModularTest };

// Run test if called directly
if (require.main === module) {
  async function runTest() {
    const test = new GlasswingModularTest();
    
    try {
      const results = await test.run();
      
      // Output final JSON
      console.log('\n📄 COMPLETE RESULTS JSON:');
      console.log('=========================');
      console.log(JSON.stringify(results, null, 2));
      
      // Test success check
      if (results.summary.test_result === 'SUCCESS') {
        console.log('\n🎉 GLASSWING MODULAR PIPELINE TEST PASSED!');
        console.log('All components working correctly with data passing between steps.');
      } else {
        console.log('\n⚠️  Test completed with partial success - check results above');
      }
      
    } catch (error) {
      console.error(`\n💥 Test failed: ${error.message}`);
      console.error(error.stack);
      process.exit(1);
    }
  }
  
  runTest();
}