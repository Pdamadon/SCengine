const express = require('express');
const dotenv = require('dotenv');
const winston = require('winston');
const { MongoClient } = require('mongodb');
const ScrapingAPI = require('./routes/scraping');
const initializeScrapingJobsRoutes = require('./routes/scrapingJobs');
const monitoringRoutes = require('./routes/monitoring');
const queueManagementRoutes = require('./routes/queueManagement');

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
    this.port = process.env.PORT || 3000;
    this.mongoClient = null;
    this.scrapingAPI = null;

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
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', true);
    
    // CORS for API access
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Correlation-ID');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
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

    // System stats endpoint
    this.app.get('/api/stats', async (req, res) => {
      const stats = await this.getSystemStats();
      res.json(stats);
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
          
          // Documentation
          api_docs: '/api/v1/docs',
          openapi_spec: '/api/v1/openapi.yaml',
        },
        available_sites: ['glasswingshop.com'],
        world_model_collections: ['domains', 'products', 'categories', 'service_providers'],
        mongodb_connected: !!this.mongoClient,
        database: this.mongoClient ? 'ai_shopping_scraper' : 'file_storage_fallback',
      });
    });
  }


  async getSystemStats() {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
      mongodb_connected: !!this.mongoClient,
      scraping_status: this.scrapingAPI ? 'available' : 'not_initialized',
      timestamp: new Date().toISOString(),
    };
  }

  async start() {
    try {
      // Start server first for health checks
      this.app.listen(this.port, async () => {
        logger.info(`AI Shopping Scraper started on port ${this.port}`);
        logger.info('Server is running - initializing services...');

        // Initialize MongoDB connection
        const mongoConnected = await this.initializeMongoDB();

        // Initialize APIs with or without MongoDB
        this.scrapingAPI = new ScrapingAPI(logger, this.mongoClient);
        this.scrapingJobsRouter = initializeScrapingJobsRoutes(this.mongoClient);
        this.monitoringRouter = monitoringRoutes;

        logger.info(`Services initialized - MongoDB: ${mongoConnected ? 'connected' : 'disabled'}`);
      });

    } catch (error) {
      logger.error('Failed to start application:', error);
      // Don't exit - keep server running for health checks
    }
  }

  async shutdown() {
    logger.info('Shutting down AI Shopping Scraper...');

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
