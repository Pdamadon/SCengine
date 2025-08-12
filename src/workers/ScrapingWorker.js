/**
 * Scraping Worker Service
 * Processes scraping jobs from Redis queue and executes scraping operations
 * Integrates with existing scraper engines and provides progress reporting
 */

const { queueManager } = require('../services/QueueManager');
const { logger } = require('../utils/logger');
const { metrics } = require('../utils/metrics');
const ScrapingEngine = require('../scrapers/ScrapingEngine');
const GlasswingScraper = require('../scrapers/GlasswingScraper');
const ScraperFactory = require('../multisite/core/ScraperFactory');
const GapScraper = require('../multisite/scrapers/GapScraper');
const UniversalScraper = require('../multisite/core/UniversalScraper');
const WorldModelPopulator = require('../services/WorldModelPopulator');
const { performance } = require('perf_hooks');

class ScrapingWorker {
  constructor(mongoClient, concurrency = 3) {
    this.mongoClient = mongoClient;
    this.db = mongoClient ? mongoClient.db('ai_shopping_scraper') : null;
    this.concurrency = concurrency;
    this.isProcessing = false;
    this.activeJobs = new Map();

    // Initialize scraper engines
    this.scrapers = {
      glasswing: new GlasswingScraper(logger),
      general: new ScrapingEngine(logger, mongoClient),
    };
    
    // Initialize multisite scraper factory
    this.scraperFactory = new ScraperFactory(logger, {
      cacheTimeout: 24 * 60 * 60 * 1000, // 24 hours
    });

    // Initialize WorldModelPopulator for orchestrated scraping
    this.worldModelPopulator = new WorldModelPopulator(mongoClient);

    // Database collections
    this.jobsCollection = 'scraping_jobs';
    this.resultsCollection = 'scraping_job_results';
  }

  /**
   * Start processing jobs from the queue
   */
  async start() {
    try {
      logger.info('ScrapingWorker: Starting worker processes...');

      if (!queueManager.isInitialized) {
        await queueManager.initialize();
      }
      
      // Initialize scraper factory
      await this.scraperFactory.initialize();

      // Get the scraping queue
      const scrapingQueue = queueManager.getQueue('scraping');

      // Set up job processing
      scrapingQueue.process('*', this.concurrency, this.processJob.bind(this));

      this.isProcessing = true;

      logger.info('ScrapingWorker: Worker started successfully', {
        concurrency: this.concurrency,
        queues: ['scraping'],
      });

      // Start health monitoring
      this.startHealthMonitoring();

    } catch (error) {
      logger.error('ScrapingWorker: Failed to start worker', {
        error: error.message,
        stack: error.stack,
      });

      metrics.trackError('WorkerStartError', 'scraping_worker');
      throw error;
    }
  }

  /**
   * Process a job from the queue
   */
  async processJob(job) {
    const startTime = performance.now();
    const jobId = job.data.job_id;

    logger.info('ScrapingWorker: Processing job', {
      jobId: jobId,
      jobType: job.name,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts,
    });

    this.activeJobs.set(jobId, {
      job: job,
      startTime: startTime,
      status: 'processing',
    });

    try {
      // Update job status in database
      await this.updateJobStatus(jobId, 'running', 0);

      // Define progress callback here
      const progressCallback = (progress, message = '', details = {}) => {
        const progressData = {
          progress: progress,
          message: message,
          details: details,
          timestamp: new Date(),
        };

        job.progress(progressData);
        logger.debug('ScrapingWorker: Job progress update', {
          jobId: jobId,
          progress: progress,
          message: message,
          details: details,
        });
      };

      // Report initial progress
      progressCallback(5, 'Job started - initializing scraper...');

      // Determine scraper type based on target URL and job type
      const scraper = await this.selectScraper(job.data);
      progressCallback(8, `Selected ${scraper.constructor.name} for scraping...`);

      // Execute scraping operation
      const result = await this.executeScraping(job, scraper, progressCallback);

      // Save results to database
      progressCallback(90, 'Saving results to database...');
      await this.saveResults(jobId, result);

      // Update final job status
      progressCallback(100, 'Job completed successfully!', {
        itemsScraped: result.summary.total_items,
        categoriesFound: result.summary.categories_found,
      });
      await this.updateJobStatus(jobId, 'completed', 100, result.summary);

      const duration = performance.now() - startTime;

      logger.info('ScrapingWorker: Job completed successfully', {
        jobId: jobId,
        duration: Math.round(duration),
        itemsScraped: result.summary.total_items,
        categoriesFound: result.summary.categories_found,
      });

      // Track metrics
      metrics.trackScrapingOperation(
        this.extractDomain(job.data.target_url),
        'success',
        duration,
        result.summary.total_items,
        job.data.scraping_type,
      );

      this.activeJobs.delete(jobId);

      return result;

    } catch (error) {
      const duration = performance.now() - startTime;

      logger.error('ScrapingWorker: Job failed', {
        jobId: jobId,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts,
        duration: Math.round(duration),
        error: error.message,
        stack: error.stack,
      });

      // Update job status with error
      await this.updateJobStatus(jobId, 'failed', job.progress(), null, error.message);

      // Track error metrics
      metrics.trackScrapingOperation(
        this.extractDomain(job.data.target_url),
        'failed',
        duration,
        0,
        job.data.scraping_type,
      );

      this.activeJobs.delete(jobId);

      throw error;
    }
  }

