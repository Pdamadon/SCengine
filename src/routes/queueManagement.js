/**
 * Queue Management API Routes
 * Provides monitoring and management endpoints for Redis job queues
 * Includes queue statistics, job management, and worker monitoring
 */

const express = require('express');
const { queueManager } = require('../services/QueueManager');
const { logger } = require('../utils/logger');
const { metrics } = require('../utils/metrics');

const router = express.Router();

/**
 * Get all queue statistics
 */
router.get('/queues', async (req, res) => {
  try {
    const stats = await queueManager.getAllQueueStats();

    res.json({
      success: true,
      queues: stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('QueueManagement: Failed to get queue stats', {
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve queue statistics',
      message: error.message,
    });
  }
});

/**
 * Get statistics for a specific queue
 */
router.get('/queues/:queueName', async (req, res) => {
  try {
    const { queueName } = req.params;
    const stats = await queueManager.getQueueStats(queueName);

    res.json({
      success: true,
      queue: stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('QueueManagement: Failed to get queue stats', {
      queueName: req.params.queueName,
      error: error.message,
    });

    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Queue not found',
        queueName: req.params.queueName,
      });
    } else {
      res.status(500).json({
        error: 'Failed to retrieve queue statistics',
        message: error.message,
      });
    }
  }
});

/**
 * Get job details from queue
 */
router.get('/queues/:queueName/jobs/:jobId', async (req, res) => {
  try {
    const { queueName, jobId } = req.params;
    const jobStatus = await queueManager.getJobStatus(queueName, jobId);

    if (!jobStatus) {
      return res.status(404).json({
        error: 'Job not found in queue',
        queueName: queueName,
        jobId: jobId,
      });
    }

    res.json({
      success: true,
      job: jobStatus,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('QueueManagement: Failed to get job status', {
      queueName: req.params.queueName,
      jobId: req.params.jobId,
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve job status',
      message: error.message,
    });
  }
});

/**
 * Pause a queue
 */
router.post('/queues/:queueName/pause', async (req, res) => {
  try {
    const { queueName } = req.params;
    await queueManager.pauseQueue(queueName);

    logger.info('QueueManagement: Queue paused', { queueName });

    res.json({
      success: true,
      message: `Queue '${queueName}' has been paused`,
      queueName: queueName,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('QueueManagement: Failed to pause queue', {
      queueName: req.params.queueName,
      error: error.message,
    });

    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Queue not found',
        queueName: req.params.queueName,
      });
    } else {
      res.status(500).json({
        error: 'Failed to pause queue',
        message: error.message,
      });
    }
  }
});

/**
 * Resume a queue
 */
router.post('/queues/:queueName/resume', async (req, res) => {
  try {
    const { queueName } = req.params;
    await queueManager.resumeQueue(queueName);

    logger.info('QueueManagement: Queue resumed', { queueName });

    res.json({
      success: true,
      message: `Queue '${queueName}' has been resumed`,
      queueName: queueName,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('QueueManagement: Failed to resume queue', {
      queueName: req.params.queueName,
      error: error.message,
    });

    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Queue not found',
        queueName: req.params.queueName,
      });
    } else {
      res.status(500).json({
        error: 'Failed to resume queue',
        message: error.message,
      });
    }
  }
});

/**
 * Clean old jobs from a queue
 */
router.post('/queues/:queueName/clean', async (req, res) => {
  try {
    const { queueName } = req.params;
    const { grace = 5000 } = req.body;

    const cleanedCount = await queueManager.cleanQueue(queueName, grace);

    logger.info('QueueManagement: Queue cleaned', {
      queueName,
      cleanedCount,
      grace,
    });

    res.json({
      success: true,
      message: `Cleaned ${cleanedCount} old jobs from queue '${queueName}'`,
      queueName: queueName,
      cleanedCount: cleanedCount,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('QueueManagement: Failed to clean queue', {
      queueName: req.params.queueName,
      error: error.message,
    });

    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Queue not found',
        queueName: req.params.queueName,
      });
    } else {
      res.status(500).json({
        error: 'Failed to clean queue',
        message: error.message,
      });
    }
  }
});

/**
 * Get queue health status
 */
router.get('/health', async (req, res) => {
  try {
    const healthStatus = await queueManager.healthCheck();

    const statusCode = healthStatus.healthy ? 200 : 503;

    res.status(statusCode).json({
      service: 'queue-management',
      ...healthStatus,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('QueueManagement: Health check failed', {
      error: error.message,
    });

    res.status(503).json({
      service: 'queue-management',
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Get queue metrics summary
 */
router.get('/metrics', async (req, res) => {
  try {
    const queueStats = await queueManager.getAllQueueStats();
    const systemMetrics = metrics.getSummary();

    // Calculate aggregate metrics
    let totalJobs = 0;
    let totalWaiting = 0;
    let totalActive = 0;
    let totalCompleted = 0;
    let totalFailed = 0;

    for (const [queueName, stats] of Object.entries(queueStats)) {
      if (stats.counts) {
        totalWaiting += stats.counts.waiting;
        totalActive += stats.counts.active;
        totalCompleted += stats.counts.completed;
        totalFailed += stats.counts.failed;
        totalJobs += Object.values(stats.counts).reduce((a, b) => a + b, 0);
      }
    }

    res.json({
      success: true,
      summary: {
        total_jobs: totalJobs,
        waiting_jobs: totalWaiting,
        active_jobs: totalActive,
        completed_jobs: totalCompleted,
        failed_jobs: totalFailed,
        queue_health: Object.keys(queueStats).length > 0 ? 'healthy' : 'no_queues',
      },
      queues: queueStats,
      system_metrics: systemMetrics,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('QueueManagement: Failed to get metrics', {
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve queue metrics',
      message: error.message,
    });
  }
});

/**
 * Get real-time queue dashboard data
 */
router.get('/dashboard', async (req, res) => {
  try {
    const queueStats = await queueManager.getAllQueueStats();
    const healthStatus = await queueManager.healthCheck();

    // Format data for dashboard display
    const dashboardData = {
      overview: {
        total_queues: Object.keys(queueStats).length,
        system_healthy: healthStatus.healthy,
        last_updated: new Date().toISOString(),
      },
      queues: Object.entries(queueStats).map(([name, stats]) => ({
        name: name,
        status: stats.isPaused ? 'paused' : 'active',
        jobs: stats.counts,
        health: stats.error ? 'error' : 'healthy',
      })),
      alerts: [],
    };

    // Add alerts for problematic queues
    for (const [name, stats] of Object.entries(queueStats)) {
      if (stats.error) {
        dashboardData.alerts.push({
          type: 'error',
          queue: name,
          message: `Queue error: ${stats.error}`,
        });
      } else if (stats.counts && stats.counts.failed > 10) {
        dashboardData.alerts.push({
          type: 'warning',
          queue: name,
          message: `High number of failed jobs: ${stats.counts.failed}`,
        });
      } else if (stats.counts && stats.counts.waiting > 100) {
        dashboardData.alerts.push({
          type: 'info',
          queue: name,
          message: `Queue backlog: ${stats.counts.waiting} waiting jobs`,
        });
      }
    }

    res.json({
      success: true,
      dashboard: dashboardData,
    });

  } catch (error) {
    logger.error('QueueManagement: Failed to get dashboard data', {
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve dashboard data',
      message: error.message,
    });
  }
});

module.exports = router;
