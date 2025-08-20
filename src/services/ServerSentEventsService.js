/**
 * Server-Sent Events (SSE) Service
 * Provides unidirectional real-time communication for job status updates
 * Complements the WebSocket service for clients preferring HTTP-based streaming
 */

const { EventEmitter } = require('events');
const { logger } = require('../utils/logger');
const { metrics } = require('../utils/metrics');

class ServerSentEventsService extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map(); // connectionId -> { res, clientInfo, subscriptions }
    this.jobSubscriptions = new Map(); // jobId -> Set of connectionIds
    this.queueStatsSubscribers = new Set(); // connectionIds subscribed to queue stats
    this.isInitialized = false;
    this.heartbeatInterval = null;

    this.initialize();
  }

  /**
   * Initialize the SSE service
   */
  initialize() {
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
      logger.error('Failed to initialize ServerSentEventsService:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Create SSE connection handler middleware
   */
  createConnection() {
    return (req, res, next) => {
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
        const clientInfo = {
          ip: req.ip || req.connection.remoteAddress,
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

        req.on('error', (error) => {
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
        logger.error('Failed to create SSE connection:', error);
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
  subscribeToJob(connectionId, jobId) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn('SSE job subscription failed - connection not found', { connectionId, jobId });
      return false;
    }

    // Add to job subscriptions
    if (!this.jobSubscriptions.has(jobId)) {
      this.jobSubscriptions.set(jobId, new Set());
    }
    this.jobSubscriptions.get(jobId).add(connectionId);

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
  subscribeToQueueStats(connectionId) {
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
  broadcastJobStatusChange(jobId, statusData) {
    const subscribers = this.jobSubscriptions.get(jobId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const eventData = {
      jobId: jobId,
      status: statusData.status,
      previousStatus: statusData.previousStatus,
      timestamp: statusData.timestamp || new Date().toISOString(),
      ...statusData,
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
  broadcastJobProgress(jobId, progressData) {
    const subscribers = this.jobSubscriptions.get(jobId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const eventData = {
      jobId: jobId,
      progress: progressData.progress,
      status: progressData.status,
      message: progressData.message || '',
      timestamp: progressData.timestamp || new Date().toISOString(),
      ...progressData,
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
  broadcastJobCompletion(jobId, completionData) {
    const subscribers = this.jobSubscriptions.get(jobId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const eventData = {
      jobId: jobId,
      status: completionData.status,
      duration: completionData.duration,
      results: completionData.results,
      timestamp: completionData.timestamp || new Date().toISOString(),
      ...completionData,
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
  broadcastQueueStats(statsData) {
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
   * Send SSE event to client
   */
  sendEvent(res, eventType, data) {
    try {
      const eventData = JSON.stringify(data);
      res.write(`event: ${eventType}\n`);
      res.write(`data: ${eventData}\n\n`);
      return true;
    } catch (error) {
      logger.error('Failed to send SSE event:', error);
      return false;
    }
  }

  /**
   * Send heartbeat to keep connections alive
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      let heartbeatsSent = 0;

      this.connections.forEach((connection, connectionId) => {
        try {
          this.sendEvent(connection.res, 'heartbeat', {
            serverTime: now.toISOString(),
            connectionAge: now - connection.clientInfo.connectionTime,
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
  handleDisconnect(connectionId, reason = 'unknown') {
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
      duration: new Date() - connection.clientInfo.connectionTime,
      totalConnections: this.connections.size,
    });
  }

  /**
   * Generate unique connection ID
   */
  generateConnectionId() {
    return `sse_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
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
   * Shutdown service and close all connections
   */
  async shutdown() {
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
        logger.debug(`Error closing SSE connection ${connectionId}:`, error.message);
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

module.exports = ServerSentEventsService;