  /**
   * Select appropriate scraper based on job data
   * Enhanced with multisite platform detection
   */
  async selectScraper(jobData) {
    const targetUrl = jobData.target_url.toLowerCase();

    // Priority override: Always use GlasswingScraper for Glasswing sites
    // This ensures we get the full orchestrated WorldModelPopulator workflow
    if (targetUrl.includes('glasswingshop.com')) {
      logger.info('ScrapingWorker: Using specialized GlasswingScraper for Glasswing site', {
        url: targetUrl,
        scraperType: 'GlasswingScraper',
        reason: 'specialized_glasswing_scraper',
      });
      return this.scrapers.glasswing;
    }

    try {
      // Try multisite scraper factory for other sites (supports Gap, Shopify, etc.)
      const scraperInfo = await this.scraperFactory.createScraper(targetUrl, jobData, {
        enableDeepAnalysis: false, // Start with fast detection
      });
      
      logger.info('ScrapingWorker: Selected multisite scraper', {
        url: targetUrl,
        platform: scraperInfo.platformInfo.platform,
        confidence: scraperInfo.platformInfo.confidence,
        scraperType: scraperInfo.scraper.constructor.name,
      });
      
      return scraperInfo.scraper;
      
    } catch (error) {
      logger.warn('ScrapingWorker: Multisite scraper selection failed, falling back to legacy scrapers', {
        url: targetUrl,
        error: error.message,
      });
      
      // Default to general scraper
      return this.scrapers.general;
    }
  }

  /**
   * Execute scraping operation with progress reporting
   */
  async executeScraping(job, scraper, progressCallback) {
    const jobData = job.data;
    const jobId = jobData.job_id;

    // Configure scraper options
    const scrapingOptions = {
      maxPages: jobData.max_pages || 100,
      respectRobotsTxt: jobData.respect_robots_txt !== false,
      rateLimitDelay: jobData.rate_limit_delay_ms || 1000,
      timeout: jobData.timeout_ms || 30000,
      extractImages: jobData.extract_images || false,
      extractReviews: jobData.extract_reviews || false,
      categoryFilters: jobData.category_filters || [],
      customSelectors: jobData.custom_selectors || {},
    };

    progressCallback(10, `Starting ${jobData.scraping_type} scraping...`);

    // Execute based on scraping type
    switch (jobData.scraping_type) {
      case 'full_site':
        return await this.executeFullSiteScraping(jobData.target_url, scrapingOptions, scraper, progressCallback);

      case 'category':
      case 'category_search': // Support both legacy and new naming
        return await this.executeCategoryScraping(jobData.target_url, scrapingOptions, scraper, progressCallback);

      case 'product':
        return await this.executeProductScraping(jobData.target_url, scrapingOptions, scraper, progressCallback);

      case 'search':
        return await this.executeSearchScraping(jobData.target_url, scrapingOptions, scraper, progressCallback);

      default:
        throw new Error(`Unsupported scraping type: ${jobData.scraping_type}`);
    }
  }

