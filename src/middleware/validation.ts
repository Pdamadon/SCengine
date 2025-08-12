/**
 * Comprehensive Request Validation Middleware
 * Provides robust input validation, sanitization, and security measures
 * Using Joi for schema validation and custom security checks
 */

import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import validator from 'validator';
import { ScrapingType, Priority } from '../types/common.types';

// Legacy imports (will be converted later)
const { logger } = require('../utils/logger');
const { metrics } = require('../utils/metrics');

interface SecurityRules {
  maxRequestSize: string;
  allowedOrigins: string[];
  blockedUserAgents: string[];
  maxUrlLength: number;
}

interface ValidationError {
  field?: string;
  message: string;
  value?: any;
}

// Extend Request interface
declare global {
  namespace Express {
    interface Request {
      validatedData?: any;
      validatedQuery?: any;
      validatedJobId?: string;
    }
  }
}

class ValidationService {
  private schemas: {
    scrapingJob: Joi.ObjectSchema;
    jobQuery: Joi.ObjectSchema;
    jobId: Joi.StringSchema;
  };
  private securityRules: SecurityRules;

  constructor() {
    // Initialize validation schemas
    this.schemas = {
      scrapingJob: this.createScrapingJobSchema(),
      jobQuery: this.createJobQuerySchema(),
      jobId: this.createJobIdSchema(),
    };

    // Initialize security rules
    this.securityRules = {
      maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
      blockedUserAgents: ['sqlmap', 'nikto', 'nmap', 'dirb'],
      maxUrlLength: 2048,
    };
  }

  /**
   * Create Joi schema for scraping job submission
   */
  private createScrapingJobSchema(): Joi.ObjectSchema {
    return Joi.object({
      scraping_type: Joi.string()
        .valid('full_site', 'category', 'category_search', 'product', 'search')
        .required()
        .messages({
          'any.only': 'scraping_type must be one of: full_site, category, category_search, product, search',
          'any.required': 'scraping_type is required',
        }),

      target_url: Joi.string()
        .uri({
          scheme: ['http', 'https'],
          allowRelative: false,
        })
        .max(2048)
        .required()
        .custom(this.validateTargetUrl.bind(this))
        .messages({
          'string.uri': 'target_url must be a valid HTTP/HTTPS URL',
          'any.required': 'target_url is required',
          'string.max': 'target_url must not exceed 2048 characters',
        }),

      priority: Joi.string()
        .valid('urgent', 'high', 'normal', 'low')
        .default('normal')
        .messages({
          'any.only': 'priority must be one of: urgent, high, normal, low',
        }),

      max_pages: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(100)
        .messages({
          'number.integer': 'max_pages must be an integer',
          'number.min': 'max_pages must be at least 1',
          'number.max': 'max_pages cannot exceed 1000',
        }),

      timeout_ms: Joi.number()
        .integer()
        .min(5000)
        .max(300000)
        .default(30000)
        .messages({
          'number.integer': 'timeout_ms must be an integer',
          'number.min': 'timeout_ms must be at least 5 seconds',
          'number.max': 'timeout_ms cannot exceed 5 minutes',
        }),

      rate_limit_delay_ms: Joi.number()
        .integer()
        .min(100)
        .max(60000)
        .default(1000)
        .messages({
          'number.integer': 'rate_limit_delay_ms must be an integer',
          'number.min': 'rate_limit_delay_ms must be at least 100ms',
          'number.max': 'rate_limit_delay_ms cannot exceed 60 seconds',
        }),

      respect_robots_txt: Joi.boolean()
        .default(true)
        .messages({
          'boolean.base': 'respect_robots_txt must be a boolean',
        }),

      extract_images: Joi.boolean()
        .default(false)
        .messages({
          'boolean.base': 'extract_images must be a boolean',
        }),

      extract_reviews: Joi.boolean()
        .default(false)
        .messages({
          'boolean.base': 'extract_reviews must be a boolean',
        }),

      category_filters: Joi.array()
        .items(Joi.string().max(100))
        .max(50)
        .default([])
        .messages({
          'array.base': 'category_filters must be an array',
          'array.max': 'category_filters cannot have more than 50 items',
          'string.max': 'each category filter must not exceed 100 characters',
        }),

      custom_selectors: Joi.object()
        .pattern(
          Joi.string().max(50),
          Joi.string().max(500),
        )
        .max(20)
        .default({})
        .messages({
          'object.base': 'custom_selectors must be an object',
          'object.pattern.match': 'custom_selectors keys must not exceed 50 characters and values must not exceed 500 characters',
        }),

      metadata: Joi.object()
        .pattern(
          Joi.string().max(50),
          Joi.alternatives().try(
            Joi.string().max(500),
            Joi.number(),
            Joi.boolean(),
          ),
        )
        .max(20)
        .default({})
        .messages({
          'object.base': 'metadata must be an object',
          'object.pattern.match': 'metadata keys must not exceed 50 characters',
        }),
    });
  }

