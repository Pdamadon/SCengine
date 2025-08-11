/**
 * Scraping Controller
 * Handles API requests for scraping operations
 * Implements SCRAPING_REQUIREMENTS.md compliance standards
 */

const { logger } = require('../utils/logger');
const { metrics } = require('../utils/metrics');
const ScrapingJobService = require('../services/ScrapingJobService');

class ScrapingController {
  constructor(mongoClient) {
    this.mongoClient = mongoClient;
    this.scrapingJobService = new ScrapingJobService(mongoClient);
  }

  /**
   * Submit a new scraping job
   * POST /api/v1/scraping/jobs
   */
  async submitJob(req, res) {
    const correlationId = req.correlationId || `scrape_${Date.now()}`;
    const startTime = performance.now();

    try {
      logger.info('SCRAPING_JOB_SUBMITTED', {
        correlation_id: correlationId,
        target_url: req.body.target_url,
        scraping_type: req.body.scraping_type,
        priority: req.body.priority || 'normal',
        user_agent: req.get('User-Agent'),
        ip_address: req.ip,
      });

      // Validate request payload
      const validationResult = this.validateSubmissionRequest(req.body);
      if (!validationResult.valid) {
        metrics.trackError('ValidationError', 'scraping_controller');
        return res.status(400).json({
          error: 'Invalid request payload',
          details: validationResult.errors,
          correlation_id: correlationId,
        });
      }

      // Check rate limits
      const rateLimitCheck = await this.checkRateLimit(req.ip);
      if (!rateLimitCheck.allowed) {
        logger.warn('SCRAPING_RATE_LIMIT_EXCEEDED', {
          correlation_id: correlationId,
          ip_address: req.ip,
          limit: rateLimitCheck.limit,
          reset_time: rateLimitCheck.reset_time,
        });

        metrics.incrementCounter('scraping_rate_limit_hits', { ip: req.ip });

        return res.status(429).json({
          error: 'Rate limit exceeded',
          limit: rateLimitCheck.limit,
          reset_time: rateLimitCheck.reset_time,
          correlation_id: correlationId,
        });
      }

      // Submit job to service
      const jobResult = await this.scrapingJobService.submitJob({
        ...req.body,
        correlation_id: correlationId,
        submitted_by: req.user?.id || 'anonymous',
        submitted_at: new Date(),
        client_ip: req.ip,
        user_agent: req.get('User-Agent'),
      });

      // Track successful submission
      const duration = performance.now() - startTime;
      metrics.trackHttpRequest('POST', '/api/v1/scraping/jobs', 201, duration);
      metrics.incrementCounter('scraping_jobs_submitted', {
        type: req.body.scraping_type,
        priority: req.body.priority || 'normal',
      });

      logger.info('SCRAPING_JOB_ACCEPTED', {
        correlation_id: correlationId,
        job_id: jobResult.job_id,
        estimated_duration: jobResult.estimated_duration_ms,
        queue_position: jobResult.queue_position,
        duration_ms: Math.round(duration),
      });

      res.status(201).json({
        success: true,
        job_id: jobResult.job_id,
        status: 'queued',
        estimated_completion: jobResult.estimated_completion,
        queue_position: jobResult.queue_position,
        correlation_id: correlationId,
        links: {
          status: `/api/v1/scraping/jobs/${jobResult.job_id}/status`,
          cancel: `/api/v1/scraping/jobs/${jobResult.job_id}/cancel`,
        },
      });

    } catch (error) {
      const duration = performance.now() - startTime;
      metrics.trackHttpRequest('POST', '/api/v1/scraping/jobs', 500, duration);
      metrics.trackError('ScrapingSubmissionError', 'scraping_controller');

      logger.error('SCRAPING_JOB_SUBMISSION_FAILED', {
        correlation_id: correlationId,
        error: error.message,
        stack: error.stack,
        duration_ms: Math.round(duration),
      });

      res.status(500).json({
        error: 'Failed to submit scraping job',
        message: error.message,
        correlation_id: correlationId,
        retry_after: 30, // seconds
      });
    }
  }

