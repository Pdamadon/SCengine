/**
 * Universal Scraping API Routes
 * Uses MasterOrchestrator for navigation extraction and product scraping
 */

const express = require('express');
const router = express.Router();
const MasterOrchestrator = require('../orchestration/MasterOrchestrator');
const { logger } = require('../utils/logger');

// Initialize orchestrator
let orchestrator = null;

// Initialize on first use
const getOrchestrator = async () => {
  if (!orchestrator) {
    orchestrator = new MasterOrchestrator(logger);
    await orchestrator.initialize();
    logger.info('MasterOrchestrator initialized for API');
  }
  return orchestrator;
};

/**
 * POST /api/universal/scrape
 * Universal scraping endpoint supporting any site
 */
router.post('/scrape', async (req, res) => {
  try {
    const {
      url,
      options = {}
    } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    logger.info(`API: Starting scrape for ${url}`, options);
    
    const orchestrator = await getOrchestrator();
    const result = await orchestrator.scrape(url, {
      enableNavigation: options.enableNavigation !== false,  // Default true
      enableCollection: options.enableCollection !== false,  // Default true
      enableExtraction: options.enableExtraction !== false,  // Default true
      maxProducts: options.maxProducts || 10,
      timeout: options.timeout || 60000
    });

    res.json({
      success: true,
      jobId: result.jobId,
      status: result.status,
      url: url,
      navigation: {
        sections: result.navigation?.main_sections?.length || 0,
        totalItems: result.navigation?.totalNavigationItems || 0,
        strategy: result.navigation?.strategy || 'unknown',
        confidence: result.navigation?.confidence || 0
      },
      products: {
        urls: result.productUrls?.length || 0,
        extracted: result.products?.length || 0
      },
      duration: result.duration,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Universal scraping failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: 'Check logs for more information'
    });
  }
});

/**
 * POST /api/universal/navigation
 * Extract only navigation structure from a site
 */
router.post('/navigation', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    logger.info(`API: Extracting navigation for ${url}`);
    
    const orchestrator = await getOrchestrator();
    const result = await orchestrator.scrape(url, {
      enableNavigation: true,
      enableCollection: false,  // Skip product collection
      enableExtraction: false,  // Skip product extraction
      timeout: 45000
    });

    res.json({
      success: true,
      url: url,
      navigation: {
        main_sections: result.navigation?.main_sections || [],
        totalItems: result.navigation?.totalNavigationItems || 0,
        strategy: result.navigation?.strategy || 'unknown',
        confidence: result.navigation?.confidence || 0,
        metadata: result.navigation?.metadata || {}
      },
      duration: result.duration,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Navigation extraction failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: 'Check logs for more information'
    });
  }
});

/**
 * GET /api/universal/status/:jobId
 * Get status of a scraping job
 */
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const orchestrator = await getOrchestrator();
    const status = await orchestrator.getJobStatus(jobId);
    
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    res.json({
      success: true,
      jobId: jobId,
      status: status
    });

  } catch (error) {
    logger.error('Status check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/universal/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'universal-scraping',
    orchestrator: orchestrator ? 'initialized' : 'not-initialized',
    timestamp: new Date().toISOString()
  });
});

// Cleanup on shutdown
process.on('SIGINT', async () => {
  if (orchestrator) {
    logger.info('Shutting down MasterOrchestrator...');
    await orchestrator.close();
  }
});

module.exports = router;