#!/usr/bin/env node

/**
 * Scraping Worker Startup Script
 * Starts the scraping worker process to handle jobs from Redis queue
 * Can be run standalone or integrated into main application
 */

const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');
const winston = require('winston');
const ScrapingWorker = require('./ScrapingWorker');
const { queueManager } = require('../services/QueueManager');

// Load environment variables
dotenv.config();

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/worker.log' }),
  ],
});

class WorkerProcess {
  constructor() {
    this.mongoClient = null;
    this.worker = null;
    this.isShuttingDown = false;
    
    // Configuration from environment
    this.config = {
      concurrency: parseInt(process.env.WORKER_CONCURRENCY) || 3,
      mongoUrl: process.env.MONGO_URL || process.env.MONGODB_URL,
      redisHost: process.env.REDIS_HOST || 'localhost',
      redisPort: process.env.REDIS_PORT || 6379,
      redisPassword: process.env.REDIS_PASSWORD || null,
    };
  }

  async initialize() {
    try {
      logger.info('WorkerProcess: Initializing scraping worker...');

      // Initialize MongoDB connection
      if (this.config.mongoUrl) {
        logger.info('WorkerProcess: Connecting to MongoDB...');
        this.mongoClient = new MongoClient(this.config.mongoUrl, {
          maxPoolSize: 10,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
        });
        
        await this.mongoClient.connect();
        await this.mongoClient.db('ai_shopping_scraper').command({ ping: 1 });
        logger.info('WorkerProcess: MongoDB connected successfully');
      } else {
        logger.warn('WorkerProcess: No MongoDB URL provided, worker will run without database');
      }

      // Initialize queue manager
      logger.info('WorkerProcess: Initializing queue manager...');
      await queueManager.initialize();

      // Create and start worker
      logger.info('WorkerProcess: Starting scraping worker...');
      this.worker = new ScrapingWorker(this.mongoClient, this.config.concurrency);
      await this.worker.start();

      logger.info('WorkerProcess: Scraping worker initialized and started', {
        concurrency: this.config.concurrency,
        mongodb: !!this.mongoClient,
        processId: process.pid,
      });

      return true;

    } catch (error) {
      logger.error('WorkerProcess: Failed to initialize', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info('WorkerProcess: Shutting down...');

    try {
      // Stop the worker
      if (this.worker) {
        logger.info('WorkerProcess: Stopping scraping worker...');
        await this.worker.stop();
      }

      // Shutdown queue manager
      logger.info('WorkerProcess: Shutting down queue manager...');
      await queueManager.shutdown();

      // Close MongoDB connection
      if (this.mongoClient) {
        logger.info('WorkerProcess: Closing MongoDB connection...');
        await this.mongoClient.close();
      }

      logger.info('WorkerProcess: Shutdown complete');
      process.exit(0);

    } catch (error) {
      logger.error('WorkerProcess: Error during shutdown', {
        error: error.message,
      });
      process.exit(1);
    }
  }

  getHealthStatus() {
    return {
      processId: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      worker: this.worker ? this.worker.getHealthStatus() : null,
      queueManager: queueManager.isInitialized,
      mongodb: !!this.mongoClient,
    };
  }
}

// Create worker process instance
const workerProcess = new WorkerProcess();

// Handle process signals
process.on('SIGINT', () => {
  logger.info('WorkerProcess: Received SIGINT, shutting down gracefully...');
  workerProcess.shutdown();
});

process.on('SIGTERM', () => {
  logger.info('WorkerProcess: Received SIGTERM, shutting down gracefully...');
  workerProcess.shutdown();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('WorkerProcess: Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  workerProcess.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('WorkerProcess: Unhandled promise rejection', {
    reason: reason,
    promise: promise,
  });
  workerProcess.shutdown();
});

// Start the worker if this script is run directly
if (require.main === module) {
  workerProcess.initialize().catch((error) => {
    logger.error('WorkerProcess: Failed to start', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
}

module.exports = WorkerProcess;