/**
 * MasterOrchestrator - Main coordinator for universal scraping operations
 * 
 * Wraps PipelineOrchestrator with job management, progress tracking, and state management
 * Provides the API interface that UniversalScrapingController expects
 * 
 * This fixes the broken import in UniversalScrapingController.js:14
 */

const PipelineOrchestrator = require('../core/PipelineOrchestrator');
const { logger } = require('../utils/logger');
const { performance } = require('perf_hooks');

class MasterOrchestrator {
  constructor(logger) {
    this.logger = logger || require('../utils/logger').logger;
    this.pipeline = new PipelineOrchestrator({
      logger: this.logger,
      enableNavigation: true,
      enableCollection: true,
      enableExtraction: true,
      persistResults: true
    });
    
    // Job tracking (matches UniversalScrapingController expectations)
    this.activeJobs = new Map();
    this.completedJobs = new Map();
    
    // Progress reporting (matches UniversalScrapingController expectations)
    this.progressReporter = {
      getCurrentProgress: (jobId) => {
        const job = this.activeJobs.get(jobId);
        if (!job) return null;
        
        return {
          percentage: job.progress,
          message: job.currentStage,
          startTime: job.startTime,
          elapsedTime: Date.now() - job.startTime
        };
      },
      
      getMetrics: () => ({
        activeJobs: this.activeJobs.size,
        completedJobs: this.completedJobs.size,
        totalJobs: this.activeJobs.size + this.completedJobs.size
      })
    };
    
    // State management (matches UniversalScrapingController expectations)
    this.stateManager = {
      getDiscovery: async (domain) => {
        // TODO: Implement discovery data retrieval
        return null;
      },
      
      getLearning: async (domain) => {
        // TODO: Implement learning data retrieval  
        return null;
      },
      
      getStatistics: () => ({
        totalSitesProcessed: this.completedJobs.size,
        averageProcessingTime: this.calculateAverageProcessingTime(),
        successRate: this.calculateSuccessRate()
      })
    };
    
    this.initialized = false;
  }

