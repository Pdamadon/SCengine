/**
 * Scraping Worker Service
 * Processes scraping jobs from Redis queue and executes scraping operations
 * Integrates with existing scraper engines and provides progress reporting
 */

import { queueManager } from '../services/QueueManager';
import { logger } from '../utils/logger';
import { metrics } from '../utils/metrics';
import { performance } from 'perf_hooks';
import { MongoClient, Db } from 'mongodb';
import * as Bull from 'bull';

// Type imports
import { 
  WorkerConfig, 
  WorkerHealthStatus 
} from '../types/queue.types';
import { 
  ScrapingJobData, 
  ScrapingResult, 
  ScrapingResultSummary,
  ScrapingType 
} from '../types/scraping.types';
import { 
  UUID, 
  Timestamp, 
  ProgressUpdate 
} from '../types/common.types';
import { BaseScraper } from '../types/multisite.types';

// Legacy imports (will be converted to TypeScript later)
const ScrapingEngine = require('../scrapers/ScrapingEngine');
const GlasswingScraper = require('../scrapers/GlasswingScraper');
const ScraperFactory = require('../multisite/core/ScraperFactory');
const GapScraper = require('../multisite/scrapers/GapScraper');
const UniversalScraper = require('../multisite/core/UniversalScraper');

interface ActiveJob {
  job: Bull.Job;
  startTime: number;
  status: 'processing' | 'completed' | 'failed';
}

interface ScrapingEngines {
  glasswing: any; // Will be typed when converted to TS
  general: any;   // Will be typed when converted to TS
}

class ScrapingWorker {
  private mongoClient: MongoClient | null;
  private db: Db | null;
  private concurrency: number;
  private isProcessing: boolean = false;
  private activeJobs: Map<UUID, ActiveJob> = new Map();
  private scrapers: ScrapingEngines;
  private scraperFactory: any; // Will be typed when converted to TS
  private readonly jobsCollection: string = 'scraping_jobs';
  private readonly resultsCollection: string = 'scraping_job_results';

  constructor(mongoClient?: MongoClient, config: WorkerConfig = {}) {
    this.mongoClient = mongoClient || null;
    this.db = mongoClient ? mongoClient.db('ai_shopping_scraper') : null;
    this.concurrency = config.concurrency || 3;

    // Initialize scraper engines
    this.scrapers = {
      glasswing: new GlasswingScraper(logger),
      general: new ScrapingEngine(logger, mongoClient),
    };
    
    // Initialize multisite scraper factory
    this.scraperFactory = new ScraperFactory(logger, {
      cacheTimeout: 24 * 60 * 60 * 1000, // 24 hours
    });
  }

