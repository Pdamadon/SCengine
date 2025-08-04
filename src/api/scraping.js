// API routes for scraping functionality
const express = require('express');
const router = express.Router();
const ScrapingEngine = require('../scraping/ScrapingEngine');
const ShopifyScraper = require('../scraping/ShopifyScraper');
const ReasoningEngine = require('../reasoning/ReasoningEngine');
const PatternRecognition = require('../patterns/PatternRecognition');
const TrainingDataGenerator = require('../training/TrainingDataGenerator');

class ScrapingAPI {
  constructor(logger) {
    this.logger = logger;
    this.scrapingEngine = new ScrapingEngine(logger);
    this.shopifyScraper = new ShopifyScraper(logger);
    this.reasoningEngine = new ReasoningEngine(logger);
    this.patternRecognition = new PatternRecognition(logger);
    this.trainingDataGenerator = new TrainingDataGenerator(logger);
    
    this.scrapingInitialized = false;
    this.setupRoutes();
  }

  setupRoutes() {
    // Simple test scraping endpoint
    router.post('/test-scrape', async (req, res) => {
      try {
        const { url } = req.body;
        if (!url) {
          return res.status(400).json({ error: 'URL is required' });
        }

        this.logger.info(`Testing basic scrape for: ${url}`);
        
        // Initialize scraping if needed
        if (!this.scrapingInitialized) {
          this.logger.info('Initializing scraping services...');
          this.scrapingInitialized = await this.initializeScrapingServices();
          if (!this.scrapingInitialized) {
            return res.status(503).json({ 
              error: 'Scraping services not available',
              suggestion: 'Try again in a few moments'
            });
          }
        }

        // Perform basic scraping test
        const result = await this.scrapingEngine.performBasicScrape(url);
        
        res.json({
          success: true,
          url: url,
          scraped_at: new Date().toISOString(),
          data: result
        });

      } catch (error) {
        this.logger.error('Test scraping failed:', error);
        res.status(500).json({ 
          error: error.message,
          details: 'Check logs for more information'
        });
      }
    });

    // Full scraping with training data generation
    router.post('/scrape', async (req, res) => {
      try {
        const { url, userIntent } = req.body;
        if (!url || !userIntent) {
          return res.status(400).json({ 
            error: 'URL and userIntent are required',
            example: { url: 'https://example-shop.com', userIntent: 'find black boots under $200' }
          });
        }

        this.logger.info(`Starting full scrape for ${url} with intent: ${userIntent}`);
        
        // Initialize scraping services if not already done
        if (!this.scrapingInitialized) {
          this.logger.info('Initializing scraping services on-demand...');
          this.scrapingInitialized = await this.initializeScrapingServices();
          if (!this.scrapingInitialized) {
            return res.status(503).json({ 
              error: 'Scraping services failed to initialize',
              details: 'Playwright browsers may not be available'
            });
          }
        }
        
        const result = await this.generateTrainingScenario(url, userIntent);
        res.json(result);
        
      } catch (error) {
        this.logger.error('Full scraping failed:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get scraping status
    router.get('/status', (req, res) => {
      res.json({
        scraping_initialized: this.scrapingInitialized,
        services: {
          scraping_engine: !!this.scrapingEngine,
          shopify_scraper: !!this.shopifyScraper,
          reasoning_engine: !!this.reasoningEngine,
          pattern_recognition: !!this.patternRecognition,
          training_generator: !!this.trainingDataGenerator
        },
        timestamp: new Date().toISOString()
      });
    });
  }

  async initializeScrapingServices() {
    try {
      this.logger.info('Initializing scraping engine...');
      await this.scrapingEngine.initialize();
      
      this.logger.info('Loading patterns...');
      await this.patternRecognition.loadPatterns();
      
      this.logger.info('Scraping services initialized successfully');
      return true;
    } catch (error) {
      this.logger.error('Scraping service initialization failed:', error);
      return false;
    }
  }

  async generateTrainingScenario(url, userIntent) {
    this.logger.info('Using universal scraper for all sites');
    
    // Use universal scraper for all sites
    const siteStructure = await this.scrapingEngine.analyzeSite(url);
    const patterns = await this.patternRecognition.identifyPatterns(siteStructure);
    const reasoning = await this.reasoningEngine.generateReasoning(userIntent, patterns);
    const trainingData = await this.trainingDataGenerator.createScenario(
      url, 
      userIntent, 
      siteStructure, 
      reasoning
    );
    
    return trainingData;
  }

  async isShopifyStore(url) {
    try {
      // Quick check for Shopify indicators without full scrape
      const siteStructure = await this.scrapingEngine.analyzeSite(url);
      return siteStructure.metadata?.platform === 'shopify';
    } catch (error) {
      return false;
    }
  }

  async convertShopifySessionToTraining(session, userIntent) {
    const { v4: uuidv4 } = require('uuid');
    
    return {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      site: {
        url: session.url,
        domain: new URL(session.url).hostname,
        platform: 'shopify'
      },
      user_intent: {
        raw: userIntent,
        analysis: {
          primary_intent: 'search',
          extracted_attributes: this.extractAttributesFromIntent(userIntent),
          shopping_goals: ['find_specific_product']
        }
      },
      shopping_flow: session.storySteps?.map((step, index) => ({
        step_id: uuidv4(),
        step_number: step.stepNumber,
        action: this.mapStepToAction(step),
        human_reasoning: step.human,
        ai_learning_objective: this.generateLearningObjective(step),
        technical_implementation: {
          method: this.extractMethod(step.technical),
          selector: this.extractSelector(step),
          interaction_type: this.classifyInteraction(step)
        },
        validation: {
          success_criteria: this.generateSuccessCriteria(step),
          timeout_ms: 5000
        }
      })) || [],
      site_context: {
        ecommerce_maturity: 'mature',
        navigation_complexity: 'moderate',
        product_catalog_size: session.products?.length || 0,
        technical_features: {
          platform: 'shopify',
          has_variants: session.discoveries?.selectedProduct?.variants?.length > 0
        }
      },
      training_metadata: {
        complexity_score: session.storySteps?.length || 1,
        success_probability: 0.9,
        estimated_time: {
          estimated_seconds: (session.storySteps?.length || 1) * 3
        },
        learning_objectives: ['shopify_navigation', 'product_extraction', 'human_reasoning']
      }
    };
  }

  extractAttributesFromIntent(intent) {
    const attributes = {};
    
    const colorMatch = intent.match(/\b(black|white|red|blue|green|brown|gray|pink)\b/i);
    if (colorMatch) attributes.color = colorMatch[1].toLowerCase();
    
    const itemMatch = intent.match(/\b(shoes|boots|shirt|pants|dress|jacket|bag|jewelry)\b/i);
    if (itemMatch) attributes.item_type = itemMatch[1].toLowerCase();
    
    const priceMatch = intent.match(/under\s*\$?(\d+)/i);
    if (priceMatch) attributes.budget_max = parseInt(priceMatch[1]);
    
    return attributes;
  }

  mapStepToAction(step) {
    if (step.human?.includes('visiting') || step.human?.includes('navigate')) return 'navigate_to_site';
    if (step.human?.includes('category') || step.human?.includes('section')) return 'navigate_to_category';
    if (step.human?.includes('click') || step.human?.includes('examine')) return 'select_product';
    if (step.human?.includes('details') || step.human?.includes('price')) return 'analyze_product';
    return 'browse_products';
  }

  generateLearningObjective(step) {
    if (step.human?.includes('navigate')) return 'Site navigation and orientation';
    if (step.human?.includes('category')) return 'Category-based product discovery';
    if (step.human?.includes('product')) return 'Product evaluation and selection';
    return 'Shopping behavior understanding';
  }

  extractMethod(technical) {
    if (technical?.includes('Navigate')) return 'navigation';
    if (technical?.includes('Extract')) return 'extraction';
    if (technical?.includes('Click')) return 'click';
    return 'analysis';
  }

  extractSelector(step) {
    // Extract any CSS selectors from discoveries or technical description
    if (step.discoveries && typeof step.discoveries === 'object') {
      const discoveryText = JSON.stringify(step.discoveries);
      const selectorMatch = discoveryText.match(/[.#][\w-]+/);
      if (selectorMatch) return selectorMatch[0];
    }
    return 'auto-detected';
  }

  classifyInteraction(step) {
    if (step.human?.includes('navigate')) return 'navigation';
    if (step.human?.includes('click')) return 'selection';
    if (step.human?.includes('examine')) return 'analysis';
    return 'general';
  }

  generateSuccessCriteria(step) {
    if (step.human?.includes('navigate')) return 'Page loaded successfully';
    if (step.human?.includes('products')) return 'Products found and displayed';
    if (step.human?.includes('details')) return 'Product details extracted';
    return 'Step completed successfully';
  }

  getRouter() {
    return router;
  }
}

module.exports = ScrapingAPI;