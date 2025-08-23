/**
 * Structured JSON Logger
 * Implements industry standards logging as required by SCRAPING_REQUIREMENTS.md
 * Supports different log levels, correlation IDs, and performance metrics
 */

const winston = require('winston');
const { performance } = require('perf_hooks');

class StructuredLogger {
  constructor() {
    this.winstonLogger = this.createWinstonLogger();
    this.correlationIdHeader = 'x-correlation-id';
    this.performanceTimers = new Map();
  }

  /**
   * Create Winston logger with structured JSON format
   */
  createWinstonLogger() {
    const isTest = process.env.NODE_ENV === 'test' || process.env.LOG_SILENT === 'true';
    
    const logFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DDTHH:mm:ss.sssZ',
      }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return JSON.stringify({
          timestamp,
          level: level.toUpperCase(),
          message,
          ...meta,
          service: 'ai-shopping-scraper',
          version: process.env.npm_package_version || '2.1.0',
          environment: process.env.NODE_ENV || 'development',
          pid: process.pid,
        });
      }),
    );

    // Configure transports based on environment
    let transports;
    let exceptionHandlers;
    let rejectionHandlers;
    
    if (isTest) {
      // Test environment: use silent console transport only
      transports = [
        new winston.transports.Console({ 
          silent: true,
          level: 'error' // Still process logs internally, just don't output
        })
      ];
      
      // Silent handlers for tests
      exceptionHandlers = [
        new winston.transports.Console({ silent: true })
      ];
      
      rejectionHandlers = [
        new winston.transports.Console({ silent: true })
      ];
    } else {
      // Production/development environment: full logging
      transports = [
        // Console transport for development
        new winston.transports.Console({
          level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
        }),

        // File transports
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          maxsize: 50 * 1024 * 1024, // 50MB
          maxFiles: 5,
          tailable: true,
        }),

        new winston.transports.File({
          filename: 'logs/combined.log',
          maxsize: 100 * 1024 * 1024, // 100MB
          maxFiles: 10,
          tailable: true,
        }),

        // Application-specific logs
        new winston.transports.File({
          filename: 'logs/scraping.log',
          level: 'info',
          maxsize: 100 * 1024 * 1024,
          maxFiles: 10,
          format: winston.format.combine(
            winston.format.label({ label: 'SCRAPING' }),
            logFormat,
          ),
        }),

        new winston.transports.File({
          filename: 'logs/performance.log',
          level: 'info',
          maxsize: 50 * 1024 * 1024,
          maxFiles: 5,
          format: winston.format.combine(
            winston.format.label({ label: 'PERFORMANCE' }),
            logFormat,
          ),
        }),
      ];
      
      // Handle uncaught exceptions and rejections
      exceptionHandlers = [
        new winston.transports.File({ filename: 'logs/exceptions.log' }),
        new winston.transports.Console(),
      ];
      
      rejectionHandlers = [
        new winston.transports.File({ filename: 'logs/rejections.log' }),
        new winston.transports.Console(),
      ];
    }

    return winston.createLogger({
      level: process.env.LOG_LEVEL || (isTest ? 'error' : 'info'),
      format: logFormat,
      defaultMeta: {
        service: 'ai-shopping-scraper',
      },
      transports,
      exceptionHandlers,
      rejectionHandlers,
    });
  }

  /**
   * Express middleware for request logging
   */
  requestMiddleware() {
    return (req, res, next) => {
      const startTime = performance.now();
      const correlationId = req.headers[this.correlationIdHeader] || this.generateCorrelationId();

      // Add correlation ID to request for downstream use
      req.correlationId = correlationId;

      // Set correlation ID header in response
      res.setHeader('X-Correlation-ID', correlationId);

      // Log incoming request
      this.info('HTTP_REQUEST_STARTED', {
        correlation_id: correlationId,
        method: req.method,
        url: req.url,
        user_agent: req.get('User-Agent'),
        remote_addr: req.ip || req.connection.remoteAddress,
        request_size: req.get('Content-Length') || 0,
      });

      // Override res.end to capture response metrics
      const originalEnd = res.end;
      res.end = function(chunk, encoding) {
        const duration = performance.now() - startTime;

        // Log response completion
        logger.info('HTTP_REQUEST_COMPLETED', {
          correlation_id: correlationId,
          method: req.method,
          url: req.url,
          status_code: res.statusCode,
          response_time_ms: Math.round(duration * 100) / 100,
          response_size: res.get('Content-Length') || 0,
        });

        // Log slow requests
        if (duration > 1000) {
          logger.warn('SLOW_REQUEST', {
            correlation_id: correlationId,
            method: req.method,
            url: req.url,
            response_time_ms: Math.round(duration * 100) / 100,
            threshold_ms: 1000,
          });
        }

        originalEnd.call(this, chunk, encoding);
      };

      next();
    };
  }

  /**
   * Log methods with correlation ID support
   */
  debug(message, meta = {}, correlationId = null) {
    this.log('debug', message, meta, correlationId);
  }

  info(message, meta = {}, correlationId = null) {
    this.log('info', message, meta, correlationId);
  }

  warn(message, meta = {}, correlationId = null) {
    this.log('warn', message, meta, correlationId);
  }

  error(message, meta = {}, correlationId = null) {
    this.log('error', message, meta, correlationId);
  }

  /**
   * Core logging method
   */
  log(level, message, meta = {}, correlationId = null) {
    const logEntry = {
      ...meta,
      correlation_id: correlationId || meta.correlation_id,
    };

    // Add error stack trace if meta contains error
    if (meta.error && meta.error instanceof Error) {
      logEntry.error_name = meta.error.name;
      logEntry.error_message = meta.error.message;
      logEntry.error_stack = meta.error.stack;
      delete logEntry.error; // Remove original error object
    }

    this.winstonLogger.log(level, message, logEntry);
  }

  /**
   * Performance tracking methods
   */
  startTimer(name, correlationId = null) {
    const timerKey = correlationId ? `${name}_${correlationId}` : name;
    this.performanceTimers.set(timerKey, performance.now());

    this.debug('PERFORMANCE_TIMER_STARTED', {
      timer_name: name,
      correlation_id: correlationId,
    });
  }

  endTimer(name, correlationId = null, meta = {}) {
    const timerKey = correlationId ? `${name}_${correlationId}` : name;
    const startTime = this.performanceTimers.get(timerKey);

    if (!startTime) {
      this.warn('PERFORMANCE_TIMER_NOT_FOUND', {
        timer_name: name,
        correlation_id: correlationId,
      });
      return null;
    }

    const duration = performance.now() - startTime;
    this.performanceTimers.delete(timerKey);

    this.info('PERFORMANCE_TIMER_COMPLETED', {
      timer_name: name,
      duration_ms: Math.round(duration * 100) / 100,
      correlation_id: correlationId,
      ...meta,
    });

    return duration;
  }

  /**
   * Scraping-specific logging methods
   */
  scrapingStarted(requestId, siteUrl, meta = {}) {
    this.info('SCRAPING_STARTED', {
      request_id: requestId,
      site_url: siteUrl,
      correlation_id: requestId,
      ...meta,
    });
  }

  scrapingCompleted(requestId, siteUrl, results, meta = {}) {
    this.info('SCRAPING_COMPLETED', {
      request_id: requestId,
      site_url: siteUrl,
      products_found: results.products_found || 0,
      categories_found: results.categories_found || 0,
      processing_time_ms: results.processing_time_ms,
      correlation_id: requestId,
      ...meta,
    });
  }

  scrapingFailed(requestId, siteUrl, error, meta = {}) {
    this.error('SCRAPING_FAILED', {
      request_id: requestId,
      site_url: siteUrl,
      error: error,
      correlation_id: requestId,
      ...meta,
    });
  }

  /**
   * Database operation logging
   */
  dbQuery(operation, collection, query, duration, meta = {}) {
    this.debug('DATABASE_QUERY', {
      operation,
      collection,
      query: JSON.stringify(query),
      duration_ms: Math.round(duration * 100) / 100,
      ...meta,
    });

    // Log slow queries
    if (duration > 100) {
      this.warn('SLOW_DATABASE_QUERY', {
        operation,
        collection,
        duration_ms: Math.round(duration * 100) / 100,
        threshold_ms: 100,
        ...meta,
      });
    }
  }

  /**
   * Site discovery logging
   */
  siteDiscoveryStarted(queryIntent, correlationId, meta = {}) {
    this.info('SITE_DISCOVERY_STARTED', {
      query_intent: queryIntent,
      correlation_id: correlationId,
      ...meta,
    });
  }

  siteDiscoveryCompleted(queryIntent, sitesFound, correlationId, meta = {}) {
    this.info('SITE_DISCOVERY_COMPLETED', {
      query_intent: queryIntent,
      sites_found: sitesFound,
      correlation_id: correlationId,
      ...meta,
    });
  }

  /**
   * API rate limiting logging
   */
  rateLimitHit(identifier, endpoint, limit, window, meta = {}) {
    this.warn('RATE_LIMIT_HIT', {
      identifier,
      endpoint,
      limit,
      window_seconds: window,
      ...meta,
    });
  }

  /**
   * Security event logging
   */
  securityEvent(eventType, details, severity = 'medium', meta = {}) {
    const logMethod = severity === 'high' ? 'error' : 'warn';

    this[logMethod]('SECURITY_EVENT', {
      event_type: eventType,
      severity,
      details,
      ...meta,
    });
  }

  /**
   * Utility methods
   */
  generateCorrelationId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create child logger with default metadata
   */
  child(defaultMeta) {
    const childLogger = Object.create(this);
    childLogger.defaultMeta = { ...this.defaultMeta, ...defaultMeta };
    return childLogger;
  }

  /**
   * Flush logs (for testing)
   */
  async flush() {
    return new Promise((resolve) => {
      this.winstonLogger.end(() => resolve());
    });
  }
}

// Create singleton logger instance
const logger = new StructuredLogger();

// Export both the class and the instance
// Default export is the logger instance for convenience
module.exports = logger;

// Also export named exports for backward compatibility
module.exports.StructuredLogger = StructuredLogger;
module.exports.logger = logger;
module.exports.requestLogging = logger.requestMiddleware();
