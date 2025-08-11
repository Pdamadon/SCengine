/**
 * Health Check Middleware
 * Implements health check endpoint as required by SCRAPING_REQUIREMENTS.md
 * Target: < 50ms response time
 */

const { performance } = require('perf_hooks');

class HealthChecker {
  constructor() {
    this.startTime = Date.now();
    this.checks = new Map();
    this.registerDefaultChecks();
  }

  /**
   * Register default system health checks
   */
  registerDefaultChecks() {
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
    return async (req, res) => {
      const startTime = performance.now();

      try {
        const results = await this.runHealthChecks();
        const duration = performance.now() - startTime;

        const response = {
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

        res.status(503).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          response_time_ms: Math.round(duration * 100) / 100,
          error: {
            message: 'Health check failed',
            details: error.message,
          },
        });
      }
    };
  }

  /**
   * Run all registered health checks
   */
  async runHealthChecks() {
    const results = {
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
          name: config.name,
          status: 'pass',
          duration_ms: Math.round(checkDuration * 100) / 100,
          critical: config.critical,
          ...result,
        };

      } catch (error) {
        const checkDuration = performance.now() - checkStartTime;

        results.checks[key] = {
          name: config.name,
          status: 'fail',
          duration_ms: Math.round(checkDuration * 100) / 100,
          critical: config.critical,
          error: error.message,
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
  async checkMemoryUsage() {
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

  async checkDatabaseHealth() {
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
      return {
        status: 'fail',
        error: error.message,
        connection_pool: 'unhealthy',
      };
    }
  }

  async checkUptime() {
    const uptimeSeconds = process.uptime();
    const uptimeHours = uptimeSeconds / 3600;

    return {
      uptime_seconds: Math.round(uptimeSeconds),
      uptime_hours: Math.round(uptimeHours * 100) / 100,
      status: 'ok',
      started_at: new Date(Date.now() - (uptimeSeconds * 1000)).toISOString(),
    };
  }

  async checkDiskSpace() {
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
  timeout(ms, message) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  /**
   * Register custom health check
   */
  registerCheck(key, config) {
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
  unregisterCheck(key) {
    this.checks.delete(key);
  }
}

// Create singleton instance
const healthChecker = new HealthChecker();

module.exports = {
  HealthChecker,
  healthCheck: healthChecker.middleware(),
  registerHealthCheck: healthChecker.registerCheck.bind(healthChecker),
  unregisterHealthCheck: healthChecker.unregisterCheck.bind(healthChecker),
};
