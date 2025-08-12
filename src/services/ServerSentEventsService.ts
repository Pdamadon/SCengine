/**
 * Server-Sent Events (SSE) Service
 * Provides unidirectional real-time communication for job status updates
 * Complements the WebSocket service for clients preferring HTTP-based streaming
 */

import { EventEmitter } from 'events';
import { Request, Response, NextFunction } from 'express';
import { UUID, Timestamp } from '../types/common.types';

// Legacy imports (will be converted later)
const { logger } = require('../utils/logger');
const { metrics } = require('../utils/metrics');

interface ClientInfo {
  ip: string;
  userAgent?: string;
  connectionTime: Timestamp;
  lastActivity: Timestamp;
}

interface ConnectionData {
  res: Response;
  clientInfo: ClientInfo;
  subscriptions: Set<string>;
}

interface JobStatusData {
  status: string;
  previousStatus?: string;
  timestamp?: string;
  [key: string]: any;
}

interface JobProgressData {
  progress: number;
  status: string;
  message?: string;
  timestamp?: string;
  [key: string]: any;
}

interface JobCompletionData {
  status: string;
  duration?: number;
  results?: any;
  timestamp?: string;
  [key: string]: any;
}

interface QueueStatsData {
  [key: string]: any;
}

// Extend Request interface to include SSE connection ID
declare global {
  namespace Express {
    interface Request {
      sseConnectionId?: string;
    }
  }
}