  /**
   * Initialize the MasterOrchestrator
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      this.logger.info('Initializing MasterOrchestrator...');
      
      // PipelineOrchestrator is fully initialized in its constructor
      // No additional initialization needed
      
      this.initialized = true;
      this.logger.info('MasterOrchestrator initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize MasterOrchestrator:', error);
      throw error;
    }
  }

  /**
   * Main scraping method (API interface for UniversalScrapingController)
   */
  async scrape(url, options = {}, progressCallback = null) {
    if (!this.initialized) {
      await this.initialize();
    }

    const jobId = `master_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();
    
    // Create job tracking entry
    const jobEntry = {
      jobId,
      url,
      startTime,
      progress: 0,
      currentStage: 'initializing',
      options
    };
    
    this.activeJobs.set(jobId, jobEntry);
    
    try {
      this.logger.info('Starting scraping job', {
        jobId,
        url,
        options: Object.keys(options)
      });

      // Update progress callback to track job progress
      const wrappedProgressCallback = (progress) => {
        if (this.activeJobs.has(jobId)) {
          const job = this.activeJobs.get(jobId);
          job.progress = progress.percentage || 0;
          job.currentStage = progress.stage || progress.message || 'processing';
        }
        
        if (progressCallback) {
          progressCallback(progress);
        }
      };

      // Execute the pipeline
      jobEntry.currentStage = 'executing_pipeline';
      jobEntry.progress = 10;
      
      const result = await this.pipeline.executePipeline(url, {
        ...options,
        jobId,
        progressCallback: wrappedProgressCallback
      });

      // Calculate final metrics
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      const finalResult = {
        ...result,
        jobId,
        success: result.status === 'completed',
        duration,
        startTime: new Date(Date.now() - duration),
        endTime: new Date(),
        
        // Add summary metrics
        summary: {
          ...result.summary,
          processingTimeMs: duration,
          stages: {
            navigation: result.navigation ? 'completed' : 'skipped',
            collection: result.collection ? 'completed' : 'skipped', 
            extraction: result.extraction ? 'completed' : 'skipped'
          }
        }
      };

      // Move to completed jobs
      this.completedJobs.set(jobId, finalResult);
      this.activeJobs.delete(jobId);

      this.logger.info('Scraping job completed successfully', {
        jobId,
        duration: Math.round(duration),
        status: finalResult.status,
        navigationSections: finalResult.summary?.navigationSections || 0,
        productUrls: finalResult.summary?.productUrls || 0,
        extractedProducts: finalResult.summary?.extractedProducts || 0
      });

      return finalResult;

    } catch (error) {
      // Handle job failure
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      const failedResult = {
        jobId,
        url,
        success: false,
        status: 'failed',
        error: error.message,
        duration,
        startTime: new Date(Date.now() - duration),
        endTime: new Date()
      };

      this.completedJobs.set(jobId, failedResult);
      this.activeJobs.delete(jobId);

      this.logger.error('Scraping job failed', {
        jobId,
        url,
        duration: Math.round(duration),
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Get job status (API interface for UniversalScrapingController)
   */
  getJobStatus(jobId) {
    if (this.activeJobs.has(jobId)) {
      const job = this.activeJobs.get(jobId);
      return {
        status: 'running',
        progress: job.progress,
        currentStage: job.currentStage,
        startTime: job.startTime,
        duration: Date.now() - job.startTime,
        phases: {
          navigation: job.currentStage.includes('navigation') ? 'running' : 'pending',
          collection: job.currentStage.includes('collection') ? 'running' : 'pending',
          extraction: job.currentStage.includes('extraction') ? 'running' : 'pending'
        }
      };
    }
    
    if (this.completedJobs.has(jobId)) {
      const job = this.completedJobs.get(jobId);
      return {
        status: job.success ? 'completed' : 'failed',
        duration: job.duration,
        error: job.error || null,
        phases: {
          navigation: job.summary?.stages?.navigation || 'completed',
          collection: job.summary?.stages?.collection || 'completed', 
          extraction: job.summary?.stages?.extraction || 'completed'
        },
        results: job.success ? {
          navigationSections: job.summary?.navigationSections || 0,
          productUrls: job.summary?.productUrls || 0,
          extractedProducts: job.summary?.extractedProducts || 0
        } : null
      };
    }
    
    return null; // Job not found
  }

  /**
   * Calculate average processing time across completed jobs
   */
  calculateAverageProcessingTime() {
    if (this.completedJobs.size === 0) return 0;
    
    const totalTime = Array.from(this.completedJobs.values())
      .reduce((sum, job) => sum + (job.duration || 0), 0);
    
    return Math.round(totalTime / this.completedJobs.size);
  }

  /**
   * Calculate success rate across completed jobs
   */
  calculateSuccessRate() {
    if (this.completedJobs.size === 0) return 1.0;
    
    const successfulJobs = Array.from(this.completedJobs.values())
      .filter(job => job.success).length;
    
    return successfulJobs / this.completedJobs.size;
  }

  /**
   * Get comprehensive statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      activeJobs: this.activeJobs.size,
      completedJobs: this.completedJobs.size,
      averageProcessingTime: this.calculateAverageProcessingTime(),
      successRate: this.calculateSuccessRate(),
      uptime: this.initialized ? Date.now() - this.initTime : 0
    };
  }

  /**
   * Cleanup resources
   */
  async close() {
    this.logger.info('Closing MasterOrchestrator...');
    
    try {
      await this.pipeline.close();
      this.activeJobs.clear();
      this.completedJobs.clear();
    } catch (error) {
      this.logger.warn('Error during MasterOrchestrator cleanup:', error);
    }

    this.initialized = false;
  }
}

module.exports = MasterOrchestrator;