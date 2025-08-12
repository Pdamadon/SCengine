/**
 * Structured JSON Logger
 * Implements industry standards logging as required by SCRAPING_REQUIREMENTS.md
 * Supports different log levels, correlation IDs, and performance metrics
 */

import winston from 'winston';
import { performance } from 'perf_hooks';
import { Request, Response, NextFunction } from 'express';

interface LogMeta {
  [key: string]: any;
  correlation_id?: string;
  error?: Error;
}

interface ScrapingResults {
  products_found?: number;
  categories_found?: number;
  processing_time_ms?: number;
}

interface DefaultMeta {
  [key: string]: any;
}

class StructuredLogger {
  private logger: winston.Logger;
  private correlationIdHeader: string;
  private performanceTimers: Map<string, number>;
  private defaultMeta?: DefaultMeta;

  constructor() {
    this.logger = this.createWinstonLogger();
    this.correlationIdHeader = 'x-correlation-id';
    this.performanceTimers = new Map();
  }

  /**
   * Create Winston logger with structured JSON format
   */
  private createWinstonLogger(): winston.Logger {
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

    return winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: logFormat,
      defaultMeta: {
        service: 'ai-shopping-scraper',
      },
      transports: [
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
      ],

      // Handle uncaught exceptions and rejections
      exceptionHandlers: [
        new winston.transports.File({ filename: 'logs/exceptions.log' }),
        new winston.transports.Console(),
      ],

      rejectionHandlers: [
        new winston.transports.File({ filename: 'logs/rejections.log' }),
        new winston.transports.Console(),
      ],
    });
  }

  /**
   * Express middleware for request logging
   */
  requestMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const startTime = performance.now();
      const correlationId = (req.headers[this.correlationIdHeader] as string) || this.generateCorrelationId();

      // Add correlation ID to request for downstream use
      (req as any).correlationId = correlationId;

      // Set correlation ID header in response
      res.setHeader('X-Correlation-ID', correlationId);

      // Log incoming request
      this.info('HTTP_REQUEST_STARTED', {
        correlation_id: correlationId,
        method: req.method,
        url: req.url,
        user_agent: req.get('User-Agent'),
        remote_addr: req.ip || req.socket.remoteAddress,
        request_size: parseInt(req.get('Content-Length') || '0'),
      });

      // Override res.end to capture response metrics
      const originalEnd = res.end;
      res.end = function(chunk?: any, encoding?: BufferEncoding | (() => void), cb?: () => void) {
        const duration = performance.now() - startTime;

        // Log response completion
        logger.info('HTTP_REQUEST_COMPLETED', {
          correlation_id: correlationId,
          method: req.method,
          url: req.url,
          status_code: res.statusCode,
          response_time_ms: Math.round(duration * 100) / 100,
          response_size: parseInt(res.get('Content-Length') || '0'),
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

        return originalEnd.call(this, chunk, encoding as BufferEncoding, cb);
      };

      next();
    };
  }

  /**
   * Log methods with correlation ID support
   */
  debug(message: string, meta: LogMeta = {}, correlationId: string | null = null): void {
    this.log('debug', message, meta, correlationId);
  }

  info(message: string, meta: LogMeta = {}, correlationId: string | null = null): void {
    this.log('info', message, meta, correlationId);
  }

  warn(message: string, meta: LogMeta = {}, correlationId: string | null = null): void {
    this.log('warn', message, meta, correlationId);
  }

  error(message: string, meta: LogMeta = {}, correlationId: string | null = null): void {
    this.log('error', message, meta, correlationId);
  }

  /**
   * Core logging method
   */
  private log(level: string, message: string, meta: LogMeta = {}, correlationId: string | null = null): void {
    const logEntry: any = {
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

    this.logger.log(level, message, logEntry);
  }

  /**
   * Performance tracking methods
   */
  startTimer(name: string, correlationId?: string): void {
    const timerKey = correlationId ? `${name}_${correlationId}` : name;
    this.performanceTimers.set(timerKey, performance.now());

    this.debug('PERFORMANCE_TIMER_STARTED', {
      timer_name: name,
      correlation_id: correlationId,
    });
  }

  endTimer(name: string, correlationId?: string, meta: LogMeta = {}): number | null {
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
  scrapingStarted(requestId: string, siteUrl: string, meta: LogMeta = {}): void {
    this.info('SCRAPING_STARTED', {
      request_id: requestId,
      site_url: siteUrl,
      correlation_id: requestId,
      ...meta,
    });
  }

  scrapingCompleted(requestId: string, siteUrl: string, results: ScrapingResults, meta: LogMeta = {}): void {
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

  scrapingFailed(requestId: string, siteUrl: string, error: Error, meta: LogMeta = {}): void {
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
  dbQuery(operation: string, collection: string, query: any, duration: number, meta: LogMeta = {}): void {
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
  siteDiscoveryStarted(queryIntent: string, correlationId: string, meta: LogMeta = {}): void {
    this.info('SITE_DISCOVERY_STARTED', {
      query_intent: queryIntent,
      correlation_id: correlationId,
      ...meta,
    });
  }

  siteDiscoveryCompleted(queryIntent: string, sitesFound: number, correlationId: string, meta: LogMeta = {}): void {
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
  rateLimitHit(identifier: string, endpoint: string, limit: number, window: number, meta: LogMeta = {}): void {
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
  securityEvent(eventType: string, details: any, severity: 'low' | 'medium' | 'high' = 'medium', meta: LogMeta = {}): void {
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
  generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create child logger with default metadata
   */
  child(defaultMeta: DefaultMeta): StructuredLogger {
    const childLogger = Object.create(this);
    childLogger.defaultMeta = { ...this.defaultMeta, ...defaultMeta };
    return childLogger;
  }

  /**
   * Flush logs (for testing)
   */
  async flush(): Promise<void> {
    return new Promise((resolve) => {
      this.logger.end(() => resolve());
    });
  }
}

// Create singleton logger instance
const logger = new StructuredLogger();

export {
  StructuredLogger,
  logger,
};