  /**
   * Get job status
   * GET /api/v1/scraping/jobs/:jobId/status
   */
  async getJobStatus(req, res) {
    const { jobId } = req.params;
    const correlationId = req.correlationId || `status_${Date.now()}`;
    const startTime = performance.now();

    try {
      logger.debug('SCRAPING_STATUS_REQUESTED', {
        correlation_id: correlationId,
        job_id: jobId,
        user_agent: req.get('User-Agent'),
      });

      const jobStatus = await this.scrapingJobService.getJobStatus(jobId);

      if (!jobStatus) {
        metrics.trackHttpRequest('GET', '/api/v1/scraping/jobs/:id/status', 404, performance.now() - startTime);
        return res.status(404).json({
          error: 'Job not found',
          job_id: jobId,
          correlation_id: correlationId,
        });
      }

      const duration = performance.now() - startTime;
      metrics.trackHttpRequest('GET', '/api/v1/scraping/jobs/:id/status', 200, duration);

      res.json({
        job_id: jobId,
        status: jobStatus.status,
        progress: jobStatus.progress,
        created_at: jobStatus.created_at,
        started_at: jobStatus.started_at,
        completed_at: jobStatus.completed_at,
        estimated_completion: jobStatus.estimated_completion,
        results_summary: jobStatus.results_summary,
        error_details: jobStatus.error_details,
        correlation_id: correlationId,
        links: {
          results: jobStatus.status === 'completed' ? `/api/v1/scraping/jobs/${jobId}/results` : null,
          cancel: ['queued', 'running'].includes(jobStatus.status) ? `/api/v1/scraping/jobs/${jobId}/cancel` : null,
        },
      });

    } catch (error) {
      const duration = performance.now() - startTime;
      metrics.trackHttpRequest('GET', '/api/v1/scraping/jobs/:id/status', 500, duration);
      metrics.trackError('StatusCheckError', 'scraping_controller');

      logger.error('SCRAPING_STATUS_CHECK_FAILED', {
        correlation_id: correlationId,
        job_id: jobId,
        error: error.message,
      });

      res.status(500).json({
        error: 'Failed to get job status',
        job_id: jobId,
        correlation_id: correlationId,
      });
    }
  }

