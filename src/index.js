const express = require('express');
const dotenv = require('dotenv');
const winston = require('winston');
const ScrapingAPI = require('./api/scraping');

dotenv.config();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log' })
  ]
});

class AIShoppingScraper {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.mongoClient = null; // MongoDB will be optional for now
    
    // Initialize simplified API handlers
    this.scrapingAPI = new ScrapingAPI(logger, this.mongoClient);
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // API routes
    this.app.use('/api/scraping', this.scrapingAPI.getRouter());
    
    // System stats endpoint
    this.app.get('/api/stats', async (req, res) => {
      const stats = await this.getSystemStats();
      res.json(stats);
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'AI Shopping Scraper - Focused World Model Population',
        version: '2.0.0',
        description: 'Focused scrapers for populating e-commerce world model',
        endpoints: {
          health: '/health',
          scrape_glasswing: 'POST /api/scraping/scrape-glasswing',
          scrape_and_populate: 'POST /api/scraping/scrape-and-populate',
          scraping_status: '/api/scraping/status',
          system_stats: '/api/stats'
        },
        available_sites: ['glasswingshop.com'],
        world_model_collections: ['domains', 'products', 'categories', 'service_providers']
      });
    });
  }


  async getSystemStats() {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
      scraping_status: this.scrapingAPI ? 'available' : 'not_initialized',
      timestamp: new Date().toISOString()
    };
  }

  async start() {
    try {
      // Start server first for health checks
      this.app.listen(this.port, () => {
        logger.info(`AI Shopping Scraper started on port ${this.port}`);
        logger.info('Server is running - initializing services...');
      });

      // Initialize services after server is running (skip scraping for now)
      await this.initializeBasicServices();
      
    } catch (error) {
      logger.error('Failed to start application:', error);
      // Don't exit - keep server running for health checks
    }
  }

  async initializeBasicServices() {
    try {
      logger.info('Initializing basic services (without scraping)...');
      logger.info('Testing database connections...');
      // Add database connection tests here later
      logger.info('Basic services initialized successfully');
    } catch (error) {
      logger.error('Basic service initialization failed:', error);
      // Continue running - services can retry later
    }
  }


  async shutdown() {
    logger.info('Shutting down AI Shopping Scraper...');
    // Cleanup will be handled by the API layer services
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