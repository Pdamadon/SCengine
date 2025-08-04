const express = require('express');
const dotenv = require('dotenv');
const winston = require('winston');
const ScrapingEngine = require('./scraping/ScrapingEngine');
const ShopifyScraper = require('./scraping/ShopifyScraper');
const ReasoningEngine = require('./reasoning/ReasoningEngine');
const PatternRecognition = require('./patterns/PatternRecognition');
const TrainingDataGenerator = require('./training/TrainingDataGenerator');

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
    
    this.scrapingEngine = new ScrapingEngine(logger);
    this.shopifyScraper = new ShopifyScraper(logger);
    this.reasoningEngine = new ReasoningEngine(logger);
    this.patternRecognition = new PatternRecognition(logger);
    this.trainingDataGenerator = new TrainingDataGenerator(logger);
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  setupRoutes() {
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    this.app.post('/api/scrape', async (req, res) => {
      try {
        const { url, userIntent } = req.body;
        logger.info(`Starting scrape for ${url} with intent: ${userIntent}`);
        
        const result = await this.generateTrainingScenario(url, userIntent);
        res.json(result);
      } catch (error) {
        logger.error('Scraping failed:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/stats', async (req, res) => {
      const stats = await this.getSystemStats();
      res.json(stats);
    });
  }

  async generateTrainingScenario(url, userIntent) {
    // Check if this is a Shopify site for specialized handling
    if (url.includes('shopify') || url.includes('myshopify') || await this.isShopifyStore(url)) {
      logger.info('Detected Shopify store, using specialized scraper');
      const shoppingSession = await this.shopifyScraper.scrapeShopifyStore(url, userIntent);
      
      // Convert Shopify session to our training format
      const trainingData = await this.convertShopifySessionToTraining(shoppingSession, userIntent);
      return trainingData;
    }
    
    // Use general scraper for non-Shopify sites
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
      shopping_flow: session.storySteps.map((step, index) => ({
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
      })),
      site_context: {
        ecommerce_maturity: 'mature',
        navigation_complexity: 'moderate',
        product_catalog_size: session.products?.length || 0,
        technical_features: {
          platform: 'shopify',
          has_variants: session.discoveries.selectedProduct?.variants?.length > 0
        }
      },
      training_metadata: {
        complexity_score: session.storySteps.length,
        success_probability: 0.9,
        estimated_time: {
          estimated_seconds: session.storySteps.length * 3
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
    if (step.human.includes('visiting') || step.human.includes('navigate')) return 'navigate_to_site';
    if (step.human.includes('category') || step.human.includes('section')) return 'navigate_to_category';
    if (step.human.includes('click') || step.human.includes('examine')) return 'select_product';
    if (step.human.includes('details') || step.human.includes('price')) return 'analyze_product';
    return 'browse_products';
  }

  generateLearningObjective(step) {
    if (step.human.includes('navigate')) return 'Site navigation and orientation';
    if (step.human.includes('category')) return 'Category-based product discovery';
    if (step.human.includes('product')) return 'Product evaluation and selection';
    return 'Shopping behavior understanding';
  }

  extractMethod(technical) {
    if (technical.includes('Navigate')) return 'navigation';
    if (technical.includes('Extract')) return 'extraction';
    if (technical.includes('Click')) return 'click';
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
    if (step.human.includes('navigate')) return 'navigation';
    if (step.human.includes('click')) return 'selection';
    if (step.human.includes('examine')) return 'analysis';
    return 'general';
  }

  generateSuccessCriteria(step) {
    if (step.human.includes('navigate')) return 'Page loaded successfully';
    if (step.human.includes('products')) return 'Products found and displayed';
    if (step.human.includes('details')) return 'Product details extracted';
    return 'Step completed successfully';
  }

  async getSystemStats() {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      scenariosGenerated: await this.trainingDataGenerator.getScenarioCount(),
      sitesSupported: await this.patternRecognition.getSupportedSitesCount()
    };
  }

  async start() {
    try {
      await this.scrapingEngine.initialize();
      await this.patternRecognition.loadPatterns();
      
      this.app.listen(this.port, () => {
        logger.info(`AI Shopping Scraper started on port ${this.port}`);
        logger.info(`Target: ${process.env.SCENARIOS_PER_DAY_TARGET} scenarios per day`);
      });
    } catch (error) {
      logger.error('Failed to start application:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    logger.info('Shutting down AI Shopping Scraper...');
    await this.scrapingEngine.close();
    await this.shopifyScraper.close();
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