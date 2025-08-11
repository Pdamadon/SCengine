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
      
      // Report progress
      job.progress(5);

      // Determine scraper type based on target URL and job type
      const scraper = this.selectScraper(job.data);
      
      // Execute scraping operation
      const result = await this.executeScraping(job, scraper);
      
      // Save results to database
      await this.saveResults(jobId, result);
      
      // Update final job status
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
        job.data.scraping_type
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
        job.data.scraping_type
      );

      this.activeJobs.delete(jobId);
      
      throw error;
    }
  }

  /**
   * Select appropriate scraper based on job data
   */
  selectScraper(jobData) {
    const targetUrl = jobData.target_url.toLowerCase();
    
    // Check for specific site scrapers
    if (targetUrl.includes('glasswingshop.com')) {
      return this.scrapers.glasswing;
    }
    
    // Default to general scraper
    return this.scrapers.general;
  }

  /**
   * Execute scraping operation with progress reporting
   */
  async executeScraping(job, scraper) {
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

    // Progress callback
    const progressCallback = (progress, message = '') => {
      job.progress(progress);
      logger.debug('ScrapingWorker: Job progress update', {
        jobId: jobId,
        progress: progress,
        message: message,
      });
    };

    job.progress(10);

    // Execute based on scraping type
    switch (jobData.scraping_type) {
      case 'full_site':
        return await this.executeFullSiteScraping(jobData.target_url, scrapingOptions, scraper, progressCallback);
        
      case 'category':
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
   * Execute full site scraping
   */
  async executeFullSiteScraping(targetUrl, options, scraper, progressCallback) {
    progressCallback(15, 'Starting full site discovery...');
    
    // For Glasswing scraper, use the existing category-aware method
    if (scraper instanceof GlasswingScraper) {
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
    
    // For general scraper, implement full site logic
    throw new Error('Full site scraping not yet implemented for general scraper');
  }

  /**
   * Execute category scraping
   */
  async executeCategoryScraping(targetUrl, options, scraper, progressCallback) {
    progressCallback(15, 'Starting category page analysis...');
    
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
   */
  async executeProductScraping(targetUrl, options, scraper, progressCallback) {
    progressCallback(15, 'Extracting product data...');
    
    if (scraper instanceof GlasswingScraper) {
      const result = await scraper.scrapeProductDetails(targetUrl, {
        extractImages: options.extractImages,
        extractReviews: options.extractReviews,
        progressCallback: progressCallback,
      });
      
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
   * Format scraping results for storage
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
   * Calculate data quality score based on completeness
   */
  calculateDataQualityScore(items) {
    if (!items.length) return 0;
    
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
        { $set: updateDoc }
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

    logger.info('ScrapingWorker: Worker stopped');
  }
}

module.exports = ScrapingWorker;