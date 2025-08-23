/**
 * Scraping Worker Service
 * Processes scraping jobs from Redis queue using the unified PipelineOrchestrator
 * Supports feature flag for gradual migration from legacy architecture
 */

const { queueManager } = require('../services/QueueManager');
const { logger } = require('../utils/logger');
const { metrics } = require('../utils/metrics');
const PipelineOrchestrator = require('../core/PipelineOrchestrator');
const ScraperCoordinator = require('../core/ScraperCoordinator'); // Original orchestrator for fallback
const CheckpointManager = require('../core/checkpoint/CheckpointManager');
const { performance } = require('perf_hooks');

class ScrapingWorker {
  constructor(mongoClient, concurrency = 3) {
    this.mongoClient = mongoClient;
    this.db = mongoClient ? mongoClient.db('ai_shopping_scraper') : null;
    this.concurrency = concurrency;
    this.isProcessing = false;
    this.activeJobs = new Map();

    // Feature flag for orchestrator selection
    this.usePipelineOrchestrator = process.env.USE_PIPELINE_ORCHESTRATOR !== 'false'; // Default to true
    
    // Initialize orchestrators
    if (this.usePipelineOrchestrator) {
      logger.info('ScrapingWorker: Using unified PipelineOrchestrator (new architecture)');
      this.pipelineOrchestrator = new PipelineOrchestrator({
        logger: logger,
        saveToDatabase: true,
        parallelCategories: concurrency,
        maxPagesPerCategory: 20,
        maxProductsPerCategory: 500,
        extractVariants: true, // Enable variant extraction
        enableFilters: true,   // Enable filter detection
        maxFilters: 20,
        captureFilterCombinations: false
      });
      
      // Initialize CheckpointManager for resumable operations
      this.checkpointManager = new CheckpointManager(logger, mongoClient);
    } else {
      logger.info('ScrapingWorker: Using original ScraperCoordinator (fallback)');
      // Keep old ScraperCoordinator for fallback
      this.scraperCoordinator = new ScraperCoordinator({
        logger: logger,
        saveToDatabase: true,
        parallelCategories: concurrency,
        maxPagesPerCategory: 20,
        maxProductsPerCategory: 500
      });
      // Also initialize CheckpointManager for old coordinator
      this.checkpointManager = new CheckpointManager(logger, mongoClient);
    }

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

      // Initialize orchestrator based on feature flag
      if (this.usePipelineOrchestrator) {
        // PipelineOrchestrator doesn't need explicit initialization
        // But initialize CheckpointManager if available
        if (this.checkpointManager) {
          await this.checkpointManager.initialize();
        }
        logger.info('ScrapingWorker: PipelineOrchestrator and CheckpointManager ready');
      } else {
        // Initialize CheckpointManager for fallback ScraperCoordinator
        if (this.checkpointManager) {
          await this.checkpointManager.initialize();
        }
        logger.info('ScrapingWorker: ScraperCoordinator (fallback) and CheckpointManager ready');
      }

      this.isProcessing = true;

      // Start processing jobs - register named processors for each job type
      const scrapingQueue = queueManager.getQueue('scraping');
      
      // Register processors for each supported job type
      const jobTypes = ['full_site', 'category', 'category_search', 'product', 'search'];
      
      for (const jobType of jobTypes) {
        scrapingQueue.process(jobType, this.concurrency, async (job) => {
          logger.info(`ScrapingWorker: Processing ${jobType} job`, { jobId: job.id });
          return this.processJob(job);
        });
        logger.info(`ScrapingWorker: Registered processor for job type: ${jobType}`);
      }

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
   * Routes to either ScraperCoordinator or PipelineOrchestrator based on feature flag
   */
  async executePipeline(job, progressCallback) {
    const jobData = job.data;
    const targetUrl = jobData.target_url;

    try {
      progressCallback(10, 'Starting pipeline execution...');

      if (this.usePipelineOrchestrator) {
        // Use unified PipelineOrchestrator with CheckpointManager support
        return await this.executeWithPipelineOrchestrator(job, progressCallback);
      } else {
        // Use legacy orchestrator
        return await this.executeWithLegacyOrchestrator(job, progressCallback);
      }

    } catch (error) {
      logger.error('Pipeline execution failed in worker', {
        jobId: job.id,
        targetUrl: targetUrl,
        orchestrator: this.usePipelineOrchestrator ? 'PipelineOrchestrator' : 'LegacyPipelineOrchestrator',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Execute using unified PipelineOrchestrator with CheckpointManager integration
   */
  async executeWithPipelineOrchestrator(job, progressCallback) {
    const jobData = job.data;
    const targetUrl = jobData.target_url;

    try {
      // Check for existing checkpoint for resumable operations
      let checkpoint = null;
      if (this.checkpointManager && this.checkpointManager.isEnabled()) {
        const resumePoint = await this.checkpointManager.getResumePoint(job.id);
        if (resumePoint.canResume) {
          checkpoint = resumePoint.checkpoint;
          progressCallback(15, `Resuming from checkpoint at step ${resumePoint.startStep}...`);
          logger.info('ScrapingWorker: Resuming job from checkpoint', {
            jobId: job.id,
            checkpointStep: resumePoint.startStep,
            checkpointId: checkpoint.checkpoint_id
          });
        }
      }

      // Create checkpoint for new jobs
      if (!checkpoint && this.checkpointManager && this.checkpointManager.isEnabled()) {
        progressCallback(15, 'Creating checkpoint for resumable execution...');
        checkpoint = await this.checkpointManager.createCheckpoint(
          job.id,
          new URL(targetUrl).hostname,
          {
            scraping_type: jobData.scraping_type,
            max_pages: jobData.max_pages || 100,
            started_at: new Date()
          }
        );
        logger.info('ScrapingWorker: Created checkpoint for job', {
          jobId: job.id,
          checkpointId: checkpoint.checkpoint_id
        });
      }

      progressCallback(25, 'Executing PipelineOrchestrator pipeline...');

      // Execute PipelineOrchestrator with progress tracking and scraping type
      const orchestratorResult = await this.pipelineOrchestrator.execute(targetUrl, {
        scraping_type: jobData.scraping_type || 'full_site',
        max_pages: jobData.max_pages,
        extractVariants: true
      });

      // Save progress to checkpoint after completion
      if (checkpoint && this.checkpointManager) {
        await this.checkpointManager.saveProgress(
          checkpoint.checkpoint_id,
          5, // Final step (now 5 steps with filter detection)
          {
            navigation: orchestratorResult.initialNavigation || orchestratorResult.navigation,
            hierarchy: orchestratorResult.categoryHierarchy || orchestratorResult.hierarchy,
            filters: orchestratorResult.filterResults,
            products: orchestratorResult.productResults || orchestratorResult.products,
            completed_at: new Date()
          },
          true // Step complete
        );
      }

      progressCallback(80, 'PipelineOrchestrator execution completed');

      // Transform PipelineOrchestrator result to expected worker format
      const totalProducts = this.extractTotalProducts(orchestratorResult);

      const result = {
        success: orchestratorResult.success !== false,
        jobId: job.id,
        targetUrl: targetUrl,
        scrapingType: jobData.scraping_type,
        timestamp: new Date(),
        
        // PipelineOrchestrator results mapped to expected format
        navigationResults: this.extractNavigationResults(orchestratorResult),
        collectionResults: this.extractCollectionResults(orchestratorResult),
        extractionResults: this.extractProductResults(orchestratorResult),
        
        // Summary for compatibility
        summary: {
          total_items: totalProducts,
          navigation_sections: this.extractNavigationResults(orchestratorResult).totalNavigationItems || 0,
          product_categories: this.extractCollectionResults(orchestratorResult).totalCategories || 0,
          product_urls: this.extractCollectionResults(orchestratorResult).totalFilterProducts || 0,
          extracted_products: totalProducts,
          duration: orchestratorResult.duration || 0,
          processing_time: orchestratorResult.duration || 0,
          orchestrator: 'PipelineOrchestrator',
          scraping_type: jobData.scraping_type,
          status: 'completed'
        }
      };
      
      return result;
      
    } catch (error) {
      // Mark checkpoint as failed if it exists
      if (checkpoint && this.checkpointManager) {
        try {
          await this.checkpointManager.markFailed(checkpoint.checkpoint_id, error);
        } catch (checkpointError) {
          logger.warn('Failed to mark checkpoint as failed', { 
            checkpointId: checkpoint.checkpoint_id,
            error: checkpointError.message 
          });
        }
      }
      
      logger.error('PipelineOrchestrator execution failed', {
        jobId: job.id,
        targetUrl: targetUrl,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Execute using legacy PipelineOrchestrator
   */
  async executeWithPipelineOrchestrator(job, progressCallback) {
    const jobData = job.data;
    const targetUrl = jobData.target_url;

    try {
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
   * Execute using legacy PipelineOrchestrator (fallback)
   */
  async executeWithLegacyOrchestrator(job, progressCallback) {
    const jobData = job.data;
    const targetUrl = jobData.target_url;

    try {
      progressCallback(25, 'Executing legacy PipelineOrchestrator...');
      
      if (!this.legacyOrchestrator || !this.legacyOrchestrator.executePipeline) {
        throw new Error('Legacy orchestrator not available');
      }
      
      const result = await this.legacyOrchestrator.executePipeline(targetUrl, {
        jobId: job.id,
        max_pages: jobData.max_pages
      });
      
      progressCallback(80, 'Legacy orchestrator execution completed');
      
      return {
        success: result.status === 'completed',
        jobId: job.id,
        targetUrl: targetUrl,
        scrapingType: jobData.scraping_type,
        timestamp: new Date(),
        navigationResults: result.navigation || {},
        collectionResults: result.collection || {},
        extractionResults: result.extraction || {},
        summary: {
          total_items: result.extraction?.products?.length || 0,
          processing_time: result.duration || 0
        }
      };
      
    } catch (error) {
      logger.error('Legacy orchestrator execution failed', {
        jobId: job.id,
        targetUrl: targetUrl,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Extract total products from orchestrator result
   */
  extractTotalProducts(result) {
    // Handle different result formats from different scraping types
    if (result.scraping_type === 'product') {
      return result.product ? 1 : 0;
    }
    
    if (result.productResults) {
      // Full pipeline format
      return result.productResults.reduce((sum, categoryResult) => 
        sum + (categoryResult.products?.length || 0), 0
      );
    }
    
    if (result.products) {
      // Category scraping format
      return Array.isArray(result.products) ? result.products.length : 0;
    }
    
    return 0;
  }

  /**
   * Extract navigation results from orchestrator result
   */
  extractNavigationResults(result) {
    if (result.navigation) {
      return {
        main_sections: result.navigation.main_sections || [],
        strategy: result.navigation.strategy,
        totalNavigationItems: result.navigation.totalNavigationItems || 0
      };
    }
    
    if (result.initialNavigation) {
      return {
        main_sections: result.initialNavigation.main_sections || [],
        strategy: result.initialNavigation.strategy,
        totalNavigationItems: result.initialNavigation.totalNavigationItems || 0
      };
    }
    
    return { main_sections: [], strategy: 'none', totalNavigationItems: 0 };
  }

  /**
   * Extract collection results from orchestrator result
   */
  extractCollectionResults(result) {
    if (result.hierarchy) {
      return {
        categories: result.hierarchy.categories || [],
        totalCategories: result.hierarchy.totalCategories || 0,
        filterEnhanced: result.hierarchy.filterEnhanced || false,
        totalFilterProducts: result.hierarchy.totalFilterProducts || 0
      };
    }
    
    if (result.categoryHierarchy) {
      return {
        categories: result.categoryHierarchy.categories || [],
        totalCategories: result.categoryHierarchy.totalCategories || 0,
        filterEnhanced: result.categoryHierarchy.filterEnhanced || false,
        totalFilterProducts: result.categoryHierarchy.totalFilterProducts || 0
      };
    }
    
    if (result.category) {
      return {
        categories: [result.category],
        totalCategories: 1
      };
    }
    
    return { categories: [], totalCategories: 0 };
  }

  /**
   * Extract product results from orchestrator result
   */
  extractProductResults(result) {
    const totalProducts = this.extractTotalProducts(result);
    
    if (result.scraping_type === 'product') {
      return {
        products: result.product ? [result.product] : [],
        totalProducts: totalProducts
      };
    }
    
    if (result.productResults) {
      return {
        products: result.productResults,
        totalProducts: totalProducts
      };
    }
    
    if (result.products) {
      return {
        products: result.products,
        totalProducts: totalProducts
      };
    }
    
    return { products: [], totalProducts: 0 };
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