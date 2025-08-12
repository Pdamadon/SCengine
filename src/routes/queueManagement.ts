/**
 * Queue Management API Routes
 * Provides monitoring and management endpoints for Redis job queues
 * Includes queue statistics, job management, and worker monitoring
 */

import express, { Request, Response, Router } from 'express';
import { UUID } from '../types/common.types';
import { QueueStats } from '../types/queue.types';

// TypeScript imports
import { queueManager } from '../services/QueueManager';

// Legacy imports (will be converted later)
const { logger } = require('../utils/logger');
const { metrics } = require('../utils/metrics');

const router: Router = express.Router();

interface QueueStatsResponse {
  success: boolean;
  queues?: Record<string, QueueStats>;
  queue?: QueueStats;
  timestamp: string;
}

interface JobResponse {
  success: boolean;
  job?: any;
  timestamp: string;
}

interface QueueActionResponse {
  success: boolean;
  message: string;
  queueName: string;
  cleanedCount?: number;
  timestamp: string;
}

interface HealthResponse {
  service: string;
  healthy: boolean;
  error?: string;
  timestamp: string;
}

interface MetricsResponse {
  success: boolean;
  summary: {
    total_jobs: number;
    waiting_jobs: number;
    active_jobs: number;
    completed_jobs: number;
    failed_jobs: number;
    queue_health: string;
  };
  queues: Record<string, QueueStats>;
  system_metrics: any;
  timestamp: string;
}

interface DashboardAlert {
  type: 'error' | 'warning' | 'info';
  queue: string;
  message: string;
}

interface DashboardResponse {
  success: boolean;
  dashboard: {
    overview: {
      total_queues: number;
      system_healthy: boolean;
      last_updated: string;
    };
    queues: Array<{
      name: string;
      status: 'paused' | 'active';
      jobs: any;
      health: 'error' | 'healthy';
    }>;
    alerts: DashboardAlert[];
  };
}

interface CleanQueueBody {
  grace?: number;
}

/**
 * Get all queue statistics
 */
router.get('/queues', async (req: Request, res: Response<QueueStatsResponse>) => {
  try {
    const stats = await queueManager.getAllQueueStats();

    res.json({
      success: true,
      queues: stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('QueueManagement: Failed to get queue stats', {
      error: errorMessage,
    });

    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
    } as any);
  }
});

/**
 * Get statistics for a specific queue
 */
router.get('/queues/:queueName', async (req: Request<{ queueName: string }>, res: Response<QueueStatsResponse>) => {
  try {
    const { queueName } = req.params;
    const stats = await queueManager.getQueueStats(queueName);

    res.json({
      success: true,
      queue: stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('QueueManagement: Failed to get queue stats', {
      queueName: req.params.queueName,
      error: errorMessage,
    });

    if (errorMessage.includes('not found')) {
      res.status(404).json({
        success: false,
        timestamp: new Date().toISOString(),
      } as any);
    } else {
      res.status(500).json({
        success: false,
        timestamp: new Date().toISOString(),
      } as any);
    }
  }
});

/**
 * Get job details from queue
 */
router.get('/queues/:queueName/jobs/:jobId', async (
  req: Request<{ queueName: string; jobId: UUID }>, 
  res: Response<JobResponse>
) => {
  try {
    const { queueName, jobId } = req.params;
    const jobStatus = await queueManager.getJobStatus(queueName, jobId);

    if (!jobStatus) {
      res.status(404).json({
        success: false,
        timestamp: new Date().toISOString(),
      } as any);
      return;
    }

    res.json({
      success: true,
      job: jobStatus,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('QueueManagement: Failed to get job status', {
      queueName: req.params.queueName,
      jobId: req.params.jobId,
      error: errorMessage,
    });

    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
    } as any);
  }
});

/**
 * Pause a queue
 */
router.post('/queues/:queueName/pause', async (
  req: Request<{ queueName: string }>, 
  res: Response<QueueActionResponse>
) => {
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('QueueManagement: Failed to pause queue', {
      queueName: req.params.queueName,
      error: errorMessage,
    });

    if (errorMessage.includes('not found')) {
      res.status(404).json({
        success: false,
        message: 'Queue not found',
        queueName: req.params.queueName,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to pause queue',
        queueName: req.params.queueName,
        timestamp: new Date().toISOString(),
      });
    }
  }
});

/**
 * Resume a queue
 */
router.post('/queues/:queueName/resume', async (
  req: Request<{ queueName: string }>, 
  res: Response<QueueActionResponse>
) => {
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('QueueManagement: Failed to resume queue', {
      queueName: req.params.queueName,
      error: errorMessage,
    });

    if (errorMessage.includes('not found')) {
      res.status(404).json({
        success: false,
        message: 'Queue not found',
        queueName: req.params.queueName,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to resume queue',
        queueName: req.params.queueName,
        timestamp: new Date().toISOString(),
      });
    }
  }
});