  /**
   * Create Joi schema for job query parameters
   */
  private createJobQuerySchema(): Joi.ObjectSchema {
    return Joi.object({
      status: Joi.string()
        .valid('queued', 'running', 'completed', 'failed', 'cancelled')
        .messages({
          'any.only': 'status must be one of: queued, running, completed, failed, cancelled',
        }),

      type: Joi.string()
        .valid('full_site', 'category', 'category_search', 'product', 'search')
        .messages({
          'any.only': 'type must be one of: full_site, category, category_search, product, search',
        }),

      page: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(1)
        .messages({
          'number.integer': 'page must be an integer',
          'number.min': 'page must be at least 1',
          'number.max': 'page cannot exceed 1000',
        }),

      limit: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(20)
        .messages({
          'number.integer': 'limit must be an integer',
          'number.min': 'limit must be at least 1',
          'number.max': 'limit cannot exceed 100',
        }),
    });
  }

  /**
   * Create Joi schema for job ID parameter
   */
  private createJobIdSchema(): Joi.StringSchema {
    return Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'job_id must be a valid UUID v4',
        'any.required': 'job_id is required',
      });
  }

  /**
   * Custom validation for target URLs
   */
  private validateTargetUrl(value: string, helpers: Joi.CustomHelpers) {
    try {
      const url = new URL(value);

      // Security checks
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return helpers.error('custom.localhost');
      }

      if (url.hostname.match(/^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./)) {
        return helpers.error('custom.private_network');
      }

      if (url.port && !['80', '443', '8080', '8443'].includes(url.port)) {
        return helpers.error('custom.invalid_port');
      }

      // Allow only specific domains in production
      if (process.env.NODE_ENV === 'production') {
        const allowedDomains = process.env.ALLOWED_DOMAINS?.split(',') || [
          'glasswingshop.com',
          'shopify.com',
          'woocommerce.com',
        ];

        const isAllowed = allowedDomains.some(domain =>
          url.hostname === domain || url.hostname.endsWith(`.${domain}`),
        );

        if (!isAllowed) {
          return helpers.error('custom.domain_not_allowed');
        }
      }

      return value;

    } catch (error) {
      return helpers.error('string.uri');
    }
  }

  /**
   * Validate scraping job submission
   */
  validateScrapingJob() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Security checks
        await this.performSecurityChecks(req);

        // Validate request body
        const { error, value } = this.schemas.scrapingJob.validate(req.body, {
          abortEarly: false,
          stripUnknown: true,
          convert: true,
        });

        if (error) {
          this.handleValidationError(error, res);
          return;
        }

        // Sanitize and set validated data
        req.body = value;
        req.validatedData = value;

        // Track validation success
        metrics.incrementCounter('validation_success', { type: 'scraping_job' });

        next();

      } catch (validationError) {
        this.handleValidationError(validationError, res);
      }
    };
  }

  /**
   * Validate job query parameters
   */
  validateJobQuery() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        await this.performSecurityChecks(req);

        const { error, value } = this.schemas.jobQuery.validate(req.query, {
          abortEarly: false,
          stripUnknown: true,
          convert: true,
        });

        if (error) {
          this.handleValidationError(error, res);
          return;
        }

        req.query = value;
        req.validatedQuery = value;

        metrics.incrementCounter('validation_success', { type: 'job_query' });
        next();

      } catch (validationError) {
        this.handleValidationError(validationError, res);
      }
    };
  }

  /**
   * Validate job ID parameter
   */
  validateJobId() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        await this.performSecurityChecks(req);

        const { error, value } = this.schemas.jobId.validate(req.params.jobId);

        if (error) {
          this.handleValidationError(error, res);
          return;
        }

        req.params.jobId = value;
        req.validatedJobId = value;

        metrics.incrementCounter('validation_success', { type: 'job_id' });
        next();

      } catch (validationError) {
        this.handleValidationError(validationError, res);
      }
    };
  }

  /**
   * Perform security checks on incoming requests
   */
  private async performSecurityChecks(req: Request): Promise<void> {
    const errors: string[] = [];

    // Check User-Agent
    const userAgent = req.get('User-Agent') || '';
    if (this.securityRules.blockedUserAgents.some(blocked =>
      userAgent.toLowerCase().includes(blocked))) {
      errors.push('Blocked user agent detected');
    }

    // Check for common attack patterns in headers
    const suspiciousHeaders = ['x-forwarded-for', 'x-real-ip', 'x-originating-ip'];
    for (const header of suspiciousHeaders) {
      const value = req.get(header);
      if (value && this.containsSuspiciousPatterns(value)) {
        errors.push(`Suspicious pattern detected in ${header} header`);
      }
    }

    // Check request body for SQL injection patterns (only for requests with bodies)
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      if (this.containsSQLInjection(JSON.stringify(req.body))) {
        errors.push('Potential SQL injection detected in request body');
      }
    }

    // Check for XSS patterns (only for requests with bodies)
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      if (this.containsXSS(JSON.stringify(req.body))) {
        errors.push('Potential XSS detected in request body');
      }
    }

    if (errors.length > 0) {
      // Log security violation
      logger.warn('Security validation failed', {
        ip: req.ip,
        userAgent: userAgent,
        url: req.url,
        method: req.method,
        errors: errors,
      });

      metrics.incrementCounter('security_violations', { type: 'validation' });

      throw new Error(`Security validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Check for suspicious patterns
   */
  private containsSuspiciousPatterns(input: string): boolean {
    const patterns = [
      /\.\.\//,  // Path traversal
      /%2e%2e%2f/i,  // Encoded path traversal
      /union.*select/i,  // SQL Union
      /script.*>/i,  // Script tag
    ];

    return patterns.some(pattern => pattern.test(input));
  }

  /**
   * Check for SQL injection patterns
   */
  private containsSQLInjection(input: string): boolean {
    const sqlPatterns = [
      // More specific SQL injection patterns that avoid false positives
      /(union\s+select)/i,
      /(insert\s+into)/i,
      /(delete\s+from)/i,
      /(update\s+set)/i,
      /(drop\s+table)/i,
      /(exec\s+xp_)/i,
      /(sp_executesql)/i,
      /(';\s*(drop|delete|insert|update|union|select))/i,
      /(or\s+1\s*=\s*1)/i,
      /(and\s+1\s*=\s*1)/i,
      /(\bselect\b.*\bfrom\b)/i,
      /(\'\s*or\s*\'\w*\'\s*=\s*\'\w*)/i,
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Check for XSS patterns
   */
  private containsXSS(input: string): boolean {
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<img[^>]+src[\\s]*=[\\s]*[\\"\\']/gi,
    ];

    return xssPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Handle validation errors
   */
  private handleValidationError(error: any, res: Response): void {
    const statusCode = error.message?.includes('Security') ? 403 : 400;

    let errorDetails: ValidationError[] = [];

    if (error.details) {
      // Joi validation error
      errorDetails = error.details.map((detail: any) => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));
    } else {
      // Custom error
      errorDetails = [{ message: error.message }];
    }

    // Log validation failure
    logger.warn('Request validation failed', {
      statusCode,
      errors: errorDetails,
      url: (res as any).req?.url,
      method: (res as any).req?.method,
      ip: (res as any).req?.ip,
    });

    metrics.incrementCounter('validation_failures', {
      type: statusCode === 403 ? 'security' : 'format',
    });

    res.status(statusCode).json({
      success: false,
      error: 'Validation failed',
      details: errorDetails,
      timestamp: new Date().toISOString(),
    });
  }
}

// Export singleton instance
const validationService = new ValidationService();

export {
  validationService,
  ValidationService,
};

export const validateScrapingJob = validationService.validateScrapingJob.bind(validationService);
export const validateJobQuery = validationService.validateJobQuery.bind(validationService);
export const validateJobId = validationService.validateJobId.bind(validationService);