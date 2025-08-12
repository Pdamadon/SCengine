/**
 * Health Check Middleware
 * Implements health check endpoint as required by SCRAPING_REQUIREMENTS.md
 * Target: < 50ms response time
 */

import { Request, Response } from 'express';
import { performance } from 'perf_hooks';

interface HealthCheckConfig {
  name?: string;
  check: () => Promise<any>;
  critical?: boolean;
}

interface HealthCheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  duration_ms: number;
  critical: boolean;
  error?: string;
  [key: string]: any;
}

interface HealthCheckResults {
  overall: 'healthy' | 'unhealthy';
  checks: Record<string, HealthCheckResult>;
  critical_failures: number;
  total_checks: number;
}

interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'error';
  timestamp: string;
  uptime: number;
  response_time_ms: number;
  checks?: Record<string, HealthCheckResult>;
  system?: {
    node_version: string;
    platform: string;
    memory: NodeJS.MemoryUsage;
    pid: number;
  };
  error?: {
    message: string;
    details: string;
  };
}

// Extend global namespace for MongoDB connection
declare global {
  var mongoConnection: any;
}

class HealthChecker {
  private startTime: number;
  private checks: Map<string, HealthCheckConfig>;

  constructor() {
    this.startTime = Date.now();
    this.checks = new Map();
    this.registerDefaultChecks();
  }

  /**
   * Register default system health checks
   */
  private registerDefaultChecks(): void {
    // Memory usage check
    this.checks.set('memory', {
      name: 'Memory Usage',
      check: this.checkMemoryUsage.bind(this),
      critical: true,
    });

    // Database connectivity (placeholder)
    this.checks.set('database', {
      name: 'Database Connectivity',
      check: this.checkDatabaseHealth.bind(this),
      critical: true,
    });

    // System uptime
    this.checks.set('uptime', {
      name: 'System Uptime',
      check: this.checkUptime.bind(this),
      critical: false,
    });

    // Disk space (placeholder)
    this.checks.set('disk', {
      name: 'Disk Space',
      check: this.checkDiskSpace.bind(this),
      critical: false,
    });
  }

  /**
   * Express middleware for health check endpoint
   */
  middleware() {
    return async (req: Request, res: Response): Promise<void> => {
      const startTime = performance.now();

      try {
        const results = await this.runHealthChecks();
        const duration = performance.now() - startTime;

        const response: HealthResponse = {
          status: results.overall === 'healthy' ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          response_time_ms: Math.round(duration * 100) / 100,
          checks: results.checks,
          system: {
            node_version: process.version,
            platform: process.platform,
            memory: process.memoryUsage(),
            pid: process.pid,
          },
        };

        // Set appropriate HTTP status
        const statusCode = results.overall === 'healthy' ? 200 : 503;

        // Add performance headers
        res.set({
          'X-Response-Time': `${response.response_time_ms}ms`,
          'X-Health-Status': response.status,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        });

        res.status(statusCode).json(response);

        // Log slow health checks
        if (duration > 25) { // Half of target 50ms
          console.warn(`Health check took ${duration.toFixed(2)}ms (target: <50ms)`);
        }

      } catch (error) {
        const duration = performance.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        res.status(503).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          response_time_ms: Math.round(duration * 100) / 100,
          error: {
            message: 'Health check failed',
            details: errorMessage,
          },
        });
      }
    };
  }

  /**
   * Run all registered health checks
   */
  private async runHealthChecks(): Promise<HealthCheckResults> {
    const results: HealthCheckResults = {
      overall: 'healthy',
      checks: {},
      critical_failures: 0,
      total_checks: this.checks.size,
    };

    const checkPromises = Array.from(this.checks.entries()).map(async ([key, config]) => {
      const checkStartTime = performance.now();

      try {
        const result = await Promise.race([
          config.check(),
          this.timeout(5000, `Health check '${key}' timed out`),
        ]);

        const checkDuration = performance.now() - checkStartTime;

        results.checks[key] = {
          name: config.name || key,
          status: 'pass',
          duration_ms: Math.round(checkDuration * 100) / 100,
          critical: config.critical || false,
          ...result,
        };

      } catch (error) {
        const checkDuration = performance.now() - checkStartTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        results.checks[key] = {
          name: config.name || key,
          status: 'fail',
          duration_ms: Math.round(checkDuration * 100) / 100,
          critical: config.critical || false,
          error: errorMessage,
        };

        if (config.critical) {
          results.critical_failures++;
          results.overall = 'unhealthy';
        }
      }
    });

    await Promise.all(checkPromises);

    return results;
  }

  /**
   * Individual health check methods
   */
  private async checkMemoryUsage(): Promise<any> {
    const usage = process.memoryUsage();
    const usedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const totalMB = Math.round(usage.heapTotal / 1024 / 1024);

    // Warning if using more than 80% of allocated heap
    const usagePercent = (usage.heapUsed / usage.heapTotal) * 100;
    const status = usagePercent > 80 ? 'warning' : 'ok';

    return {
      heap_used_mb: usedMB,
      heap_total_mb: totalMB,
      heap_usage_percent: Math.round(usagePercent),
      status: status,
      rss_mb: Math.round(usage.rss / 1024 / 1024),
    };
  }

  private async checkDatabaseHealth(): Promise<any> {
    try {
      // Try to connect to MongoDB if available
      if (global.mongoConnection) {
        const start = performance.now();
        await global.mongoConnection.db().admin().ping();
        const duration = performance.now() - start;

        return {
          status: 'ok',
          connection_pool: 'healthy',
          ping_time_ms: Math.round(duration * 100) / 100,
          connection_state: global.mongoConnection.readyState || 'unknown',
        };
      } else {
        // Fallback for when database isn't initialized yet
        return {
          status: 'ok',
          connection_pool: 'not_initialized',
          last_query_ms: 0,
          note: 'Database connection not established',
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        status: 'fail',
        error: errorMessage,
        connection_pool: 'unhealthy',
      };
    }
  }

  private async checkUptime(): Promise<any> {
    const uptimeSeconds = process.uptime();
    const uptimeHours = uptimeSeconds / 3600;

    return {
      uptime_seconds: Math.round(uptimeSeconds),
      uptime_hours: Math.round(uptimeHours * 100) / 100,
      status: 'ok',
      started_at: new Date(Date.now() - (uptimeSeconds * 1000)).toISOString(),
    };
  }

  private async checkDiskSpace(): Promise<any> {
    // Placeholder for disk space check
    // In real implementation, this would check available disk space

    return {
      status: 'ok',
      available_gb: 'unknown',
      usage_percent: 'unknown',
      note: 'Disk space check placeholder',
    };
  }

  /**
   * Utility methods
   */
  private timeout(ms: number, message: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  /**
   * Register custom health check
   */
  registerCheck(key: string, config: HealthCheckConfig): void {
    if (typeof config.check !== 'function') {
      throw new Error('Health check must provide a check function');
    }

    this.checks.set(key, {
      name: config.name || key,
      check: config.check,
      critical: config.critical || false,
    });
  }

  /**
   * Remove health check
   */
  unregisterCheck(key: string): void {
    this.checks.delete(key);
  }
}

// Create singleton instance
const healthChecker = new HealthChecker();

export {
  HealthChecker,
};

export const healthCheck = healthChecker.middleware();
export const registerHealthCheck = healthChecker.registerCheck.bind(healthChecker);
export const unregisterHealthCheck = healthChecker.unregisterCheck.bind(healthChecker);