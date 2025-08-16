/**
 * ProductDiscoveryOrchestrator - Systematic product collection from stored category tree
 * 
 * Processes categories in parallel using stored category tree from CategoryTreeBuilder.
 * Focuses purely on product discovery with resumable operations and progress tracking.
 * 
 * Key Features:
 * - Parallel processing of multiple categories
 * - Resumable operations with progress tracking
 * - Systematic product collection per category
 * - Proper category-product relationship maintenance
 * - Integration with ProductCatalogCache for storage
 */

const { chromium } = require('playwright');
const ProductCatalogStrategy = require('../navigation/strategies/ProductCatalogStrategy');

class ProductDiscoveryOrchestrator {
  constructor(logger, worldModel, options = {}) {
    this.logger = logger;
    this.worldModel = worldModel;
    
    // Configuration
    this.maxConcurrent = options.maxConcurrent || 3;
    this.maxProductsPerCategory = options.maxProductsPerCategory || 1000;
    this.requestDelay = options.requestDelay || 2000;
    this.retryAttempts = options.retryAttempts || 2;
    this.timeoutMs = options.timeoutMs || 30000;
    
    // Worker management
    this.activeWorkers = new Map();
    this.completedCategories = new Set();
    this.failedCategories = new Map();
    this.progressTracker = null;
    
    // Product discovery strategy
    this.productStrategy = new ProductCatalogStrategy(logger, {
      productDetectionThreshold: 3,
      maxProductsPerPage: 500,
      enableInfiniteScroll: true,
      enableLoadMoreButtons: true,
      enableTraditionalPagination: true,
      enablePaginationDetection: true
    });
    
    // Statistics
    this.stats = {
      totalCategories: 0,
      processedCategories: 0,
      skippedCategories: 0,
      failedCategories: 0,
      totalProducts: 0,
      categoriesWithProducts: 0,
      averageProductsPerCategory: 0,
      startTime: null,
      endTime: null
    };
  }

