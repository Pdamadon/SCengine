/**
 * Server-Sent Events API Routes
 * Provides streaming endpoints for real-time job updates
 * RESTful SSE endpoints with subscription management
 */

import express, { Request, Response, Router } from 'express';
import { UUID } from '../types/common.types';

// TypeScript imports
import { ServerSentEventsService } from '../services/ServerSentEventsService';

// Legacy imports (will be converted later)
const { validateJobId } = require('../middleware/validation');
const { performanceMonitoring } = require('../middleware/monitoring');
const { logger } = require('../utils/logger');

const router: Router = express.Router();

// Extend Request interface to include SSE connection ID
declare global {
  namespace Express {
    interface Request {
      sseConnectionId?: string;
    }
  }
}

interface SSEResponse {
  success: boolean;
  message: string;
  jobId?: UUID;
  connectionId?: string;
  error?: string;
  timestamp: string;
}

interface SSEHealthResponse {
  service: string;
  initialized: boolean;
  connections: {
    total: number;
    active: number;
    subscriptions: {
      jobs: number;
      queueStats: number;
    };
  };
  timestamp: string;
}

interface SSEErrorResponse {
  success: boolean;
  error: string;
  message: string;
  timestamp: string;
}

/**
 * Initialize SSE routes with ServerSentEventsService
 */
