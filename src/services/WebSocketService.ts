/**
 * WebSocket Service
 * Provides real-time job progress updates and system notifications
 * Integrates with Redis queue events for live job status broadcasting
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { UUID, Timestamp } from '../types/common.types';
import { WebSocketJobEvent, WebSocketQueueEvent } from '../types/api.types';

// Legacy imports (will be converted later)
const { logger } = require('../utils/logger');
const { metrics } = require('../utils/metrics');

interface ClientInfo {
  id: string;
  connectedAt: Timestamp;
  lastActivity: Timestamp;
  subscribedJobs: Set<UUID>;
  clientInfo: {
    ip: string;
    userAgent?: string;
  };
}

interface JobSubscriptionData {
  jobId: UUID;
}

interface JobProgressData {
  progress: number;
  status: string;
  message?: string;
  queueName?: string;
  timestamp?: Timestamp;
  [key: string]: any;
}

interface JobStatusData {
  status: string;
  previousStatus?: string;
  error?: string;
  attempt?: number;
  maxAttempts?: number;
  queueName?: string;
  timestamp?: Timestamp;
  [key: string]: any;
}

interface JobCompletionData {
  status: string;
  duration?: number;
  results?: any;
  queueName?: string;
  timestamp?: Timestamp;
  [key: string]: any;
}

interface QueueStatsData {
  queueName?: string;
  [key: string]: any;
}

interface SystemMetricsData {
  [key: string]: any;
}

class WebSocketService {
  private io: SocketIOServer | null = null;
  private httpServer: HttpServer;
  private connectedClients: Map<string, ClientInfo> = new Map();
  private jobSubscriptions: Map<UUID, Set<string>> = new Map(); // jobId -> Set of socketIds
  public isInitialized: boolean = false;

  // Track metrics
  private connectionCount: number = 0;
  private messagesSent: number = 0;
  private messagesReceived: number = 0;

  constructor(httpServer: HttpServer) {
    this.httpServer = httpServer;
  }

  /**
   * Initialize WebSocket server
   */
  initialize(): void {
    try {
      logger.info('WebSocketService: Initializing Socket.IO server...');

      this.io = new SocketIOServer(this.httpServer, {
        cors: {
          origin: process.env.CORS_ORIGIN || '*',
          methods: ['GET', 'POST'],
          credentials: true,
        },
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        pingTimeout: 60000,
        pingInterval: 25000,
      });

      this.setupEventHandlers();
      this.startMetricsCollection();

      this.isInitialized = true;
      logger.info('WebSocketService: Socket.IO server initialized successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      logger.error('WebSocketService: Failed to initialize', {
        error: errorMessage,
        stack: errorStack,
      });
      
      throw error;
    }
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      this.connectionCount++;

      logger.info('WebSocketService: Client connected', {
        socketId: socket.id,
        clientIP: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
        totalConnections: this.connectionCount,
      });

      // Store client info
      this.connectedClients.set(socket.id, {
        id: socket.id,
        connectedAt: new Date(),
        lastActivity: new Date(),
        subscribedJobs: new Set(),
        clientInfo: {
          ip: socket.handshake.address,
          userAgent: socket.handshake.headers['user-agent'] as string,
        },
      });

      // Handle job subscription
      socket.on('subscribe_job', (data: JobSubscriptionData) => {
        this.handleJobSubscription(socket, data);
      });

      // Handle job unsubscription
      socket.on('unsubscribe_job', (data: JobSubscriptionData) => {
        this.handleJobUnsubscription(socket, data);
      });

      // Handle queue monitoring subscription
      socket.on('subscribe_queue_stats', () => {
        this.handleQueueStatsSubscription(socket);
      });

      // Handle system metrics subscription
      socket.on('subscribe_system_metrics', () => {
        this.handleSystemMetricsSubscription(socket);
      });

      // Handle client ping for activity tracking
      socket.on('ping', (data: any) => {
        this.handleClientPing(socket, data);
      });

      // Handle disconnection
      socket.on('disconnect', (reason: string) => {
        this.handleClientDisconnection(socket, reason);
      });

      // Handle errors
      socket.on('error', (error: Error) => {
        logger.error('WebSocketService: Socket error', {
          socketId: socket.id,
          error: error.message,
        });
      });

      // Send welcome message with connection info
      socket.emit('connection_established', {
        socketId: socket.id,
        serverTime: new Date().toISOString(),
        availableEvents: [
          'job_progress',
          'job_status_change',
          'job_completed',
          'job_failed',
          'queue_stats',
          'system_metrics',
        ],
      });

      // Update metrics
      metrics.setGauge('websocket_connections_active', this.connectionCount);
    });
  }

  /**
   * Handle job subscription
   */
  private handleJobSubscription(socket: Socket, data: JobSubscriptionData): void {
    try {
      const { jobId } = data;

      if (!jobId) {
        socket.emit('error', { message: 'jobId is required for subscription' });
        return;
      }

      // Add socket to job subscription
      if (!this.jobSubscriptions.has(jobId)) {
        this.jobSubscriptions.set(jobId, new Set());
      }
      this.jobSubscriptions.get(jobId)!.add(socket.id);

      // Add job to client subscriptions
      const client = this.connectedClients.get(socket.id);
      if (client) {
        client.subscribedJobs.add(jobId);
        client.lastActivity = new Date();
      }

      socket.emit('subscription_confirmed', { jobId });

      logger.debug('WebSocketService: Client subscribed to job', {
        socketId: socket.id,
        jobId: jobId,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('WebSocketService: Error handling job subscription', {
        socketId: socket.id,
        error: errorMessage,
      });
      socket.emit('error', { message: 'Failed to subscribe to job' });
    }
  }

  /**
   * Handle job unsubscription
   */
  private handleJobUnsubscription(socket: Socket, data: JobSubscriptionData): void {
    try {
      const { jobId } = data;

      // Remove socket from job subscription
      if (this.jobSubscriptions.has(jobId)) {
        this.jobSubscriptions.get(jobId)!.delete(socket.id);
        if (this.jobSubscriptions.get(jobId)!.size === 0) {
          this.jobSubscriptions.delete(jobId);
        }
      }

      // Remove job from client subscriptions
      const client = this.connectedClients.get(socket.id);
      if (client) {
        client.subscribedJobs.delete(jobId);
        client.lastActivity = new Date();
      }

      socket.emit('unsubscription_confirmed', { jobId });

      logger.debug('WebSocketService: Client unsubscribed from job', {
        socketId: socket.id,
        jobId: jobId,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('WebSocketService: Error handling job unsubscription', {
        socketId: socket.id,
        error: errorMessage,
      });
    }
  }

  /**
   * Handle queue stats subscription
   */
  private handleQueueStatsSubscription(socket: Socket): void {
    socket.join('queue_stats');
    socket.emit('subscription_confirmed', { type: 'queue_stats' });

    logger.debug('WebSocketService: Client subscribed to queue stats', {
      socketId: socket.id,
    });
  }

  /**
   * Handle system metrics subscription
   */
  private handleSystemMetricsSubscription(socket: Socket): void {
    socket.join('system_metrics');
    socket.emit('subscription_confirmed', { type: 'system_metrics' });

    logger.debug('WebSocketService: Client subscribed to system metrics', {
      socketId: socket.id,
    });
  }

  /**
   * Handle client ping
   */
  private handleClientPing(socket: Socket, data: any): void {
    const client = this.connectedClients.get(socket.id);
    if (client) {
      client.lastActivity = new Date();
    }

    socket.emit('pong', {
      timestamp: new Date().toISOString(),
      clientData: data,
    });
  }

  /**
   * Handle client disconnection
   */
  private handleClientDisconnection(socket: Socket, reason: string): void {
    this.connectionCount--;

    logger.info('WebSocketService: Client disconnected', {
      socketId: socket.id,
      reason: reason,
      totalConnections: this.connectionCount,
    });

    // Clean up job subscriptions
    const client = this.connectedClients.get(socket.id);
    if (client) {
      for (const jobId of client.subscribedJobs) {
        if (this.jobSubscriptions.has(jobId)) {
          this.jobSubscriptions.get(jobId)!.delete(socket.id);
          if (this.jobSubscriptions.get(jobId)!.size === 0) {
            this.jobSubscriptions.delete(jobId);
          }
        }
      }
    }

    // Remove client info
    this.connectedClients.delete(socket.id);

    // Update metrics
    metrics.setGauge('websocket_connections_active', this.connectionCount);
  }

  /**
   * Broadcast job progress update
   */
  broadcastJobProgress(jobId: UUID, progressData: JobProgressData): void {
    if (!this.isInitialized || !this.io || !this.jobSubscriptions.has(jobId)) {
      return;
    }

    const subscribers = this.jobSubscriptions.get(jobId)!;
    const message = {
      ...progressData,
      jobId: jobId,
      progress: progressData.progress,
      status: progressData.status,
      message: progressData.message,
      timestamp: new Date().toISOString(),
    };

    subscribers.forEach(socketId => {
      const socket = this.io!.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('job_progress', message);
        this.messagesSent++;
      }
    });

    logger.debug('WebSocketService: Broadcasted job progress', {
      jobId: jobId,
      subscribers: subscribers.size,
      progress: progressData.progress,
    });
  }

  /**
   * Broadcast job status change
   */
  broadcastJobStatusChange(jobId: UUID, statusData: JobStatusData): void {
    if (!this.isInitialized || !this.io || !this.jobSubscriptions.has(jobId)) {
      return;
    }

    const subscribers = this.jobSubscriptions.get(jobId)!;
    const message = {
      ...statusData,
      jobId: jobId,
      status: statusData.status,
      previousStatus: statusData.previousStatus,
      timestamp: new Date().toISOString(),
    };

    subscribers.forEach(socketId => {
      const socket = this.io!.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('job_status_change', message);
        this.messagesSent++;
      }
    });

    logger.info('WebSocketService: Broadcasted job status change', {
      jobId: jobId,
      subscribers: subscribers.size,
      status: statusData.status,
      previousStatus: statusData.previousStatus,
    });
  }

  /**
   * Broadcast job completion
   */
  broadcastJobCompletion(jobId: UUID, completionData: JobCompletionData): void {
    if (!this.isInitialized || !this.io || !this.jobSubscriptions.has(jobId)) {
      return;
    }

    const subscribers = this.jobSubscriptions.get(jobId)!;
    const message = {
      ...completionData,
      jobId: jobId,
      status: 'completed',
      duration: completionData.duration,
      results: completionData.results,
      timestamp: new Date().toISOString(),
    };

    subscribers.forEach(socketId => {
      const socket = this.io!.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('job_completed', message);
        this.messagesSent++;
      }
    });

    logger.info('WebSocketService: Broadcasted job completion', {
      jobId: jobId,
      subscribers: subscribers.size,
      duration: completionData.duration,
    });
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(event: string, data: any): void {
    if (!this.isInitialized || !this.io) {
      return;
    }

    this.io.emit(event, data);
    this.messagesSent += this.connectionCount;
  }

  /**
   * Broadcast queue statistics
   */
  broadcastQueueStats(queueStats: QueueStatsData): void {
    if (!this.isInitialized || !this.io) {
      return;
    }

    const message = {
      type: 'queue_stats',
      data: queueStats,
      timestamp: new Date().toISOString(),
    };

    this.io.to('queue_stats').emit('queue_stats', message);

    logger.debug('WebSocketService: Broadcasted queue stats', {
      subscriberCount: this.io.sockets.adapter.rooms.get('queue_stats')?.size || 0,
    });
  }

  /**
   * Broadcast system metrics
   */
  broadcastSystemMetrics(systemMetrics: SystemMetricsData): void {
    if (!this.isInitialized || !this.io) {
      return;
    }

    const message = {
      type: 'system_metrics',
      data: systemMetrics,
      timestamp: new Date().toISOString(),
    };

    this.io.to('system_metrics').emit('system_metrics', message);

    logger.debug('WebSocketService: Broadcasted system metrics');
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    // Update WebSocket metrics every 30 seconds
    setInterval(() => {
      metrics.setGauge('websocket_connections_active', this.connectionCount);
      metrics.setGauge('websocket_job_subscriptions', this.jobSubscriptions.size);
      metrics.incrementCounter('websocket_messages_sent_total', {}, this.messagesSent);

      // Reset counters
      this.messagesSent = 0;
      this.messagesReceived = 0;
    }, 30000);
  }

  /**
   * Get service health status
   */
  getHealthStatus(): {
    isInitialized: boolean;
    activeConnections: number;
    jobSubscriptions: number;
    connectedClients: Array<{
      id: string;
      connectedAt: Timestamp;
      lastActivity: Timestamp;
      subscribedJobsCount: number;
    }>;
  } {
    return {
      isInitialized: this.isInitialized,
      activeConnections: this.connectionCount,
      jobSubscriptions: this.jobSubscriptions.size,
      connectedClients: Array.from(this.connectedClients.values()).map(client => ({
        id: client.id,
        connectedAt: client.connectedAt,
        lastActivity: client.lastActivity,
        subscribedJobsCount: client.subscribedJobs.size,
      })),
    };
  }

  /**
   * Close the WebSocket service
   */
  async close(): Promise<void> {
    await this.shutdown();
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized || !this.io) {
      return;
    }

    logger.info('WebSocketService: Shutting down...');

    // Notify all clients of shutdown
    this.io.emit('server_shutdown', {
      message: 'Server is shutting down',
      timestamp: new Date().toISOString(),
    });

    // Close all connections
    this.io.close();

    // Clear data structures
    this.connectedClients.clear();
    this.jobSubscriptions.clear();

    this.isInitialized = false;
    logger.info('WebSocketService: Shutdown complete');
  }
}

export default WebSocketService;