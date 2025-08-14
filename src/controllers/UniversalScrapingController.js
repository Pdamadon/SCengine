/**
 * UniversalScrapingController - API controller for universal scraping
 * 
 * Handles HTTP requests for the universal scraping system.
 * Uses MasterOrchestrator for all scraping operations.
 * 
 * Endpoints:
 * - POST /api/v1/universal/scrape - Start universal scraping job
 * - GET /api/v1/universal/job/:jobId - Get job status
 * - GET /api/v1/universal/discovery/:domain - Get cached discovery
 * - GET /api/v1/universal/learning/:domain - Get cached learning
 */

const MasterOrchestrator = require('../orchestration/MasterOrchestrator');
const { logger } = require('../utils/logger');
const { metrics } = require('../utils/metrics');

class UniversalScrapingController {
  constructor() {
    this.orchestrator = new MasterOrchestrator(logger);
    this.initialized = false;
  }

  /**
   * Initialize controller
   */
  async initialize() {
    if (!this.initialized) {
      await this.orchestrator.initialize();
      this.initialized = true;
      logger.info('UniversalScrapingController initialized');
    }
  }

  /**
   * Start universal scraping job
   * POST /api/v1/universal/scrape
   */
  async startScrapingJob(req, res) {
    const correlationId = req.correlationId || `universal_${Date.now()}`;
    const startTime = performance.now();

    try {
      // Ensure initialized
      await this.initialize();

      logger.info('UNIVERSAL_SCRAPING_JOB_SUBMITTED', {
        correlation_id: correlationId,
        url: req.body.url,
        options: req.body.options,
        user_agent: req.get('User-Agent'),
        ip_address: req.ip
      });

      // Validate request
      if (!req.body.url) {
        metrics.trackError('ValidationError', 'universal_scraping_controller');
        return res.status(400).json({
          error: 'URL is required',
          correlation_id: correlationId
        });
      }

      // Validate URL format
      try {
        new URL(req.body.url);
      } catch (error) {
        return res.status(400).json({
          error: 'Invalid URL format',
          correlation_id: correlationId
        });
      }

      // Parse options
      const options = {
        maxProducts: req.body.maxProducts || 100,
        targetQuality: req.body.targetQuality || 0.9,
        maxWorkers: req.body.maxWorkers || 5,
        discoveryDepth: req.body.discoveryDepth || 3,
        learningAttempts: req.body.learningAttempts || 3,
        rateLimit: req.body.rateLimit || {},
        forceRefresh: req.body.forceRefresh || false
      };

      // Start async scraping job
      const scrapePromise = this.orchestrator.scrape(
        req.body.url,
        options,
        null // No progress callback for HTTP request
      );

      // Get job ID from orchestrator
      const activeJobs = Array.from(this.orchestrator.activeJobs.keys());
      const jobId = activeJobs[activeJobs.length - 1] || correlationId;

      // Track metrics
      const duration = performance.now() - startTime;
      metrics.trackHttpRequest('POST', '/api/v1/universal/scrape', 202, duration);
      metrics.incrementCounter('universal_scraping_jobs_submitted');

      // Return immediate response with job ID
      res.status(202).json({
        success: true,
        jobId: jobId,
        message: 'Universal scraping job started',
        correlation_id: correlationId,
        status_url: `/api/v1/universal/job/${jobId}`
      });

      // Handle job completion asynchronously
      scrapePromise.then(result => {
        logger.info('UNIVERSAL_SCRAPING_JOB_COMPLETED', {
          correlation_id: correlationId,
          jobId: jobId,
          success: result.success,
          productsFound: result.products?.length || 0,
          quality: result.quality
        });
        
        metrics.incrementCounter('universal_scraping_jobs_completed');
        
      }).catch(error => {
        logger.error('UNIVERSAL_SCRAPING_JOB_FAILED', {
          correlation_id: correlationId,
          jobId: jobId,
          error: error.message
        });
        
        metrics.incrementCounter('universal_scraping_jobs_failed');
      });

    } catch (error) {
      logger.error('UNIVERSAL_SCRAPING_CONTROLLER_ERROR', {
        correlation_id: correlationId,
        error: error.message,
        stack: error.stack
      });

      metrics.trackError(error, 'universal_scraping_controller');

      const duration = performance.now() - startTime;
      metrics.trackHttpRequest('POST', '/api/v1/universal/scrape', 500, duration);

      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        correlation_id: correlationId
      });
    }
  }

  /**
   * Get job status
   * GET /api/v1/universal/job/:jobId
   */
  async getJobStatus(req, res) {
    const { jobId } = req.params;
    const correlationId = req.correlationId || `status_${Date.now()}`;

    try {
      await this.initialize();

      const status = this.orchestrator.getJobStatus(jobId);

      if (!status) {
        return res.status(404).json({
          error: 'Job not found',
          jobId: jobId,
          correlation_id: correlationId
        });
      }

      // Add progress information
      const progress = this.orchestrator.progressReporter.getCurrentProgress(jobId);

      res.json({
        success: true,
        jobId: jobId,
        status: status.status,
        phases: status.phases,
        progress: progress ? {
          percentage: progress.percentage,
          message: progress.message
        } : null,
        duration: status.duration,
        error: status.error,
        correlation_id: correlationId
      });

    } catch (error) {
      logger.error('GET_JOB_STATUS_ERROR', {
        correlation_id: correlationId,
        jobId: jobId,
        error: error.message
      });

      res.status(500).json({
        error: 'Failed to get job status',
        message: error.message,
        correlation_id: correlationId
      });
    }
  }

  /**
   * Get cached discovery for domain
   * GET /api/v1/universal/discovery/:domain
   */
  async getCachedDiscovery(req, res) {
    const { domain } = req.params;
    const correlationId = req.correlationId || `discovery_${Date.now()}`;

    try {
      await this.initialize();

      const discovery = await this.orchestrator.stateManager.getDiscovery(domain);

      if (!discovery) {
        return res.status(404).json({
          error: 'No discovery data found for domain',
          domain: domain,
          correlation_id: correlationId
        });
      }

      res.json({
        success: true,
        domain: domain,
        discovery: discovery,
        correlation_id: correlationId
      });

    } catch (error) {
      logger.error('GET_DISCOVERY_ERROR', {
        correlation_id: correlationId,
        domain: domain,
        error: error.message
      });

      res.status(500).json({
        error: 'Failed to get discovery data',
        message: error.message,
        correlation_id: correlationId
      });
    }
  }

  /**
   * Get cached learning for domain
   * GET /api/v1/universal/learning/:domain
   */
  async getCachedLearning(req, res) {
    const { domain } = req.params;
    const correlationId = req.correlationId || `learning_${Date.now()}`;

    try {
      await this.initialize();

      const learning = await this.orchestrator.stateManager.getLearning(domain);

      if (!learning) {
        return res.status(404).json({
          error: 'No learning data found for domain',
          domain: domain,
          correlation_id: correlationId
        });
      }

      res.json({
        success: true,
        domain: domain,
        learning: learning,
        correlation_id: correlationId
      });

    } catch (error) {
      logger.error('GET_LEARNING_ERROR', {
        correlation_id: correlationId,
        domain: domain,
        error: error.message
      });

      res.status(500).json({
        error: 'Failed to get learning data',
        message: error.message,
        correlation_id: correlationId
      });
    }
  }

  /**
   * Get system statistics
   * GET /api/v1/universal/stats
   */
  async getStatistics(req, res) {
    const correlationId = req.correlationId || `stats_${Date.now()}`;

    try {
      await this.initialize();

      const stateStats = this.orchestrator.stateManager.getStatistics();
      const progressMetrics = this.orchestrator.progressReporter.getMetrics();

      res.json({
        success: true,
        statistics: {
          state: stateStats,
          progress: progressMetrics,
          activeJobs: this.orchestrator.activeJobs.size,
          completedJobs: this.orchestrator.completedJobs.size
        },
        correlation_id: correlationId
      });

    } catch (error) {
      logger.error('GET_STATISTICS_ERROR', {
        correlation_id: correlationId,
        error: error.message
      });

      res.status(500).json({
        error: 'Failed to get statistics',
        message: error.message,
        correlation_id: correlationId
      });
    }
  }

  /**
   * Health check
   * GET /api/v1/universal/health
   */
  async healthCheck(req, res) {
    try {
      await this.initialize();

      res.json({
        status: 'healthy',
        initialized: this.initialized,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

// Create singleton instance
const universalScrapingController = new UniversalScrapingController();

module.exports = universalScrapingController;