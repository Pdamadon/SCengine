/**
 * PipelineOrchestrator - Unified orchestrator for all scraping operations
 * 
 * Implements the complete scraping pipeline with flexible entry points:
 * Main Flow: Navigation → Subcategories → Filters → Product URLs → Batch Extract
 * 
 * Supports multiple operation modes:
 * - full_site: Complete pipeline with filter detection
 * - product: Direct single product extraction
 * - category: Category-level scraping with filters
 * - navigation: Navigation structure mapping only
 * 
 * Coordinates specialized modules:
 * 1. NavigationMapperBrowserless - Discovers site navigation
 * 2. SubCategoryExplorationStrategy - Recursively explores subcategories  
 * 3. FilterDiscoveryStrategy - Discovers filter candidates with CSS escaping
 * 4. FilterBasedExplorationStrategy - Enhanced two-phase filter system
 * 5. ProductPaginationStrategy - Extracts products with pagination
 */

const NavigationMapperBrowserless = require('./discovery/NavigationMapperBrowserless');
const SubCategoryExplorationStrategy = require('./discovery/strategies/exploration/SubCategoryExplorationStrategy');
const FilterBasedExplorationStrategy = require('./discovery/strategies/exploration/FilterBasedExplorationStrategy');
const FilterDiscoveryStrategy = require('./discovery/strategies/exploration/FilterDiscoveryStrategy');
const ProductPaginationStrategy = require('./collection/strategies/ProductPaginationStrategy');
const ExtractorIntelligence = require('./extraction/ExtractorIntelligence');
const UniversalProductExtractor = require('./extraction/UniversalProductExtractor');
const SelectorDiscovery = require('../common/scraping/dom/SelectorDiscovery');
const BrowserManagerBrowserless = require('../common/browser/managers/BrowserManagerBrowserless');
const { logger } = require('../utils/logger');
const WorldModel = require('../data/WorldModel');

class PipelineOrchestrator {
  constructor(options = {}) {
    this.logger = options.logger || logger;
    this.worldModel = options.worldModel || new WorldModel(this.logger);
    this.browserManager = new BrowserManagerBrowserless();
    
    // Pipeline mode configuration
    this.mode = options.mode || 'full';
    this.stages = {
      navigation: options.enableNavigation !== false,
      subcategories: options.enableSubcategories !== false,
      filters: options.enableFilters !== false,
      collection: options.enableCollection !== false,
      extraction: options.enableExtraction !== false
    };
    
    // Initialize modules
    this.navigationMapper = new NavigationMapperBrowserless(this.logger);
    this.subCategoryExplorer = new SubCategoryExplorationStrategy(this.browserManager, {
      logger: this.logger,
      maxDepth: options.maxCategoryDepth || 4,
      maxCategoriesPerLevel: options.maxCategoriesPerLevel || 15,
      trackNavigationPath: true
    });
    // Initialize FilterDiscoveryStrategy for two-phase filter approach
    this.filterDiscovery = new FilterDiscoveryStrategy({
      logger: this.logger,
      maxFilters: options.maxFiltersPerGroup || process.env.MAX_FILTERS_PER_GROUP || 20,
      scoreThreshold: options.filterScoreThreshold || process.env.FILTER_SCORE_THRESHOLD || 2,
      discoveryTimeout: options.filterDiscoveryTimeout || process.env.FILTER_DISCOVERY_TIMEOUT || 30000,
      trackFilterMetadata: options.trackFilterMetadata !== false
    });
    
    // Enhanced FilterBasedExplorationStrategy with two-phase filter system
    this.filterExplorer = new FilterBasedExplorationStrategy(this.browserManager, {
      logger: this.logger,
      maxFilters: options.maxFilters || 20,
      filterTimeout: options.filterTimeout || 5000,
      captureFilterCombinations: options.captureFilterCombinations || false,
      trackForML: options.trackForML !== false,
      // Phase 2 integration: Pass FilterDiscoveryStrategy for enhanced filter detection
      filterDiscoveryStrategy: this.filterDiscovery,
      useDiscoveredFilters: options.useDiscoveredFilters !== false, // Default to true for enhanced detection
      // Pass through feature flags for A/B testing
      features: options.features
    });
    this.productPaginator = new ProductPaginationStrategy(this.browserManager, {
      logger: this.logger,
      maxPages: options.maxPagesPerCategory || 20,
      maxProductsPerCategory: options.maxProductsPerCategory || 500,
      extractVariants: options.extractVariants !== false // Default to true for variants
    });
    this.extractorIntelligence = new ExtractorIntelligence(this.logger, this.browserManager);
    
    // Initialize individual product extraction components
    this.universalExtractor = new UniversalProductExtractor(this.logger);
    this.selectorDiscovery = new SelectorDiscovery(this.logger);
    
    this.options = {
      saveToDatabase: options.saveToDatabase !== false,
      parallelCategories: options.parallelCategories || 3,
      sampleCategories: options.sampleCategories || null, // Limit for testing
      outputPath: options.outputPath || './data/results'
    };
    
    this.results = {
      startTime: null,
      endTime: null,
      domain: null,
      initialNavigation: null,
      categoryHierarchy: null,
      productResults: [],
      stats: {}
    };
  }

