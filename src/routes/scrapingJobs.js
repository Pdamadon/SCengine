/**
 * Scraping Jobs API Routes
 * RESTful endpoints for scraping job management
 * Implements OpenAPI 3.0 specification
 */

const express = require('express');
// Removed express-validator - now using comprehensive Joi validation
const ScrapingController = require('../controllers/ScrapingController');
const { performanceMonitoring } = require('../middleware/monitoring');
const { logger } = require('../utils/logger');
const { validateScrapingJob, validateJobQuery, validateJobId } = require('../middleware/validation');
const { jobSubmissionRateLimit } = require('../middleware/security');

const router = express.Router();

/**
 * Middleware to add correlation ID to requests
 */
const correlationIdMiddleware = (req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || `api_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
};

// Removed old validation error handler - now using comprehensive validation middleware

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
    jobSubmissionRateLimit(), // Rate limiting for job submissions
    validateScrapingJob(), // Comprehensive validation and security
    performanceMonitoring('submit_job'),
    correlationIdMiddleware,
    (req, res) => scrapingController.submitJob(req, res),
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
    validateJobQuery(), // Validate query parameters with security checks
    performanceMonitoring('list_jobs'),
    correlationIdMiddleware,
    (req, res) => scrapingController.listJobs(req, res),
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
    validateJobId(), // Validate job ID parameter with security checks
    performanceMonitoring('job_status'),
    correlationIdMiddleware,
    (req, res) => scrapingController.getJobStatus(req, res),
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
    validateJobId(), // Validate job ID parameter with security checks
    performanceMonitoring('job_results'),
    correlationIdMiddleware,
    (req, res) => scrapingController.getJobResults(req, res),
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
    validateJobId(), // Validate job ID parameter with security checks
    performanceMonitoring('cancel_job'),
    correlationIdMiddleware,
    (req, res) => scrapingController.cancelJob(req, res),
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
