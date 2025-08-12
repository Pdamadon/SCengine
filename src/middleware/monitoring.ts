/**
 * Monitoring Middleware
 * Integrates logging, metrics, and health checks for comprehensive monitoring
 * Implements SCRAPING_REQUIREMENTS.md monitoring standards
 */

import { Request, Response, NextFunction } from 'express';
import { performance } from 'perf_hooks';

// Legacy imports (will be converted later)
const { logger } = require('../utils/logger');
const { metrics } = require('../utils/metrics');

// Extend Request interface to include correlation ID
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

interface ErrorWithStatusCode extends Error {
  statusCode?: number;
  code?: string;
}

interface HealthCheckResults {
  checks?: Record<string, { status: string }>;
}

interface DatabaseOperationArgs {
  correlationId?: string;
  [key: string]: any;
}

interface ScrapingOperationResult {
  products_found?: number;
  categories_found?: number;
  category?: string;
}

/**
 * Performance monitoring middleware
 * Tracks response times and request metrics
 */
export function performanceMonitoring() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = performance.now();
    const endpoint = req.route?.path || req.url.split('?')[0];

    // Track request start
    metrics.incrementGauge('http_active_requests');

    // Override res.end to capture metrics
    const originalEnd = res.end;
    res.end = function(chunk?: any, encoding?: BufferEncoding) {
      const duration = performance.now() - startTime;

      // Track HTTP metrics
      metrics.trackHttpRequest(
        req.method,
        endpoint,
        res.statusCode,
        duration,
      );

      // Decrement active requests
      metrics.decrementGauge('http_active_requests');

      // Log performance warnings
      if (duration > 200 && endpoint !== '/health') {
        logger.warn('SLOW_HTTP_REQUEST', {
          method: req.method,
          endpoint,
          duration_ms: Math.round(duration * 100) / 100,
          threshold_ms: 200,
          correlation_id: req.correlationId,
        });
      }

      originalEnd.call(this, chunk, encoding);
    };

    next();
  };
}

/**
 * Error tracking middleware
 * Captures and logs application errors with metrics
 */
export function errorTracking() {
  return (err: ErrorWithStatusCode, req: Request, res: Response, next: NextFunction): void => {
    const endpoint = req.route?.path || req.url.split('?')[0];

    // Track error metrics
    metrics.trackError(err.name || 'UnknownError', 'api');

    // Log error with full context
    logger.error('API_ERROR', {
      error_name: err.name,
      error_message: err.message,
      error_stack: err.stack,
      method: req.method,
      endpoint,
      status_code: err.statusCode || 500,
      user_agent: req.get('User-Agent'),
      correlation_id: req.correlationId,
      request_body: req.body ? JSON.stringify(req.body) : undefined,
    });

    // Send appropriate error response
    const statusCode = err.statusCode || 500;
    const errorResponse = {
      error: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An internal error occurred',
      timestamp: new Date().toISOString(),
      request_id: req.correlationId,
    };

    // Don't expose internal errors in production
    if (process.env.NODE_ENV === 'production' && statusCode === 500) {
      errorResponse.message = 'Internal server error';
    }

    res.status(statusCode).json(errorResponse);
  };
}

/**
 * Request validation monitoring
 * Tracks validation failures and suspicious requests
 */
export function validationMonitoring() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const endpoint = req.route?.path || req.url.split('?')[0];

    // Track suspicious patterns
    const suspiciousPatterns = [
      /\.\.\//,  // Directory traversal
      /<script/i,  // XSS attempts
      /union.*select/i,  // SQL injection
      /javascript:/i,  // JavaScript injection
    ];

    const requestData = JSON.stringify({
      url: req.url,
      body: req.body,
      query: req.query,
    });

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(requestData)) {
        logger.securityEvent('SUSPICIOUS_REQUEST', {
          pattern: pattern.source,
          method: req.method,
          endpoint,
          user_agent: req.get('User-Agent'),
          remote_addr: req.ip,
          correlation_id: req.correlationId,
        }, 'high');

        metrics.trackError('SuspiciousRequest', 'security');
        break;
      }
    }

    next();
  };
}

/**
 * Rate limiting monitoring
 * Tracks rate limit hits and patterns
 */