  /**
   * Execute full site scraping using WorldModelPopulator orchestration
   */
  async executeFullSiteScraping(targetUrl, options, scraper, progressCallback) {
    progressCallback(15, 'Starting orchestrated full site discovery...');

    // Use WorldModelPopulator orchestrated workflow for comprehensive scraping
    if (scraper instanceof GlasswingScraper) {
      try {
        progressCallback(20, 'Initializing WorldModelPopulator orchestration...');
        
        // Use the orchestrated WorldModelPopulator workflow
        const results = await this.worldModelPopulator.populateFromGlasswing({
          progressCallback: (progress, message, details) => {
            // Map progress from 20-95% range
            const mappedProgress = Math.round(20 + (progress * 0.75));
            progressCallback(mappedProgress, message || 'Processing...', details);
          }
        });

        progressCallback(95, 'Formatting orchestrated scraping results...');

        // Format results for consistency with existing API
        return this.formatOrchestatedResults(results, 'full_site');

      } catch (error) {
        logger.error('ScrapingWorker: Orchestrated full site scraping failed', {
          targetUrl,
          error: error.message,
        });

        // Fallback to basic scraping if orchestrated fails
        progressCallback(15, 'Falling back to basic category-aware scraping...');
        const results = await scraper.scrapeWithCategories({
          baseUrl: targetUrl,
          maxPages: options.maxPages,
          respectRobotsTxt: options.respectRobotsTxt,
          delay: options.rateLimitDelay,
          extractImages: options.extractImages,
          extractReviews: options.extractReviews,
          progressCallback: progressCallback,
        });

        return this.formatScrapingResults(results, 'full_site');
      }
    }

    // For general scraper, implement full site logic
    throw new Error('Full site scraping not yet implemented for general scraper');
  }

  /**
   * Execute category scraping
   * Enhanced to support multisite scrapers
   */
  async executeCategoryScraping(targetUrl, options, scraper, progressCallback) {
    progressCallback(15, 'Starting category page analysis...');

    // Handle multisite scrapers (Gap, Universal, etc.)
    if (scraper instanceof GapScraper || scraper instanceof UniversalScraper) {
      const results = await scraper.scrape(progressCallback);
      return this.formatMultisiteResults(results, 'category');
    }
    
    // Handle legacy Glasswing scraper
    if (scraper instanceof GlasswingScraper) {
      const results = await scraper.scrapeCategoryPage(targetUrl, {
        maxPages: options.maxPages,
        respectRobotsTxt: options.respectRobotsTxt,
        delay: options.rateLimitDelay,
        extractImages: options.extractImages,
        extractReviews: options.extractReviews,
        progressCallback: progressCallback,
      });

      return this.formatScrapingResults(results, 'category');
    }

    throw new Error('Category scraping not yet implemented for general scraper');
  }

  /**
   * Execute product scraping
   * Enhanced to support multisite scrapers
   */
  async executeProductScraping(targetUrl, options, scraper, progressCallback) {
    progressCallback(15, 'Extracting product data...');

    // Handle multisite scrapers (Gap, Universal, etc.)
    if (scraper instanceof GapScraper || scraper instanceof UniversalScraper) {
      const results = await scraper.scrape(progressCallback);
      return this.formatMultisiteResults(results, 'product');
    }
    
    // Handle legacy Glasswing scraper
    if (scraper instanceof GlasswingScraper) {
      const result = await scraper.scrapeProductPage(targetUrl);
      return this.formatScrapingResults([result], 'product');
    }

    throw new Error('Product scraping not yet implemented for general scraper');
  }

  /**
   * Execute search scraping
   */
  async executeSearchScraping(targetUrl, options, scraper, progressCallback) {
    progressCallback(15, 'Processing search results...');

    throw new Error('Search scraping not yet implemented');
  }

  /**
   * Format scraping results for storage (legacy format)
   */
  formatScrapingResults(rawResults, scrapingType) {
    const items = Array.isArray(rawResults) ? rawResults : [rawResults];
    const totalItems = items.length;
    const categories = [...new Set(items.map(item => item.category).filter(Boolean))];

    return {
      data: items,
      summary: {
        total_items: totalItems,
        categories_found: categories.length,
        categories: categories,
        scraping_type: scrapingType,
        data_quality_score: this.calculateDataQualityScore(items),
      },
    };
  }

