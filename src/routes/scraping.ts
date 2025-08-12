/**
 * Simplified API for focused scraping and world model population
 */

import express, { Request, Response, Router } from 'express';
import { MongoClient } from 'mongodb';

// Legacy imports (will be converted later)
const GlasswingScraper = require('../scrapers/GlasswingScraper');
const WorldModelPopulator = require('../services/WorldModelPopulator');

const router: Router = express.Router();

interface ScrapingRequestBody {
  maxProducts?: number;
  collection?: string;
  site?: string;
}

interface ScrapingResponse {
  success: boolean;
  scraped_at: string;
  results?: any;
  scraping_summary?: any;
  world_model_populated?: boolean;
  population_result?: any;
  error?: string;
  details?: string;
  availableSites?: string[];
}

interface StatusResponse {
  available_scrapers: string[];
  services: {
    glasswing_scraper: boolean;
    world_model_populator: boolean;
    mongodb_connected: boolean;
  };
  timestamp: string;
}

class ScrapingAPI {
  private logger: any;
  private mongoClient: MongoClient | null;
  private glasswingScraper: any;
  private worldModelPopulator: any;

  constructor(logger: any, mongoClient: MongoClient | null = null) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.glasswingScraper = new GlasswingScraper(logger);
    this.worldModelPopulator = new WorldModelPopulator(logger, mongoClient);

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Glasswing focused scraping endpoint
    router.post('/scrape-glasswing', async (req: Request<{}, ScrapingResponse, ScrapingRequestBody>, res: Response<ScrapingResponse>) => {
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('Glasswing scraping failed:', error);
        res.status(500).json({
          success: false,
          scraped_at: new Date().toISOString(),
          error: errorMessage,
          details: 'Check logs for more information',
        });
      }
    });

    // Scrape and populate world model
    router.post('/scrape-and-populate', async (req: Request<{}, ScrapingResponse, ScrapingRequestBody>, res: Response<ScrapingResponse>) => {
      try {
        const { site = 'glasswing', maxProducts = 10, collection = '/collections/clothing-collection' } = req.body;

        if (site !== 'glasswing') {
          res.status(400).json({
            success: false,
            scraped_at: new Date().toISOString(),
            error: 'Only Glasswing scraping is currently supported',
            availableSites: ['glasswing'],
          });
          return;
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('Scrape and populate failed:', error);
        res.status(500).json({ 
          success: false,
          scraped_at: new Date().toISOString(),
          error: errorMessage 
        });
      }
    });

    // Get scraping status
    router.get('/status', (req: Request, res: Response<StatusResponse>) => {
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
  }

  getRouter(): Router {
    return router;
  }
}

export default ScrapingAPI;