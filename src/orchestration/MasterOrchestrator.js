/**
 * MasterOrchestrator - Central coordination for universal scraping system
 * 
 * Manages the complete scraping lifecycle:
 * 1. Discovery - Navigate and map site structure
 * 2. Learning - Learn patterns and improve quality
 * 3. Extraction - Extract products using learned patterns
 * 
 * This replaces SelfLearningUniversalScraper as the main entry point
 */

const DiscoveryPipeline = require('./DiscoveryPipeline');
const LearningEngine = require('./LearningEngine');
const ExtractionPipeline = require('./ExtractionPipeline');
const StateManager = require('./StateManager');
const ProgressReporter = require('./ProgressReporter');
const { createDomainRateLimiter } = require('../utils/rateLimiter');

class MasterOrchestrator {
  constructor(logger) {
    this.logger = logger;
    
    // Initialize sub-components
    this.stateManager = new StateManager(logger);
    this.progressReporter = new ProgressReporter(logger);
    this.discoveryPipeline = new DiscoveryPipeline(logger);
    this.learningEngine = new LearningEngine(logger);
    this.extractionPipeline = new ExtractionPipeline(logger);
    
    // Job tracking
    this.activeJobs = new Map();
    this.completedJobs = new Map();
  }

  /**
   * Initialize all components
   */
  async initialize() {
    this.logger.info('Initializing MasterOrchestrator');
    
    await this.stateManager.initialize();
    await this.discoveryPipeline.initialize();
    await this.learningEngine.initialize();
    await this.extractionPipeline.initialize();
    await this.progressReporter.initialize();
    
    this.logger.info('MasterOrchestrator initialized successfully');
  }

  /**
   * Main entry point for universal scraping
   * 
   * @param {string} url - Target URL to scrape
   * @param {object} options - Scraping options
   * @param {function} progressCallback - Progress callback function
   * @returns {object} Scraping results
   */
  async scrape(url, options = {}, progressCallback = null) {
    const jobId = this.generateJobId();
    const domain = new URL(url).hostname;
    const startTime = Date.now();
    
    this.logger.info('Starting universal scraping job', {
      jobId,
      url,
      domain,
      options
    });

    // Initialize rate limiter for domain
    const rateLimiter = createDomainRateLimiter(domain);
    rateLimiter.configure({
      baseDelay: options.rateLimit?.baseDelay || 2000,
      minDelay: options.rateLimit?.minDelay || 1000,
      maxDelay: options.rateLimit?.maxDelay || 5000
    });

    // Create job state
    const jobState = {
      jobId,
      url,
      domain,
      options,
      status: 'initializing',
      phases: {
        discovery: { status: 'pending', data: null },
        learning: { status: 'pending', data: null },
        extraction: { status: 'pending', data: null }
      },
      startTime,
      progressCallback
    };

    this.activeJobs.set(jobId, jobState);

    try {
      // Setup progress reporting
      if (progressCallback) {
        this.progressReporter.attachCallback(jobId, progressCallback);
      }

      // Phase 1: Discovery
      await this.executeDiscoveryPhase(jobState);
      
      // Phase 2: Learning
      await this.executeLearningPhase(jobState);
      
      // Phase 3: Extraction
      await this.executeExtractionPhase(jobState);
      
      // Compile final results
      const results = this.compileFinalResults(jobState);
      
      // Mark job as completed
      jobState.status = 'completed';
      jobState.endTime = Date.now();
      jobState.duration = jobState.endTime - startTime;
      
      this.completedJobs.set(jobId, jobState);
      this.activeJobs.delete(jobId);
      
      this.logger.info('Universal scraping job completed', {
        jobId,
        duration: jobState.duration,
        productsFound: results.products?.length || 0,
        quality: results.quality
      });
      
      return {
        success: true,
        jobId,
        ...results
      };
      
    } catch (error) {
      this.logger.error('Universal scraping job failed', {
        jobId,
        error: error.message,
        stack: error.stack
      });
      
      jobState.status = 'failed';
      jobState.error = error.message;
      jobState.endTime = Date.now();
      jobState.duration = jobState.endTime - startTime;
      
      this.completedJobs.set(jobId, jobState);
      this.activeJobs.delete(jobId);
      
      return {
        success: false,
        jobId,
        error: error.message,
        duration: jobState.duration
      };
      
    } finally {
      if (progressCallback) {
        this.progressReporter.detachCallback(jobId);
      }
    }
  }

  /**
   * Execute discovery phase - map site navigation and structure
   */
  async executeDiscoveryPhase(jobState) {
    this.logger.info('Starting discovery phase', { jobId: jobState.jobId });
    
    jobState.status = 'discovering';
    jobState.phases.discovery.status = 'in_progress';
    
    this.progressReporter.reportProgress(jobState.jobId, 10, 'Discovering site navigation structure...');
    
    const discoveryResult = await this.discoveryPipeline.discover(
      jobState.url,
      {
        maxDepth: jobState.options.discoveryDepth || 3,
        maxSections: jobState.options.maxSections || 10,
        includeHiddenMenus: true,
        exploreDropdowns: true
      }
    );
    
    jobState.phases.discovery.status = 'completed';
    jobState.phases.discovery.data = discoveryResult;
    
    // Store discovery results in state
    await this.stateManager.storeDiscovery(jobState.domain, discoveryResult);
    
    this.progressReporter.reportProgress(
      jobState.jobId, 
      30, 
      `Discovery complete: ${discoveryResult.navigation?.total_items || 0} navigation items found`
    );
    
    this.logger.info('Discovery phase completed', {
      jobId: jobState.jobId,
      itemsFound: discoveryResult.navigation?.total_items || 0
    });
    
    return discoveryResult;
  }