  /**
   * Format orchestrated WorldModelPopulator results for storage
   */
  formatOrchestatedResults(orchestratedResults, scrapingType) {
    try {
      // WorldModelPopulator returns comprehensive results with database insertions
      const { 
        products, 
        categories, 
        categoryHierarchy, 
        productCategories, 
        summary 
      } = orchestratedResults;

      // Convert database documents to API format
      const items = products.map(product => ({
        title: product.title,
        price: product.price_cents ? (product.price_cents / 100).toFixed(2) : product.original_price,
        url: product.url,
        description: product.description,
        images: product.images || [],
        availability: product.availability || (product.in_stock ? 'in_stock' : 'out_of_stock'),
        brand: product.brand,
        sizes: product.glasswing_variants?.sizes?.map(s => s.value).join(', ') || '',
        colors: product.glasswing_variants?.colors?.map(c => c.name).join(', ') || '',
        category: product.category,
        scraped_at: product.scraped_at,
        platform: 'glasswing',
        // Include rich automation intelligence
        glasswing_product_id: product.glasswing_product_id,
        automation_elements: product.automation_elements,
        purchase_workflow: product.purchase_workflow,
      }));

      const totalItems = items.length;
      const categoriesFound = categories?.length || 0;
      const categoryNames = categories?.map(c => c.name) || [];
      
      // Include orchestrated workflow metadata
      const orchestratedSummary = {
        total_items: totalItems,
        categories_found: categoriesFound,
        categories: categoryNames,
        scraping_type: scrapingType,
        data_quality_score: this.calculateDataQualityScore(items),
        // Orchestrated workflow metadata
        total_products_stored: summary?.productsStored || totalItems,
        total_categories_stored: summary?.categoriesStored || categoriesFound,
        total_relationships_created: summary?.relationshipsCreated || 0,
        category_hierarchy_levels: categoryHierarchy?.length || 0,
        automation_intelligence_embedded: true,
        orchestrated_workflow: true,
        database_populated: true,
      };

      return {
        data: items,
        summary: orchestratedSummary,
        orchestrated_metadata: {
          categories_structure: categories,
          category_hierarchy: categoryHierarchy,
          product_category_relationships: productCategories,
          raw_orchestrated_results: orchestratedResults,
        },
      };

    } catch (error) {
      logger.warn('ScrapingWorker: Failed to format orchestrated results, using fallback format', {
        error: error.message,
        scrapingType: scrapingType,
      });

      // Fallback to basic format
      return this.formatScrapingResults([], scrapingType);
    }
  }

  /**
   * Format multisite scraper results for storage
   */
  formatMultisiteResults(multisiteResults, scrapingType) {
    try {
      // Multisite scrapers return structured results with products array
      const products = multisiteResults.products || [];
      const pages = multisiteResults.pages || [];
      
      // Convert multisite format to legacy format for compatibility
      const items = products.map(product => ({
        title: product.title,
        price: product.price,
        url: product.url,
        description: product.description,
        images: product.images ? product.images.map(img => img.src) : [],
        availability: product.available ? 'in_stock' : 'out_of_stock',
        brand: product.brand,
        sizes: product.sizes ? product.sizes.map(size => size.text).join(', ') : '',
        colors: product.colors ? product.colors.map(color => color.name).join(', ') : '',
        category: this.extractCategoryFromUrl(product.url),
        scraped_at: product.scrapedAt,
        platform: multisiteResults.platform,
      }));

      const totalItems = items.length;
      const categories = [...new Set(items.map(item => item.category).filter(Boolean))];
      
      // Include multisite-specific metadata
      const summary = {
        total_items: totalItems,
        categories_found: categories.length,
        categories: categories,
        scraping_type: scrapingType,
        data_quality_score: this.calculateDataQualityScore(items),
        platform: multisiteResults.platform,
        pages_scraped: multisiteResults.summary?.pagesScraped || pages.length,
        success_rate: multisiteResults.summary?.successRate || 1.0,
        duration_ms: multisiteResults.summary?.duration || 0,
      };

      return {
        data: items,
        summary: summary,
        raw_results: multisiteResults, // Keep original results for analysis
      };

    } catch (error) {
      logger.warn('ScrapingWorker: Failed to format multisite results, using fallback format', {
        error: error.message,
        scrapingType: scrapingType,
      });

      // Fallback to basic format
      return this.formatScrapingResults([], scrapingType);
    }
  }

