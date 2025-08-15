/**
 * Queue Manager Service
 * Centralized Redis-based task queue management using Bull.js
 * Handles job queueing, priority scheduling, retry logic, and monitoring
 */

const Bull = require('bull');
const Redis = require('ioredis');
const EventEmitter = require('events');
const { logger } = require('../utils/logger');
const { metrics } = require('../utils/metrics');

class QueueManager extends EventEmitter {
  constructor() {
    super();
    this.queues = new Map();
    this.redisClient = null;
    this.isInitialized = false;

    // Queue configuration - support both REDIS_URL and individual settings
    this.queueConfig = {
      redis: process.env.REDIS_URL ? process.env.REDIS_URL : {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || null,
        db: process.env.REDIS_DB || 0,
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
    this.priorityLevels = {
      urgent: 1,
      high: 2,
      normal: 3,
      low: 4,
    };
  }

  /**
   * Initialize Redis connection and queues
   */
  async initialize() {
    try {
      logger.info('QueueManager: Initializing Redis connection...');

      // Create Redis connection with better error handling
      this.redisClient = new Redis(this.queueConfig.redis);

      // Wait for connection to be ready
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Redis connection timeout'));
        }, 10000);

        this.redisClient.on('ready', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.redisClient.on('error', (error) => {
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
      logger.error('QueueManager: Failed to initialize', {
        error: error.message,
        stack: error.stack,
      });

      metrics.trackError('QueueInitializationError', 'queue_manager');
      throw error;
    }
  }

  /**
   * Create a new queue with specified configuration
   */
  async createQueue(queueName, options = {}) {
    const mergedOptions = {
      redis: this.queueConfig.redis,
      defaultJobOptions: {
        ...this.queueConfig.defaultJobOptions,
        ...options,
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
  async addJob(queueName, jobType, jobData, options = {}) {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueManager not initialized');
      }

      const queue = this.getQueue(queueName);

      // Determine priority based on job data
      const priority = this.determinePriority(jobData.priority);

      const jobOptions = {
        priority: priority,
        delay: options.delay || 0,
        attempts: options.attempts || this.queueConfig.defaultJobOptions.attempts,
        backoff: options.backoff || this.queueConfig.defaultJobOptions.backoff,
        removeOnComplete: options.removeOnComplete !== undefined ? options.removeOnComplete : this.queueConfig.defaultJobOptions.removeOnComplete,
        removeOnFail: options.removeOnFail !== undefined ? options.removeOnFail : this.queueConfig.defaultJobOptions.removeOnFail,
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
        logger.warn('QueueManager: Failed to update queue size gauge', { error: gaugeError.message });
      }

      return {
        jobId: job.id,
        queuePosition: await this.getQueuePosition(queueName, job.id),
        estimatedWaitTime: this.estimateWaitTime(queueName, priority),
      };

    } catch (error) {
      logger.error('QueueManager: Failed to add job', {
        queue: queueName,
        jobType: jobType,
        error: error.message,
      });

      metrics.trackError('JobAddError', 'queue_manager');
      throw error;
    }
  }

  /**
   * Remove a job from the queue
   */
  async removeJob(queueName, jobId) {
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
          currentState: jobState,
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
        logger.warn('QueueManager: Failed to update queue size gauge', { error: gaugeError.message });
      }

      return { success: true, previousState: jobState };

    } catch (error) {
      logger.error('QueueManager: Failed to remove job', {
        queue: queueName,
        jobId: jobId,
        error: error.message,
      });

      metrics.trackError('JobRemovalError', 'queue_manager');
      throw error;
    }
  }

  /**
   * Get job status from queue
   */
  async getJobStatus(queueName, jobId) {
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
        jobId: job.id,
        state: state,
        progress: progress,
        data: job.data,
        opts: opts,
        attemptsMade: job.attemptsMade,
        finishedOn: job.finishedOn,
        processedOn: job.processedOn,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
      };

    } catch (error) {
      logger.error('QueueManager: Failed to get job status', {
        queue: queueName,
        jobId: jobId,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName) {
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
        },
        isPaused: await queue.isPaused(),
      };

    } catch (error) {
      logger.error('QueueManager: Failed to get queue stats', {
        queue: queueName,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats() {
    const stats = {};

    for (const [queueName] of this.queues) {
      try {
        stats[queueName] = await this.getQueueStats(queueName);
      } catch (error) {
        stats[queueName] = { error: error.message };
      }
    }

    return stats;
  }

  /**
   * Pause/Resume queue operations
   */
  async pauseQueue(queueName) {
    const queue = this.getQueue(queueName);
    await queue.pause();
    logger.info(`QueueManager: Paused queue '${queueName}'`);
  }

  async resumeQueue(queueName) {
    const queue = this.getQueue(queueName);
    await queue.resume();
    logger.info(`QueueManager: Resumed queue '${queueName}'`);
  }

  /**
   * Clean up completed/failed jobs
   */
  async cleanQueue(queueName, grace = 5000) {
    const queue = this.getQueue(queueName);

    const cleaned = await queue.clean(grace, 'completed', 100);
    await queue.clean(grace * 2, 'failed', 50);

    logger.info(`QueueManager: Cleaned ${cleaned.length} old jobs from queue '${queueName}'`);
    return cleaned.length;
  }

  /**
   * Setup event listeners for queue monitoring
   */
  setupQueueEventListeners(queue, queueName) {
    queue.on('completed', (job, result) => {
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
      this.emit('job_completed', {
        jobId: job.data.job_id || job.id,
        queueName: queueName,
        duration: job.finishedOn - job.processedOn,
        result: result,
        status: 'completed',
        timestamp: new Date(),
      });
    });

    queue.on('failed', (job, err) => {
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
      this.emit('job_failed', {
        jobId: job.data.job_id || job.id,
        queueName: queueName,
        attempt: job.attemptsMade,
        maxAttempts: job.opts.attempts,
        error: err.message,
        status: 'failed',
        timestamp: new Date(),
      });
    });

    queue.on('stalled', (job) => {
      logger.warn('QueueManager: Job stalled', {
        queue: queueName,
        jobId: job.id,
      });

      metrics.incrementCounter('queue_jobs_stalled', {
        queue: queueName,
      });
    });

    queue.on('active', (job) => {
      logger.info('QueueManager: Job started', {
        queue: queueName,
        jobId: job.id,
      });

      // Emit WebSocket event for job start
      this.emit('job_started', {
        jobId: job.data.job_id || job.id,
        queueName: queueName,
        status: 'running',
        timestamp: new Date(),
      });
    });

    queue.on('progress', (job, progress) => {
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
      this.emit('job_progress', {
        jobId: job.data.job_id || job.id,
        queueName: queueName,
        progress: progressValue,
        message: progressMessage,
        details: progressDetails,
        status: 'running',
        timestamp: typeof progress === 'object' ? progress.timestamp : new Date(),
      });
    });
  }

  /**
   * Start collecting queue metrics
   */
  startMetricsCollection() {
    // Collect queue metrics every 30 seconds
    setInterval(async () => {
      for (const [queueName] of this.queues) {
        try {
          const stats = await this.getQueueStats(queueName);

          // Update gauge metrics
          metrics.setGauge('queue_jobs_waiting', stats.counts.waiting, { queue: queueName });
          metrics.setGauge('queue_jobs_active', stats.counts.active, { queue: queueName });
          metrics.setGauge('queue_jobs_completed', stats.counts.completed, { queue: queueName });
          metrics.setGauge('queue_jobs_failed', stats.counts.failed, { queue: queueName });

        } catch (error) {
          logger.error('QueueManager: Failed to collect metrics for queue', {
            queue: queueName,
            error: error.message,
          });
        }
      }
    }, 30000);
  }

  /**
   * Helper methods
   */
  getQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }
    return queue;
  }

  determinePriority(priorityString) {
    return this.priorityLevels[priorityString] || this.priorityLevels.normal;
  }

  async getQueuePosition(queueName, jobId) {
    try {
      const queue = this.getQueue(queueName);
      const waitingJobs = await queue.getWaiting();

      const position = waitingJobs.findIndex(job => job.id === jobId);
      return position >= 0 ? position + 1 : null;
    } catch (error) {
      logger.warn('QueueManager: Failed to get queue position', {
        queue: queueName,
        jobId: jobId,
        error: error.message,
      });
      return null;
    }
  }

  estimateWaitTime(queueName, priority) {
    // Simple estimation: higher priority = less wait time
    const baseTimes = {
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
  async shutdown() {
    logger.info('QueueManager: Shutting down...');

    for (const [queueName, queue] of this.queues) {
      try {
        await queue.close();
        logger.info(`QueueManager: Closed queue '${queueName}'`);
      } catch (error) {
        logger.error(`QueueManager: Error closing queue '${queueName}'`, {
          error: error.message,
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
  async healthCheck() {
    if (!this.isInitialized) {
      return { healthy: false, reason: 'not_initialized' };
    }

    try {
      await this.redisClient.ping();

      const queueChecks = {};
      for (const [queueName, queue] of this.queues) {
        try {
          await queue.isReady();
          queueChecks[queueName] = { healthy: true };
        } catch (error) {
          queueChecks[queueName] = { healthy: false, error: error.message };
        }
      }

      return {
        healthy: true,
        redis: 'connected',
        queues: queueChecks,
      };

    } catch (error) {
      return {
        healthy: false,
        reason: 'redis_connection_failed',
        error: error.message,
      };
    }
  }
}

// Create singleton instance
const queueManager = new QueueManager();

module.exports = {
  QueueManager,
  queueManager,
};
