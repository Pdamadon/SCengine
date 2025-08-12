/**
 * AI Shopping Scraper - TypeScript Entry Point
 * Enhanced e-commerce scraping system with category intelligence
 * Supports multisite scraping with Redis queue orchestration
 */

import express, { Express, Request, Response } from 'express';
import http from 'http';
import path from 'path';
import dotenv from 'dotenv';
import winston from 'winston';
import { MongoClient, Db } from 'mongodb';

// Database imports
import { initializeMongoService, getDb, getClient, ping as mongoPing } from './database/mongo';
import { bootstrapIndexes, validateSchema, getDatabaseStats } from './database/bootstrap';

// Type imports
import { HealthStatus } from './types/common.types';

// Legacy imports (will be converted to TypeScript gradually)
const ScrapingAPI = require('./routes/scraping');
const initializeScrapingJobsRoutes = require('./routes/scrapingJobs');
const monitoringRoutes = require('./routes/monitoring');
const queueManagementRoutes = require('./routes/queueManagement');
const WebSocketService = require('./services/WebSocketService');
const ServerSentEventsService = require('./services/ServerSentEventsService');
const initializeSSERoutes = require('./routes/serverSentEvents');
const { initializeSecurity, corsProtection, validateContentType } = require('./middleware/security');

// TypeScript imports
import { queueManager } from './services/QueueManager';

dotenv.config();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log' }),
  ],
});

interface AppConfig {
  port: number;
  mongoUri: string;
  mongoDatabase: string;
  corsOrigins: string[];
  environment: 'development' | 'production' | 'test';
  enableWebSockets: boolean;
  enableSSE: boolean;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

class AIShoppingScraper {
  private app: Express;
  private server: http.Server | null = null;
  private mongoClient: MongoClient | null = null;
  private db: Db | null = null;
  private webSocketService: any = null;
  private sseService: any = null;
  private config: AppConfig;

  constructor() {
    this.app = express();
    this.config = this.loadConfiguration();
    this.setupExitHandlers();
  }

  /**
   * Load configuration from environment variables
   */
  private loadConfiguration(): AppConfig {
    return {
      port: parseInt(process.env.PORT || '3000'),
      mongoUri: process.env.MONGODB_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017',
      mongoDatabase: process.env.MONGODB_DB || 'ai_shopping_scraper',
      corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      environment: (process.env.NODE_ENV || 'development') as AppConfig['environment'],
      enableWebSockets: process.env.ENABLE_WEBSOCKETS !== 'false',
      enableSSE: process.env.ENABLE_SSE !== 'false',
      rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
      rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    };
  }

  /**
   * Initialize the application
   */
  async initialize(): Promise<void> {
    try {
      logger.info('🚀 Initializing AI Shopping Scraper (TypeScript)', {
        version: '2.1.0',
        environment: this.config.environment,
        port: this.config.port,
      });

      // Step 1: Connect to MongoDB
      await this.connectToDatabase();

      // Step 2: Initialize Redis Queue Manager
      await this.initializeQueueManager();

      // Step 3: Setup Express middleware
      await this.setupMiddleware();

      // Step 4: Setup routes
      await this.setupRoutes();

      // Step 5: Setup WebSocket and SSE services
      await this.setupRealtimeServices();

      // Step 6: Setup health monitoring
      this.setupHealthEndpoints();

      logger.info('✅ AI Shopping Scraper initialization complete');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      logger.error('❌ Failed to initialize AI Shopping Scraper', {
        error: errorMessage,
        stack: errorStack,
      });
      
      throw error;
    }
  }