export function rateLimitMonitoring() {
  const requestCounts = new Map<string, number[]>();
  const windowSize = 60000; // 1 minute
  const requestLimit = 60; // requests per minute per IP

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowSize;

    // Clean old entries
    if (!requestCounts.has(clientId)) {
      requestCounts.set(clientId, []);
    }

    const requests = requestCounts.get(clientId)!;
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);
    requestCounts.set(clientId, recentRequests);

    // Check rate limit
    if (recentRequests.length >= requestLimit) {
      logger.rateLimitHit(clientId, req.url, requestLimit, windowSize / 1000, {
        correlation_id: req.correlationId,
      });

      metrics.trackError('RateLimit', 'api');

      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Limit: ${requestLimit} requests per minute`,
        timestamp: new Date().toISOString(),
        request_id: req.correlationId,
      });
      return;
    }

    // Add current request
    recentRequests.push(now);

    next();
  };
}

/**
 * Database operation monitoring wrapper
 */
export function monitorDatabaseOperation<T extends (...args: any[]) => Promise<any>>(
  operation: string, 
  collection: string, 
  fn: T
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const startTime = performance.now();
    const correlationId = (args[0] as DatabaseOperationArgs)?.correlationId;

    try {
      logger.debug('DATABASE_OPERATION_START', {
        operation,
        collection,
        correlation_id: correlationId,
      });

      const result = await fn(...args);
      const duration = performance.now() - startTime;

      metrics.trackDatabaseOperation(operation, collection, duration);

      logger.dbQuery(operation, collection, args[0] || {}, duration, {
        correlation_id: correlationId,
      });

      return result;

    } catch (error) {
      const duration = performance.now() - startTime;

      metrics.trackError('DatabaseError', 'database');

      logger.error('DATABASE_OPERATION_FAILED', {
        operation,
        collection,
        duration_ms: Math.round(duration * 100) / 100,
        error: error,
        correlation_id: correlationId,
      });

      throw error;
    }
  }) as T;
}

/**
 * Scraping operation monitoring decorator
 */
export function monitorScrapingOperation(siteDomain: string) {
  return function<T extends (...args: any[]) => Promise<ScrapingOperationResult>>(
    target: any, 
    propertyName: string, 
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const method = descriptor.value!;

    descriptor.value = (async function(this: any, ...args: Parameters<T>): Promise<ReturnType<T>> {
      const correlationId = (args[0] as any)?.correlationId || (args[0] as any)?.request_id;
      const startTime = performance.now();

      // Track active scraping operations
      metrics.incrementGauge('scraping_active_requests');

      logger.scrapingStarted(correlationId, siteDomain, {
        method: propertyName,
      });

      try {
        const result = await method.apply(this, args);
        const duration = performance.now() - startTime;

        metrics.trackScrapingOperation(
          siteDomain,
          'success',
          duration,
          result?.products_found || 0,
          result?.category || '',
        );

        logger.scrapingCompleted(correlationId, siteDomain, {
          products_found: result?.products_found || 0,
          categories_found: result?.categories_found || 0,
          processing_time_ms: Math.round(duration * 100) / 100,
        });

        return result;

      } catch (error) {
        const duration = performance.now() - startTime;

        metrics.trackScrapingOperation(siteDomain, 'failed', duration);
        metrics.trackError('ScrapingError', 'scraper');

        logger.scrapingFailed(correlationId, siteDomain, error);

        throw error;

      } finally {
        metrics.decrementGauge('scraping_active_requests');
      }
    }) as T;

    return descriptor;
  };
}

/**
 * Health check integration
 * Updates metrics based on health check results
 */
export function updateHealthMetrics(healthResults: HealthCheckResults): void {
  if (healthResults && healthResults.checks) {
    Object.keys(healthResults.checks).forEach(checkName => {
      const check = healthResults.checks![checkName];
      metrics.updateHealthCheckStatus(checkName, check.status);
    });
  }
}

/**
 * Metrics endpoint middleware
 * Provides Prometheus-compatible metrics endpoint
 */
export function metricsEndpoint() {
  return (req: Request, res: Response): void => {
    try {
      const format = req.query.format || 'prometheus';

      if (format === 'json') {
        const jsonMetrics = metrics.exportJsonMetrics();
        res.setHeader('Content-Type', 'application/json');
        res.json(jsonMetrics);
      } else {
        const prometheusMetrics = metrics.exportPrometheusMetrics();
        res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.send(prometheusMetrics);
      }

    } catch (error) {
      logger.error('METRICS_EXPORT_ERROR', {
        error: error,
        correlation_id: req.correlationId,
      });

      res.status(500).json({
        error: 'METRICS_EXPORT_FAILED',
        message: 'Failed to export metrics',
        timestamp: new Date().toISOString(),
        request_id: req.correlationId,
      });
    }
  };
}

/**
 * Monitoring summary endpoint
 * Provides high-level monitoring overview
 */
export function monitoringSummary() {
  return (req: Request, res: Response): void => {
    try {
      const summary = metrics.getSummary();

      // Add recent error counts
      const errorCounts: Record<string, number> = {};
      const errorMetric = metrics.counters.get('errors_total');
      if (errorMetric) {
        for (const [labelKey, count] of errorMetric.values) {
          const labels = labelKey.split(',').reduce((obj: Record<string, string>, pair: string) => {
            const [key, value] = pair.split('=');
            obj[key] = value.replace(/"/g, '');
            return obj;
          }, {});

          if (!errorCounts[labels.error_type]) {
            errorCounts[labels.error_type] = 0;
          }
          errorCounts[labels.error_type] += count;
        }
      }

      res.json({
        ...summary,
        recent_errors: errorCounts,
        monitoring: {
          status: 'active',
          last_updated: new Date().toISOString(),
        },
      });

    } catch (error) {
      logger.error('MONITORING_SUMMARY_ERROR', {
        error: error,
        correlation_id: req.correlationId,
      });

      res.status(500).json({
        error: 'MONITORING_SUMMARY_FAILED',
        message: 'Failed to generate monitoring summary',
        timestamp: new Date().toISOString(),
        request_id: req.correlationId,
      });
    }
  };
}