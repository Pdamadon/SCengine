// Simplified API for focused scraping and world model population
const express = require('express');
const router = express.Router();
// Temporarily disabled - these scrapers have been replaced by MasterOrchestrator
// const GlasswingScraper = require('../scrapers/GlasswingScraper');
// const WorldModelPopulator = require('../services/WorldModelPopulator');
// const SelfLearningUniversalScraper = require('../scrapers/SelfLearningUniversalScraper');

class ScrapingAPI {
  constructor(logger, mongoClient = null) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    // Scrapers disabled - use /api/universal endpoints instead
    // this.glasswingScraper = new GlasswingScraper(logger);
    // this.worldModelPopulator = new WorldModelPopulator(logger, mongoClient);

    this.setupRoutes();
  }

  setupRoutes() {
    // Glasswing focused scraping endpoint - DEPRECATED
    router.post('/scrape-glasswing', async (req, res) => {
      res.status(410).json({
        error: 'This endpoint has been deprecated',
        message: 'Please use /api/universal/scrape instead',
        newEndpoint: '/api/universal/scrape',
        example: {
          url: 'https://glasswingshop.com/collections/clothing-collection',
          options: {
            maxProducts: 5
          }
        }
      });
    });

    // Scrape and populate world model - DEPRECATED
    router.post('/scrape-and-populate', async (req, res) => {
      res.status(410).json({
        error: 'This endpoint has been deprecated',
        message: 'Please use /api/universal/scrape instead',
        newEndpoint: '/api/universal/scrape'
      });
      return;
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

    // Universal scraper test endpoint
    router.post('/test-universal', async (req, res) => {
      try {
        const {
          target_url,
          max_attempts = 3,
          target_quality = 0.9,
          enable_cross_site_learning = true,
        } = req.body;

        if (!target_url) {
          return res.status(400).json({
            error: 'target_url is required',
            example: {
              target_url: 'https://example-shop.com',
              max_attempts: 3,
              target_quality: 0.9,
            },
          });
        }

        this.logger.info('Starting universal scraper test', {
          target_url,
          max_attempts,
          target_quality,
          enable_cross_site_learning,
        });

        // Create job data for the universal scraper
        const jobData = {
          scraping_type: 'universal',
          max_attempts,
          target_quality,
          enable_cross_site_learning,
          submitted_at: new Date().toISOString(),
          test_mode: true,
        };

        // Initialize universal scraper
        const universalScraper = new SelfLearningUniversalScraper(
          this.logger,
          target_url,
          jobData,
          {
            enableCrossSiteLearning: enable_cross_site_learning,
            aggressiveLearning: false,
          },
        );

        // Track progress for real-time updates
        const progressUpdates = [];
        const progressCallback = (progress, message, details = {}) => {
          const update = {
            progress,
            message,
            details,
            timestamp: new Date().toISOString(),
          };
          progressUpdates.push(update);
          this.logger.info('Universal scraper progress', update);
        };

        // Execute the scraping with learning
        const startTime = Date.now();
        const results = await universalScraper.scrape(progressCallback);
        const duration = Date.now() - startTime;

        // Format response with learning insights
        res.json({
          success: true,
          test_completed_at: new Date().toISOString(),
          target_url,
          duration_ms: duration,

          // Core results
          products: results.products || [],
          actionable_selectors: results.actionable_selectors || {},

          // Learning metadata
          learning_results: {
            attempts_used: results.learning?.attempts_used || 0,
            final_quality: results.learning?.final_quality || 0,
            quality_progression: results.learning?.quality_progression || [],
            patterns_learned: results.learning?.patterns_learned || 0,
            target_reached: results.learning?.target_reached || false,
            learning_effectiveness: results.learning?.learning_effectiveness || 0,
          },

          // Progress tracking
          progress_updates: progressUpdates,

          // Performance insights
          performance: {
            total_duration: duration,
            average_attempt_duration: results.performance?.average_attempt_duration || 0,
            quality_per_minute: results.performance?.quality_per_minute || 0,
            patterns_per_minute: results.performance?.patterns_per_minute || 0,
          },

          // Test summary
          test_summary: {
            status: results.learning?.target_reached ? 'SUCCESS' : 'PARTIAL_SUCCESS',
            quality_achieved: `${(results.learning?.final_quality * 100 || 0).toFixed(1)}%`,
            attempts_needed: results.learning?.attempts_used || 0,
            learning_efficiency: results.learning?.learning_effectiveness || 0,
            products_extracted: results.products?.length || 0,
          },
        });

      } catch (error) {
        this.logger.error('Universal scraper test failed:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          details: 'Check logs for more information',
          test_failed_at: new Date().toISOString(),
        });
      }
    });

    // Get scraping status
    router.get('/status', (req, res) => {
      res.json({
        available_scrapers: ['glasswing', 'universal'],
        services: {
          glasswing_scraper: !!this.glasswingScraper,
          universal_scraper: !!SelfLearningUniversalScraper,
          world_model_populator: !!this.worldModelPopulator,
          mongodb_connected: !!this.mongoClient,
        },
        timestamp: new Date().toISOString(),
      });
    });
  }

  getRouter() {
    return router;
  }
}

module.exports = ScrapingAPI;
