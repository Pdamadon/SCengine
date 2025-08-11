/**
 * Monitoring Middleware
 * Integrates logging, metrics, and health checks for comprehensive monitoring
 * Implements SCRAPING_REQUIREMENTS.md monitoring standards
 */

const { logger } = require('../utils/logger');
const { metrics } = require('../utils/metrics');
const { performance } = require('perf_hooks');

/**
 * Performance monitoring middleware
 * Tracks response times and request metrics
 */
function performanceMonitoring() {
  return (req, res, next) => {
    const startTime = performance.now();
    const endpoint = req.route?.path || req.url.split('?')[0];

    // Track request start
    metrics.incrementGauge('http_active_requests');

    // Override res.end to capture metrics
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
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
function errorTracking() {
  return (err, req, res, next) => {
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
function validationMonitoring() {
  return (req, res, next) => {
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
function rateLimitMonitoring() {
  const requestCounts = new Map();
  const windowSize = 60000; // 1 minute
  const requestLimit = 60; // requests per minute per IP

  return (req, res, next) => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowSize;

    // Clean old entries
    if (!requestCounts.has(clientId)) {
      requestCounts.set(clientId, []);
    }

    const requests = requestCounts.get(clientId);
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);
    requestCounts.set(clientId, recentRequests);

    // Check rate limit
    if (recentRequests.length >= requestLimit) {
      logger.rateLimitHit(clientId, req.url, requestLimit, windowSize / 1000, {
        correlation_id: req.correlationId,
      });

      metrics.trackError('RateLimit', 'api');

      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Limit: ${requestLimit} requests per minute`,
        timestamp: new Date().toISOString(),
        request_id: req.correlationId,
      });
    }

    // Add current request
    recentRequests.push(now);

    next();
  };
}

/**
 * Database operation monitoring wrapper
 */
function monitorDatabaseOperation(operation, collection, fn) {
  return async (...args) => {
    const startTime = performance.now();
    const correlationId = args[0]?.correlationId;

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
  };
}

/**
 * Scraping operation monitoring wrapper
 */
function monitorScrapingOperation(siteDomain) {
  return function(target, propertyName, descriptor) {
    const method = descriptor.value;

    descriptor.value = async function(...args) {
      const correlationId = args[0]?.correlationId || args[0]?.request_id;
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
    };

    return descriptor;
  };
}

/**
 * Health check integration
 * Updates metrics based on health check results
 */
function updateHealthMetrics(healthResults) {
  if (healthResults && healthResults.checks) {
    Object.keys(healthResults.checks).forEach(checkName => {
      const check = healthResults.checks[checkName];
      metrics.updateHealthCheckStatus(checkName, check.status);
    });
  }
}

/**
 * Metrics endpoint middleware
 * Provides Prometheus-compatible metrics endpoint
 */
function metricsEndpoint() {
  return (req, res) => {
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
function monitoringSummary() {
  return (req, res) => {
    try {
      const summary = metrics.getSummary();

      // Add recent error counts
      const errorCounts = {};
      const errorMetric = metrics.counters.get('errors_total');
      if (errorMetric) {
        for (const [labelKey, count] of errorMetric.values) {
          const labels = labelKey.split(',').reduce((obj, pair) => {
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

module.exports = {
  performanceMonitoring,
  errorTracking,
  validationMonitoring,
  rateLimitMonitoring,
  monitorDatabaseOperation,
  monitorScrapingOperation,
  updateHealthMetrics,
  metricsEndpoint,
  monitoringSummary,
};
