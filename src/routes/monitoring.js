/**
 * Monitoring Routes
 * Provides endpoints for metrics, health checks, and monitoring dashboards
 */

const express = require('express');
const {
  metricsEndpoint,
  monitoringSummary,
  updateHealthMetrics,
} = require('../middleware/monitoring');
const { healthCheck } = require('../middleware/healthCheck');
const { logger } = require('../utils/logger');
const { rateLimiter } = require('../utils/rateLimiter');

const router = express.Router();

/**
 * Health check endpoint
 * GET /health
 */
router.get('/health', healthCheck);

/**
 * Metrics endpoint (Prometheus compatible)
 * GET /metrics?format=prometheus
 * GET /metrics?format=json
 */
router.get('/metrics', metricsEndpoint());

/**
 * Monitoring summary dashboard
 * GET /monitoring/summary
 */
router.get('/monitoring/summary', monitoringSummary());

/**
 * Monitoring status endpoint
 * GET /monitoring/status
 */
router.get('/monitoring/status', (req, res) => {
  try {
    const status = {
      monitoring: {
        status: 'active',
        version: '1.0.0',
        features: [
          'structured_logging',
          'prometheus_metrics',
          'health_checks',
          'performance_tracking',
          'error_tracking',
          'rate_limit_monitoring',
        ],
      },
      endpoints: {
        health: '/health',
        metrics: '/metrics',
        summary: '/monitoring/summary',
        logs: '/monitoring/logs',
      },
      system: {
        node_version: process.version,
        platform: process.platform,
        uptime_seconds: Math.round(process.uptime()),
        memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        pid: process.pid,
      },
      timestamp: new Date().toISOString(),
    };

    res.json(status);

  } catch (error) {
    logger.error('MONITORING_STATUS_ERROR', {
      error: error,
      correlation_id: req.correlationId,
    });

    res.status(500).json({
      error: 'MONITORING_STATUS_FAILED',
      message: 'Failed to retrieve monitoring status',
      timestamp: new Date().toISOString(),
      request_id: req.correlationId,
    });
  }
});

/**
 * Recent logs endpoint (for debugging)
 * GET /monitoring/logs?lines=100&level=error
 */
router.get('/monitoring/logs', (req, res) => {
  const fs = require('fs');
  const path = require('path');

  try {
    const lines = parseInt(req.query.lines) || 50;
    const level = req.query.level || 'all';
    const logFile = level === 'error' ? 'error.log' : 'combined.log';
    const logPath = path.join(process.cwd(), 'logs', logFile);

    if (!fs.existsSync(logPath)) {
      return res.json({
        logs: [],
        message: 'Log file not found',
        log_file: logFile,
      });
    }

    // Read last N lines from log file
    const logContent = fs.readFileSync(logPath, 'utf8');
    const logLines = logContent.trim().split('\n').slice(-lines);

    // Parse JSON log entries
    const parsedLogs = logLines
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return { message: line, unparsed: true };
        }
      })
      .filter(log => {
        if (level === 'all') {return true;}
        return log.level === level.toUpperCase();
      });

    res.json({
      logs: parsedLogs,
      count: parsedLogs.length,
      log_file: logFile,
      lines_requested: lines,
      level_filter: level,
    });

  } catch (error) {
    logger.error('LOGS_ENDPOINT_ERROR', {
      error: error,
      correlation_id: req.correlationId,
    });

    res.status(500).json({
      error: 'LOGS_RETRIEVAL_FAILED',
      message: 'Failed to retrieve logs',
      timestamp: new Date().toISOString(),
      request_id: req.correlationId,
    });
  }
});

/**
 * Configuration endpoint
 * GET /monitoring/config
 */
