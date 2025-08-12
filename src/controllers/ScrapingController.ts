/**
 * Scraping Controller
 * Handles API requests for scraping operations
 * Implements SCRAPING_REQUIREMENTS.md compliance standards
 */

import { Request, Response } from 'express';
import { MongoClient } from 'mongodb';
import { performance } from 'perf_hooks';
import { logger } from '../utils/logger';
import { metrics } from '../utils/metrics';

// Type imports
import { 
  CreateScrapingJobRequest,
  UpdateScrapingJobRequest,
  ScrapingJobResponse,
  ScrapingJobListResponse,
  ApiResponse,
  ValidationErrorResponse,
  RateLimitResponse 
} from '../types/api.types';
import { 
  UUID, 
  Timestamp, 
  Priority 
} from '../types/common.types';
import { ScrapingType } from '../types/scraping.types';

// Legacy import (will be converted to TypeScript later)
const ScrapingJobService = require('../services/ScrapingJobService');

interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

interface RateLimitResult {
  allowed: boolean;
  remainingRequests?: number;
  resetTime?: Timestamp;
}

interface RequestWithCorrelation extends Request {
  correlationId?: string;
}

class ScrapingController {
  private mongoClient: MongoClient;
  private scrapingJobService: any; // Will be typed when converted to TS

  constructor(mongoClient: MongoClient) {
    this.mongoClient = mongoClient;
    this.scrapingJobService = new ScrapingJobService(mongoClient);
  }

