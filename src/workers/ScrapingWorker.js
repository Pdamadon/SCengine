/**
 * Scraping Worker Service
 * Processes scraping jobs from Redis queue using PipelineOrchestrator
 */

const { queueManager } = require('../services/QueueManager');
const { logger } = require('../utils/logger');
const { metrics } = require('../utils/metrics');
const PipelineOrchestrator = require('../core/PipelineOrchestrator');
const { performance } = require('perf_hooks');

class ScrapingWorker {
  constructor(mongoClient, concurrency = 3) {
    this.mongoClient = mongoClient;
    this.db = mongoClient ? mongoClient.db('ai_shopping_scraper') : null;
    this.concurrency = concurrency;
    this.isProcessing = false;
    this.activeJobs = new Map();

    // Initialize pipeline orchestrator
    this.pipelineOrchestrator = new PipelineOrchestrator(logger, {
      persistResults: true,
      maxConcurrency: concurrency
    });

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

      // Initialize pipeline orchestrator
      await this.pipelineOrchestrator.initialize();

      this.isProcessing = true;

      // Start processing jobs
      queueManager.scrapingQueue.process(this.concurrency, async (job) => {
        return this.processJob(job);
      });

      logger.info(`ScrapingWorker: Started with concurrency ${this.concurrency}`);

    } catch (error) {
      logger.error('ScrapingWorker: Failed to start worker', { error: error.message });
      throw error;
    }
  }

  /**
   * Process individual scraping job
   */
  async processJob(job) {
    const jobId = job.id;
    const startTime = performance.now();

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

      // Define progress callback
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
      progressCallback(5, 'Job started - initializing pipeline...');

      // Execute pipeline operation
      const result = await this.executePipeline(job, progressCallback);

      // Save results to database
      progressCallback(90, 'Saving results to database...');
      await this.saveResults(jobId, result);

      // Update final job status
      const duration = performance.now() - startTime;
      await this.updateJobStatus(jobId, 'completed', 100, result.summary);

      logger.info('ScrapingWorker: Job completed successfully', {
        jobId: jobId,
        duration: Math.round(duration),
        itemsProcessed: result.summary.total_items,
      });

      // Track success metrics
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
   * Execute pipeline orchestrator for the job
   */
  async executePipeline(job, progressCallback) {
    const jobData = job.data;
    const targetUrl = jobData.target_url;

    try {
      progressCallback(10, 'Starting pipeline execution...');

      // Configure pipeline options based on job data
      const pipelineOptions = {
        jobId: job.id,
        enableNavigation: jobData.scraping_type !== 'extraction_only',
        enableCollection: jobData.scraping_type !== 'navigation_only', 
        enableExtraction: jobData.scraping_type !== 'navigation_only',
        persistResults: true,
        maxPages: jobData.max_pages || 100
      };

      progressCallback(20, 'Executing pipeline stages...');

      // Execute full pipeline
      const pipelineResult = await this.pipelineOrchestrator.executePipeline(targetUrl, pipelineOptions);

      progressCallback(80, 'Pipeline execution completed');

      // Transform pipeline result to expected worker format
      const result = {
        success: pipelineResult.status === 'completed',
        jobId: job.id,
        targetUrl: targetUrl,
        scrapingType: jobData.scraping_type,
        timestamp: new Date(),
        
        // Pipeline results
        navigationResults: pipelineResult.navigation,
        collectionResults: pipelineResult.collection, 
        extractionResults: pipelineResult.extraction,
        
        // Summary for compatibility
        summary: {
          total_items: pipelineResult.summary?.extractedProducts || 0,
          navigation_sections: pipelineResult.summary?.navigationSections || 0,
          product_categories: pipelineResult.summary?.productCategories || 0,
          product_urls: pipelineResult.summary?.productUrls || 0,
          extracted_products: pipelineResult.summary?.extractedProducts || 0,
          duration: pipelineResult.duration,
          status: pipelineResult.status
        },

        // Store full pipeline result for debugging
        pipelineResult: pipelineResult
      };

      return result;

    } catch (error) {
      logger.error('Pipeline execution failed in worker', {
        jobId: job.id,
        targetUrl: targetUrl,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update job status in database
   */
  async updateJobStatus(jobId, status, progress, resultsSummary = null, errorDetails = null) {
    if (!this.db) {
      logger.warn('ScrapingWorker: No database connection, skipping job status update');
      return;
    }

    try {
      const updateData = {
        status: status,
        progress: progress,
        updated_at: new Date(),
      };

      if (resultsSummary) {
        updateData.results_summary = resultsSummary;
      }

      if (errorDetails) {
        updateData.error_details = errorDetails;
        updateData.error_timestamp = new Date();
      }

      if (status === 'completed') {
        updateData.completed_at = new Date();
      }

      await this.db.collection(this.jobsCollection).updateOne(
        { job_id: jobId },
        { $set: updateData }
      );

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
      logger.warn('ScrapingWorker: No database connection, skipping results save');
      return;
    }

    try {
      const resultRecord = {
        job_id: jobId,
        results: results,
        created_at: new Date(),
        result_type: results.scrapingType || 'unknown',
        item_count: results.summary?.total_items || 0,
        success: results.success || false,
      };

      await this.db.collection(this.resultsCollection).insertOne(resultRecord);

      logger.info('ScrapingWorker: Results saved successfully', {
        jobId: jobId,
        itemCount: resultRecord.item_count,
        success: resultRecord.success,
      });

    } catch (error) {
      logger.error('ScrapingWorker: Failed to save results', {
        jobId: jobId,
        error: error.message,
      });
    }
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Get worker status and statistics
   */
  getStatus() {
    return {
      isProcessing: this.isProcessing,
      activeJobs: this.activeJobs.size,
      concurrency: this.concurrency,
      queueStatus: queueManager.getStatus(),
    };
  }

  /**
   * Stop the worker gracefully
   */
  async stop(maxWaitTime = 30000) {
    logger.info('ScrapingWorker: Stopping worker...');
    this.isProcessing = false;

    // Wait for active jobs to complete
    const startWait = Date.now();

    while (this.activeJobs.size > 0 && (Date.now() - startWait) < maxWaitTime) {
      logger.info(`ScrapingWorker: Waiting for ${this.activeJobs.size} active jobs to complete...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    if (this.activeJobs.size > 0) {
      logger.warn(`ScrapingWorker: Force stopping with ${this.activeJobs.size} active jobs`);
    }

    // Clean up pipeline orchestrator
    try {
      await this.pipelineOrchestrator.close();
    } catch (error) {
      logger.warn('ScrapingWorker: Error closing pipeline orchestrator', { error: error.message });
    }

    logger.info('ScrapingWorker: Worker stopped');
  }
}

module.exports = ScrapingWorker;