  /**
   * Main execution entry point - routes to appropriate method based on scraping type
   * @param {string} targetUrl - Starting URL for scraping
   * @param {Object} options - Execution options including scraping_type
   * @returns {Promise<Object>} Scraping results
   */
  async execute(targetUrl, options = {}) {
    const scrapingType = options.scraping_type || 'full_site';
    
    this.logger.info('🚀 Starting PipelineOrchestrator', {
      targetUrl,
      scrapingType,
      mode: this.mode,
      stages: this.stages
    });

    try {
      switch (scrapingType) {
        case 'full_site':
          return await this.executePipeline(targetUrl, options);
        case 'product':
          return await this.extractSingleProduct(targetUrl, options);
        case 'category':
          return await this.scrapeCategory(targetUrl, options);
        case 'navigation':
          return await this.mapNavigation(targetUrl, options);
        default:
          this.logger.warn(`Unknown scraping type: ${scrapingType}, using full_site`);
          return await this.executePipeline(targetUrl, options);
      }
    } catch (error) {
      this.logger.error('❌ PipelineOrchestrator execution failed', {
        targetUrl,
        scrapingType,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Execute complete scraping pipeline with filter detection
   * @param {string} targetUrl - Starting URL for scraping
   * @param {Object} options - Pipeline options
   * @returns {Promise<Object>} Complete scraping results
   */
  async executePipeline(targetUrl, options = {}) {
    this.results.startTime = new Date();
    this.results.domain = new URL(targetUrl).hostname;
    
    this.logger.info('🔄 Starting complete pipeline', {
      targetUrl,
      domain: this.results.domain,
      modules: ['NavigationMapper', 'SubCategoryExplorer', 'FilterExplorer', 'ProductPaginator']
    });

    try {
      let navigationResults = null;
      let categoryHierarchy = null;
      let filterResults = null;
      let productResults = null;

      // Step 1: Discover initial navigation structure
      if (this.stages.navigation) {
        this.logger.info('📍 Step 1: Discovering initial navigation...');
        navigationResults = await this.discoverNavigation(targetUrl);
        this.results.initialNavigation = navigationResults;
      }
      
      // Step 2: Recursively explore all subcategories
      if (this.stages.subcategories && navigationResults) {
        this.logger.info('🔍 Step 2: Exploring subcategories recursively...');
        categoryHierarchy = await this.exploreCategories(navigationResults);
        this.results.categoryHierarchy = categoryHierarchy;
      }
      
      // Step 3: Detect and iterate through filters (NEW)
      if (this.stages.filters) {
        this.logger.info('🎛️ Step 3: Detecting and iterating filters...');
        
        // Create minimal categoryHierarchy if not available from subcategory exploration
        let targetHierarchy = categoryHierarchy;
        if (!categoryHierarchy) {
          this.logger.debug('Creating minimal category hierarchy for direct filter exploration');
          targetHierarchy = {
            categories: [{
              name: options.categoryName || 'target-category',
              url: targetUrl,
              hasProducts: true,
              isLeaf: true
            }]
          };
        }
        
        filterResults = await this.detectAndIterateFilters(targetHierarchy);
        this.results.filterResults = filterResults;
      }
      
      // Step 4: Extract products from all categories with pagination
      if (this.stages.extraction && (categoryHierarchy || filterResults)) {
        this.logger.info('📦 Step 4: Extracting products from all categories...');
        const targetHierarchy = filterResults || categoryHierarchy;
        productResults = await this.extractAllProducts(targetHierarchy);
        this.results.productResults = productResults;
      }
      
      // Step 5: Save results
      if (this.options.saveToDatabase) {
        await this.saveResults();
      }
      
      this.results.endTime = new Date();
      this.results.stats = this.calculateStats();
      
      this.logger.info('✅ Complete pipeline finished!', this.results.stats);
      
      return this.results;
      
    } catch (error) {
      this.logger.error('❌ Complete pipeline failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Step 1: Discover initial navigation using NavigationMapperBrowserless
   */
  async discoverNavigation(targetUrl) {
    // NavigationMapperBrowserless doesn't need explicit initialization
    
    // Use extractNavigation which returns navigation with navigation field
    const navigationResults = await this.navigationMapper.extractNavigation(targetUrl);
    
    // Transform to expected format (main_sections)
    const transformedResults = {
      main_sections: navigationResults.navigation || [],
      strategy: navigationResults.strategy,
      totalNavigationItems: navigationResults.totalNavigationItems || (navigationResults.navigation?.length || 0),
      confidence: navigationResults.confidence,
      extractedAt: new Date().toISOString()
    };
    
    this.logger.info('Navigation discovery complete', {
      sectionsFound: transformedResults.main_sections?.length || 0,
      totalItems: transformedResults.totalNavigationItems || 0,
      strategy: transformedResults.strategy
    });
    
    return transformedResults;
  }

  /**
   * Step 2: Explore all subcategories recursively
   */
  async exploreCategories(navigationResults) {
    // Extract initial categories from navigation results
    const initialCategories = this.extractInitialCategories(navigationResults);
    
    // Apply sampling limit if specified (for testing)
    const categoriesToExplore = this.options.sampleCategories 
      ? initialCategories.slice(0, this.options.sampleCategories)
      : initialCategories;
    
    this.logger.info('Starting category exploration', {
      initialCategories: initialCategories.length,
      exploring: categoriesToExplore.length,
      sampleCategories: categoriesToExplore.slice(0, 3).map(c => c.name)
    });
    
    // Use SubCategoryExplorer to recursively discover all categories
    const hierarchy = await this.subCategoryExplorer.exploreAll(categoriesToExplore);
    
    this.logger.info('Category exploration complete', {
      totalCategories: hierarchy.totalCategories,
      maxDepth: hierarchy.maxDepth,
      leafCategories: hierarchy.leafCategories,
      categoriesWithProducts: hierarchy.categoriesWithProducts
    });
    
    return hierarchy;
  }

  /**
   * Step 3: Extract products from all discovered categories using hybrid approach
   * Uses FilterBasedExplorationStrategy for URL collection + UniversalProductExtractor for details
   */
  async extractAllProducts(categoryHierarchy) {
    const productResults = [];
    
    // Get categories that have products (leaf nodes or categories with products)
    const productCategories = categoryHierarchy.categories.filter(cat => 
      cat.hasProducts || cat.isLeaf
    );
    
    this.logger.info('Starting hybrid product extraction', {
      totalCategories: productCategories.length,
      approach: 'FilterBasedExploration + UniversalExtractor',
      samplingStrategy: '~3 per category'
    });
    
    // Process categories in batches for parallel processing
    const batches = this.createBatches(productCategories, this.options.parallelCategories);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      this.logger.info(`Processing batch ${batchIndex + 1}/${batches.length}`, {
        categoriesInBatch: batch.length
      });
      
      // Process batch in parallel
      const batchPromises = batch.map(async (category) => {
        try {
          // Step 1: Collect product URLs using existing FilterBasedExplorationStrategy
          this.logger.debug(`Collecting product URLs for category: ${category.name}`);
          const urlResults = await this.filterExplorer.exploreWithFilters(
            category.url, 
            category.name
          );
          
          // Step 2: Extract URLs from filter results
          const productUrls = this.extractProductUrlsFromResults(urlResults);
          
          if (!productUrls || productUrls.length === 0) {
            this.logger.warn(`No product URLs found for category: ${category.name}`);
            return {
              category: category,
              products: [],
              stats: { urlsCollected: 0, productsExtracted: 0 }
            };
          }
          
          // Step 3: Extract full product details using hybrid approach
          this.logger.debug(`Extracting ${productUrls.length} products for category: ${category.name}`);
          const extractedProducts = await this.extractProductsBatch(productUrls, {
            categoryName: category.name,
            samplesPerCategory: 3 // Hybrid sampling strategy
          });
          
          return {
            category: category,
            products: extractedProducts,
            stats: {
              urlsCollected: productUrls.length,
              productsExtracted: extractedProducts.length,
              samplesValidated: extractedProducts.filter(p => p.interactionValidated).length,
              avgConfidenceScore: this.calculateAverageConfidence(extractedProducts)
            }
          };
          
        } catch (error) {
          this.logger.warn('Failed to extract products from category', {
            category: category.name,
            error: error.message
          });
          return { 
            category: category, 
            products: [], 
            error: error.message,
            stats: { urlsCollected: 0, productsExtracted: 0 }
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      productResults.push(...batchResults);
    }
    
    // Calculate comprehensive statistics
    const totalUrls = productResults.reduce((sum, result) => 
      sum + (result.stats?.urlsCollected || 0), 0
    );
    const totalProducts = productResults.reduce((sum, result) => 
      sum + (result.products?.length || 0), 0
    );
    const totalSamples = productResults.reduce((sum, result) => 
      sum + (result.stats?.samplesValidated || 0), 0
    );
    
    this.logger.info('Hybrid product extraction complete', {
      categoriesProcessed: productResults.length,
      totalUrlsCollected: totalUrls,
      totalProductsExtracted: totalProducts,
      totalSamplesValidated: totalSamples,
      successfulCategories: productResults.filter(r => r.products?.length > 0).length,
      extractionEfficiency: totalUrls > 0 ? `${Math.round((totalProducts / totalUrls) * 100)}%` : '0%'
    });
    
    return productResults;
  }

  /**
   * Extract product URLs from FilterBasedExplorationStrategy results
   */
  extractProductUrlsFromResults(filterResults) {
    const urls = new Set(); // Use Set to avoid duplicates
    
    // Extract from direct products array
    if (filterResults.products) {
      for (const product of filterResults.products) {
        if (product.url) {
          urls.add(product.url);
        }
      }
    }
    
    // Extract from filter paths results
    if (filterResults.filterPaths) {
      for (const path of filterResults.filterPaths) {
        if (path.products) {
          for (const product of path.products) {
            if (product.url) {
              urls.add(product.url);
            }
          }
        }
      }
    }
    
    return Array.from(urls);
  }

  /**
   * Extract initial categories from navigation results
   */
  extractInitialCategories(navigationResults) {
    const categories = [];
    
    // Extract from main sections
    if (navigationResults.main_sections) {
      for (const section of navigationResults.main_sections) {
        // Add main section if it has a URL
        if (section.url) {
          categories.push({
            url: section.url,
            name: section.name || section.text,
            children: section.children || []
          });
        } else if (section.children) {
          // If main section has no URL, add its children
          for (const child of section.children) {
            if (child.url) {
              categories.push({
                url: child.url,
                name: child.name || child.text,
                parent: section.name
              });
            }
          }
        }
      }
    }
    
    return categories;
  }

  /**
   * Create batches for parallel processing
   */
  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Save results to database and files
   */
  async saveResults() {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const domain = this.results.domain.replace(/\./g, '_');
      
      // Save to WorldModel (MongoDB)
      if (this.worldModel) {
        // Save navigation structure
        await this.worldModel.storeSiteNavigation(this.results.domain, {
          navigation: this.results.initialNavigation,
          hierarchy: this.results.categoryHierarchy,
          extractedAt: timestamp
        });
        
        // Save products
        let savedProducts = 0;
        for (const categoryResult of this.results.productResults) {
          if (categoryResult.products) {
            for (const product of categoryResult.products) {
              await this.worldModel.storeProduct({
                ...product,
                domain: this.results.domain,
                extractedAt: timestamp
              });
              savedProducts++;
            }
          }
        }
        
        this.logger.info('Results saved to database', {
          domain: this.results.domain,
          productsStored: savedProducts
        });
      }
      
      // Also save to JSON files for analysis
      const fs = require('fs').promises;
      const path = require('path');
      
      // Create output directory
      const outputDir = path.join(this.options.outputPath, domain, timestamp);
      await fs.mkdir(outputDir, { recursive: true });
      
      // Save navigation
      await fs.writeFile(
        path.join(outputDir, 'navigation.json'),
        JSON.stringify(this.results.initialNavigation, null, 2)
      );
      
      // Save hierarchy
      await fs.writeFile(
        path.join(outputDir, 'hierarchy.json'),
        JSON.stringify(this.results.categoryHierarchy, null, 2)
      );
      
      // Save products
      await fs.writeFile(
        path.join(outputDir, 'products.json'),
        JSON.stringify(this.results.productResults, null, 2)
      );
      
      // Save summary
      await fs.writeFile(
        path.join(outputDir, 'summary.json'),
        JSON.stringify(this.results.stats, null, 2)
      );
      
      this.logger.info('Results saved to files', { outputDir });
      
    } catch (error) {
      this.logger.error('Failed to save results', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate statistics for the scraping run
   */
  calculateStats() {
    const totalProducts = this.results.productResults.reduce((sum, result) => 
      sum + (result.products?.length || 0), 0
    );
    
    const duration = this.results.endTime - this.results.startTime;
    
    return {
      domain: this.results.domain,
      duration: `${Math.round(duration / 1000)}s`,
      navigation: {
        mainSections: this.results.initialNavigation?.main_sections?.length || 0,
        totalNavigationItems: this.results.initialNavigation?.totalNavigationItems || 0
      },
      hierarchy: {
        totalCategories: this.results.categoryHierarchy?.totalCategories || 0,
        maxDepth: this.results.categoryHierarchy?.maxDepth || 0,
        leafCategories: this.results.categoryHierarchy?.leafCategories || 0
      },
      products: {
        categoriesProcessed: this.results.productResults.length,
        totalProducts: totalProducts,
        avgProductsPerCategory: Math.round(totalProducts / Math.max(1, this.results.productResults.length))
      },
      performance: {
        productsPerSecond: Math.round(totalProducts / (duration / 1000))
      }
    };
  }

  /**
   * Get current orchestrator status
   */
  getStatus() {
    return {
      mode: this.mode,
      stages: this.stages,
      navigation: this.navigationMapper.getStats ? this.navigationMapper.getStats() : {},
      exploration: this.subCategoryExplorer.getStats(),
      filters: this.filterExplorer ? {} : {}, // FilterExplorer doesn't have getStats yet
      pagination: this.productPaginator.getStats(),
      extraction: this.extractorIntelligence ? {} : {},
      results: this.results.stats || {}
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.logger.info('Cleaning up PipelineOrchestrator resources...');
    
    try {
      await this.browserManager.closeAll();
      await this.navigationMapper.close();
      await this.worldModel.close();
      // Close additional modules
      if (this.extractorIntelligence && this.extractorIntelligence.close) {
        await this.extractorIntelligence.close();
      }
    } catch (error) {
      this.logger.warn('Error during cleanup', { error: error.message });
    }
  }

  /**
   * NEW: Detect and iterate through filters on categories
   * @param {Object} categoryHierarchy - Category hierarchy from subcategory exploration
   * @returns {Promise<Object>} Enhanced hierarchy with filter-discovered products
   */
  async detectAndIterateFilters(categoryHierarchy) {
    if (!categoryHierarchy || !categoryHierarchy.categories) {
      this.logger.warn('No category hierarchy provided for filter detection');
      return categoryHierarchy;
    }

    // Get leaf categories or categories with products
    const targetCategories = categoryHierarchy.categories.filter(cat => 
      cat.hasProducts || cat.isLeaf
    );
    
    this.logger.info('Starting filter detection', {
      totalCategories: targetCategories.length,
      sampleCategories: targetCategories.slice(0, 3).map(c => c.name)
    });

    const enhancedCategories = [];
    let totalFilterProducts = 0;

    // Process categories in smaller batches for filter exploration
    const filterBatches = this.createBatches(targetCategories, 2); // Smaller batches for filters
    
    for (let batchIndex = 0; batchIndex < filterBatches.length; batchIndex++) {
      const batch = filterBatches[batchIndex];
      this.logger.info(`Processing filter batch ${batchIndex + 1}/${filterBatches.length}`);
      
      for (const category of batch) {
        try {
          this.logger.debug(`Applying filters to category: ${category.name}`);
          
          // Use FilterBasedExplorationStrategy
          const filterResults = await this.filterExplorer.exploreWithFilters(
            category.url, 
            category.name
          );
          
          // Enhance category with filter results
          const enhancedCategory = {
            ...category,
            filterProducts: filterResults.products || [],
            filterPaths: filterResults.filterPaths || [],
            filterStats: filterResults.stats || {},
            totalFilterProducts: filterResults.totalProducts || 0
          };
          
          enhancedCategories.push(enhancedCategory);
          totalFilterProducts += enhancedCategory.totalFilterProducts;
          
          this.logger.info(`Filter exploration complete for ${category.name}`, {
            productsFound: enhancedCategory.totalFilterProducts,
            filtersUsed: enhancedCategory.filterStats.uniqueFilters || 0
          });
          
        } catch (error) {
          this.logger.warn(`Filter exploration failed for ${category.name}`, {
            error: error.message
          });
          
          // Add category without filter enhancement
          enhancedCategories.push({
            ...category,
            filterProducts: [],
            filterError: error.message
          });
        }
      }
    }

    const enhancedHierarchy = {
      ...categoryHierarchy,
      categories: enhancedCategories,
      filterEnhanced: true,
      totalFilterProducts: totalFilterProducts,
      filterStats: {
        categoriesWithFilters: enhancedCategories.filter(c => c.filterProducts?.length > 0).length,
        avgProductsPerCategory: enhancedCategories.length > 0 
          ? Math.round(totalFilterProducts / enhancedCategories.length) 
          : 0
      }
    };

    this.logger.info('Filter detection complete', {
      categoriesProcessed: enhancedCategories.length,
      totalFilterProducts: totalFilterProducts,
      categoriesWithFilters: enhancedHierarchy.filterStats.categoriesWithFilters
    });

    return enhancedHierarchy;
  }

  /**
   * Extract single product with complete details (JSON-LD + SelectorDiscovery)
   * Used for specific customer requests - always does full extraction
   * @param {string} productUrl - URL of the product to extract
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} Complete product data with interaction patterns
   */
  async extractSingleProduct(productUrl, options = {}) {
    this.logger.info('🎯 Starting single product extraction (complete mode)', {
      productUrl,
      mode: 'complete'
    });

    try {
      const page = await this.browserManager.getPage();
      await page.goto(productUrl, { waitUntil: 'networkidle2' });

      // Step 1: Extract basic product data using UniversalProductExtractor
      this.logger.debug('Step 1: Extracting basic product data via JSON-LD + fallbacks');
      const basicData = await this.universalExtractor.extract(page, {
        url: productUrl,
        includeVariants: true,
        includeImages: true
      });

      // Step 2: Extract interaction patterns using SelectorDiscovery
      this.logger.debug('Step 2: Discovering interaction patterns and variants');
      const interactionData = await this.selectorDiscovery.discoverVariants(page);

      // Step 3: Merge results with interaction validation
      const completeProduct = {
        url: productUrl,
        extractedAt: new Date().toISOString(),
        extractionMode: 'complete',
        
        // Basic product data from JSON-LD/DOM
        ...basicData,
        
        // Interaction patterns and discovered variants
        interactionPatterns: {
          variantSelectors: interactionData.variantGroups || [],
          cartButton: interactionData.cartButton || null,
          priceSelector: interactionData.priceSelector || null,
          availabilitySelector: interactionData.availabilitySelector || null
        },
        
        // Enhanced variant information (merge JSON-LD + discovered)
        variants: this.mergeVariantData(basicData.variants, interactionData.variantGroups),
        
        // Extraction confidence and validation
        extractionStats: {
          jsonLdSuccess: basicData.extractionMethod === 'jsonLd',
          domFallbackUsed: basicData.extractionMethod === 'dom',
          selectorDiscoverySuccess: !!interactionData.variantGroups?.length,
          cartInteractionValidated: !!interactionData.cartButton,
          confidenceScore: this.calculateConfidenceScore(basicData, interactionData)
        }
      };

      this.logger.info('✅ Single product extraction complete', {
        productUrl,
        hasVariants: completeProduct.variants?.length > 0,
        cartValidated: completeProduct.extractionStats.cartInteractionValidated,
        confidenceScore: completeProduct.extractionStats.confidenceScore
      });

      return completeProduct;

    } catch (error) {
      this.logger.error('❌ Single product extraction failed', {
        productUrl,
        error: error.message,
        stack: error.stack
      });
      
      // Return minimal error response
      return {
        url: productUrl,
        extractedAt: new Date().toISOString(),
        extractionMode: 'complete',
        error: error.message,
        extractionStats: {
          jsonLdSuccess: false,
          selectorDiscoverySuccess: false,
          cartInteractionValidated: false,
          confidenceScore: 0
        }
      };
    }
  }

  /**
   * Extract products using hybrid approach (JSON-LD all + SelectorDiscovery sampling)
   * Used for full site scrapes - optimizes for performance
   * @param {Array} productUrls - Array of product URLs to extract
   * @param {Object} options - Extraction options including sampling config
   * @returns {Promise<Array>} Array of product data with interaction patterns
   */
  async extractProductsBatch(productUrls, options = {}) {
    const samplesPerCategory = options.samplesPerCategory || 3;
    const categoryName = options.categoryName || 'unknown';
    
    this.logger.info('📦 Starting batch product extraction (hybrid mode)', {
      totalProducts: productUrls.length,
      samplesPerCategory,
      categoryName,
      mode: 'hybrid'
    });

    if (!productUrls || productUrls.length === 0) {
      return [];
    }

    try {
      const results = [];
      
      // Step 1: Extract ALL products using JSON-LD + DOM fallbacks (fast)
      this.logger.debug(`Step 1: JSON-LD extraction for all ${productUrls.length} products`);
      const basicExtractions = await this.extractBasicProductsBatch(productUrls);
      
      // Step 2: Select representative samples for SelectorDiscovery
      const samples = this.selectSamplesForDiscovery(basicExtractions, samplesPerCategory);
      this.logger.debug(`Step 2: Selected ${samples.length} products for interaction validation`);
      
      // Step 3: Run SelectorDiscovery on samples
      const interactionPatterns = await this.extractInteractionPatterns(samples);
      
      // Step 4: Apply interaction patterns to all products
      for (const basicProduct of basicExtractions) {
        const isSample = samples.some(s => s.url === basicProduct.url);
        const patterns = interactionPatterns.find(p => p.url === basicProduct.url);
        
        const enhancedProduct = {
          ...basicProduct,
          extractionMode: 'hybrid',
          interactionValidated: isSample,
          interactionPatterns: patterns?.interactionPatterns || null,
          extractionStats: {
            ...basicProduct.extractionStats,
            sampleValidated: isSample,
            confidenceScore: this.calculateHybridConfidenceScore(basicProduct, isSample, patterns)
          }
        };
        
        results.push(enhancedProduct);
      }

      this.logger.info('✅ Batch product extraction complete', {
        totalProducts: results.length,
        samplesValidated: samples.length,
        avgConfidenceScore: this.calculateAverageConfidence(results)
      });

      return results;

    } catch (error) {
      this.logger.error('❌ Batch product extraction failed', {
        totalProducts: productUrls.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Extract basic product data using JSON-LD + DOM fallbacks (no browser interaction)
   */
  async extractBasicProductsBatch(productUrls) {
    const results = [];
    const batchSize = 5; // Process in small batches to avoid overwhelming

    for (let i = 0; i < productUrls.length; i += batchSize) {
      const batch = productUrls.slice(i, i + batchSize);
      const batchPromises = batch.map(async (url) => {
        try {
          const page = await this.browserManager.getPage();
          await page.goto(url, { waitUntil: 'networkidle2' });
          
          const basicData = await this.universalExtractor.extract(page, {
            url,
            includeVariants: true,
            includeImages: true
          });
          
          return {
            url,
            extractedAt: new Date().toISOString(),
            ...basicData,
            extractionStats: {
              jsonLdSuccess: basicData.extractionMethod === 'jsonLd',
              domFallbackUsed: basicData.extractionMethod === 'dom'
            }
          };
        } catch (error) {
          this.logger.warn(`Failed to extract basic data for ${url}`, error.message);
          return {
            url,
            extractedAt: new Date().toISOString(),
            error: error.message,
            extractionStats: { jsonLdSuccess: false, domFallbackUsed: false }
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      this.logger.debug(`Processed batch ${Math.floor(i/batchSize) + 1}, total: ${results.length}`);
    }

    return results;
  }

  /**
   * Select representative products for SelectorDiscovery sampling
   */
  selectSamplesForDiscovery(products, maxSamples) {
    // Filter valid products (no errors)
    const validProducts = products.filter(p => !p.error);
    
    if (validProducts.length <= maxSamples) {
      return validProducts;
    }

    // Intelligent sampling: diverse price points and variant complexity
    const samples = [];
    
    // Sort by variant complexity (more complex first)
    const byComplexity = validProducts.sort((a, b) => {
      const aComplexity = (a.variants?.length || 0);
      const bComplexity = (b.variants?.length || 0);
      return bComplexity - aComplexity;
    });
    
    // Take most complex product
    if (byComplexity[0]) samples.push(byComplexity[0]);
    
    // Take product with different price range
    const priceRanges = validProducts.filter(p => p.price && p.price !== byComplexity[0]?.price);
    if (priceRanges[0] && samples.length < maxSamples) samples.push(priceRanges[0]);
    
    // Fill remaining with random selection
    const remaining = validProducts.filter(p => !samples.includes(p));
    while (samples.length < maxSamples && remaining.length > 0) {
      const randomIndex = Math.floor(Math.random() * remaining.length);
      samples.push(remaining.splice(randomIndex, 1)[0]);
    }
    
    return samples.slice(0, maxSamples);
  }

  /**
   * Extract interaction patterns for sampled products
   */
  async extractInteractionPatterns(samples) {
    const patterns = [];
    
    for (const sample of samples) {
      try {
        const page = await this.browserManager.getPage();
        await page.goto(sample.url, { waitUntil: 'networkidle2' });
        
        const interactionData = await this.selectorDiscovery.discoverVariants(page);
        
        patterns.push({
          url: sample.url,
          interactionPatterns: {
            variantSelectors: interactionData.variantGroups || [],
            cartButton: interactionData.cartButton || null,
            priceSelector: interactionData.priceSelector || null,
            availabilitySelector: interactionData.availabilitySelector || null
          }
        });
        
      } catch (error) {
        this.logger.warn(`Failed to extract interaction patterns for ${sample.url}`, error.message);
        patterns.push({
          url: sample.url,
          interactionPatterns: null,
          error: error.message
        });
      }
    }
    
    return patterns;
  }

  /**
   * Merge variant data from JSON-LD and SelectorDiscovery
   */
  mergeVariantData(jsonLdVariants, discoveredGroups) {
    // If no discovered groups, return JSON-LD variants
    if (!discoveredGroups || discoveredGroups.length === 0) {
      return jsonLdVariants || [];
    }

    // If no JSON-LD variants, return discovered variants
    if (!jsonLdVariants || jsonLdVariants.length === 0) {
      return discoveredGroups.map(group => ({
        type: group.type,
        options: group.options || []
      }));
    }

    // Merge both sources - prefer JSON-LD data with SelectorDiscovery validation
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
   * Calculate confidence score for complete extraction
   */
  calculateConfidenceScore(basicData, interactionData) {
    let score = 0;
    
    // Basic data quality (0-50 points)
    if (basicData.name) score += 15;
    if (basicData.price) score += 15;
    if (basicData.variants?.length > 0) score += 10;
    if (basicData.extractionMethod === 'jsonLd') score += 10;
    
    // Interaction validation (0-50 points)
    if (interactionData.cartButton) score += 25;
    if (interactionData.variantGroups?.length > 0) score += 15;
    if (interactionData.priceSelector) score += 10;
    
    return Math.min(100, score);
  }

  /**
   * Calculate confidence score for hybrid extraction
   */
  calculateHybridConfidenceScore(basicData, isSample, patterns) {
    let score = 0;
    
    // Basic data quality (0-70 points)
    if (basicData.name) score += 20;
    if (basicData.price) score += 20;
    if (basicData.variants?.length > 0) score += 15;
    if (basicData.extractionMethod === 'jsonLd') score += 15;
    
    // Sample validation bonus (0-30 points)
    if (isSample && patterns?.interactionPatterns) {
      score += 30;
    } else if (!isSample) {
      // Non-samples get partial credit based on category validation
      score += 15;
    }
    
    return Math.min(100, score);
  }

  /**
   * Calculate average confidence score for batch
   */
  calculateAverageConfidence(results) {
    if (!results || results.length === 0) return 0;
    
    const total = results.reduce((sum, result) => 
      sum + (result.extractionStats?.confidenceScore || 0), 0
    );
    
    return Math.round(total / results.length);
  }
}

module.exports = PipelineOrchestrator;