  /**
   * Connect to MongoDB Atlas using singleton service
   */
  private async connectToDatabase(): Promise<void> {
    try {
      logger.info('📊 Connecting to MongoDB Atlas...', {
        uri: this.config.mongoUri.replace(/\/\/.*@/, '//***@'), // Hide credentials in logs
        database: this.config.mongoDatabase,
      });

      // Initialize MongoDB singleton service
      initializeMongoService({
        uri: this.config.mongoUri,
        database: this.config.mongoDatabase,
        maxPoolSize: 20, // Increased for Atlas optimization
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      // Get client and database instances
      this.mongoClient = await getClient();
      this.db = await getDb();
      
      // Verify connection
      const pingSuccess = await mongoPing();
      if (!pingSuccess) {
        throw new Error('MongoDB ping failed');
      }
      
      logger.info('✅ MongoDB Atlas connection established', {
        database: this.config.mongoDatabase,
      });

      // Bootstrap database indexes for optimal performance
      await this.initializeDatabaseSchema();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ MongoDB Atlas connection failed', { error: errorMessage });
      throw new Error(`Database connection failed: ${errorMessage}`);
    }
  }

  /**
   * Initialize database schema and indexes
   */
  private async initializeDatabaseSchema(): Promise<void> {
    try {
      logger.info('🏗️  Initializing database schema...');
      
      await bootstrapIndexes();
      const schemaValid = await validateSchema();
      
      if (schemaValid) {
        logger.info('✅ Database schema initialized successfully');
      } else {
        logger.warn('⚠️  Database schema validation issues detected');
      }

      // Log database statistics
      const stats = await getDatabaseStats();
      if (stats) {
        logger.info('📊 Database statistics', {
          collections: stats.collections,
          totalIndexes: stats.indexes,
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ Database schema initialization failed', { error: errorMessage });
      // Don't throw - allow app to continue with basic connection
    }
  }

  /**
   * Initialize Redis Queue Manager
   */
  private async initializeQueueManager(): Promise<void> {
    try {
      logger.info('⚡ Initializing Redis Queue Manager...');
      
      if (!queueManager.isInitialized) {
        await queueManager.initialize();
      }
      
      logger.info('✅ Redis Queue Manager initialized');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ Queue Manager initialization failed', { error: errorMessage });
      throw new Error(`Queue Manager initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Setup Express middleware
   */
  private async setupMiddleware(): Promise<void> {
    logger.info('🛡️  Setting up security middleware...');

    // Temporarily disable security middleware to test
    // await initializeSecurity(this.app, {
    //   corsOrigins: this.config.corsOrigins,
    //   rateLimitWindowMs: this.config.rateLimitWindowMs,
    //   rateLimitMaxRequests: this.config.rateLimitMaxRequests,
    // });

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Temporarily disable other middleware
    // this.app.use(corsProtection);
    // this.app.use(validateContentType);

    // Request correlation ID middleware
    this.app.use((req: Request & { correlationId?: string }, _res: Response, next) => {
      req.correlationId = req.headers['x-correlation-id'] as string || 
                          `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      next();
    });

    // Request logging middleware
    this.app.use((req: Request, _res: Response, next) => {
      logger.info('HTTP_REQUEST', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        correlationId: (req as any).correlationId,
      });
      next();
    });

    logger.info('✅ Middleware setup complete');
  }

  /**
   * Setup API routes
   */
  private async setupRoutes(): Promise<void> {
    logger.info('🛣️  Setting up API routes...');

    // API routes with database client
    const scrapingAPI = new ScrapingAPI(logger, this.mongoClient);
    this.app.use('/api/v1/scraping', scrapingAPI.getRouter());
    this.app.use('/api/v1/jobs', initializeScrapingJobsRoutes(this.mongoClient));
    this.app.use('/api/v1/monitoring', monitoringRoutes);
    this.app.use('/api/v1/queue', queueManagementRoutes);

    // SSE routes (if enabled and service is available)
    if (this.config.enableSSE && this.sseService) {
      this.app.use('/api/v1/events', initializeSSERoutes(this.sseService));
    }

    // Serve static files from public directory
    const publicPath = path.join(__dirname, 'public');
    this.app.use(express.static(publicPath));
    logger.info('📁 Static files served from:', publicPath);

    // Root endpoint
    this.app.get('/', (_req: Request, res: Response) => {
      res.json({
        name: 'AI Shopping Scraper',
        version: '2.1.0',
        status: 'running',
        environment: this.config.environment,
        features: {
          websockets: this.config.enableWebSockets,
          server_sent_events: this.config.enableSSE,
          redis_queue: queueManager.isInitialized,
          mongodb: !!this.db,
        },
        timestamp: new Date().toISOString(),
      });
    });

    logger.info('✅ API routes setup complete');
  }

  /**
   * Setup real-time services (WebSockets and SSE) 
   */
  private async setupRealtimeServices(): Promise<void> {
    // WebSocket service will be initialized after server creation
    // SSE service
    if (this.config.enableSSE) {
      logger.info('📡 Setting up Server-Sent Events service...');
      
      this.sseService = new ServerSentEventsService(logger);
      await this.sseService.initialize();
      
      // Connect queue events to SSE broadcasts
      queueManager.on('job_started', (event: any) => {
        this.sseService.broadcast('job_update', event);
      });
      
      queueManager.on('job_progress', (event: any) => {
        this.sseService.broadcast('job_update', event);
      });
      
      queueManager.on('job_completed', (event: any) => {
        this.sseService.broadcast('job_update', event);
      });
      
      queueManager.on('job_failed', (event: any) => {
        this.sseService.broadcast('job_update', event);
      });
      
      logger.info('✅ Server-Sent Events service initialized');
    }
  }

  /**
   * Setup health monitoring endpoints
   */
  private setupHealthEndpoints(): void {
    // Health check endpoint
    this.app.get('/health', async (_req: Request, res: Response) => {
      try {
        const healthStatus: HealthStatus = {
          healthy: true,
          services: {
            database: { 
              healthy: !!this.db, 
              responseTime: await this.checkDatabaseHealth(),
              lastCheck: new Date()
            },
            redis: { 
              healthy: queueManager.isInitialized, 
              responseTime: await this.checkRedisHealth(),
              lastCheck: new Date()
            },
            queue: { 
              healthy: queueManager.isInitialized,
              responseTime: await this.getQueueDepth(),
              lastCheck: new Date()
            },
            workers: { 
              healthy: true, 
              responseTime: await this.getActiveWorkerCount(),
              lastCheck: new Date()
            },
          },
          timestamp: new Date(),
          uptime: process.uptime(),
        };

        // Check if any service is unhealthy
        const unhealthyServices = healthStatus.services ? 
          Object.values(healthStatus.services).filter(service => !service.healthy) : [];
        if (unhealthyServices.length > 0) {
          healthStatus.healthy = false;
          res.status(503).json(healthStatus);
        } else {
          res.json(healthStatus);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        res.status(503).json({
          healthy: false,
          error: errorMessage,
          timestamp: new Date(),
        });
      }
    });

    // Metrics endpoint
    this.app.get('/metrics', (_req: Request, res: Response) => {
      // TODO: Implement Prometheus metrics
      res.json({
        message: 'Metrics endpoint - Prometheus integration coming soon',
        timestamp: new Date(),
      });
    });
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    await this.initialize();

    this.server = http.createServer(this.app);

    // Initialize WebSocket service with HTTP server
    if (this.config.enableWebSockets) {
      logger.info('🔌 Setting up WebSocket service...');
      
      this.webSocketService = new WebSocketService(this.server);
      await this.webSocketService.initialize();
      
      // Connect queue events to WebSocket broadcasts
      queueManager.on('job_started', (event: any) => {
        this.webSocketService.broadcast('job_update', event);
      });
      
      queueManager.on('job_progress', (event: any) => {
        this.webSocketService.broadcast('job_update', event);
      });
      
      queueManager.on('job_completed', (event: any) => {
        this.webSocketService.broadcast('job_update', event);
      });
      
      queueManager.on('job_failed', (event: any) => {
        this.webSocketService.broadcast('job_update', event);
      });
      
      logger.info('✅ WebSocket service initialized');
    }

    this.server.listen(this.config.port, () => {
      logger.info('🌟 AI Shopping Scraper server started', {
        port: this.config.port,
        environment: this.config.environment,
        pid: process.pid,
        features: {
          websockets: this.config.enableWebSockets,
          sse: this.config.enableSSE,
          redis_queue: queueManager.isInitialized,
        },
      });
    });
  }

  /**
   * Graceful shutdown
   */
  async stop(): Promise<void> {
    logger.info('🛑 Initiating graceful shutdown...');

    try {
      // Close HTTP server
      if (this.server) {
        await new Promise<void>((resolve) => {
          this.server!.close(() => resolve());
        });
        logger.info('✅ HTTP server closed');
      }

      // Close WebSocket service
      if (this.webSocketService) {
        await this.webSocketService.close();
        logger.info('✅ WebSocket service closed');
      }

      // Close SSE service
      if (this.sseService) {
        await this.sseService.close();
        logger.info('✅ SSE service closed');
      }

      // Close queue manager
      if (queueManager.isInitialized) {
        await queueManager.shutdown();
        logger.info('✅ Queue manager shutdown');
      }

      // Close MongoDB connection
      if (this.mongoClient) {
        await this.mongoClient.close();
        logger.info('✅ MongoDB connection closed');
      }

      logger.info('🎉 Graceful shutdown complete');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ Error during shutdown', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Setup process exit handlers
   */
  private setupExitHandlers(): void {
    // Graceful shutdown on SIGTERM
    process.on('SIGTERM', async () => {
      logger.info('📨 Received SIGTERM signal');
      await this.stop();
      process.exit(0);
    });

    // Graceful shutdown on SIGINT
    process.on('SIGINT', async () => {
      logger.info('📨 Received SIGINT signal');
      await this.stop();
      process.exit(0);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('💥 Uncaught Exception', {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logger.error('🚫 Unhandled Rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        promise: promise.toString(),
      });
      process.exit(1);
    });
  }

  /**
   * Health check helper methods
   */
  private async checkDatabaseHealth(): Promise<number> {
    if (!this.db) return -1;
    
    const start = Date.now();
    try {
      await this.db.command({ ping: 1 });
      return Date.now() - start;
    } catch {
      return -1;
    }
  }

  private async checkRedisHealth(): Promise<number> {
    const start = Date.now();
    try {
      const healthCheck = await queueManager.healthCheck();
      return healthCheck.healthy ? Date.now() - start : -1;
    } catch {
      return -1;
    }
  }

  private async getQueueDepth(): Promise<number> {
    try {
      const stats = await queueManager.getAllQueueStats();
      return Object.values(stats).reduce((total, stat) => total + stat.counts.waiting, 0);
    } catch {
      return -1;
    }
  }

  private async getActiveWorkerCount(): Promise<number> {
    // TODO: Implement worker tracking
    return 0;
  }
}

// Start the application if this file is run directly
if (require.main === module) {
  const app = new AIShoppingScraper();
  
  app.start().catch((error) => {
    logger.error('💥 Failed to start AI Shopping Scraper', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
}

export default AIShoppingScraper;