/**
 * Clean old jobs from a queue
 */
router.post('/queues/:queueName/clean', async (
  req: Request<{ queueName: string }, QueueActionResponse, CleanQueueBody>, 
  res: Response<QueueActionResponse>
) => {
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('QueueManagement: Failed to clean queue', {
      queueName: req.params.queueName,
      error: errorMessage,
    });

    if (errorMessage.includes('not found')) {
      res.status(404).json({
        success: false,
        message: 'Queue not found',
        queueName: req.params.queueName,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to clean queue',
        queueName: req.params.queueName,
        timestamp: new Date().toISOString(),
      });
    }
  }
});

/**
 * Get queue health status
 */
router.get('/health', async (req: Request, res: Response<HealthResponse>) => {
  try {
    const healthStatus = await queueManager.healthCheck();

    const statusCode = healthStatus.healthy ? 200 : 503;

    res.status(statusCode).json({
      service: 'queue-management',
      ...healthStatus,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('QueueManagement: Health check failed', {
      error: errorMessage,
    });

    res.status(503).json({
      service: 'queue-management',
      healthy: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Get queue metrics summary
 */
router.get('/metrics', async (req: Request, res: Response<MetricsResponse>) => {
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('QueueManagement: Failed to get metrics', {
      error: errorMessage,
    });

    res.status(500).json({
      success: false,
      summary: {
        total_jobs: 0,
        waiting_jobs: 0,
        active_jobs: 0,
        completed_jobs: 0,
        failed_jobs: 0,
        queue_health: 'error',
      },
      queues: {},
      system_metrics: {},
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Get real-time queue dashboard data
 */
router.get('/dashboard', async (req: Request, res: Response<DashboardResponse>) => {
  try {
    const queueStats = await queueManager.getAllQueueStats();
    const healthStatus = await queueManager.healthCheck();

    // Format data for dashboard display
    const alerts: DashboardAlert[] = [];

    // Add alerts for problematic queues
    for (const [name, stats] of Object.entries(queueStats)) {
      if (stats.error) {
        alerts.push({
          type: 'error',
          queue: name,
          message: `Queue error: ${stats.error}`,
        });
      } else if (stats.counts && stats.counts.failed > 10) {
        alerts.push({
          type: 'warning',
          queue: name,
          message: `High number of failed jobs: ${stats.counts.failed}`,
        });
      } else if (stats.counts && stats.counts.waiting > 100) {
        alerts.push({
          type: 'info',
          queue: name,
          message: `Queue backlog: ${stats.counts.waiting} waiting jobs`,
        });
      }
    }

    const dashboardData = {
      overview: {
        total_queues: Object.keys(queueStats).length,
        system_healthy: healthStatus.healthy,
        last_updated: new Date().toISOString(),
      },
      queues: Object.entries(queueStats).map(([name, stats]) => ({
        name: name,
        status: stats.isPaused ? 'paused' as const : 'active' as const,
        jobs: stats.counts,
        health: stats.error ? 'error' as const : 'healthy' as const,
      })),
      alerts: alerts,
    };

    res.json({
      success: true,
      dashboard: dashboardData,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('QueueManagement: Failed to get dashboard data', {
      error: errorMessage,
    });

    res.status(500).json({
      success: false,
      dashboard: {
        overview: {
          total_queues: 0,
          system_healthy: false,
          last_updated: new Date().toISOString(),
        },
        queues: [],
        alerts: [{
          type: 'error',
          queue: 'system',
          message: 'Failed to retrieve dashboard data',
        }],
      },
    });
  }
});

export default router;