  /**
   * Discover products for all categories in the stored tree
   */
  async discoverAll(categoryTree, options = {}) {
    const startTime = Date.now();
    this.logger.info('🚀 Starting systematic product discovery', {
      maxConcurrent: this.maxConcurrent,
      totalNodes: this.countTotalNodes(categoryTree)
    });

    // Reset state
    this.completedCategories.clear();
    this.failedCategories.clear();
    this.activeWorkers.clear();
    this.stats = {
      totalCategories: 0,
      processedCategories: 0,
      skippedCategories: 0,
      failedCategories: 0,
      totalProducts: 0,
      categoriesWithProducts: 0,
      averageProductsPerCategory: 0,
      startTime: startTime,
      endTime: null
    };

    try {
      // Extract all leaf categories (categories with no children or few children)
      const leafCategories = this.extractLeafCategories(categoryTree);
      this.stats.totalCategories = leafCategories.length;
      
      this.logger.info(`📂 Found ${leafCategories.length} leaf categories for product discovery`);

      // Initialize progress tracking
      if (this.worldModel && this.worldModel.initializeProductDiscoveryProgress) {
        await this.worldModel.initializeProductDiscoveryProgress(
          new URL(categoryTree.url).hostname,
          leafCategories.map(cat => ({
            url: cat.url,
            name: cat.name,
            depth: cat.depth,
            status: 'pending'
          }))
        );
      }

      // Process categories in parallel batches
      await this.processCategoriesInParallel(leafCategories, categoryTree.url);

      // Finalize statistics
      const endTime = Date.now();
      this.stats.endTime = endTime;
      this.stats.averageProductsPerCategory = this.stats.categoriesWithProducts > 0 
        ? (this.stats.totalProducts / this.stats.categoriesWithProducts).toFixed(1)
        : 0;

      const duration = ((endTime - startTime) / 1000).toFixed(1);
      
      this.logger.info('✅ Product discovery completed', {
        duration: `${duration}s`,
        totalProducts: this.stats.totalProducts,
        processedCategories: this.stats.processedCategories,
        categoriesWithProducts: this.stats.categoriesWithProducts,
        failedCategories: this.stats.failedCategories,
        averageProductsPerCategory: this.stats.averageProductsPerCategory
      });

      return {
        success: true,
        stats: this.stats,
        discoveredProducts: this.stats.totalProducts,
        processedCategories: this.stats.processedCategories,
        duration: duration
      };

    } catch (error) {
      this.logger.error('Product discovery failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Process categories in parallel batches
   */
  async processCategoriesInParallel(categories, baseUrl) {
    const domain = new URL(baseUrl).hostname;
    
    // Create batches for parallel processing
    for (let i = 0; i < categories.length; i += this.maxConcurrent) {
      const batch = categories.slice(i, i + this.maxConcurrent);
      
      this.logger.info(`📦 Processing batch ${Math.floor(i / this.maxConcurrent) + 1}: ${batch.length} categories`);

      // Process batch in parallel
      const batchPromises = batch.map(category => 
        this.processCategory(category, domain)
      );

      // Wait for batch completion
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Log batch results
      const successful = batchResults.filter(r => r.status === 'fulfilled').length;
      const failed = batchResults.filter(r => r.status === 'rejected').length;
      
      this.logger.info(`Batch completed: ${successful} successful, ${failed} failed`);
      
      // Progress update
      const progressPercentage = ((i + batch.length) / categories.length * 100).toFixed(1);
      this.logger.info(`Overall progress: ${progressPercentage}% (${i + batch.length}/${categories.length})`);
      
      // Brief delay between batches to be respectful
      if (i + this.maxConcurrent < categories.length) {
        await this.delay(this.requestDelay);
      }
    }
  }

  /**
   * Process a single category for product discovery
   */
  async processCategory(category, domain) {
    const workerId = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.debug(`👷 Worker ${workerId} starting: ${category.name}`);
    
    let browser = null;
    
    try {
      // Check if already processed
      if (this.completedCategories.has(category.url)) {
        this.stats.skippedCategories++;
        return { skipped: true, reason: 'already_processed' };
      }

      // Mark as in progress
      this.activeWorkers.set(workerId, {
        category: category.name,
        url: category.url,
        startTime: Date.now()
      });

      // Initialize browser for this worker
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        viewport: { width: 1920, height: 1080 }
      });
      
      const page = await context.newPage();

      // Visit category page
      this.logger.debug(`🌐 Visiting category: ${category.url}`);
      
      await page.goto(category.url, {
        waitUntil: 'domcontentloaded',
        timeout: this.timeoutMs
      });
      
      await page.waitForTimeout(3000); // Let page settle

      // Run product discovery
      this.logger.debug(`🔍 Running product discovery for: ${category.name}`);
      
      const productResult = await this.productStrategy.execute(page);
      
      const productsFound = productResult.items?.length || 0;
      
      if (productsFound > 0) {
        this.logger.info(`🛍️ ${category.name}: Found ${productsFound} products`);
        
        // Enhance products with category information
        const enhancedProducts = productResult.items.map(product => ({
          ...product,
          category_info: {
            category_name: category.name,
            category_url: category.url,
            category_depth: category.depth,
            category_type: category.type,
            discovery_path: this.buildCategoryPath(category)
          }
        }));

        // Store products via cache (if available)
        if (this.worldModel && this.worldModel.storeDiscoveredProducts) {
          await this.worldModel.storeDiscoveredProducts(domain, category, enhancedProducts);
        }
        
        // Update statistics
        this.stats.totalProducts += productsFound;
        this.stats.categoriesWithProducts++;
        
      } else {
        this.logger.debug(`📭 ${category.name}: No products found`);
      }

      // Mark category as completed
      this.completedCategories.add(category.url);
      this.stats.processedCategories++;
      
      // Update progress tracking
      if (this.worldModel && this.worldModel.markCategoryProcessed) {
        await this.worldModel.markCategoryProcessed(domain, category.url, {
          status: 'completed',
          products_found: productsFound,
          processed_at: new Date().toISOString()
        });
      }

      return {
        success: true,
        category: category.name,
        products_found: productsFound,
        worker_id: workerId
      };

    } catch (error) {
      this.logger.warn(`❌ Worker ${workerId} failed for ${category.name}: ${error.message}`);
      
      // Track failure
      this.failedCategories.set(category.url, {
        category: category.name,
        error: error.message,
        attempts: (this.failedCategories.get(category.url)?.attempts || 0) + 1,
        last_attempt: new Date().toISOString()
      });
      
      this.stats.failedCategories++;
      
      // Update progress tracking
      if (this.worldModel && this.worldModel.markCategoryProcessed) {
        try {
          await this.worldModel.markCategoryProcessed(domain, category.url, {
            status: 'failed',
            error: error.message,
            processed_at: new Date().toISOString()
          });
        } catch (trackingError) {
          this.logger.warn(`Failed to update progress tracking: ${trackingError.message}`);
        }
      }

      throw error;

    } finally {
      // Clean up worker
      this.activeWorkers.delete(workerId);
      
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          this.logger.warn(`Error closing browser for worker ${workerId}: ${closeError.message}`);
        }
      }
    }
  }

  /**
   * Extract leaf categories (categories likely to contain products)
   */
  extractLeafCategories(tree) {
    const leafCategories = [];
    
    const traverse = (node) => {
      // Consider a node a "leaf" if:
      // 1. It has no children, OR
      // 2. It has very few children (likely subcategories with products), OR  
      // 3. It's at maximum depth
      const isLeaf = !node.children || 
                     node.children.length === 0 || 
                     node.children.length <= 2 || 
                     node.depth >= 3;
      
      if (isLeaf && node.url && node.url !== '#' && node.type !== 'root') {
        leafCategories.push({
          name: node.name,
          url: node.url,
          depth: node.depth,
          type: node.type,
          parent_path: this.buildCategoryPath(node)
        });
      }
      
      // Also traverse children to catch deeper categories
      if (node.children) {
        node.children.forEach(child => traverse(child));
      }
    };
    
    traverse(tree);
    
    // Sort by depth (deeper categories first as they're more likely to have products)
    leafCategories.sort((a, b) => b.depth - a.depth || a.name.localeCompare(b.name));
    
    return leafCategories;
  }

  /**
   * Build category path for proper hierarchy tracking
   */
  buildCategoryPath(category) {
    // This would need to be enhanced to track full parent path
    // For now, return basic info
    return {
      category_name: category.name,
      depth: category.depth,
      type: category.type
    };
  }

  /**
   * Count total nodes in tree
   */
  countTotalNodes(tree) {
    let count = 1;
    if (tree.children) {
      tree.children.forEach(child => {
        count += this.countTotalNodes(child);
      });
    }
    return count;
  }

  /**
   * Simple delay utility
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current discovery statistics
   */
  getStats() {
    return {
      ...this.stats,
      active_workers: this.activeWorkers.size,
      completed_categories: this.completedCategories.size,
      failed_categories: this.failedCategories.size
    };
  }

  /**
   * Get detailed progress information
   */
  getProgress() {
    const activeWorkerInfo = Array.from(this.activeWorkers.entries()).map(([id, info]) => ({
      worker_id: id,
      category: info.category,
      url: info.url,
      running_time: Date.now() - info.startTime
    }));

    return {
      total_categories: this.stats.totalCategories,
      processed: this.stats.processedCategories,
      failed: this.stats.failedCategories,
      active_workers: activeWorkerInfo,
      progress_percentage: this.stats.totalCategories > 0 
        ? ((this.stats.processedCategories + this.stats.failedCategories) / this.stats.totalCategories * 100).toFixed(1)
        : 0
    };
  }

  /**
   * Cleanup any active resources
   */
  async cleanup() {
    this.logger.info('🧹 Cleaning up ProductDiscoveryOrchestrator resources...');
    
    // Wait for active workers to complete (with timeout)
    const cleanupTimeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.activeWorkers.size > 0 && (Date.now() - startTime) < cleanupTimeout) {
      this.logger.info(`Waiting for ${this.activeWorkers.size} active workers to complete...`);
      await this.delay(1000);
    }
    
    if (this.activeWorkers.size > 0) {
      this.logger.warn(`Cleanup timeout: ${this.activeWorkers.size} workers still active`);
    }
    
    this.logger.info('✅ ProductDiscoveryOrchestrator cleanup completed');
  }
}

module.exports = ProductDiscoveryOrchestrator;