  /**
   * Execute learning phase - learn patterns and improve quality
   */
  async executeLearningPhase(jobState) {
    this.logger.info('Starting learning phase', { jobId: jobState.jobId });
    
    jobState.status = 'learning';
    jobState.phases.learning.status = 'in_progress';
    
    this.progressReporter.reportProgress(jobState.jobId, 40, 'Learning site patterns...');
    
    // Get discovery data
    const discoveryData = jobState.phases.discovery.data;
    
    const learningResult = await this.learningEngine.learn(
      jobState.url,
      discoveryData,
      {
        maxAttempts: jobState.options.learningAttempts || 3,
        targetQuality: jobState.options.targetQuality || 0.9,
        progressCallback: (percent, message) => {
          const adjustedPercent = 40 + (percent * 0.3); // 40-70% range
          this.progressReporter.reportProgress(jobState.jobId, adjustedPercent, message);
        }
      }
    );
    
    jobState.phases.learning.status = 'completed';
    jobState.phases.learning.data = learningResult;
    
    // Store learning results
    await this.stateManager.storeLearning(jobState.domain, learningResult);
    
    this.progressReporter.reportProgress(
      jobState.jobId, 
      70, 
      `Learning complete: ${(learningResult.quality * 100).toFixed(1)}% quality achieved`
    );
    
    this.logger.info('Learning phase completed', {
      jobId: jobState.jobId,
      quality: learningResult.quality,
      patternsLearned: learningResult.patterns?.length || 0
    });
    
    return learningResult;
  }

  /**
   * Execute extraction phase - extract products using learned patterns
   */
  async executeExtractionPhase(jobState) {
    this.logger.info('Starting extraction phase', { jobId: jobState.jobId });
    
    jobState.status = 'extracting';
    jobState.phases.extraction.status = 'in_progress';
    
    this.progressReporter.reportProgress(jobState.jobId, 75, 'Extracting products...');
    
    // Get learning data
    const learningData = jobState.phases.learning.data;
    const discoveryData = jobState.phases.discovery.data;
    
    const extractionResult = await this.extractionPipeline.extract(
      jobState.url,
      {
        patterns: learningData.patterns,
        selectors: learningData.selectors,
        navigation: discoveryData.navigation,
        maxProducts: jobState.options.maxProducts || 1000,
        maxWorkers: jobState.options.maxWorkers || 5,
        progressCallback: (percent, message) => {
          const adjustedPercent = 75 + (percent * 0.2); // 75-95% range
          this.progressReporter.reportProgress(jobState.jobId, adjustedPercent, message);
        }
      }
    );
    
    jobState.phases.extraction.status = 'completed';
    jobState.phases.extraction.data = extractionResult;
    
    // Store extraction results
    await this.stateManager.storeExtraction(jobState.domain, extractionResult);
    
    this.progressReporter.reportProgress(
      jobState.jobId, 
      95, 
      `Extraction complete: ${extractionResult.products?.length || 0} products found`
    );
    
    this.logger.info('Extraction phase completed', {
      jobId: jobState.jobId,
      productsFound: extractionResult.products?.length || 0
    });
    
    return extractionResult;
  }

  /**
   * Compile final results from all phases
   */
  compileFinalResults(jobState) {
    const discoveryData = jobState.phases.discovery.data;
    const learningData = jobState.phases.learning.data;
    const extractionData = jobState.phases.extraction.data;
    
    this.progressReporter.reportProgress(jobState.jobId, 100, 'Scraping complete!');
    
    return {
      navigation: discoveryData?.navigation,
      patterns: learningData?.patterns,
      selectors: learningData?.selectors,
      quality: learningData?.quality || 0,
      products: extractionData?.products || [],
      metadata: {
        jobId: jobState.jobId,
        domain: jobState.domain,
        duration: Date.now() - jobState.startTime,
        phases: {
          discovery: {
            itemsFound: discoveryData?.navigation?.total_items || 0,
            duration: discoveryData?.duration
          },
          learning: {
            quality: learningData?.quality || 0,
            attempts: learningData?.attempts || 0,
            duration: learningData?.duration
          },
          extraction: {
            productsFound: extractionData?.products?.length || 0,
            failedUrls: extractionData?.failedUrls?.length || 0,
            duration: extractionData?.duration
          }
        }
      }
    };
  }

  /**
   * Generate unique job ID
   */
  generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get job status
   */
  getJobStatus(jobId) {
    const job = this.activeJobs.get(jobId) || this.completedJobs.get(jobId);
    if (!job) {
      return null;
    }
    
    return {
      jobId: job.jobId,
      status: job.status,
      phases: job.phases,
      duration: job.duration,
      error: job.error
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    await this.discoveryPipeline.cleanup();
    await this.learningEngine.cleanup();
    await this.extractionPipeline.cleanup();
    await this.stateManager.cleanup();
    await this.progressReporter.cleanup();
    
    this.logger.info('MasterOrchestrator cleaned up');
  }
}

module.exports = MasterOrchestrator;