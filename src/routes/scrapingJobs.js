/**
 * Scraping Jobs API Routes
 * RESTful endpoints for scraping job management
 * Implements OpenAPI 3.0 specification
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const ScrapingController = require('../controllers/ScrapingController');
const { performanceMonitoring } = require('../middleware/monitoring');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * Middleware to add correlation ID to requests
 */
const correlationIdMiddleware = (req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || `api_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
};

/**
 * Validation error handler
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
      correlation_id: req.correlationId,
    });
  }
  next();
};

/**
 * Initialize routes with MongoDB client
 */
const initializeRoutes = (mongoClient) => {
  const scrapingController = new ScrapingController(mongoClient);

  // Apply middleware
  router.use(correlationIdMiddleware);
  router.use(performanceMonitoring());

  /**
   * @swagger
   * /api/v1/scraping/jobs:
   *   post:
   *     summary: Submit a new scraping job
   *     tags: [Scraping Jobs]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ScrapingJobRequest'
   *     responses:
   *       201:
   *         description: Job submitted successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ScrapingJobResponse'
   *       400:
   *         description: Invalid request payload
   *       429:
   *         description: Rate limit exceeded
   *       500:
   *         description: Server error
   */
  router.post('/jobs',
    [
      body('target_url')
        .isURL()
        .withMessage('target_url must be a valid URL'),
      body('scraping_type')
        .isIn(['full_site', 'category', 'product', 'search'])
        .withMessage('scraping_type must be one of: full_site, category, product, search'),
      body('priority')
        .optional()
        .isIn(['low', 'normal', 'high', 'urgent'])
        .withMessage('priority must be one of: low, normal, high, urgent'),
      body('max_pages')
        .optional()
        .isInt({ min: 1, max: 1000 })
        .withMessage('max_pages must be an integer between 1 and 1000'),
      body('respect_robots_txt')
        .optional()
        .isBoolean()
        .withMessage('respect_robots_txt must be a boolean'),
      body('rate_limit_delay_ms')
        .optional()
        .isInt({ min: 0, max: 30000 })
        .withMessage('rate_limit_delay_ms must be between 0 and 30000'),
      body('timeout_ms')
        .optional()
        .isInt({ min: 5000, max: 120000 })
        .withMessage('timeout_ms must be between 5000 and 120000'),
      body('category_filters')
        .optional()
        .isArray()
        .withMessage('category_filters must be an array'),
      body('extract_images')
        .optional()
        .isBoolean()
        .withMessage('extract_images must be a boolean'),
      body('extract_reviews')
        .optional()
        .isBoolean()
        .withMessage('extract_reviews must be a boolean'),
    ],
    handleValidationErrors,
    (req, res) => scrapingController.submitJob(req, res)
  );

  /**
   * @swagger
   * /api/v1/scraping/jobs:
   *   get:
   *     summary: List scraping jobs with filtering and pagination
   *     tags: [Scraping Jobs]
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [queued, running, completed, failed, cancelled]
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [full_site, category, product, search]
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           minimum: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *     responses:
   *       200:
   *         description: List of jobs
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/JobListResponse'
   */
  router.get('/jobs',
    [
      query('status')
        .optional()
        .isIn(['queued', 'running', 'completed', 'failed', 'cancelled'])
        .withMessage('status must be one of: queued, running, completed, failed, cancelled'),
      query('type')
        .optional()
        .isIn(['full_site', 'category', 'product', 'search'])
        .withMessage('type must be one of: full_site, category, product, search'),
      query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('page must be a positive integer'),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('limit must be between 1 and 100'),
    ],
    handleValidationErrors,
    (req, res) => scrapingController.listJobs(req, res)
  );

  /**
   * @swagger
   * /api/v1/scraping/jobs/{jobId}/status:
   *   get:
   *     summary: Get job status and progress
   *     tags: [Scraping Jobs]
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Job status retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/JobStatusResponse'
   *       404:
   *         description: Job not found
   */
  router.get('/jobs/:jobId/status',
    [
      param('jobId')
        .isUUID()
        .withMessage('jobId must be a valid UUID'),
    ],
    handleValidationErrors,
    (req, res) => scrapingController.getJobStatus(req, res)
  );

  /**
   * @swagger
   * /api/v1/scraping/jobs/{jobId}/results:
   *   get:
   *     summary: Get job results
   *     tags: [Scraping Jobs]
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: format
   *         schema:
   *           type: string
   *           enum: [json, csv, xml]
   *           default: json
   *     responses:
   *       200:
   *         description: Job results retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/JobResultsResponse'
   *       404:
   *         description: Job not found or results not available
   */
  router.get('/jobs/:jobId/results',
    [
      param('jobId')
        .isUUID()
        .withMessage('jobId must be a valid UUID'),
      query('format')
        .optional()
        .isIn(['json', 'csv', 'xml'])
        .withMessage('format must be one of: json, csv, xml'),
    ],
    handleValidationErrors,
    (req, res) => scrapingController.getJobResults(req, res)
  );

  /**
   * @swagger
   * /api/v1/scraping/jobs/{jobId}:
   *   delete:
   *     summary: Cancel a scraping job
   *     tags: [Scraping Jobs]
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Job cancelled successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/JobCancellationResponse'
   *       404:
   *         description: Job not found
   *       400:
   *         description: Job cannot be cancelled
   */
  router.delete('/jobs/:jobId',
    [
      param('jobId')
        .isUUID()
        .withMessage('jobId must be a valid UUID'),
    ],
    handleValidationErrors,
    (req, res) => scrapingController.cancelJob(req, res)
  );

  /**
   * Health check endpoint for load balancer
   */
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'scraping-jobs-api',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  });

  /**
   * API information endpoint
   */
  router.get('/info', (req, res) => {
    res.json({
      name: 'AI Shopping Scraper API',
      version: '1.0.0',
      description: 'RESTful API for managing scraping jobs',
      endpoints: {
        submit_job: 'POST /api/v1/scraping/jobs',
        list_jobs: 'GET /api/v1/scraping/jobs',
        job_status: 'GET /api/v1/scraping/jobs/{jobId}/status',
        job_results: 'GET /api/v1/scraping/jobs/{jobId}/results',
        cancel_job: 'DELETE /api/v1/scraping/jobs/{jobId}',
      },
      documentation: '/api/v1/docs',
      openapi_spec: '/api/v1/openapi.json',
    });
  });

  return router;
};

module.exports = initializeRoutes;