  /**
   * Submit a new scraping job
   * POST /api/v1/scraping/jobs
   */
  async submitJob(req: RequestWithCorrelation, res: Response): Promise<void> {
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
        
        const errorResponse: ValidationErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            validation_errors: validationResult.errors?.map(error => ({
              field: 'unknown',
              message: error,
            })) || [],
            timestamp: new Date(),
          },
        };
        
        res.status(400).json(errorResponse);
        return;
      }

      // Check rate limits
      const rateLimitCheck = await this.checkRateLimit(req.ip);
      if (!rateLimitCheck.allowed) {
        logger.warn('SCRAPING_RATE_LIMIT_EXCEEDED', {
          correlation_id: correlationId,
          ip_address: req.ip,
          remaining_requests: rateLimitCheck.remainingRequests,
        });

        metrics.incrementCounter('rate_limit_exceeded', {
          ip_address: req.ip || 'unknown',
          endpoint: 'submit_job',
        });

        const rateLimitResponse: RateLimitResponse = {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests',
            rate_limit: {
              limit: 100, // TODO: Make configurable
              remaining: rateLimitCheck.remainingRequests || 0,
              reset: rateLimitCheck.resetTime || new Date(),
            },
            timestamp: new Date(),
          },
        };

        res.status(429).json(rateLimitResponse);
        return;
      }

      // Create scraping job
      const jobData: CreateScrapingJobRequest = {
        target_url: req.body.target_url,
        scraping_type: req.body.scraping_type,
        priority: req.body.priority || 'normal',
        max_pages: req.body.max_pages,
        timeout_ms: req.body.timeout_ms,
        extract_images: req.body.extract_images,
        extract_reviews: req.body.extract_reviews,
        respect_robots_txt: req.body.respect_robots_txt,
        rate_limit_delay_ms: req.body.rate_limit_delay_ms,
        category_filters: req.body.category_filters,
        custom_selectors: req.body.custom_selectors,
      };

      const result = await this.scrapingJobService.createJob(jobData, {
        correlation_id: correlationId,
        user_ip: req.ip,
        user_agent: req.get('User-Agent'),
      });

      const duration = performance.now() - startTime;

      logger.info('SCRAPING_JOB_CREATED', {
        correlation_id: correlationId,
        job_id: result.job_id,
        queue_position: result.queue_position,
        estimated_completion: result.estimated_completion,
        duration_ms: Math.round(duration),
      });

      // Track success metrics
      metrics.trackScrapingJobSubmission(
        req.body.target_url,
        req.body.scraping_type,
        'success',
        duration,
      );

      const response: ApiResponse<ScrapingJobResponse> = {
        success: true,
        data: {
          job_id: result.job_id,
          target_url: result.target_url,
          scraping_type: result.scraping_type,
          status: result.status,
          progress: result.progress,
          priority: result.priority,
          created_at: result.created_at,
          queue_position: result.queue_position,
          estimated_completion: result.estimated_completion,
        },
        timestamp: new Date(),
      };

      res.status(201).json(response);

    } catch (error) {
      const duration = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error('SCRAPING_JOB_SUBMISSION_FAILED', {
        correlation_id: correlationId,
        error_message: errorMessage,
        stack: errorStack,
        duration_ms: Math.round(duration),
      });

      metrics.trackScrapingJobSubmission(
        req.body?.target_url || 'unknown',
        req.body?.scraping_type || 'unknown',
        'error',
        duration,
      );

      const errorResponse: ApiResponse = {
        success: false,
        error: 'Internal server error occurred while processing scraping job',
        message: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        timestamp: new Date(),
      };

      res.status(500).json(errorResponse);
    }
  }

  /**
   * Get job status
   * GET /api/v1/scraping/jobs/:jobId
   */
  async getJobStatus(req: RequestWithCorrelation, res: Response): Promise<void> {
    const correlationId = req.correlationId || `status_${Date.now()}`;
    const jobId = req.params.jobId;

    try {
      logger.debug('SCRAPING_JOB_STATUS_REQUESTED', {
        correlation_id: correlationId,
        job_id: jobId,
      });

      const job = await this.scrapingJobService.getJobById(jobId);

      if (!job) {
        const notFoundResponse: ApiResponse = {
          success: false,
          error: 'Job not found',
          timestamp: new Date(),
        };

        res.status(404).json(notFoundResponse);
        return;
      }

      const response: ApiResponse<ScrapingJobResponse> = {
        success: true,
        data: {
          job_id: job.job_id,
          target_url: job.target_url,
          scraping_type: job.scraping_type,
          status: job.status,
          progress: job.progress,
          priority: job.priority,
          created_at: job.created_at,
          started_at: job.started_at,
          completed_at: job.completed_at,
          estimated_completion: job.estimated_completion,
          worker_id: job.worker_id,
          results_summary: job.results_summary,
          error_details: job.error_details,
        },
        timestamp: new Date(),
      };

      res.json(response);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error('SCRAPING_JOB_STATUS_FAILED', {
        correlation_id: correlationId,
        job_id: jobId,
        error: errorMessage,
        stack: errorStack,
      });

      const errorResponse: ApiResponse = {
        success: false,
        error: 'Failed to retrieve job status',
        message: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        timestamp: new Date(),
      };

      res.status(500).json(errorResponse);
    }
  }

  /**
   * List scraping jobs with filtering and pagination
   * GET /api/v1/scraping/jobs
   */
  async listJobs(req: RequestWithCorrelation, res: Response): Promise<void> {
    const correlationId = req.correlationId || `list_${Date.now()}`;

    try {
      const filters = {
        status: req.query.status as string,
        scraping_type: req.query.scraping_type as ScrapingType,
        created_after: req.query.created_after ? new Date(req.query.created_after as string) : undefined,
        created_before: req.query.created_before ? new Date(req.query.created_before as string) : undefined,
      };

      const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100), // Max 100 items per page
      };

      logger.debug('SCRAPING_JOBS_LIST_REQUESTED', {
        correlation_id: correlationId,
        filters: filters,
        pagination: pagination,
      });

      const result = await this.scrapingJobService.listJobs(filters, pagination);

      const response: ApiResponse<ScrapingJobListResponse> = {
        success: true,
        data: {
          items: result.items,
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
          filters_applied: filters,
        },
        timestamp: new Date(),
      };

      res.json(response);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error('SCRAPING_JOBS_LIST_FAILED', {
        correlation_id: correlationId,
        error: errorMessage,
        stack: errorStack,
      });

      const errorResponse: ApiResponse = {
        success: false,
        error: 'Failed to retrieve jobs list',
        message: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        timestamp: new Date(),
      };

      res.status(500).json(errorResponse);
    }
  }

  /**
   * Cancel a pending or running job
   * DELETE /api/v1/scraping/jobs/:jobId
   */
  async cancelJob(req: RequestWithCorrelation, res: Response): Promise<void> {
    const correlationId = req.correlationId || `cancel_${Date.now()}`;
    const jobId = req.params.jobId;

    try {
      logger.info('SCRAPING_JOB_CANCELLATION_REQUESTED', {
        correlation_id: correlationId,
        job_id: jobId,
        user_ip: req.ip,
      });

      const result = await this.scrapingJobService.cancelJob(jobId);

      if (!result.success) {
        const errorResponse: ApiResponse = {
          success: false,
          error: result.reason || 'Job could not be cancelled',
          timestamp: new Date(),
        };

        const statusCode = result.reason === 'not_found' ? 404 : 400;
        res.status(statusCode).json(errorResponse);
        return;
      }

      logger.info('SCRAPING_JOB_CANCELLED', {
        correlation_id: correlationId,
        job_id: jobId,
        previous_status: result.previous_status,
      });

      const response: ApiResponse = {
        success: true,
        message: 'Job cancelled successfully',
        timestamp: new Date(),
      };

      res.json(response);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error('SCRAPING_JOB_CANCELLATION_FAILED', {
        correlation_id: correlationId,
        job_id: jobId,
        error: errorMessage,
        stack: errorStack,
      });

      const errorResponse: ApiResponse = {
        success: false,
        error: 'Failed to cancel job',
        message: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        timestamp: new Date(),
      };

      res.status(500).json(errorResponse);
    }
  }

  /**
   * Get job results
   * GET /api/v1/scraping/jobs/:jobId/results
   */
  async getJobResults(req: RequestWithCorrelation, res: Response): Promise<void> {
    const correlationId = req.correlationId || `results_${Date.now()}`;
    const jobId = req.params.jobId;

    try {
      logger.debug('SCRAPING_JOB_RESULTS_REQUESTED', {
        correlation_id: correlationId,
        job_id: jobId,
      });

      const results = await this.scrapingJobService.getJobResults(jobId);

      if (!results) {
        const notFoundResponse: ApiResponse = {
          success: false,
          error: 'Job results not found',
          timestamp: new Date(),
        };

        res.status(404).json(notFoundResponse);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: results,
        timestamp: new Date(),
      };

      res.json(response);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error('SCRAPING_JOB_RESULTS_FAILED', {
        correlation_id: correlationId,
        job_id: jobId,
        error: errorMessage,
        stack: errorStack,
      });

      const errorResponse: ApiResponse = {
        success: false,
        error: 'Failed to retrieve job results',
        message: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        timestamp: new Date(),
      };

      res.status(500).json(errorResponse);
    }
  }

  /**
   * Validate job submission request
   */
  private validateSubmissionRequest(body: any): ValidationResult {
    const errors: string[] = [];

    // Required fields
    if (!body.target_url) {
      errors.push('target_url is required');
    } else {
      try {
        new URL(body.target_url);
      } catch {
        errors.push('target_url must be a valid URL');
      }
    }

    if (!body.scraping_type) {
      errors.push('scraping_type is required');
    } else if (!['product', 'category_search', 'full_site', 'search'].includes(body.scraping_type)) {
      errors.push('scraping_type must be one of: product, category_search, full_site, search');
    }

    // Optional field validation
    if (body.priority && !['urgent', 'high', 'normal', 'low'].includes(body.priority)) {
      errors.push('priority must be one of: urgent, high, normal, low');
    }

    if (body.max_pages && (!Number.isInteger(body.max_pages) || body.max_pages < 1 || body.max_pages > 1000)) {
      errors.push('max_pages must be an integer between 1 and 1000');
    }

    if (body.timeout_ms && (!Number.isInteger(body.timeout_ms) || body.timeout_ms < 1000 || body.timeout_ms > 300000)) {
      errors.push('timeout_ms must be an integer between 1000 and 300000');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Check rate limits for IP address
   */
  private async checkRateLimit(ipAddress?: string): Promise<RateLimitResult> {
    if (!ipAddress) {
      return { allowed: true };
    }

    try {
      // TODO: Implement actual rate limiting with Redis
      // For now, allow all requests
      return {
        allowed: true,
        remainingRequests: 95,
        resetTime: new Date(Date.now() + 60000), // Reset in 1 minute
      };
    } catch (error) {
      logger.warn('Rate limit check failed, allowing request', {
        ip_address: ipAddress,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return { allowed: true };
    }
  }
}

export default ScrapingController;