const initializeSSERoutes = (sseService: ServerSentEventsService): Router => {
  /**
   * @swagger
   * /api/v1/sse/connect:
   *   get:
   *     summary: Establish SSE connection for real-time updates
   *     tags: [Server-Sent Events]
   *     produces:
   *       - text/event-stream
   *     responses:
   *       200:
   *         description: SSE connection established
   *         content:
   *           text/event-stream:
   *             schema:
   *               type: string
   *               example: |
   *                 event: connected
   *                 data: {"connectionId":"sse_123456789_abc123","serverTime":"2024-01-01T00:00:00Z","message":"SSE connection established"}
   *       503:
   *         description: SSE service not available
   */
  router.get('/connect',
    performanceMonitoring('sse_connect'),
    sseService.createConnection(),
    (req: Request, res: Response) => {
      // Connection is established by middleware
      // Keep connection alive - it will be closed by client or timeout
    }
  );

  /**
   * @swagger
   * /api/v1/sse/jobs/{jobId}/subscribe:
   *   post:
   *     summary: Subscribe to job updates via SSE
   *     tags: [Server-Sent Events]
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: header
   *         name: X-SSE-Connection-ID
   *         required: true
   *         schema:
   *           type: string
   *         description: SSE connection ID from /connect endpoint
   *     responses:
   *       200:
   *         description: Subscription successful
   *       400:
   *         description: Invalid job ID or missing connection
   *       404:
   *         description: SSE connection not found
   */
  router.post('/jobs/:jobId/subscribe',
    validateJobId(),
    performanceMonitoring('sse_job_subscribe'),
    (req: Request<{ jobId: UUID }>, res: Response<SSEResponse | SSEErrorResponse>) => {
      try {
        const jobId = req.params.jobId;
        const connectionId = req.headers['x-sse-connection-id'] as string || req.sseConnectionId;

        if (!connectionId) {
          res.status(400).json({
            success: false,
            error: 'Missing SSE connection ID',
            message: 'Include X-SSE-Connection-ID header or establish connection first',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const subscribed = sseService.subscribeToJob(connectionId, jobId);

        if (!subscribed) {
          res.status(404).json({
            success: false,
            error: 'SSE connection not found',
            message: 'Connection may have expired or been closed',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        res.json({
          success: true,
          message: 'Subscribed to job updates',
          jobId: jobId,
          connectionId: connectionId,
          timestamp: new Date().toISOString(),
        });

        logger.info('SSE job subscription created', { jobId, connectionId });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('SSE job subscription failed:', error);
        res.status(500).json({
          success: false,
          error: 'Subscription failed',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
      }
    }
  );

  /**
   * @swagger
   * /api/v1/sse/queue-stats/subscribe:
   *   post:
   *     summary: Subscribe to queue statistics via SSE
   *     tags: [Server-Sent Events]
   *     parameters:
   *       - in: header
   *         name: X-SSE-Connection-ID
   *         required: true
   *         schema:
   *           type: string
   *         description: SSE connection ID from /connect endpoint
   *     responses:
   *       200:
   *         description: Subscription successful
   *       400:
   *         description: Missing connection ID
   *       404:
   *         description: SSE connection not found
   */
  router.post('/queue-stats/subscribe',
    performanceMonitoring('sse_queue_subscribe'),
    (req: Request, res: Response<SSEResponse | SSEErrorResponse>) => {
      try {
        const connectionId = req.headers['x-sse-connection-id'] as string || req.sseConnectionId;

        if (!connectionId) {
          res.status(400).json({
            success: false,
            error: 'Missing SSE connection ID',
            message: 'Include X-SSE-Connection-ID header or establish connection first',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const subscribed = sseService.subscribeToQueueStats(connectionId);

        if (!subscribed) {
          res.status(404).json({
            success: false,
            error: 'SSE connection not found',
            message: 'Connection may have expired or been closed',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        res.json({
          success: true,
          message: 'Subscribed to queue statistics',
          connectionId: connectionId,
          timestamp: new Date().toISOString(),
        });

        logger.info('SSE queue stats subscription created', { connectionId });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('SSE queue stats subscription failed:', error);
        res.status(500).json({
          success: false,
          error: 'Subscription failed',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
      }
    }
  );

  /**
   * @swagger
   * /api/v1/sse/jobs/{jobId}/stream:
   *   get:
   *     summary: Direct SSE stream for specific job (connect + subscribe in one request)
   *     tags: [Server-Sent Events]
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     produces:
   *       - text/event-stream
   *     responses:
   *       200:
   *         description: SSE stream established and subscribed to job
   *         content:
   *           text/event-stream:
   *             schema:
   *               type: string
   *       400:
   *         description: Invalid job ID
   */
  router.get('/jobs/:jobId/stream',
    validateJobId(),
    performanceMonitoring('sse_job_stream'),
    sseService.createConnection(),
    (req: Request<{ jobId: UUID }>, res: Response) => {
      try {
        const jobId = req.params.jobId;
        const connectionId = req.sseConnectionId;

        if (!connectionId) {
          sseService.sendEvent(res, 'error', {
            error: 'Connection ID not found',
            timestamp: new Date().toISOString(),
          });
          res.end();
          return;
        }

        // Auto-subscribe to the job
        const subscribed = sseService.subscribeToJob(connectionId, jobId);

        if (!subscribed) {
          // Send error event and close connection
          sseService.sendEvent(res, 'error', {
            error: 'Failed to subscribe to job',
            jobId: jobId,
            timestamp: new Date().toISOString(),
          });
          res.end();
          return;
        }

        // Send confirmation event
        sseService.sendEvent(res, 'stream_ready', {
          jobId: jobId,
          connectionId: connectionId,
          message: 'Streaming job updates',
          timestamp: new Date().toISOString(),
        });

        logger.info('SSE job stream established', { jobId, connectionId });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('SSE job stream failed:', error);
        sseService.sendEvent(res, 'error', {
          error: 'Stream setup failed',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        res.end();
      }
    }
  );

  /**
   * @swagger
   * /api/v1/sse/queue-stats/stream:
   *   get:
   *     summary: Direct SSE stream for queue statistics
   *     tags: [Server-Sent Events]
   *     produces:
   *       - text/event-stream
   *     responses:
   *       200:
   *         description: SSE stream established for queue stats
   *         content:
   *           text/event-stream:
   *             schema:
   *               type: string
   */
  router.get('/queue-stats/stream',
    performanceMonitoring('sse_queue_stream'),
    sseService.createConnection(),
    (req: Request, res: Response) => {
      try {
        const connectionId = req.sseConnectionId;

        if (!connectionId) {
          sseService.sendEvent(res, 'error', {
            error: 'Connection ID not found',
            timestamp: new Date().toISOString(),
          });
          res.end();
          return;
        }

        // Auto-subscribe to queue stats
        const subscribed = sseService.subscribeToQueueStats(connectionId);

        if (!subscribed) {
          // Send error event and close connection
          sseService.sendEvent(res, 'error', {
            error: 'Failed to subscribe to queue stats',
            timestamp: new Date().toISOString(),
          });
          res.end();
          return;
        }

        // Send confirmation event
        sseService.sendEvent(res, 'stream_ready', {
          connectionId: connectionId,
          message: 'Streaming queue statistics',
          timestamp: new Date().toISOString(),
        });

        logger.info('SSE queue stats stream established', { connectionId });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('SSE queue stats stream failed:', error);
        sseService.sendEvent(res, 'error', {
          error: 'Stream setup failed',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        res.end();
      }
    }
  );

  /**
   * @swagger
   * /api/v1/sse/health:
   *   get:
   *     summary: SSE service health check
   *     tags: [Server-Sent Events]
   *     responses:
   *       200:
   *         description: Service health status
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 service:
   *                   type: string
   *                 initialized:
   *                   type: boolean
   *                 connections:
   *                   type: object
   *                 timestamp:
   *                   type: string
   */
  router.get('/health', (req: Request, res: Response<SSEHealthResponse>) => {
    const health = sseService.getHealthStatus();
    res.json(health);
  });

  return router;
};

export default initializeSSERoutes;