class ServerSentEventsService extends EventEmitter {
  private connections: Map<string, ConnectionData> = new Map();
  private jobSubscriptions: Map<UUID, Set<string>> = new Map(); // jobId -> Set of connectionIds
  private queueStatsSubscribers: Set<string> = new Set(); // connectionIds subscribed to queue stats
  public isInitialized: boolean = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initialize();
  }

  /**
   * Initialize the SSE service
   */
  async initialize(): Promise<void> {
    try {
      // Start heartbeat to keep connections alive
      this.startHeartbeat();
      
      this.isInitialized = true;
      logger.info('ServerSentEventsService initialized successfully');
      
      // Initialize metrics
      metrics.createGauge('sse_connections_active', 'Active SSE connections');
      metrics.createCounter('sse_events_sent', 'SSE events sent', ['event_type']);
      metrics.createCounter('sse_connections_opened', 'SSE connections opened');
      metrics.createCounter('sse_connections_closed', 'SSE connections closed', ['reason']);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to initialize ServerSentEventsService:', errorMessage);
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Create SSE connection handler middleware
   */
  createConnection() {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        const connectionId = this.generateConnectionId();
        
        // Set SSE headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control',
          'X-Accel-Buffering': 'no', // Disable nginx buffering
        });

        // Store connection info
        const clientInfo: ClientInfo = {
          ip: req.ip || req.socket.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent'),
          connectionTime: new Date(),
          lastActivity: new Date(),
        };

        this.connections.set(connectionId, {
          res: res,
          clientInfo: clientInfo,
          subscriptions: new Set(),
        });

        // Send initial connection event
        this.sendEvent(res, 'connected', {
          connectionId: connectionId,
          serverTime: new Date().toISOString(),
          message: 'SSE connection established',
        });

        // Handle client disconnect
        req.on('close', () => {
          this.handleDisconnect(connectionId, 'client_disconnect');
        });

        req.on('error', (error: Error) => {
          logger.warn('SSE connection error', { connectionId, error: error.message });
          this.handleDisconnect(connectionId, 'connection_error');
        });

        // Update metrics
        metrics.incrementCounter('sse_connections_opened');
        metrics.setGauge('sse_connections_active', this.connections.size);

        logger.info('SSE connection established', {
          connectionId,
          clientIP: clientInfo.ip,
          totalConnections: this.connections.size,
        });

        // Store connection ID in request for use in route handlers
        req.sseConnectionId = connectionId;
        next();

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to create SSE connection:', errorMessage);
        res.status(500).json({
          success: false,
          error: 'Failed to establish SSE connection',
          timestamp: new Date().toISOString(),
        });
      }
    };
  }

  /**
   * Subscribe to job updates
   */
  subscribeToJob(connectionId: string, jobId: UUID): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn('SSE job subscription failed - connection not found', { connectionId, jobId });
      return false;
    }

    // Add to job subscriptions
    if (!this.jobSubscriptions.has(jobId)) {
      this.jobSubscriptions.set(jobId, new Set());
    }
    this.jobSubscriptions.get(jobId)!.add(connectionId);
    
    // Add to connection subscriptions
    connection.subscriptions.add(`job:${jobId}`);
    connection.clientInfo.lastActivity = new Date();

    logger.debug('SSE client subscribed to job updates', { connectionId, jobId });

    // Send confirmation
    this.sendEvent(connection.res, 'subscription', {
      type: 'job',
      jobId: jobId,
      message: 'Subscribed to job updates',
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  /**
   * Subscribe to queue statistics
   */
  subscribeToQueueStats(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn('SSE queue stats subscription failed - connection not found', { connectionId });
      return false;
    }

    this.queueStatsSubscribers.add(connectionId);
    connection.subscriptions.add('queue_stats');
    connection.clientInfo.lastActivity = new Date();

    logger.debug('SSE client subscribed to queue stats', { connectionId });

    // Send confirmation
    this.sendEvent(connection.res, 'subscription', {
      type: 'queue_stats',
      message: 'Subscribed to queue statistics',
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  /**
   * Broadcast job status change to subscribed clients
   */
  broadcastJobStatusChange(jobId: UUID, statusData: JobStatusData): void {
    const subscribers = this.jobSubscriptions.get(jobId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const eventData = {
      ...statusData,
      jobId: jobId,
      status: statusData.status,
      previousStatus: statusData.previousStatus,
      timestamp: statusData.timestamp || new Date().toISOString(),
    };

    let sentCount = 0;
    subscribers.forEach(connectionId => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        this.sendEvent(connection.res, 'job_status_change', eventData);
        connection.clientInfo.lastActivity = new Date();
        sentCount++;
      }
    });

    metrics.incrementCounter('sse_events_sent', { event_type: 'job_status_change' });
    logger.debug('SSE job status change broadcasted', { jobId, sentCount });
  }

  /**
   * Broadcast job progress to subscribed clients
   */
  broadcastJobProgress(jobId: UUID, progressData: JobProgressData): void {
    const subscribers = this.jobSubscriptions.get(jobId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const eventData = {
      ...progressData,
      jobId: jobId,
      progress: progressData.progress,
      status: progressData.status,
      message: progressData.message || '',
      timestamp: progressData.timestamp || new Date().toISOString(),
    };

    let sentCount = 0;
    subscribers.forEach(connectionId => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        this.sendEvent(connection.res, 'job_progress', eventData);
        connection.clientInfo.lastActivity = new Date();
        sentCount++;
      }
    });

    metrics.incrementCounter('sse_events_sent', { event_type: 'job_progress' });
    logger.debug('SSE job progress broadcasted', { jobId, progress: progressData.progress, sentCount });
  }

  /**
   * Broadcast job completion to subscribed clients
   */
  broadcastJobCompletion(jobId: UUID, completionData: JobCompletionData): void {
    const subscribers = this.jobSubscriptions.get(jobId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const eventData = {
      ...completionData,
      jobId: jobId,
      status: completionData.status,
      duration: completionData.duration,
      results: completionData.results,
      timestamp: completionData.timestamp || new Date().toISOString(),
    };

    let sentCount = 0;
    subscribers.forEach(connectionId => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        this.sendEvent(connection.res, 'job_completed', eventData);
        connection.clientInfo.lastActivity = new Date();
        sentCount++;
      }
    });

    metrics.incrementCounter('sse_events_sent', { event_type: 'job_completed' });
    logger.debug('SSE job completion broadcasted', { jobId, sentCount });
  }

  /**
   * Broadcast queue statistics to subscribed clients
   */
  broadcastQueueStats(statsData: QueueStatsData): void {
    if (this.queueStatsSubscribers.size === 0) {
      return;
    }

    const eventData = {
      ...statsData,
      timestamp: new Date().toISOString(),
    };

    let sentCount = 0;
    this.queueStatsSubscribers.forEach(connectionId => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        this.sendEvent(connection.res, 'queue_stats', eventData);
        connection.clientInfo.lastActivity = new Date();
        sentCount++;
      }
    });

    metrics.incrementCounter('sse_events_sent', { event_type: 'queue_stats' });
    logger.debug('SSE queue stats broadcasted', { sentCount });
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(event: string, data: any): void {
    if (!this.isInitialized) {
      return;
    }

    this.connections.forEach((connection) => {
      this.sendEvent(connection.res, event, data);
    });
  }

  /**
   * Send SSE event to client
   */
  private sendEvent(res: Response, eventType: string, data: any): boolean {
    try {
      const eventData = JSON.stringify(data);
      res.write(`event: ${eventType}\n`);
      res.write(`data: ${eventData}\n\n`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send SSE event:', errorMessage);
      return false;
    }
  }

  /**
   * Send heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      let heartbeatsSent = 0;

      this.connections.forEach((connection, connectionId) => {
        try {
          this.sendEvent(connection.res, 'heartbeat', {
            serverTime: now.toISOString(),
            connectionAge: now.getTime() - connection.clientInfo.connectionTime.getTime(),
          });
          heartbeatsSent++;
        } catch (error) {
          // Connection likely closed, remove it
          this.handleDisconnect(connectionId, 'heartbeat_failed');
        }
      });

      if (heartbeatsSent > 0) {
        logger.debug(`SSE heartbeat sent to ${heartbeatsSent} connections`);
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(connectionId: string, reason: string = 'unknown'): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    // Remove from job subscriptions
    this.jobSubscriptions.forEach((subscribers, jobId) => {
      if (subscribers.has(connectionId)) {
        subscribers.delete(connectionId);
        if (subscribers.size === 0) {
          this.jobSubscriptions.delete(jobId);
        }
      }
    });

    // Remove from queue stats subscribers
    this.queueStatsSubscribers.delete(connectionId);

    // Remove connection
    this.connections.delete(connectionId);

    // Update metrics
    metrics.incrementCounter('sse_connections_closed', { reason });
    metrics.setGauge('sse_connections_active', this.connections.size);

    logger.info('SSE connection closed', {
      connectionId,
      reason,
      duration: new Date().getTime() - connection.clientInfo.connectionTime.getTime(),
      totalConnections: this.connections.size,
    });
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `sse_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Get service health status
   */
  getHealthStatus(): {
    service: string;
    initialized: boolean;
    connections: {
      total: number;
      job_subscriptions: number;
      queue_stats_subscribers: number;
    };
    heartbeat_active: boolean;
    timestamp: string;
  } {
    return {
      service: 'ServerSentEventsService',
      initialized: this.isInitialized,
      connections: {
        total: this.connections.size,
        job_subscriptions: this.jobSubscriptions.size,
        queue_stats_subscribers: this.queueStatsSubscribers.size,
      },
      heartbeat_active: !!this.heartbeatInterval,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Close the SSE service
   */
  async close(): Promise<void> {
    await this.shutdown();
  }

  /**
   * Shutdown service and close all connections
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down ServerSentEventsService...');

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all connections
    this.connections.forEach((connection, connectionId) => {
      try {
        this.sendEvent(connection.res, 'shutdown', {
          message: 'Server is shutting down',
          timestamp: new Date().toISOString(),
        });
        connection.res.end();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.debug(`Error closing SSE connection ${connectionId}:`, errorMessage);
      }
    });

    // Clear data structures
    this.connections.clear();
    this.jobSubscriptions.clear();
    this.queueStatsSubscribers.clear();

    this.isInitialized = false;
    logger.info('ServerSentEventsService shutdown complete');
  }
}

export default ServerSentEventsService;