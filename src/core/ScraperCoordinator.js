/**
 * ScraperCoordinator - Orchestrates the complete scraping pipeline
 * 
 * Coordinates three specialized modules:
 * 1. NavigationMapper - Discovers initial site navigation
 * 2. SubCategoryExplorer - Recursively explores all subcategories  
 * 3. ProductPaginator - Extracts all products with pagination
 * 
 * Provides a clean, maintainable architecture following Single Responsibility Principle
 */

const NavigationMapper = require('./discovery/NavigationMapper');
const SubCategoryExplorationStrategy = require('./discovery/strategies/exploration/SubCategoryExplorationStrategy');
const ProductPaginationStrategy = require('./collection/strategies/ProductPaginationStrategy');
const BrowserManager = require('../common/BrowserManager');
const { logger } = require('../utils/logger');
const WorldModel = require('../data/WorldModel');

class ScraperCoordinator {
  constructor(options = {}) {
    this.logger = options.logger || logger;
    this.worldModel = options.worldModel || new WorldModel(this.logger);
    this.browserManager = new BrowserManager();
    
    // Initialize modules
    this.navigationMapper = new NavigationMapper(this.logger, this.worldModel);
    this.subCategoryExplorer = new SubCategoryExplorationStrategy(this.browserManager, {
      logger: this.logger,
      maxDepth: options.maxCategoryDepth || 4,
      maxCategoriesPerLevel: options.maxCategoriesPerLevel || 15,
      trackNavigationPath: true
    });
    this.productPaginator = new ProductPaginationStrategy(this.browserManager, {
      logger: this.logger,
      maxPages: options.maxPagesPerCategory || 20,
      maxProductsPerCategory: options.maxProductsPerCategory || 500,
      extractVariants: options.extractVariants || false
    });
    
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
   * Execute complete scraping pipeline
   * @param {string} targetUrl - Starting URL for scraping
   * @returns {Promise<Object>} Complete scraping results with hierarchy and products
   */
  async execute(targetUrl) {
    this.results.startTime = new Date();
    this.results.domain = new URL(targetUrl).hostname;
    
    this.logger.info('🚀 Starting ScraperCoordinator pipeline', {
      targetUrl,
      domain: this.results.domain,
      modules: ['NavigationMapper', 'SubCategoryExplorer', 'ProductPaginator']
    });

    try {
      // Step 1: Discover initial navigation structure
      this.logger.info('📍 Step 1: Discovering initial navigation...');
      const navigationResults = await this.discoverNavigation(targetUrl);
      this.results.initialNavigation = navigationResults;
      
      // Step 2: Recursively explore all subcategories
      this.logger.info('🔍 Step 2: Exploring subcategories recursively...');
      const categoryHierarchy = await this.exploreCategories(navigationResults);
      this.results.categoryHierarchy = categoryHierarchy;
      
      // Step 3: Extract products from all categories with pagination
      this.logger.info('📦 Step 3: Extracting products from all categories...');
      const productResults = await this.extractAllProducts(categoryHierarchy);
      this.results.productResults = productResults;
      
      // Step 4: Save results
      if (this.options.saveToDatabase) {
        await this.saveResults();
      }
      
      this.results.endTime = new Date();
      this.results.stats = this.calculateStats();
      
      this.logger.info('✅ ScraperCoordinator pipeline complete!', this.results.stats);
      
      return this.results;
      
    } catch (error) {
      this.logger.error('❌ ScraperCoordinator pipeline failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Step 1: Discover initial navigation using NavigationMapper
   */
  async discoverNavigation(targetUrl) {
    await this.navigationMapper.initialize();
    
    // Use mapSiteTaxonomy which returns navigation with main_sections
    const navigationResults = await this.navigationMapper.mapSiteTaxonomy(targetUrl);
    
    this.logger.info('Navigation discovery complete', {
      sectionsFound: navigationResults.main_sections?.length || 0,
      totalItems: navigationResults.totalNavigationItems || 0,
      strategy: navigationResults.strategy
    });
    
    return navigationResults;
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
   * Step 3: Extract products from all discovered categories
   */
  async extractAllProducts(categoryHierarchy) {
    const productResults = [];
    
    // Get categories that have products (leaf nodes or categories with products)
    const productCategories = categoryHierarchy.categories.filter(cat => 
      cat.hasProducts || cat.isLeaf
    );
    
    this.logger.info('Starting product extraction', {
      totalCategories: productCategories.length,
      parallelProcessing: this.options.parallelCategories
    });
    
    // Process categories in batches for parallel processing
    const batches = this.createBatches(productCategories, this.options.parallelCategories);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      this.logger.info(`Processing batch ${batchIndex + 1}/${batches.length}`, {
        categoriesInBatch: batch.length
      });
      
      // Process batch in parallel
      const batchPromises = batch.map(category => 
        this.productPaginator.extractProducts(category)
          .catch(error => {
            this.logger.warn('Failed to extract products from category', {
              category: category.name,
              error: error.message
            });
            return { 
              category: category, 
              products: [], 
              error: error.message 
            };
          })
      );
      
      const batchResults = await Promise.all(batchPromises);
      productResults.push(...batchResults);
    }
    
    // Calculate total products extracted
    const totalProducts = productResults.reduce((sum, result) => 
      sum + (result.products?.length || 0), 0
    );
    
    this.logger.info('Product extraction complete', {
      categoriesProcessed: productResults.length,
      totalProducts: totalProducts,
      successfulCategories: productResults.filter(r => r.products?.length > 0).length
    });
    
    return productResults;
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
   * Get current coordinator status
   */
  getStatus() {
    return {
      navigation: this.navigationMapper.getStats ? this.navigationMapper.getStats() : {},
      exploration: this.subCategoryExplorer.getStats(),
      pagination: this.productPaginator.getStats(),
      results: this.results.stats || {}
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.logger.info('Cleaning up ScraperCoordinator resources...');
    
    try {
      await this.browserManager.closeAll();
      await this.navigationMapper.close();
      await this.worldModel.close();
    } catch (error) {
      this.logger.warn('Error during cleanup', { error: error.message });
    }
  }
}

module.exports = ScraperCoordinator;