router.get('/monitoring/config', (req, res) => {
  try {
    const config = {
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: 'json',
        outputs: ['console', 'file'],
        retention_days: 30,
        max_file_size_mb: 100,
      },
      metrics: {
        format: 'prometheus',
        collection_interval_seconds: 30,
        retention_hours: 24,
      },
      health_checks: {
        timeout_seconds: 5,
        interval_seconds: 30,
        critical_checks: ['memory', 'database'],
      },
      performance: {
        slow_request_threshold_ms: 200,
        slow_query_threshold_ms: 100,
        circuit_breaker_enabled: true,
      },
      security: {
        rate_limiting: true,
        request_validation: true,
        suspicious_pattern_detection: true,
      },
    };

    res.json(config);

  } catch (error) {
    logger.error('MONITORING_CONFIG_ERROR', {
      error: error,
      correlation_id: req.correlationId,
    });

    res.status(500).json({
      error: 'CONFIG_RETRIEVAL_FAILED',
      message: 'Failed to retrieve monitoring configuration',
      timestamp: new Date().toISOString(),
      request_id: req.correlationId,
    });
  }
});

/**
 * Rate limiting statistics endpoint
 * GET /rate-limits
 * GET /rate-limits?domain=example.com
 */
router.get('/rate-limits', (req, res) => {
  try {
    const { domain } = req.query;

    const stats = rateLimiter.getStats(domain || null);

    res.json({
      rate_limiting: {
        enabled: true,
        adaptive: true,
        jitter_enabled: true,
        status: 'active',
      },
      domain_stats: stats,
      global_summary: {
        total_domains: Object.keys(stats).length,
        domains_rate_limited: Object.values(stats).filter(s => s && s.isRateLimited).length,
        total_requests: Object.values(stats).reduce((sum, s) => sum + (s ? s.requestCount : 0), 0),
        total_successes: Object.values(stats).reduce((sum, s) => sum + (s ? s.successCount : 0), 0),
        overall_success_rate: (() => {
          const totalReq = Object.values(stats).reduce((sum, s) => sum + (s ? s.requestCount : 0), 0);
          const totalSuccess = Object.values(stats).reduce((sum, s) => sum + (s ? s.successCount : 0), 0);
          return totalReq > 0 ? ((totalSuccess / totalReq) * 100).toFixed(1) + '%' : '0%';
        })(),
      },
      timestamp: new Date().toISOString(),
      request_id: req.correlationId,
    });

  } catch (error) {
    logger.error('RATE_LIMIT_STATS_ERROR', {
      error: error,
      correlation_id: req.correlationId,
    });

    res.status(500).json({
      error: 'RATE_LIMIT_STATS_FAILED',
      message: 'Failed to retrieve rate limiting statistics',
      timestamp: new Date().toISOString(),
      request_id: req.correlationId,
    });
  }
});

/**
 * Rate limiting configuration endpoint
 * POST /rate-limits/configure
 */
router.post('/rate-limits/configure', (req, res) => {
  try {
    const { domain, baseDelay, minDelay, maxDelay, reset } = req.body;

    if (!domain) {
      return res.status(400).json({
        error: 'MISSING_DOMAIN',
        message: 'Domain parameter is required',
        timestamp: new Date().toISOString(),
      });
    }

    if (reset) {
      rateLimiter.resetDomain(domain);
      logger.info('Rate limiting reset for domain', { domain, correlation_id: req.correlationId });
    } else {
      const config = {};
      if (baseDelay !== undefined) {config.baseDelay = parseInt(baseDelay);}
      if (minDelay !== undefined) {config.minDelay = parseInt(minDelay);}
      if (maxDelay !== undefined) {config.maxDelay = parseInt(maxDelay);}

      rateLimiter.configureDomain(domain, config);
      logger.info('Rate limiting configured for domain', { domain, config, correlation_id: req.correlationId });
    }

    const updatedStats = rateLimiter.getStats(domain);

    res.json({
      success: true,
      message: reset ? 'Rate limiting reset' : 'Rate limiting configured',
      domain,
      configuration: updatedStats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('RATE_LIMIT_CONFIG_ERROR', {
      error: error,
      correlation_id: req.correlationId,
    });

    res.status(500).json({
      error: 'RATE_LIMIT_CONFIG_FAILED',
      message: 'Failed to configure rate limiting',
      timestamp: new Date().toISOString(),
      request_id: req.correlationId,
    });
  }
});

module.exports = router;