  /**
   * Get job results
   * GET /api/v1/scraping/jobs/:jobId/results
   */
  async getJobResults(req, res) {
    const { jobId } = req.params;
    const correlationId = req.correlationId || `results_${Date.now()}`;
    const format = req.query.format || 'json';
    const startTime = performance.now();

    try {
      logger.info('SCRAPING_RESULTS_REQUESTED', {
        correlation_id: correlationId,
        job_id: jobId,
        format: format,
        user_agent: req.get('User-Agent'),
      });

      const results = await this.scrapingJobService.getJobResults(jobId, format);

      if (!results) {
        metrics.trackHttpRequest('GET', '/api/v1/scraping/jobs/:id/results', 404, performance.now() - startTime);
        return res.status(404).json({
          error: 'Job not found or results not available',
          job_id: jobId,
          correlation_id: correlationId,
        });
      }

      const duration = performance.now() - startTime;
      metrics.trackHttpRequest('GET', '/api/v1/scraping/jobs/:id/results', 200, duration);
      metrics.incrementCounter('scraping_results_downloaded', { format });

      // Set appropriate content type based on format
      switch (format) {
        case 'csv':
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="scraping_results_${jobId}.csv"`);
          break;
        case 'xml':
          res.setHeader('Content-Type', 'application/xml');
          break;
        default:
          res.setHeader('Content-Type', 'application/json');
      }

      res.json({
        job_id: jobId,
        status: results.status,
        results: results.data,
        metadata: {
          total_items: results.total_items,
          categories_found: results.categories_found,
          processing_time_ms: results.processing_time_ms,
          data_quality_score: results.data_quality_score,
        },
        correlation_id: correlationId,
      });

    } catch (error) {
      const duration = performance.now() - startTime;
      metrics.trackHttpRequest('GET', '/api/v1/scraping/jobs/:id/results', 500, duration);
      metrics.trackError('ResultsRetrievalError', 'scraping_controller');

      logger.error('SCRAPING_RESULTS_RETRIEVAL_FAILED', {
        correlation_id: correlationId,
        job_id: jobId,
        error: error.message,
      });

      res.status(500).json({
        error: 'Failed to retrieve job results',
        job_id: jobId,
        correlation_id: correlationId,
      });
    }
  }

  /**
   * Cancel a job
   * DELETE /api/v1/scraping/jobs/:jobId
   */
  async cancelJob(req, res) {
    const { jobId } = req.params;
    const correlationId = req.correlationId || `cancel_${Date.now()}`;
    const startTime = performance.now();

    try {
      logger.info('SCRAPING_JOB_CANCEL_REQUESTED', {
        correlation_id: correlationId,
        job_id: jobId,
        user_agent: req.get('User-Agent'),
      });

      const cancelResult = await this.scrapingJobService.cancelJob(jobId);

      if (!cancelResult.success) {
        const statusCode = cancelResult.reason === 'not_found' ? 404 : 400;
        metrics.trackHttpRequest('DELETE', '/api/v1/scraping/jobs/:id', statusCode, performance.now() - startTime);

        return res.status(statusCode).json({
          error: 'Cannot cancel job',
          reason: cancelResult.reason,
          job_id: jobId,
          correlation_id: correlationId,
        });
      }

      const duration = performance.now() - startTime;
      metrics.trackHttpRequest('DELETE', '/api/v1/scraping/jobs/:id', 200, duration);
      metrics.incrementCounter('scraping_jobs_cancelled');

      logger.info('SCRAPING_JOB_CANCELLED', {
        correlation_id: correlationId,
        job_id: jobId,
        duration_ms: Math.round(duration),
      });

      res.json({
        success: true,
        job_id: jobId,
        status: 'cancelled',
        correlation_id: correlationId,
      });

    } catch (error) {
      const duration = performance.now() - startTime;
      metrics.trackHttpRequest('DELETE', '/api/v1/scraping/jobs/:id', 500, duration);
      metrics.trackError('JobCancellationError', 'scraping_controller');

      logger.error('SCRAPING_JOB_CANCELLATION_FAILED', {
        correlation_id: correlationId,
        job_id: jobId,
        error: error.message,
      });

      res.status(500).json({
        error: 'Failed to cancel job',
        job_id: jobId,
        correlation_id: correlationId,
      });
    }
  }

  /**
   * List jobs with filtering and pagination
   * GET /api/v1/scraping/jobs
   */
  async listJobs(req, res) {
    const correlationId = req.correlationId || `list_${Date.now()}`;
    const startTime = performance.now();

    try {
      const filters = {
        status: req.query.status,
        scraping_type: req.query.type,
        submitted_after: req.query.submitted_after,
        submitted_before: req.query.submitted_before,
      };

      const pagination = {
        page: parseInt(req.query.page) || 1,
        limit: Math.min(parseInt(req.query.limit) || 20, 100), // Max 100 per page
      };

      logger.debug('SCRAPING_JOBS_LIST_REQUESTED', {
        correlation_id: correlationId,
        filters,
        pagination,
      });

      const jobsList = await this.scrapingJobService.listJobs(filters, pagination);

      const duration = performance.now() - startTime;
      metrics.trackHttpRequest('GET', '/api/v1/scraping/jobs', 200, duration);

      res.json({
        jobs: jobsList.jobs,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total_jobs: jobsList.total,
          total_pages: Math.ceil(jobsList.total / pagination.limit),
          has_next: pagination.page < Math.ceil(jobsList.total / pagination.limit),
          has_prev: pagination.page > 1,
        },
        correlation_id: correlationId,
      });

    } catch (error) {
      const duration = performance.now() - startTime;
      metrics.trackHttpRequest('GET', '/api/v1/scraping/jobs', 500, duration);
      metrics.trackError('JobListError', 'scraping_controller');

      logger.error('SCRAPING_JOBS_LIST_FAILED', {
        correlation_id: correlationId,
        error: error.message,
      });

      res.status(500).json({
        error: 'Failed to retrieve jobs list',
        correlation_id: correlationId,
      });
    }
  }

  /**
   * Validate scraping job submission request
   */
  validateSubmissionRequest(body) {
    const errors = [];

    if (!body.target_url) {
      errors.push('target_url is required');
    } else if (!this.isValidUrl(body.target_url)) {
      errors.push('target_url must be a valid URL');
    }

    if (!body.scraping_type) {
      errors.push('scraping_type is required');
    } else if (!['full_site', 'category', 'product', 'search'].includes(body.scraping_type)) {
      errors.push('scraping_type must be one of: full_site, category, product, search');
    }

    if (body.priority && !['low', 'normal', 'high', 'urgent'].includes(body.priority)) {
      errors.push('priority must be one of: low, normal, high, urgent');
    }

    if (body.max_pages && (!Number.isInteger(body.max_pages) || body.max_pages < 1 || body.max_pages > 1000)) {
      errors.push('max_pages must be an integer between 1 and 1000');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check rate limiting for IP address
   */
  async checkRateLimit(ipAddress) {
    // Implementation would check Redis or in-memory store
    // For now, return basic rate limiting
    return {
      allowed: true,
      limit: 100, // requests per hour
      remaining: 95,
      reset_time: new Date(Date.now() + 3600000), // 1 hour from now
    };
  }

  /**
   * Validate URL format
   */
  isValidUrl(string) {
    try {
      const url = new URL(string);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }
}

module.exports = ScrapingController;
