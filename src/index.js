const express = require('express');
const http = require('http');
const dotenv = require('dotenv');
const winston = require('winston');
const { MongoClient } = require('mongodb');
const ScrapingAPI = require('./routes/scraping');
const initializeScrapingJobsRoutes = require('./routes/scrapingJobs');
const monitoringRoutes = require('./routes/monitoring');
const queueManagementRoutes = require('./routes/queueManagement');
const universalScrapingRoutes = require('./routes/universalScraping');
const toastTestRoutes = require('./routes/toastTest');
const glasswingTestRoutes = require('./routes/glasswingTest');
const WebSocketService = require('./services/WebSocketService');
const ServerSentEventsService = require('./services/ServerSentEventsService');
const initializeSSERoutes = require('./routes/serverSentEvents');
const { queueManager } = require('./services/QueueManager');
const { initializeSecurity, corsProtection, validateContentType } = require('./middleware/security');

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

class AIShoppingScraper {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.port = process.env.PORT || 3000;
    this.mongoClient = null;
    this.scrapingAPI = null;
    this.webSocketService = null;
    this.sseService = null;

    this.setupMiddleware();
    this.setupRoutes();
  }

  async initializeMongoDB() {
    const mongoUrl = process.env.MONGO_URL || process.env.MONGODB_URL;

    if (!mongoUrl) {
      logger.warn('MONGO_URL or MONGODB_URL not configured, MongoDB features will be disabled');
      return false;
    }

    try {
      logger.info('Connecting to MongoDB...');
      this.mongoClient = new MongoClient(mongoUrl, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      await this.mongoClient.connect();

      // Test the connection
      await this.mongoClient.db('ai_shopping_scraper').command({ ping: 1 });

      logger.info('MongoDB connected successfully');
      return true;
    } catch (error) {
      logger.error('MongoDB connection failed:', error.message);
      this.mongoClient = null;
      return false;
    }
  }

  setupMiddleware() {
    // Trust proxy for accurate IP addresses (must be first)
    // Always trust proxy on Railway, or when TRUST_PROXY is set
    this.app.set('trust proxy', !!process.env.RAILWAY_ENVIRONMENT || process.env.TRUST_PROXY === 'true');

    // Initialize comprehensive security middleware
    initializeSecurity(this.app);

    // CORS protection (replaces basic CORS middleware)
    this.app.use(corsProtection());

    // Content-Type validation for API endpoints
    this.app.use('/api', validateContentType(['application/json']));

    // Body parsing with security limits
    this.app.use(express.json({
      limit: process.env.MAX_REQUEST_SIZE || '10mb',
      strict: true,
      type: 'application/json',
    }));
    this.app.use(express.urlencoded({
      extended: true,
      limit: process.env.MAX_REQUEST_SIZE || '10mb',
      type: 'application/x-www-form-urlencoded',
    }));

    // Serve static files (exempt from Content-Type validation)
    this.app.use('/static', express.static('src/public', {
      maxAge: '1h',
      setHeaders: (res, path) => {
        // Additional security headers for static files
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }));

    logger.info('Security middleware and request parsing initialized');
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        mongodb_connected: !!this.mongoClient,
        websocket_connected: this.webSocketService?.isInitialized || false,
      });
    });

    // Legacy API routes - will be set up after MongoDB initialization
    this.app.use('/api/scraping', (req, res, next) => {
      if (!this.scrapingAPI) {
        return res.status(503).json({
          error: 'Scraping API not initialized yet',
          suggestion: 'Try again in a few moments',
        });
      }
      this.scrapingAPI.getRouter()(req, res, next);
    });

    // New V1 API Routes - will be set up after MongoDB initialization
    this.app.use('/api/v1/scraping', (req, res, next) => {
      if (!this.scrapingJobsRouter) {
        return res.status(503).json({
          error: 'Scraping Jobs API not initialized yet',
          suggestion: 'Try again in a few moments',
          version: '1.0.0',
        });
      }
      this.scrapingJobsRouter(req, res, next);
    });

    // Monitoring routes
    this.app.use('/api/v1/monitoring', (req, res, next) => {
      if (!this.monitoringRouter) {
        return res.status(503).json({
          error: 'Monitoring API not initialized yet',
          suggestion: 'Try again in a few moments',
        });
      }
      this.monitoringRouter(req, res, next);
    });

    // Queue Management routes
    this.app.use('/api/v1/queue', queueManagementRoutes);

    // Universal scraping routes (NEW - uses MasterOrchestrator)
    this.app.use('/api/universal', universalScrapingRoutes);
    
    // Test routes for Railway deployment testing
    this.app.use('/api/test', toastTestRoutes);
    this.app.use('/api/test', glasswingTestRoutes);

    // SSE routes - will be set up after SSE service initialization
    this.app.use('/api/v1/sse', (req, res, next) => {
      if (!this.sseRouter) {
        return res.status(503).json({
          error: 'SSE service not initialized yet',
          suggestion: 'Try again in a few moments',
        });
      }
      this.sseRouter(req, res, next);
    });

    // WebSocket health endpoint
    this.app.get('/api/v1/websocket/health', (req, res) => {
      if (!this.webSocketService) {
        return res.status(503).json({
          error: 'WebSocket service not initialized',
          suggestion: 'Try again in a few moments',
        });
      }
      res.json(this.webSocketService.getHealthStatus());
    });

    // SSE health endpoint
    this.app.get('/api/v1/sse/health', (req, res) => {
      if (!this.sseService) {
        return res.status(503).json({
          error: 'SSE service not initialized',
          suggestion: 'Try again in a few moments',
        });
      }
      res.json(this.sseService.getHealthStatus());
    });

    // System stats endpoint
    this.app.get('/api/stats', async (req, res) => {
      const stats = await this.getSystemStats();
      res.json(stats);
    });

    // Real-time dashboard
    this.app.get('/dashboard', (req, res) => {
      res.sendFile('websocket-test.html', { root: 'src/public' });
    });

    // Analytics dashboard
    this.app.get('/analytics', (req, res) => {
      res.sendFile('analytics-dashboard.html', { root: 'src/public' });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'AI Shopping Scraper - Focused World Model Population',
        version: '2.1.0',
        description: 'Focused scrapers for populating e-commerce world model with MongoDB integration',
        endpoints: {
          // Legacy API (v0)
          health: '/health',
          scrape_glasswing: 'POST /api/scraping/scrape-glasswing',
          scrape_and_populate: 'POST /api/scraping/scrape-and-populate',
          scraping_status: '/api/scraping/status',
          system_stats: '/api/stats',

          // New V1 API
          v1_submit_job: 'POST /api/v1/scraping/jobs',
          v1_list_jobs: 'GET /api/v1/scraping/jobs',
          v1_job_status: 'GET /api/v1/scraping/jobs/{jobId}/status',
          v1_job_results: 'GET /api/v1/scraping/jobs/{jobId}/results',
          v1_cancel_job: 'DELETE /api/v1/scraping/jobs/{jobId}',
          v1_monitoring: 'GET /api/v1/monitoring/*',
          v1_queue_status: 'GET /api/v1/queue/queues',
          v1_queue_dashboard: 'GET /api/v1/queue/dashboard',
          v1_websocket_health: 'GET /api/v1/websocket/health',
          realtime_dashboard: 'GET /dashboard',
          analytics_dashboard: 'GET /analytics',

          // Documentation
          api_docs: '/api/v1/docs',
          openapi_spec: '/api/v1/openapi.yaml',
        },
        available_sites: ['glasswingshop.com'],
        world_model_collections: ['domains', 'products', 'categories', 'service_providers'],
        mongodb_connected: !!this.mongoClient,
        websocket_enabled: this.webSocketService?.isInitialized || false,
        database: this.mongoClient ? 'ai_shopping_scraper' : 'file_storage_fallback',
      });
    });
  }


  setupWebSocketIntegration() {
    if (!this.webSocketService || !this.webSocketService.isInitialized) {
      logger.warn('WebSocket service not available for integration');
      return;
    }

    logger.info('Setting up WebSocket integration with QueueManager...');

    // Listen for queue manager events and broadcast via WebSocket
    queueManager.on('job_started', (eventData) => {
      this.webSocketService.broadcastJobStatusChange(eventData.jobId, {
        status: 'running',
        previousStatus: 'queued',
        queueName: eventData.queueName,
        timestamp: eventData.timestamp,
      });
    });

    queueManager.on('job_progress', (eventData) => {
      this.webSocketService.broadcastJobProgress(eventData.jobId, {
        progress: eventData.progress,
        status: 'running',
        queueName: eventData.queueName,
        timestamp: eventData.timestamp,
      });
    });

    queueManager.on('job_completed', (eventData) => {
      this.webSocketService.broadcastJobCompletion(eventData.jobId, {
        status: 'completed',
        duration: eventData.duration,
        results: eventData.result,
        queueName: eventData.queueName,
        timestamp: eventData.timestamp,
      });
    });

    queueManager.on('job_failed', (eventData) => {
      this.webSocketService.broadcastJobStatusChange(eventData.jobId, {
        status: 'failed',
        previousStatus: 'running',
        error: eventData.error,
        attempt: eventData.attempt,
        maxAttempts: eventData.maxAttempts,
        queueName: eventData.queueName,
        timestamp: eventData.timestamp,
      });
    });

    // Periodically broadcast queue statistics
    setInterval(async () => {
      try {
        if (queueManager.isInitialized) {
          const queueStats = await queueManager.getQueueStats('scraping');
          this.webSocketService.broadcastQueueStats({
            queueName: 'scraping',
            ...queueStats,
          });
        }
      } catch (error) {
        logger.debug('Error broadcasting queue stats:', error.message);
      }
    }, 10000); // Every 10 seconds

    logger.info('WebSocket integration with QueueManager setup complete');
  }

  setupSSEIntegration() {
    if (!this.sseService || !this.sseService.isInitialized) {
      logger.warn('SSE service not available for integration');
      return;
    }

    logger.info('Setting up SSE integration with QueueManager...');

    // Listen for queue manager events and broadcast via SSE
    queueManager.on('job_started', (eventData) => {
      this.sseService.broadcastJobStatusChange(eventData.jobId, {
        status: 'running',
        previousStatus: 'queued',
        queueName: eventData.queueName,
        timestamp: eventData.timestamp,
      });
    });

    queueManager.on('job_progress', (eventData) => {
      this.sseService.broadcastJobProgress(eventData.jobId, {
        progress: eventData.progress,
        status: 'running',
        queueName: eventData.queueName,
        timestamp: eventData.timestamp,
      });
    });

    queueManager.on('job_completed', (eventData) => {
      this.sseService.broadcastJobCompletion(eventData.jobId, {
        status: 'completed',
        duration: eventData.duration,
        results: eventData.result,
        queueName: eventData.queueName,
        timestamp: eventData.timestamp,
      });
    });

    queueManager.on('job_failed', (eventData) => {
      this.sseService.broadcastJobStatusChange(eventData.jobId, {
        status: 'failed',
        previousStatus: 'running',
        error: eventData.error,
        attempt: eventData.attempt,
        maxAttempts: eventData.maxAttempts,
        queueName: eventData.queueName,
        timestamp: eventData.timestamp,
      });
    });

    // Periodically broadcast queue statistics via SSE
    setInterval(async () => {
      try {
        if (queueManager.isInitialized) {
          const queueStats = await queueManager.getQueueStats('scraping');
          this.sseService.broadcastQueueStats({
            queueName: 'scraping',
            ...queueStats,
          });
        }
      } catch (error) {
        logger.debug('Error broadcasting queue stats via SSE:', error.message);
      }
    }, 10000); // Every 10 seconds

    logger.info('SSE integration with QueueManager setup complete');
  }

  async getSystemStats() {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
      mongodb_connected: !!this.mongoClient,
      websocket_connected: this.webSocketService?.isInitialized || false,
      sse_connected: this.sseService?.isInitialized || false,
      scraping_status: this.scrapingAPI ? 'available' : 'not_initialized',
      timestamp: new Date().toISOString(),
    };
  }

  async start() {
    try {
      // Start server first for health checks
      this.server.listen(this.port, async () => {
        logger.info(`AI Shopping Scraper started on port ${this.port}`);
        logger.info('Server is running - initializing services...');

        // Initialize MongoDB connection
        const mongoConnected = await this.initializeMongoDB();

        // Initialize WebSocket service
        try {
          logger.info('Initializing WebSocket service...');
          this.webSocketService = new WebSocketService(this.server);
          this.webSocketService.initialize();
          logger.info('WebSocket service initialized successfully');

          // Connect QueueManager events to WebSocketService
          this.setupWebSocketIntegration();
        } catch (error) {
          logger.error('Failed to initialize WebSocket service:', error);
        }

        // Initialize SSE service
        try {
          logger.info('Initializing Server-Sent Events service...');
          this.sseService = new ServerSentEventsService();
          logger.info('SSE service initialized successfully');

          // Connect QueueManager events to SSE service
          this.setupSSEIntegration();
        } catch (error) {
          logger.error('Failed to initialize SSE service:', error);
        }

        // Initialize APIs with or without MongoDB
        this.scrapingAPI = new ScrapingAPI(logger, this.mongoClient);
        this.scrapingJobsRouter = initializeScrapingJobsRoutes(this.mongoClient);
        this.monitoringRouter = monitoringRoutes;

        // Initialize SSE router if service is available
        if (this.sseService && this.sseService.isInitialized) {
          this.sseRouter = initializeSSERoutes(this.sseService);
          logger.info('SSE router initialized');
        }

        logger.info(`Services initialized - MongoDB: ${mongoConnected ? 'connected' : 'disabled'}, WebSocket: ${this.webSocketService?.isInitialized || false}`);
      });

    } catch (error) {
      logger.error('Failed to start application:', error);
      // Don't exit - keep server running for health checks
    }
  }

  async shutdown() {
    logger.info('Shutting down AI Shopping Scraper...');

    // Shutdown WebSocket service
    if (this.webSocketService) {
      try {
        await this.webSocketService.shutdown();
        logger.info('WebSocket service shutdown complete');
      } catch (error) {
        logger.error('Error shutting down WebSocket service:', error);
      }
    }

    // Shutdown SSE service
    if (this.sseService) {
      try {
        await this.sseService.shutdown();
        logger.info('SSE service shutdown complete');
      } catch (error) {
        logger.error('Error shutting down SSE service:', error);
      }
    }

    // Close MongoDB connection
    if (this.mongoClient) {
      try {
        await this.mongoClient.close();
        logger.info('MongoDB connection closed');
      } catch (error) {
        logger.error('Error closing MongoDB connection:', error);
      }
    }

    process.exit(0);
  }
}

const app = new AIShoppingScraper();

process.on('SIGINT', () => app.shutdown());
process.on('SIGTERM', () => app.shutdown());

if (require.main === module) {
  app.start();
}

module.exports = AIShoppingScraper;
