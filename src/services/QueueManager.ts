/**
 * Queue Manager Service
 * Centralized Redis-based task queue management using Bull.js
 * Handles job queueing, priority scheduling, retry logic, and monitoring
 */

import * as Bull from 'bull';
import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { metrics } from '../utils/metrics';
import { 
  IQueueManager, 
  QueueConfig, 
  QueueJobOptions, 
  QueueStats,
  QueueJobStatus,
  QueueJobEvent 
} from '../types/queue.types';
import { 
  Priority, 
  UUID, 
  Timestamp 
} from '../types/common.types';
import { ScrapingJobData } from '../types/scraping.types';

class QueueManager extends EventEmitter implements IQueueManager {
  private queues: Map<string, Bull.Queue> = new Map();
  private redisClient: Redis | null = null;
  public isInitialized: boolean = false;

  private readonly queueConfig: QueueConfig = {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableOfflineQueue: true,
      lazyConnect: false,
      connectTimeout: 10000,
      commandTimeout: 5000,
    },
    defaultJobOptions: {
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 50,      // Keep last 50 failed jobs
      attempts: 3,           // Default retry attempts
      backoff: {
        type: 'exponential',
        delay: 2000,         // Start with 2 second delay
      },
    },
  };

  // Priority levels configuration
  private readonly priorityLevels: Record<Priority, number> = {
    urgent: 1,
    high: 2,
    normal: 3,
    low: 4,
  };

  constructor() {
    super();
  }

  /**
   * Initialize Redis connection and queues
   */
  async initialize(): Promise<boolean> {
    try {
      logger.info('QueueManager: Initializing Redis connection...');

      // Create Redis connection with better error handling
      this.redisClient = new Redis(this.queueConfig.redis);

      // Wait for connection to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Redis connection timeout'));
        }, 10000);

        this.redisClient!.on('ready', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.redisClient!.on('error', (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      logger.info('QueueManager: Redis connection established');

      // Initialize scraping queue
      await this.createQueue('scraping', {
        ...this.queueConfig.defaultJobOptions,
        attempts: 5, // More attempts for scraping jobs
        backoff: {
          type: 'exponential',
          delay: 5000, // Longer delays for scraping failures
        },
      });

      // Initialize priority queues for different job types
      await this.createQueue('scraping-urgent', {
        ...this.queueConfig.defaultJobOptions,
        attempts: 3,
        backoff: {
          type: 'fixed',
          delay: 1000, // Quick retries for urgent jobs
        },
      });

      this.isInitialized = true;
      logger.info('QueueManager: Successfully initialized');

      // Start monitoring
      this.startMetricsCollection();

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      logger.error('QueueManager: Failed to initialize', {
        error: errorMessage,
        stack: errorStack,
      });

      metrics.trackError('QueueInitializationError', 'queue_manager');
      throw error;
    }
  }

  /**
   * Create a new queue with specified configuration
   */
  async createQueue(queueName: string, options: QueueJobOptions = {}): Promise<Bull.Queue> {
    const mergedOptions: Bull.QueueOptions = {
      redis: this.queueConfig.redis,
      defaultJobOptions: {
        removeOnComplete: options.removeOnComplete || this.queueConfig.defaultJobOptions.removeOnComplete,
        removeOnFail: options.removeOnFail || this.queueConfig.defaultJobOptions.removeOnFail,
        attempts: options.attempts || this.queueConfig.defaultJobOptions.attempts,
        backoff: options.backoff || this.queueConfig.defaultJobOptions.backoff,
        delay: options.delay,
        priority: options.priority,
      },
    };

    const queue = new Bull(queueName, mergedOptions);

    // Set up event listeners
    this.setupQueueEventListeners(queue, queueName);

    this.queues.set(queueName, queue);

    logger.info(`QueueManager: Created queue '${queueName}'`);
    return queue;
  }

  /**
   * Add a job to the queue
   */
  async addJob(
    queueName: string, 
    jobType: string, 
    jobData: ScrapingJobData, 
    options: QueueJobOptions = {}
  ): Promise<{
    jobId: string;
    queuePosition: number | null;
    estimatedWaitTime: number;
  }> {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueManager not initialized');
      }

      const queue = this.getQueue(queueName);

      // Determine priority based on job data
      const priority = this.determinePriority(jobData.priority || 'normal');

      const jobOptions: Bull.JobOptions = {
        priority: priority,
        delay: options.delay || 0,
        attempts: options.attempts || this.queueConfig.defaultJobOptions.attempts,
        backoff: options.backoff as Bull.BackoffOptions || this.queueConfig.defaultJobOptions.backoff as Bull.BackoffOptions,
        removeOnComplete: options.removeOnComplete !== undefined ? 
          options.removeOnComplete : 
          this.queueConfig.defaultJobOptions.removeOnComplete,
        removeOnFail: options.removeOnFail !== undefined ? 
          options.removeOnFail : 
          this.queueConfig.defaultJobOptions.removeOnFail,
        jobId: jobData.job_id, // Use our UUID as Bull job ID
      };

      const job = await queue.add(jobType, jobData, jobOptions);

      logger.info('QueueManager: Job added to queue', {
        queue: queueName,
        jobType: jobType,
        jobId: job.id,
        priority: priority,
        attempts: jobOptions.attempts,
      });

      // Update metrics
      metrics.incrementCounter('queue_jobs_added', {
        queue: queueName,
        type: jobType,
        priority: jobData.priority || 'normal',
      });

      // Update queue size gauge
      try {
        const waitingJobs = await queue.getWaiting();
        metrics.setGauge('queue_size', waitingJobs.length, { queue_name: queueName });
      } catch (gaugeError) {
        const errorMessage = gaugeError instanceof Error ? gaugeError.message : String(gaugeError);
        logger.warn('QueueManager: Failed to update queue size gauge', { error: errorMessage });
      }

      return {
        jobId: job.id as string,
        queuePosition: await this.getQueuePosition(queueName, job.id as string),
        estimatedWaitTime: this.estimateWaitTime(queueName, priority),
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('QueueManager: Failed to add job', {
        queue: queueName,
        jobType: jobType,
        error: errorMessage,
      });

      metrics.trackError('JobAddError', 'queue_manager');
      throw error;
    }
  }

  /**
   * Remove a job from the queue
   */
  async removeJob(queueName: string, jobId: UUID): Promise<{
    success: boolean;
    reason?: string;
    previousState?: string;
  }> {
    try {
      const queue = this.getQueue(queueName);
      const job = await queue.getJob(jobId);

      if (!job) {
        return { success: false, reason: 'not_found' };
      }

      // Check if job can be removed
      const jobState = await job.getState();
      if (!['waiting', 'delayed', 'active'].includes(jobState)) {
        return {
          success: false,
          reason: 'cannot_remove',
          previousState: jobState,
        };
      }

      await job.remove();

      logger.info('QueueManager: Job removed from queue', {
        queue: queueName,
        jobId: jobId,
        previousState: jobState,
      });

      metrics.incrementCounter('queue_jobs_removed', {
        queue: queueName,
        reason: 'cancelled',
      });

      // Update queue size gauge
      try {
        const waitingJobs = await queue.getWaiting();
        metrics.setGauge('queue_size', waitingJobs.length, { queue_name: queueName });
      } catch (gaugeError) {
        const errorMessage = gaugeError instanceof Error ? gaugeError.message : String(gaugeError);
        logger.warn('QueueManager: Failed to update queue size gauge', { error: errorMessage });
      }

      return { success: true, previousState: jobState };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('QueueManager: Failed to remove job', {
        queue: queueName,
        jobId: jobId,
        error: errorMessage,
      });

      metrics.trackError('JobRemovalError', 'queue_manager');
      throw error;
    }
  }

  /**
   * Get job status from queue
   */
  async getJobStatus(queueName: string, jobId: UUID): Promise<QueueJobStatus | null> {
    try {
      const queue = this.getQueue(queueName);
      const job = await queue.getJob(jobId);

      if (!job) {
        return null;
      }

      const state = await job.getState();
      const progress = job.progress();
      const opts = job.opts;

      return {
        jobId: job.id as string,
        state: state as QueueJobStatus['state'],
        progress: typeof progress === 'number' ? progress : progress,
        data: job.data,
        opts: opts,
        attemptsMade: job.attemptsMade,
        finishedOn: job.finishedOn,
        processedOn: job.processedOn,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('QueueManager: Failed to get job status', {
        queue: queueName,
        jobId: jobId,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<QueueStats> {
    try {
      const queue = this.getQueue(queueName);

      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
      ]);

      return {
        name: queueName,
        counts: {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length,
          paused: 0, // Bull.js doesn't directly expose paused count
        },
        isPaused: await queue.isPaused(),
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('QueueManager: Failed to get queue stats', {
        queue: queueName,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats(): Promise<Record<string, QueueStats>> {
    const stats: Record<string, QueueStats> = {};

    for (const queueName of Array.from(this.queues.keys())) {
      try {
        stats[queueName] = await this.getQueueStats(queueName);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        stats[queueName] = { 
          name: queueName,
          counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
          isPaused: false,
        };
      }
    }

    return stats;
  }

  /**
   * Pause/Resume queue operations
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.pause();
    logger.info(`QueueManager: Paused queue '${queueName}'`);
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.resume();
    logger.info(`QueueManager: Resumed queue '${queueName}'`);
  }

  /**
   * Clean up completed/failed jobs
   */
  async cleanQueue(queueName: string, grace: number = 5000): Promise<number> {
    const queue = this.getQueue(queueName);

    const cleaned = await queue.clean(grace, 'completed', 100);
    await queue.clean(grace * 2, 'failed', 50);

    logger.info(`QueueManager: Cleaned ${cleaned.length} old jobs from queue '${queueName}'`);
    return cleaned.length;
  }

  /**
   * Setup event listeners for queue monitoring
   */
  private setupQueueEventListeners(queue: Bull.Queue, queueName: string): void {
    queue.on('completed', (job: Bull.Job, result: any) => {
      logger.info('QueueManager: Job completed', {
        queue: queueName,
        jobId: job.id,
        duration: job.finishedOn - job.processedOn,
      });

      metrics.incrementCounter('queue_jobs_completed', {
        queue: queueName,
        status: 'success',
      });

      metrics.observeHistogram('queue_job_duration', job.finishedOn - job.processedOn, {
        queue: queueName,
      });

      // Emit WebSocket event for job completion
      const event: QueueJobEvent = {
        jobId: job.data.job_id || job.id as string,
        queueName: queueName,
        status: 'completed',
        timestamp: new Date(),
        duration: job.finishedOn - job.processedOn,
        result: result,
      };
      
      this.emit('job_completed', event);
    });

    queue.on('failed', (job: Bull.Job, err: Error) => {
      logger.error('QueueManager: Job failed', {
        queue: queueName,
        jobId: job.id,
        attempt: job.attemptsMade,
        maxAttempts: job.opts.attempts,
        error: err.message,
      });

      metrics.incrementCounter('queue_jobs_failed', {
        queue: queueName,
        attempt: job.attemptsMade.toString(),
      });

      // Emit WebSocket event for job failure
      const event: QueueJobEvent = {
        jobId: job.data.job_id || job.id as string,
        queueName: queueName,
        status: 'failed',
        timestamp: new Date(),
        error: err.message,
      };
      
      this.emit('job_failed', event);
    });

    queue.on('stalled', (job: Bull.Job) => {
      logger.warn('QueueManager: Job stalled', {
        queue: queueName,
        jobId: job.id,
      });

      metrics.incrementCounter('queue_jobs_stalled', {
        queue: queueName,
      });
    });

    queue.on('active', (job: Bull.Job) => {
      logger.info('QueueManager: Job started', {
        queue: queueName,
        jobId: job.id,
      });

      // Emit WebSocket event for job start
      const event: QueueJobEvent = {
        jobId: job.data.job_id || job.id as string,
        queueName: queueName,
        status: 'running',
        timestamp: new Date(),
      };
      
      this.emit('job_started', event);
    });

    queue.on('progress', (job: Bull.Job, progress: number | any) => {
      // Handle both numeric progress and object progress data
      const progressValue = typeof progress === 'object' ? progress.progress : progress;
      const progressMessage = typeof progress === 'object' ? progress.message : '';
      const progressDetails = typeof progress === 'object' ? progress.details : {};

      logger.debug('QueueManager: Job progress update', {
        queue: queueName,
        jobId: job.id,
        progress: progressValue,
        message: progressMessage,
      });

      // Emit WebSocket event for job progress
      const event: QueueJobEvent = {
        jobId: job.data.job_id || job.id as string,
        queueName: queueName,
        status: 'running',
        timestamp: typeof progress === 'object' ? progress.timestamp : new Date(),
        progress: progressValue,
        message: progressMessage,
        details: progressDetails,
      };
      
      this.emit('job_progress', event);
    });
  }

  /**
   * Start collecting queue metrics
   */
  private startMetricsCollection(): void {
    // Collect queue metrics every 30 seconds
    setInterval(async () => {
      for (const queueName of Array.from(this.queues.keys())) {
        try {
          const stats = await this.getQueueStats(queueName);

          // Update gauge metrics
          metrics.setGauge('queue_jobs_waiting', stats.counts.waiting, { queue: queueName });
          metrics.setGauge('queue_jobs_active', stats.counts.active, { queue: queueName });
          metrics.setGauge('queue_jobs_completed', stats.counts.completed, { queue: queueName });
          metrics.setGauge('queue_jobs_failed', stats.counts.failed, { queue: queueName });

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('QueueManager: Failed to collect metrics for queue', {
            queue: queueName,
            error: errorMessage,
          });
        }
      }
    }, 30000);
  }

  /**
   * Helper methods
   */
  getQueue(queueName: string): Bull.Queue {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }
    return queue;
  }

  private determinePriority(priorityString: Priority): number {
    return this.priorityLevels[priorityString] || this.priorityLevels.normal;
  }

  private async getQueuePosition(queueName: string, jobId: string): Promise<number | null> {
    try {
      const queue = this.getQueue(queueName);
      const waitingJobs = await queue.getWaiting();

      const position = waitingJobs.findIndex(job => job.id === jobId);
      return position >= 0 ? position + 1 : null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('QueueManager: Failed to get queue position', {
        queue: queueName,
        jobId: jobId,
        error: errorMessage,
      });
      return null;
    }
  }

  private estimateWaitTime(queueName: string, priority: number): number {
    // Simple estimation: higher priority = less wait time
    const baseTimes: Record<number, number> = {
      1: 30000,   // urgent: 30 seconds
      2: 120000,  // high: 2 minutes
      3: 300000,  // normal: 5 minutes
      4: 900000,  // low: 15 minutes
    };

    return baseTimes[priority] || baseTimes[3];
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('QueueManager: Shutting down...');

    for (const [queueName, queue] of Array.from(this.queues.entries())) {
      try {
        await queue.close();
        logger.info(`QueueManager: Closed queue '${queueName}'`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`QueueManager: Error closing queue '${queueName}'`, {
          error: errorMessage,
        });
      }
    }

    if (this.redisClient) {
      await this.redisClient.quit();
      logger.info('QueueManager: Closed Redis connection');
    }

    this.isInitialized = false;
    logger.info('QueueManager: Shutdown complete');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    redis?: string;
    queues?: Record<string, { healthy: boolean; error?: string }>;
    reason?: string;
    error?: string;
  }> {
    if (!this.isInitialized) {
      return { healthy: false, reason: 'not_initialized' };
    }

    try {
      await this.redisClient!.ping();

      const queueChecks: Record<string, { healthy: boolean; error?: string }> = {};
      for (const [queueName, queue] of Array.from(this.queues.entries())) {
        try {
          await queue.isReady();
          queueChecks[queueName] = { healthy: true };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          queueChecks[queueName] = { healthy: false, error: errorMessage };
        }
      }

      return {
        healthy: true,
        redis: 'connected',
        queues: queueChecks,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        healthy: false,
        reason: 'redis_connection_failed',
        error: errorMessage,
      };
    }
  }
}

// Create singleton instance
const queueManager = new QueueManager();

export {
  QueueManager,
  queueManager,
};