  /**
   * Extract category from product URL
   */
  extractCategoryFromUrl(url) {
    try {
      const urlPath = new URL(url).pathname.toLowerCase();
      
      // Common category patterns
      const categoryPatterns = [
        /\/browse\/([^\/]+)/,
        /\/collections\/([^\/]+)/,
        /\/category\/([^\/]+)/,
        /\/shop\/([^\/]+)/,
      ];
      
      for (const pattern of categoryPatterns) {
        const match = urlPath.match(pattern);
        if (match && match[1]) {
          return match[1].replace(/-/g, ' ').replace(/_/g, ' ');
        }
      }
      
      return 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Calculate data quality score based on completeness
   */
  calculateDataQualityScore(items) {
    if (!items.length) {return 0;}

    const requiredFields = ['title', 'price', 'url'];
    const optionalFields = ['description', 'images', 'availability'];

    let totalScore = 0;

    for (const item of items) {
      let itemScore = 0;

      // Required fields (70% of score)
      const requiredCount = requiredFields.filter(field => item[field] && item[field] !== '').length;
      itemScore += (requiredCount / requiredFields.length) * 0.7;

      // Optional fields (30% of score)
      const optionalCount = optionalFields.filter(field => item[field] && item[field] !== '').length;
      itemScore += (optionalCount / optionalFields.length) * 0.3;

      totalScore += itemScore;
    }

    return Math.round((totalScore / items.length) * 100) / 100;
  }

  /**
   * Update job status in database
   */
  async updateJobStatus(jobId, status, progress, resultsSummary = null, errorDetails = null) {
    if (!this.db) {
      logger.warn('ScrapingWorker: Database not available for status update', { jobId });
      return;
    }

    try {
      const updateDoc = {
        status: status,
        progress: progress,
        updated_at: new Date(),
      };

      if (status === 'running' && !progress) {
        updateDoc.started_at = new Date();
      }

      if (status === 'completed') {
        updateDoc.completed_at = new Date();
        updateDoc.results_summary = resultsSummary;
      }

      if (status === 'failed') {
        updateDoc.completed_at = new Date();
        updateDoc.error_details = errorDetails;
      }

      await this.db.collection(this.jobsCollection).updateOne(
        { job_id: jobId },
        { $set: updateDoc },
      );

      logger.debug('ScrapingWorker: Job status updated', {
        jobId: jobId,
        status: status,
        progress: progress,
      });

    } catch (error) {
      logger.error('ScrapingWorker: Failed to update job status', {
        jobId: jobId,
        status: status,
        error: error.message,
      });
    }
  }

  /**
   * Save scraping results to database
   */
  async saveResults(jobId, results) {
    if (!this.db) {
      logger.warn('ScrapingWorker: Database not available for results storage', { jobId });
      return;
    }

    try {
      const resultDoc = {
        job_id: jobId,
        data: results.data,
        total_items: results.summary.total_items,
        categories_found: results.summary.categories_found,
        categories: results.summary.categories,
        data_quality_score: results.summary.data_quality_score,
        processing_time_ms: Date.now(), // Will be calculated by caller
        created_at: new Date(),
      };

      await this.db.collection(this.resultsCollection).insertOne(resultDoc);

      logger.info('ScrapingWorker: Results saved to database', {
        jobId: jobId,
        totalItems: results.summary.total_items,
        categoriesFound: results.summary.categories_found,
      });

    } catch (error) {
      logger.error('ScrapingWorker: Failed to save results', {
        jobId: jobId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    // Report active job count every 30 seconds
    setInterval(() => {
      metrics.setGauge('scraping_worker_active_jobs', this.activeJobs.size);

      // Report individual job progress
      for (const [jobId, jobInfo] of this.activeJobs) {
        const duration = performance.now() - jobInfo.startTime;
        logger.debug('ScrapingWorker: Active job status', {
          jobId: jobId,
          duration: Math.round(duration),
          status: jobInfo.status,
        });
      }
    }, 30000);
  }

  /**
   * Get worker health status
   */
  getHealthStatus() {
    return {
      isProcessing: this.isProcessing,
      activeJobs: this.activeJobs.size,
      maxConcurrency: this.concurrency,
      jobDetails: Array.from(this.activeJobs.entries()).map(([jobId, jobInfo]) => ({
        jobId: jobId,
        duration: Math.round(performance.now() - jobInfo.startTime),
        status: jobInfo.status,
      })),
    };
  }

  /**
   * Graceful shutdown
   */
  async stop() {
    logger.info('ScrapingWorker: Stopping worker...');

    this.isProcessing = false;

    // Wait for active jobs to complete (with timeout)
    const maxWaitTime = 300000; // 5 minutes
    const startWait = Date.now();

    while (this.activeJobs.size > 0 && (Date.now() - startWait) < maxWaitTime) {
      logger.info(`ScrapingWorker: Waiting for ${this.activeJobs.size} active jobs to complete...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    if (this.activeJobs.size > 0) {
      logger.warn(`ScrapingWorker: Force stopping with ${this.activeJobs.size} active jobs`);
    }

    // Clean up scraper factory resources
    try {
      await this.scraperFactory.close();
    } catch (error) {
      logger.warn('ScrapingWorker: Error closing scraper factory', { error: error.message });
    }

    logger.info('ScrapingWorker: Worker stopped');
  }
}

module.exports = ScrapingWorker;
