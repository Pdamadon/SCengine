#!/usr/bin/env node

/**
 * Site Intelligence API Server
 * 
 * A simple HTTP server that exposes the Site Intelligence system via REST API
 * 
 * Usage:
 *   node intelligence-api-server.js
 *   
 * Then make requests to:
 *   POST http://localhost:3001/analyze
 *   Body: { "url": "https://example.com", "options": {...} }
 */

const express = require('express');
const SiteIntelligence = require('./src/intelligence/SiteIntelligence');

const app = express();
const port = process.env.INTELLIGENCE_PORT || 3001;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS for browser testing
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Logger for API
const logger = {
  info: (...args) => console.log(`[API] ${new Date().toISOString()}:`, ...args),
  error: (...args) => console.error(`[API] ${new Date().toISOString()}:`, ...args),
  warn: (...args) => console.warn(`[API] ${new Date().toISOString()}:`, ...args),
  debug: (...args) => console.log(`[API-DEBUG] ${new Date().toISOString()}:`, ...args)
};

// Active analysis tracking
const activeAnalyses = new Map();

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Site Intelligence API',
    timestamp: new Date().toISOString(),
    activeAnalyses: activeAnalyses.size
  });
});

// Get API information
app.get('/', (req, res) => {
  res.json({
    service: 'Site Intelligence API',
    version: '1.0.0',
    description: 'REST API for Site Intelligence Analysis',
    endpoints: {
      analyze: 'POST /analyze - Run site intelligence analysis',
      status: 'GET /status/:analysisId - Get analysis status',
      health: 'GET /health - Health check'
    },
    usage: {
      analyze: {
        method: 'POST',
        url: '/analyze',
        body: {
          url: 'https://example.com',
          options: {
            concurrent: 4,
            subcategories: 3,
            forceRefresh: false,
            quick: false
          }
        }
      }
    }
  });
});

// Main analysis endpoint
app.post('/analyze', async (req, res) => {
  const { url, options = {} } = req.body;
  
  if (!url) {
    return res.status(400).json({
      error: 'Missing required parameter: url',
      example: { url: 'https://example.com', options: {} }
    });
  }

  // Validate URL
  try {
    new URL(url);
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid URL format',
      provided: url
    });
  }

  const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();

  // Track analysis
  activeAnalyses.set(analysisId, {
    url,
    options,
    status: 'starting',
    startTime,
    progress: 0
  });

  logger.info(`Starting analysis ${analysisId} for ${url}`);

  // Send immediate response with analysis ID
  res.json({
    success: true,
    analysisId,
    status: 'started',
    message: 'Site intelligence analysis started',
    url,
    options,
    estimatedDuration: '15-45 seconds',
    statusEndpoint: `/status/${analysisId}`
  });

  // Run analysis asynchronously
  runAnalysisAsync(analysisId, url, options);
});

// Status endpoint
app.get('/status/:analysisId', (req, res) => {
  const { analysisId } = req.params;
  const analysis = activeAnalyses.get(analysisId);

  if (!analysis) {
    return res.status(404).json({
      error: 'Analysis not found',
      analysisId
    });
  }

  res.json({
    analysisId,
    ...analysis,
    duration: Date.now() - analysis.startTime
  });
});

// Quick platform detection endpoint
app.post('/detect-platform', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({
      error: 'Missing required parameter: url'
    });
  }

  try {
    new URL(url);
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid URL format',
      provided: url
    });
  }

  const siteIntelligence = new SiteIntelligence(logger);
  
  try {
    await siteIntelligence.initialize();
    const platformResult = await siteIntelligence.detectPlatform(url);
    
    res.json({
      success: true,
      url,
      platform: platformResult,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Platform detection failed:', error);
    res.status(500).json({
      error: 'Platform detection failed',
      message: error.message
    });
  } finally {
    await siteIntelligence.close();
  }
});