  /**
   * Start processing jobs from the queue
   */
  async start(): Promise<void> {
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      logger.error('ScrapingWorker: Failed to start worker', {
        error: errorMessage,
        stack: errorStack,
      });

      metrics.trackError('WorkerStartError', 'scraping_worker');
      throw error;
    }
  }

  /**
   * Process a job from the queue
   */
  async processJob(job: Bull.Job<ScrapingJobData>): Promise<ScrapingResult> {
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
      const progressCallback = (progress: number, message: string = '', details: Record<string, any> = {}): void => {
        const progressData: ProgressUpdate = {
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error('ScrapingWorker: Job failed', {
        jobId: jobId,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts,
        duration: Math.round(duration),
        error: errorMessage,
        stack: errorStack,
      });

      // Update job status with error
      await this.updateJobStatus(jobId, 'failed', job.progress() as number, undefined, errorMessage);

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
  private async selectScraper(jobData: ScrapingJobData): Promise<any> {
    const targetUrl = jobData.target_url.toLowerCase();

    try {
      // Try multisite scraper factory first (supports Gap, Shopify, etc.)
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.warn('ScrapingWorker: Multisite scraper selection failed, falling back to legacy scrapers', {
        url: targetUrl,
        error: errorMessage,
      });
      
      // Fall back to legacy scraper selection
      if (targetUrl.includes('glasswingshop.com')) {
        return this.scrapers.glasswing;
      }

      // Default to general scraper
      return this.scrapers.general;
    }
  }

  /**
   * Execute scraping operation with progress reporting
   */
  private async executeScraping(
    job: Bull.Job<ScrapingJobData>, 
    scraper: any, 
    progressCallback: (progress: number, message?: string, details?: Record<string, any>) => void
  ): Promise<ScrapingResult> {
    const jobData = job.data;

    // Configure scraper options
    const scrapingOptions = {
      maxPages: jobData.config?.maxPages || 100,
      respectRobotsTxt: jobData.config?.respectRobotsTxt !== false,
      rateLimitDelay: jobData.config?.rateLimitDelay || 1000,
      timeout: jobData.config?.timeout || 30000,
      extractImages: jobData.config?.extractImages || false,
      extractReviews: jobData.config?.extractReviews || false,
      categoryFilters: jobData.config?.categoryFilters || [],
      customSelectors: jobData.config?.customSelectors || {},
    };

    progressCallback(10, `Starting ${jobData.scraping_type} scraping...`);

    // Execute based on scraping type
    switch (jobData.scraping_type) {
      case 'full_site':
        return await this.executeFullSiteScraping(jobData.target_url, scrapingOptions, scraper, progressCallback);

      case 'category_search':
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
  private async executeFullSiteScraping(
    targetUrl: string, 
    options: any, 
    scraper: any, 
    progressCallback: (progress: number, message?: string) => void
  ): Promise<ScrapingResult> {
    progressCallback(15, 'Starting full site discovery...');

    // For Glasswing scraper, use the existing category-aware method
    if (scraper.constructor.name === 'GlasswingScraper') {
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
  private async executeCategoryScraping(
    targetUrl: string, 
    options: any, 
    scraper: any, 
    progressCallback: (progress: number, message?: string) => void
  ): Promise<ScrapingResult> {
    progressCallback(15, 'Starting category page analysis...');

    // Handle multisite scrapers (Gap, Universal, etc.)
    if (scraper.constructor.name === 'GapScraper' || scraper.constructor.name === 'UniversalScraper') {
      const results = await scraper.scrape(progressCallback);
      return this.formatMultisiteResults(results, 'category_search');
    }
    
    // Handle legacy Glasswing scraper
    if (scraper.constructor.name === 'GlasswingScraper') {
      const results = await scraper.scrapeCategoryPage(targetUrl, {
        maxPages: options.maxPages,
        respectRobotsTxt: options.respectRobotsTxt,
        delay: options.rateLimitDelay,
        extractImages: options.extractImages,
        extractReviews: options.extractReviews,
        progressCallback: progressCallback,
      });

      return this.formatScrapingResults(results, 'category_search');
    }

    throw new Error('Category scraping not yet implemented for general scraper');
  }

  /**
   * Execute product scraping
   */
  private async executeProductScraping(
    targetUrl: string, 
    options: any, 
    scraper: any, 
    progressCallback: (progress: number, message?: string) => void
  ): Promise<ScrapingResult> {
    progressCallback(15, 'Extracting product data...');

    // Handle multisite scrapers (Gap, Universal, etc.)
    if (scraper.constructor.name === 'GapScraper' || scraper.constructor.name === 'UniversalScraper') {
      const results = await scraper.scrape(progressCallback);
      return this.formatMultisiteResults(results, 'product');
    }
    
    // Handle legacy Glasswing scraper
    if (scraper.constructor.name === 'GlasswingScraper') {
      const result = await scraper.scrapeProductPage(targetUrl);
      return this.formatScrapingResults([result], 'product');
    }

    throw new Error('Product scraping not yet implemented for general scraper');
  }

  /**
   * Execute search scraping
   */
  private async executeSearchScraping(
    targetUrl: string, 
    options: any, 
    scraper: any, 
    progressCallback: (progress: number, message?: string) => void
  ): Promise<ScrapingResult> {
    progressCallback(15, 'Processing search results...');

    throw new Error('Search scraping not yet implemented');
  }

  /**
   * Format scraping results for storage (legacy format)
   */
  private formatScrapingResults(rawResults: any, scrapingType: ScrapingType): ScrapingResult {
    const items = Array.isArray(rawResults) ? rawResults : [rawResults];
    const totalItems = items.length;
    const categories = [...new Set(items.map((item: any) => item.category).filter(Boolean))];

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
   * Format multisite scraper results for storage
   */
  private formatMultisiteResults(multisiteResults: any, scrapingType: ScrapingType): ScrapingResult {
    try {
      // Multisite scrapers return structured results with products array
      const products = multisiteResults.products || [];
      const pages = multisiteResults.pages || [];
      
      // Convert multisite format to legacy format for compatibility
      const items = products.map((product: any) => ({
        title: product.title,
        price: product.price,
        url: product.url,
        description: product.description,
        images: product.images ? product.images.map((img: any) => img.src) : [],
        availability: product.available ? 'in_stock' : 'out_of_stock',
        brand: product.brand,
        sizes: product.sizes ? product.sizes.map((size: any) => size.text).join(', ') : '',
        colors: product.colors ? product.colors.map((color: any) => color.name).join(', ') : '',
        category: this.extractCategoryFromUrl(product.url),
        scraped_at: product.scrapedAt,
        platform: multisiteResults.platform,
      }));

      const totalItems = items.length;
      const categories = [...new Set(items.map((item: any) => item.category).filter(Boolean))];
      
      // Include multisite-specific metadata
      const summary: ScrapingResultSummary = {
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.warn('ScrapingWorker: Failed to format multisite results, using fallback format', {
        error: errorMessage,
        scrapingType: scrapingType,
      });

      // Fallback to basic format
      return this.formatScrapingResults([], scrapingType);
    }
  }

  /**
   * Extract category from product URL
   */
  private extractCategoryFromUrl(url: string): string {
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
  private calculateDataQualityScore(items: any[]): number {
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
  private async updateJobStatus(
    jobId: UUID, 
    status: string, 
    progress: number, 
    resultsSummary?: ScrapingResultSummary, 
    errorDetails?: string
  ): Promise<void> {
    if (!this.db) {
      logger.warn('ScrapingWorker: Database not available for status update', { jobId });
      return;
    }

    try {
      const updateDoc: any = {
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('ScrapingWorker: Failed to update job status', {
        jobId: jobId,
        status: status,
        error: errorMessage,
      });
    }
  }

  /**
   * Save scraping results to database
   */
  private async saveResults(jobId: UUID, results: ScrapingResult): Promise<void> {
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('ScrapingWorker: Failed to save results', {
        jobId: jobId,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    // Report active job count every 30 seconds
    setInterval(() => {
      metrics.setGauge('scraping_worker_active_jobs', this.activeJobs.size);

      // Report individual job progress
      for (const [jobId, jobInfo] of this.activeJobs.entries()) {
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
  getHealthStatus(): WorkerHealthStatus {
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
  async stop(): Promise<void> {
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('ScrapingWorker: Error closing scraper factory', { error: errorMessage });
    }

    logger.info('ScrapingWorker: Worker stopped');
  }
}

export default ScrapingWorker;