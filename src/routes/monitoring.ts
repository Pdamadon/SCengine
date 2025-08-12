/**
 * Monitoring Routes
 * Provides endpoints for metrics, health checks, and monitoring dashboards
 */

import express, { Request, Response, Router } from 'express';
import fs from 'fs';
import path from 'path';

// TypeScript imports
import {
  metricsEndpoint,
  monitoringSummary,
  updateHealthMetrics,
} from '../middleware/monitoring';
import { healthCheck } from '../middleware/healthCheck';

// Legacy imports (will be converted later)
const { logger } = require('../utils/logger');

const router: Router = express.Router();

// Extend Request interface
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

interface MonitoringStatus {
  monitoring: {
    status: string;
    version: string;
    features: string[];
  };
  endpoints: {
    health: string;
    metrics: string;
    summary: string;
    logs: string;
  };
  system: {
    node_version: string;
    platform: string;
    uptime_seconds: number;
    memory_usage_mb: number;
    pid: number;
  };
  timestamp: string;
}

interface LogsQuery {
  lines?: string;
  level?: string;
}

interface LogEntry {
  message: string;
  level?: string;
  timestamp?: string;
  unparsed?: boolean;
  [key: string]: any;
}

interface LogsResponse {
  logs: LogEntry[];
  count: number;
  log_file: string;
  lines_requested: number;
  level_filter: string;
}

interface MonitoringConfig {
  logging: {
    level: string;
    format: string;
    outputs: string[];
    retention_days: number;
    max_file_size_mb: number;
  };
  metrics: {
    format: string;
    collection_interval_seconds: number;
    retention_hours: number;
  };
  health_checks: {
    timeout_seconds: number;
    interval_seconds: number;
    critical_checks: string[];
  };
  performance: {
    slow_request_threshold_ms: number;
    slow_query_threshold_ms: number;
    circuit_breaker_enabled: boolean;
  };
  security: {
    rate_limiting: boolean;
    request_validation: boolean;
    suspicious_pattern_detection: boolean;
  };
}

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
router.get('/monitoring/status', (req: Request, res: Response<MonitoringStatus>) => {
  try {
    const status: MonitoringStatus = {
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
    } as any);
  }
});

/**
 * Recent logs endpoint (for debugging)
 * GET /monitoring/logs?lines=100&level=error
 */
router.get('/monitoring/logs', (req: Request<{}, LogsResponse, {}, LogsQuery>, res: Response<LogsResponse>) => {
  try {
    const lines = parseInt(req.query.lines || '50');
    const level = req.query.level || 'all';
    const logFile = level === 'error' ? 'error.log' : 'combined.log';
    const logPath = path.join(process.cwd(), 'logs', logFile);

    if (!fs.existsSync(logPath)) {
      res.json({
        logs: [],
        count: 0,
        log_file: logFile,
        lines_requested: lines,
        level_filter: level,
      });
      return;
    }

    // Read last N lines from log file
    const logContent = fs.readFileSync(logPath, 'utf8');
    const logLines = logContent.trim().split('\n').slice(-lines);

    // Parse JSON log entries
    const parsedLogs: LogEntry[] = logLines
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return { message: line, unparsed: true };
        }
      })
      .filter(log => {
        if (level === 'all') { return true; }
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
    } as any);
  }
});

/**
 * Configuration endpoint
 * GET /monitoring/config
 */
router.get('/monitoring/config', (req: Request, res: Response<MonitoringConfig>) => {
  try {
    const config: MonitoringConfig = {
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
    } as any);
  }
});

export default router;