// List active analyses
app.get('/analyses', (req, res) => {
  const analyses = Array.from(activeAnalyses.entries()).map(([id, data]) => ({
    analysisId: id,
    url: data.url,
    status: data.status,
    progress: data.progress,
    duration: Date.now() - data.startTime,
    startTime: new Date(data.startTime).toISOString()
  }));

  res.json({
    activeAnalyses: analyses.length,
    analyses
  });
});

// Async analysis function
async function runAnalysisAsync(analysisId, url, options) {
  const analysis = activeAnalyses.get(analysisId);
  const siteIntelligence = new SiteIntelligence(logger);

  try {
    // Update status
    analysis.status = 'initializing';
    analysis.progress = 10;

    await siteIntelligence.initialize();
    
    analysis.status = 'analyzing';
    analysis.progress = 20;

    // Configure options
    const analysisOptions = {
      forceRefresh: options.forceRefresh || true,
      maxConcurrent: options.concurrent || 4,
      maxSubcategories: options.subcategories || 3,
      includeProductSampling: !options.quick,
      generateSelectors: true
    };

    analysis.progress = 30;

    // Run platform detection first
    const platformResult = await siteIntelligence.detectPlatform(url);
    analysis.platform = platformResult;
    analysis.progress = 40;

    // Run full intelligence if not quick mode
    let intelligenceResult = null;
    if (!options.quick) {
      analysis.status = 'deep_analysis';
      analysis.progress = 50;

      intelligenceResult = await siteIntelligence.buildComprehensiveSiteIntelligence(
        url,
        analysisOptions
      );
      
      analysis.progress = 90;
    }

    // Complete analysis
    analysis.status = 'completed';
    analysis.progress = 100;
    analysis.endTime = Date.now();
    analysis.duration = analysis.endTime - analysis.startTime;
    analysis.results = {
      platform: platformResult,
      intelligence: intelligenceResult
    };

    // Generate summary
    analysis.summary = {
      intelligenceScore: intelligenceResult?.summary?.intelligence_score || 0,
      sectionsMaped: intelligenceResult?.summary?.sections_mapped || 0,
      platformDetected: platformResult.platform,
      platformConfidence: Math.round(platformResult.confidence * 100),
      analysisQuality: getQualityDescription(intelligenceResult?.summary?.intelligence_score || 0)
    };

    logger.info(`Analysis ${analysisId} completed successfully in ${(analysis.duration / 1000).toFixed(1)}s`);

  } catch (error) {
    logger.error(`Analysis ${analysisId} failed:`, error);
    
    analysis.status = 'failed';
    analysis.error = error.message;
    analysis.endTime = Date.now();
    analysis.duration = analysis.endTime - analysis.startTime;
  } finally {
    await siteIntelligence.close();
    
    // Clean up after 1 hour
    setTimeout(() => {
      activeAnalyses.delete(analysisId);
      logger.info(`Cleaned up analysis ${analysisId}`);
    }, 60 * 60 * 1000);
  }
}

function getQualityDescription(score) {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 80) return 'VERY GOOD';
  if (score >= 70) return 'GOOD';
  if (score >= 60) return 'FAIR';
  if (score >= 40) return 'POOR';
  return 'VERY POOR';
}

// Start server
app.listen(port, () => {
  console.log('🧠 Site Intelligence API Server');
  console.log('================================');
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log('');
  console.log('Available endpoints:');
  console.log(`   GET  http://localhost:${port}/          - API information`);
  console.log(`   GET  http://localhost:${port}/health    - Health check`);
  console.log(`   POST http://localhost:${port}/analyze   - Run analysis`);
  console.log(`   POST http://localhost:${port}/detect-platform - Quick platform detection`);
  console.log(`   GET  http://localhost:${port}/status/:id - Analysis status`);
  console.log(`   GET  http://localhost:${port}/analyses  - List active analyses`);
  console.log('');
  console.log('Example usage:');
  console.log(`   curl -X POST http://localhost:${port}/analyze \\`);
  console.log(`        -H "Content-Type: application/json" \\`);
  console.log(`        -d '{"url":"https://glasswingshop.com","options":{"concurrent":4}}'`);
  console.log('');
});

module.exports = app;