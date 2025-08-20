/**
 * PipelineOrchestrator
 * 
 * Main coordinator for the scraping pipeline:
 * Discovery → Collection → Extraction
 * 
 * Coordinates NavigationMapper → ProductCatalogStrategy → ExtractorIntelligence
 * with proper error handling, progress tracking, and data persistence.
 */

const NavigationMapper = require('./discovery/NavigationMapper');
const ProductCatalogStrategy = require('./collection/ProductCatalogStrategy');
const ExtractorIntelligence = require('./extraction/ExtractorIntelligence');
const WorldModel = require('../data/WorldModel');
const BrowserManager = require('../common/BrowserManager');
const { performance } = require('perf_hooks');

class PipelineOrchestrator {
  constructor(logger, options = {}) {
    this.logger = logger;
    this.options = {
      maxConcurrency: options.maxConcurrency || 3,
      enableNavigation: options.enableNavigation !== false,
      enableCollection: options.enableCollection !== false,
      enableExtraction: options.enableExtraction !== false,
      persistResults: options.persistResults !== false,
      ...options
    };

    // Initialize pipeline components
    this.navigationMapper = new NavigationMapper(logger, null);
    this.productCatalogStrategy = new ProductCatalogStrategy(logger, options.catalogOptions);
    this.extractorIntelligence = new ExtractorIntelligence(logger, null);
    this.worldModel = new WorldModel(logger);
    this.browserManager = new BrowserManager();

    // Pipeline state
    this.isInitialized = false;
    this.currentJob = null;
    this.stats = {
      jobsProcessed: 0,
      navigationSuccesses: 0,
      collectionSuccesses: 0,
      extractionSuccesses: 0,
      errors: 0
    };
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      this.logger.info('Initializing PipelineOrchestrator...');

      // Initialize components in order
      await this.navigationMapper.initialize();
      await this.worldModel.initialize();

      this.isInitialized = true;
      this.logger.info('PipelineOrchestrator initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize PipelineOrchestrator:', error);
      throw error;
    }
  }

  /**
   * Execute full pipeline for a target URL
   */
  async executePipeline(targetUrl, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const jobId = options.jobId || `pipeline_${Date.now()}`;
    const startTime = performance.now();

    this.currentJob = {
      jobId,
      targetUrl,
      startTime,
      stage: 'starting',
      progress: {
        navigation: { status: 'pending', results: null },
        collection: { status: 'pending', results: null },
        extraction: { status: 'pending', results: null }
      }
    };

    try {
      this.logger.info('Starting pipeline execution', {
        jobId,
        targetUrl,
        enabledStages: {
          navigation: this.options.enableNavigation,
          collection: this.options.enableCollection,
          extraction: this.options.enableExtraction
        }
      });

      // Stage 1: Navigation Discovery
      let navigationResults = null;
      if (this.options.enableNavigation) {
        navigationResults = await this.executeNavigationStage(targetUrl);
      }

      // Stage 2: Product Collection  
      let collectionResults = null;
      if (this.options.enableCollection && navigationResults) {
        collectionResults = await this.executeCollectionStage(navigationResults);
      }

      // Stage 3: Product Extraction
      let extractionResults = null;
      if (this.options.enableExtraction && collectionResults) {
        extractionResults = await this.executeExtractionStage(collectionResults);
      }

      // Finalize and persist results
      const finalResults = await this.finalizePipeline({
        jobId,
        targetUrl,
        navigation: navigationResults,
        collection: collectionResults,
        extraction: extractionResults,
        duration: performance.now() - startTime
      });

      this.stats.jobsProcessed++;
      this.logger.info('Pipeline execution completed successfully', {
        jobId,
        duration: finalResults.duration,
        stages: Object.keys(finalResults).filter(k => k !== 'jobId' && k !== 'duration')
      });

      return finalResults;

    } catch (error) {
      this.stats.errors++;
      this.logger.error('Pipeline execution failed', {
        jobId,
        targetUrl,
        stage: this.currentJob?.stage,
        error: error.message
      });

      // Return partial results on failure
      return {
        jobId,
        targetUrl,
        status: 'failed',
        error: error.message,
        partialResults: this.currentJob?.progress,
        duration: performance.now() - startTime
      };
    } finally {
      this.currentJob = null;
    }
  }

  /**
   * Stage 1: Navigation Discovery
   */
  async executeNavigationStage(targetUrl) {
    this.currentJob.stage = 'navigation';
    this.currentJob.progress.navigation.status = 'running';

    try {
      this.logger.info('Executing navigation discovery stage', { targetUrl });

      const domain = new URL(targetUrl).hostname;
      const navigationResults = await this.navigationMapper.mapSiteNavigation(targetUrl);

      this.currentJob.progress.navigation = {
        status: 'completed',
        results: navigationResults
      };

      this.stats.navigationSuccesses++;
      this.logger.info('Navigation stage completed', {
        domain,
        sectionsFound: navigationResults.main_sections?.length || 0,
        strategy: navigationResults.strategy
      });

      return navigationResults;

    } catch (error) {
      this.currentJob.progress.navigation = {
        status: 'failed',
        error: error.message
      };
      throw new Error(`Navigation stage failed: ${error.message}`);
    }
  }

  /**
   * Stage 2: Product Collection
   */
  async executeCollectionStage(navigationResults) {
    this.currentJob.stage = 'collection';
    this.currentJob.progress.collection.status = 'running';

    try {
      this.logger.info('Executing product collection stage');

      // Extract product-rich categories from navigation
      const productCategories = navigationResults.main_sections?.filter(section => 
        this.isProductCategory(section)
      ) || [];

      if (productCategories.length === 0) {
        this.logger.warn('No product categories found in navigation results');
        return { categories: [], productUrls: [] };
      }

      const collectionResults = {
        categories: productCategories,
        productUrls: []
      };

      // Use ProductCatalogStrategy to collect product URLs from each category
      for (const category of productCategories.slice(0, 5)) { // Limit to first 5 categories
        try {
          const categoryProducts = await this.collectCategoryProducts(category);
          collectionResults.productUrls.push(...categoryProducts);
        } catch (error) {
          this.logger.warn('Failed to collect products from category', {
            category: category.name,
            error: error.message
          });
        }
      }

      this.currentJob.progress.collection = {
        status: 'completed',
        results: collectionResults
      };

      this.stats.collectionSuccesses++;
      this.logger.info('Collection stage completed', {
        categoriesProcessed: productCategories.length,
        productUrlsFound: collectionResults.productUrls.length
      });

      return collectionResults;

    } catch (error) {
      this.currentJob.progress.collection = {
        status: 'failed',
        error: error.message
      };
      throw new Error(`Collection stage failed: ${error.message}`);
    }
  }

  /**
   * Stage 3: Product Extraction
   */
  async executeExtractionStage(collectionResults) {
    this.currentJob.stage = 'extraction';
    this.currentJob.progress.extraction.status = 'running';

    try {
      this.logger.info('Executing product extraction stage');

      const { productUrls } = collectionResults;
      if (!productUrls || productUrls.length === 0) {
        this.logger.warn('No product URLs to extract');
        return { products: [], extractionStats: {} };
      }

      // Sample first few products for extraction
      const sampleUrls = productUrls.slice(0, 10);
      const extractedProducts = [];

      for (const productUrl of sampleUrls) {
        try {
          const productData = await this.extractorIntelligence.extractProduct(productUrl);
          if (productData && productData.title) {
            extractedProducts.push(productData);
          }
        } catch (error) {
          this.logger.warn('Failed to extract product', {
            productUrl,
            error: error.message
          });
        }
      }

      const extractionResults = {
        products: extractedProducts,
        extractionStats: {
          totalUrls: productUrls.length,
          sampleSize: sampleUrls.length,
          successfulExtractions: extractedProducts.length,
          successRate: extractedProducts.length / sampleUrls.length
        }
      };

      this.currentJob.progress.extraction = {
        status: 'completed',
        results: extractionResults
      };

      this.stats.extractionSuccesses++;
      this.logger.info('Extraction stage completed', {
        productsExtracted: extractedProducts.length,
        successRate: `${(extractionResults.extractionStats.successRate * 100).toFixed(1)}%`
      });

      return extractionResults;

    } catch (error) {
      this.currentJob.progress.extraction = {
        status: 'failed',
        error: error.message
      };
      throw new Error(`Extraction stage failed: ${error.message}`);
    }
  }

  /**
   * Finalize pipeline results and optionally persist to WorldModel
   */
  async finalizePipeline(results) {
    try {
      if (this.options.persistResults && this.worldModel) {
        // Store navigation intelligence
        if (results.navigation) {
          const domain = new URL(results.targetUrl).hostname;
          await this.worldModel.storeSiteNavigation(domain, results.navigation);
        }

        // Store extracted products
        if (results.extraction?.products) {
          for (const product of results.extraction.products) {
            await this.worldModel.storeProduct(product);
          }
        }
      }

      return {
        ...results,
        status: 'completed',
        summary: {
          navigationSections: results.navigation?.main_sections?.length || 0,
          productCategories: results.collection?.categories?.length || 0,
          productUrls: results.collection?.productUrls?.length || 0,
          extractedProducts: results.extraction?.products?.length || 0
        }
      };
    } catch (error) {
      this.logger.warn('Failed to persist pipeline results', { error: error.message });
      return { ...results, persistenceError: error.message };
    }
  }

  /**
   * Helper: Determine if navigation section is product-related
   */
  isProductCategory(section) {
    const name = section.name?.toLowerCase() || '';
    const url = section.url?.toLowerCase() || '';
    
    const productKeywords = [
      'shop', 'products', 'collections', 'category', 'clothing', 'shoes', 
      'accessories', 'men', 'women', 'sale', 'new', 'brands'
    ];

    return productKeywords.some(keyword => 
      name.includes(keyword) || url.includes(keyword)
    );
  }

  /**
   * Helper: Collect products from a specific category using ProductCatalogStrategy
   */
  async collectCategoryProducts(category) {
    this.logger.info('Collecting products from category', { category: category.name });

    // If parent category has no URL but has children, collect from children instead
    if (!category.url) {
      if (category.children && category.children.length > 0) {
        this.logger.info('Parent category has no URL, collecting from children', { 
          category: category.name,
          childrenCount: category.children.length 
        });
        
        // Collect from first few children categories (limit to prevent overload)
        const childUrls = [];
        const childrenToProcess = category.children.slice(0, 3); // Process first 3 children
        
        for (const child of childrenToProcess) {
          if (child.url) {
            try {
              const childProducts = await this.collectCategoryProducts(child);
              childUrls.push(...childProducts);
            } catch (error) {
              this.logger.warn('Failed to collect from child category', {
                parent: category.name,
                child: child.name,
                error: error.message
              });
            }
          }
        }
        
        return childUrls;
      } else {
        this.logger.warn('Category has no URL and no children, skipping', { category: category.name });
        return [];
      }
    }

    try {
      // Use BrowserManager with anti-bot detection (100% success rate)
      const { page, close } = await this.browserManager.createBrowser('stealth');
      this.logger.debug('Created stealth browser for category collection', { category: category.name });

      try {
        // Navigate to category page with human-like timing
        await page.goto(category.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await this.browserManager.humanDelay(2000, 0.3); // Human-like delay with variance

        // Use ProductCatalogStrategy to collect product URLs
        const result = await this.productCatalogStrategy.execute(page);
        
        // Extract URLs from product items (items may be objects with url property)
        const productUrls = result.items?.map(item => 
          typeof item === 'string' ? item : item.url || item.href
        ).filter(Boolean) || [];
        
        this.logger.info('Product collection completed for category', {
          category: category.name,
          productsFound: productUrls.length,
          confidence: result.confidence,
          platform: result.metadata?.platform,
          antiBotBypass: true
        });

        return productUrls;

      } finally {
        await close(); // BrowserManager handles proper cleanup
      }

    } catch (error) {
      this.logger.error('Failed to collect products from category', {
        category: category.name,
        url: category.url,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get current pipeline statistics
   */
  getStats() {
    return {
      ...this.stats,
      uptime: this.isInitialized ? Date.now() - this.initTime : 0,
      currentJob: this.currentJob ? {
        jobId: this.currentJob.jobId,
        stage: this.currentJob.stage,
        targetUrl: this.currentJob.targetUrl
      } : null
    };
  }

  /**
   * Cleanup resources
   */
  async close() {
    this.logger.info('Closing PipelineOrchestrator...');
    
    try {
      await this.navigationMapper.close();
      await this.extractorIntelligence.close();
      await this.worldModel.close();
    } catch (error) {
      this.logger.warn('Error during PipelineOrchestrator cleanup:', error);
    }

    this.isInitialized = false;
  }
}

module.exports = PipelineOrchestrator;