// Simplified API for focused scraping and world model population
const express = require('express');
const router = express.Router();
const GlasswingScraper = require('../scrapers/GlasswingScraper');
const WorldModelPopulator = require('../services/WorldModelPopulator');

class ScrapingAPI {
  constructor(logger, mongoClient = null) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.glasswingScraper = new GlasswingScraper(logger);
    this.worldModelPopulator = new WorldModelPopulator(logger, mongoClient);

    this.setupRoutes();
  }

  setupRoutes() {
    // Glasswing focused scraping endpoint
    router.post('/scrape-glasswing', async (req, res) => {
      try {
        const { maxProducts = 5, collection = '/collections/clothing-collection' } = req.body;

        this.logger.info(`Starting focused Glasswing scrape for ${maxProducts} products from ${collection}`);

        const results = await this.glasswingScraper.scrapeFirstProducts(
          collection,
          maxProducts,
        );

        res.json({
          success: true,
          scraped_at: new Date().toISOString(),
          results: results,
        });

      } catch (error) {
        this.logger.error('Glasswing scraping failed:', error);
        res.status(500).json({
          error: error.message,
          details: 'Check logs for more information',
        });
      }
    });

    // Scrape and populate world model
    router.post('/scrape-and-populate', async (req, res) => {
      try {
        const { site = 'glasswing', maxProducts = 10, collection = '/collections/clothing-collection' } = req.body;

        if (site !== 'glasswing') {
          return res.status(400).json({
            error: 'Only Glasswing scraping is currently supported',
            availableSites: ['glasswing'],
          });
        }

        this.logger.info(`Starting scrape and populate for ${site} with ${maxProducts} products from ${collection}`);

        // Step 1: Scrape the site
        const scraperResults = await this.glasswingScraper.scrapeFirstProducts(
          collection,
          maxProducts,
        );

        // Step 2: Initialize world model populator
        const initialized = await this.worldModelPopulator.initialize();

        // Step 3: Populate world model
        const populationResult = await this.worldModelPopulator.populateFromScraperResults(scraperResults);

        res.json({
          success: true,
          scraped_at: new Date().toISOString(),
          scraping_summary: scraperResults.summary,
          world_model_populated: initialized,
          population_result: populationResult,
        });

      } catch (error) {
        this.logger.error('Scrape and populate failed:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get scraping status
    router.get('/status', (req, res) => {
      res.json({
        available_scrapers: ['glasswing'],
        services: {
          glasswing_scraper: !!this.glasswingScraper,
          world_model_populator: !!this.worldModelPopulator,
          mongodb_connected: !!this.mongoClient,
        },
        timestamp: new Date().toISOString(),
      });
    });

    // Clear database endpoint for testing
    router.post('/clear-database', async (req, res) => {
      try {
        if (!this.mongoClient) {
          return res.status(500).json({ error: 'MongoDB not connected' });
        }

        // Check both databases to see where data actually is
        const aiDb = this.mongoClient.db('ai_shopping_scraper');
        const worldDb = this.mongoClient.db('worldmodel1');
        
        // Clear all collections
        const collections = ['products', 'categories', 'product_categories', 'domains', 'sites', 'category_hierarchy'];
        const results = { ai_shopping_scraper: {}, worldmodel1: {} };
        
        for (const collectionName of collections) {
          // Clear from ai_shopping_scraper database
          const aiResult = await aiDb.collection(collectionName).deleteMany({});
          results.ai_shopping_scraper[collectionName] = { deleted: aiResult.deletedCount };
          
          // Clear from worldmodel1 database
          const worldResult = await worldDb.collection(collectionName).deleteMany({});
          results.worldmodel1[collectionName] = { deleted: worldResult.deletedCount };
        }

        this.logger.info('Database cleared successfully', { results });

        res.json({
          success: true,
          message: 'Database cleared successfully',
          collections_cleared: results,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        this.logger.error('Database clearing failed:', error);
        res.status(500).json({
          error: 'Database clearing failed',
          details: error.message
        });
      }
    });

    // Database inspection endpoint
    router.get('/inspect-databases', async (req, res) => {
      try {
        if (!this.mongoClient) {
          return res.status(500).json({ error: 'MongoDB not connected' });
        }

        // List all databases
        const admin = this.mongoClient.db().admin();
        const databasesList = await admin.listDatabases();
        
        const inspection = {
          available_databases: databasesList.databases,
          collections_info: {}
        };

        // Check key databases for our collections
        const databasesToCheck = ['ai_shopping_scraper', 'worldmodel1'];
        const collectionsToCheck = ['products', 'categories', 'product_categories', 'domains'];
        
        for (const dbName of databasesToCheck) {
          const db = this.mongoClient.db(dbName);
          inspection.collections_info[dbName] = {};
          
          for (const collectionName of collectionsToCheck) {
            try {
              const count = await db.collection(collectionName).countDocuments();
              const sample = await db.collection(collectionName).findOne();
              inspection.collections_info[dbName][collectionName] = {
                count: count,
                has_sample: !!sample,
                sample_id: sample ? sample._id : null
              };
            } catch (error) {
              inspection.collections_info[dbName][collectionName] = {
                error: error.message
              };
            }
          }
        }

        res.json({
          success: true,
          inspection: inspection,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        this.logger.error('Database inspection failed:', error);
        res.status(500).json({
          error: 'Database inspection failed',
          details: error.message
        });
      }
    });

    // Temporary endpoint to verify database population
    router.get('/verify-database', async (req, res) => {
      try {
        if (!this.mongoClient) {
          return res.status(500).json({ error: 'MongoDB not connected' });
        }

        const db = this.mongoClient.db('ai_shopping_scraper');
        
        // Check products collection
        const productsCount = await db.collection('products').countDocuments();
        const recentProducts = await db.collection('products')
          .find({})
          .sort({ created_at: -1 })
          .limit(5)
          .project({ name: 1, price: 1, url: 1, created_at: 1, updated_at: 1 })
          .toArray();

        // Check categories collection  
        const categoriesCount = await db.collection('categories').countDocuments();
        
        // Check product_categories relationships
        const relationshipsCount = await db.collection('product_categories').countDocuments();

        res.json({
          success: true,
          collections: {
            products: {
              count: productsCount,
              recent: recentProducts
            },
            categories: {
              count: categoriesCount
            },
            product_categories: {
              count: relationshipsCount
            }
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        this.logger.error('Database verification failed:', error);
        res.status(500).json({
          error: 'Database verification failed',
          details: error.message
        });
      }
    });
  }

  getRouter() {
    return router;
  }
}

module.exports = ScrapingAPI;
