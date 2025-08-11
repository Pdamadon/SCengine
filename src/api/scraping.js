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
          maxProducts
        );
        
        res.json({
          success: true,
          scraped_at: new Date().toISOString(),
          results: results
        });

      } catch (error) {
        this.logger.error('Glasswing scraping failed:', error);
        res.status(500).json({ 
          error: error.message,
          details: 'Check logs for more information'
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
            availableSites: ['glasswing']
          });
        }

        this.logger.info(`Starting scrape and populate for ${site} with ${maxProducts} products from ${collection}`);
        
        // Step 1: Scrape the site
        const scraperResults = await this.glasswingScraper.scrapeFirstProducts(
          collection, 
          maxProducts
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
          population_result: populationResult
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
          mongodb_connected: !!this.mongoClient
        },
        timestamp: new Date().toISOString()
      });
    });
  }

  getRouter() {
    return router;
  }
}

module.exports = ScrapingAPI;