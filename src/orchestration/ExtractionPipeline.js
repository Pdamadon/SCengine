/**
 * ExtractionPipeline - Orchestrator for product extraction components
 * 
 * ORCHESTRATES (doesn't execute):
 * - UniversalProductExtractor for intelligent product extraction
 * - ProductExtractorPool for parallel product extraction
 * - URLQueue for URL management and deduplication
 * - SelectorValidator for selector validation
 * 
 * This is a thin orchestration layer that coordinates extraction components
 */

const UniversalProductExtractor = require('../extraction/UniversalProductExtractor');
const ProductExtractorPool = require('../intelligence/extraction/ProductExtractorPool');
const URLQueue = require('../intelligence/extraction/URLQueue');
const SelectorValidator = require('../intelligence/SelectorValidator');
const ProductPatternLearner = require('../intelligence/discovery/ProductPatternLearner');
const { chromium } = require('playwright');

class ExtractionPipeline {
  constructor(logger) {
    this.logger = logger;
    
    // Initialize extraction components (orchestration, not execution)
    this.universalExtractor = null; // Will be initialized on demand
    this.extractorPool = null;
    this.urlQueue = null;
    this.selectorValidator = new SelectorValidator(logger);
    this.patternLearner = new ProductPatternLearner(logger);
    
    // Extraction state
    this.browser = null;
    this.extractionResults = [];
  }

  /**
   * Initialize extraction components
   */
  async initialize() {
    // Components will be initialized on demand
    this.logger.info('ExtractionPipeline initialized');
  }

  /**
   * Main extraction orchestration method
   * 
   * @param {string} url - Target URL
   * @param {object} options - Extraction options with learned patterns from LearningEngine
   * @returns {object} Extraction results
   */
  async extract(url, options = {}) {
    const domain = new URL(url).hostname;
    const startTime = Date.now();
    
    this.logger.info('Orchestrating product extraction', {
      url,
      domain,
      maxProducts: options.maxProducts,
      maxWorkers: options.maxWorkers,
      hasLearnedPatterns: !!options.learnedPatterns
    });

    try {
      // Initialize the UniversalProductExtractor with learned patterns
      this.universalExtractor = new UniversalProductExtractor(this.logger);
      await this.universalExtractor.initialize();
      
      // Initialize URL queue for managing discovered URLs
      this.urlQueue = new URLQueue(this.logger);
      await this.urlQueue.initialize(domain);
      
      // Initialize extractor pool for parallel processing
      this.extractorPool = new ProductExtractorPool(this.logger, {
        maxWorkers: options.maxWorkers || 5,
        headless: process.env.HEADLESS_MODE !== 'false'
      });
      await this.extractorPool.initialize(domain);
      
      // Phase 1: Discover product URLs using learned patterns
      const discoveredUrls = await this.discoverProductUrls(
        url,
        options.navigation,
        options.learnedPatterns?.url_patterns,
        options.progressCallback
      );
      
      // Phase 2: Extract product details using UniversalProductExtractor
      const products = await this.extractProducts(
        discoveredUrls,
        options.learnedPatterns,
        options.maxProducts,
        options.progressCallback
      );
      
      // Phase 3: Validate products using intelligence services
      const validatedProducts = await this.validateProducts(products, options.learnedPatterns);
      
      // Compile extraction results
      const extractionResult = {
        products: validatedProducts,
        stats: {
          urlsDiscovered: discoveredUrls.length,
          productsExtracted: products.length,
          productsValidated: validatedProducts.length,
          failedExtractions: this.extractorPool.failedUrls?.length || 0
        },
        failedUrls: this.extractorPool.failedUrls || [],
        duration: Date.now() - startTime
      };
      
      this.logger.info('Extraction completed', {
        productsFound: validatedProducts.length,
        duration: extractionResult.duration
      });
      
      return extractionResult;
      
    } catch (error) {
      this.logger.error('Extraction failed', {
        url,
        error: error.message,
        stack: error.stack
      });
      
      return {
        products: [],
        stats: {
          urlsDiscovered: 0,
          productsExtracted: 0,
          productsValidated: 0,
          failedExtractions: 0
        },
        error: error.message,
        duration: Date.now() - startTime
      };
      
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Initialize browser for extraction
   */
  async initializeBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: process.env.HEADLESS_MODE !== 'false',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
    }
  }

  /**
   * Phase 1: Orchestrate product URL discovery using intelligence services
   */
  async discoverProductUrls(baseUrl, navigation, patterns, progressCallback) {
    this.logger.info('Orchestrating product URL discovery');
    
    const domain = new URL(baseUrl).hostname;
    const discoveredUrls = new Set();
    
    // Select sections to explore from navigation
    const sectionsToExplore = this.selectSectionsForExploration(navigation);
    
    if (progressCallback) {
      progressCallback(10, `Orchestrating exploration of ${sectionsToExplore.length} sections`);
    }
    
    // If we don't have patterns yet, learn them using ProductPatternLearner
    if (!patterns || patterns.length === 0) {
      this.logger.info('No URL patterns provided, using ProductPatternLearner to discover');
      
      // Initialize a browser page for pattern learning
      if (!this.browser) {
        await this.initializeBrowser();
      }
      
      const learningPage = await this.browser.newPage();
      
      try {
        // Navigate to first category page to learn patterns
        if (sectionsToExplore.length > 0) {
          await learningPage.goto(sectionsToExplore[0].url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
          });
          
          // Use ProductPatternLearner to learn what product URLs look like
          patterns = await this.patternLearner.learnProductPatterns(learningPage, domain);
          this.logger.info(`Learned ${patterns ? patterns.length : 0} URL patterns for ${domain}`);
        }
      } finally {
        await learningPage.close();
      }
    }
    
    // Use ConcurrentExplorer or simple parallel exploration to find product URLs
    // For now, using simple parallel approach, but should use ConcurrentExplorer
    const explorationPromises = sectionsToExplore.map(async (section, index) => {
      try {
        const page = await this.browser.newPage();
        await page.goto(section.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Use PatternLearner to find product URLs with learned patterns
        const urls = await this.patternLearner.findProductUrlsWithPatterns(page, patterns);
        
        await page.close();
        
        if (progressCallback) {
          const progress = 10 + ((index + 1) / sectionsToExplore.length * 30);
          progressCallback(progress, `Discovered URLs from ${section.name}`);
        }
        
        return urls;
      } catch (error) {
        this.logger.warn(`Failed to explore section ${section.name}:`, error.message);
        return [];
      }
    });
    
    // Wait for all explorations to complete
    const allUrls = await Promise.all(explorationPromises);
    
    // Combine and deduplicate URLs
    allUrls.flat().forEach(url => discoveredUrls.add(url));
    
    // Add URLs to queue for processing
    const urlArray = Array.from(discoveredUrls);
    await this.urlQueue.addBatch(urlArray);
    
    this.logger.info(`Discovery complete: ${urlArray.length} unique product URLs found`);
    
    return urlArray;
  }

  /**
   * Select sections for exploration based on navigation
   */
  selectSectionsForExploration(navigation) {
    if (!navigation || !navigation.main_sections) {
      return [];
    }
    
    // Prioritize category sections
    const sections = navigation.main_sections
      .filter(section => {
        const text = (section.name || section.text || '').toLowerCase();
        // Skip utility sections
        return !/(account|cart|help|contact|about|sign|login)/i.test(text);
      })
      .slice(0, 10); // Limit to 10 sections
    
    return sections;
  }

  /**
   * Find product URLs on a page using patterns
   */
  async findProductUrlsOnPage(page, patterns) {
    // Use patterns if available
    if (patterns && patterns.length > 0) {
      const topPattern = patterns[0];
      
      return await page.evaluate((pattern) => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        const productUrls = [];
        
        // Create regex from pattern
        const regex = new RegExp(pattern.pattern);
        
        links.forEach(link => {
          const href = link.href;
          if (regex.test(href)) {
            productUrls.push(href);
          }
        });
        
        return productUrls;
      }, topPattern);
    }
    
    // Fallback: use common product URL patterns
    return await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      const productUrls = [];
      
      const productPatterns = [
        /\/product\//i,
        /\/products\//i,
        /\/p\//i,
        /\/pd\//i,
        /\/item\//i,
        /\/shop\/.*\/\d+/i,
        /\?product_id=/i,
        /\?p=\d+/i
      ];
      
      links.forEach(link => {
        const href = link.href;
        if (productPatterns.some(pattern => pattern.test(href))) {
          productUrls.push(href);
        }
      });
      
      return productUrls;
    });
  }

  /**
   * Phase 2: Orchestrate product extraction using UniversalProductExtractor
   */
  async extractProducts(urls, learnedPatterns, maxProducts, progressCallback) {
    this.logger.info(`Orchestrating extraction of ${urls.length} product URLs`);
    
    // Limit URLs if maxProducts specified
    const urlsToProcess = maxProducts ? urls.slice(0, maxProducts) : urls;
    const domain = new URL(urls[0]).hostname;
    
    // Create extraction function that uses UniversalProductExtractor
    const extractionFunction = async (page, url) => {
      try {
        // Use the intelligent UniversalProductExtractor
        const product = await this.universalExtractor.extractProduct(url, domain, {
          platformPatterns: learnedPatterns,
          page: page // Reuse the existing page for efficiency
        });
        
        return product;
      } catch (error) {
        this.logger.warn(`Failed to extract product from ${url}:`, error.message);
        return null;
      }
    };
    
    // Orchestrate parallel extraction using ProductExtractorPool
    const extractionResult = await this.extractorPool.processBatch(
      urlsToProcess,
      extractionFunction,
      (progress, message) => {
        if (progressCallback) {
          const overallProgress = 40 + (progress * 0.4); // 40-80% of total
          progressCallback(overallProgress, message);
        }
      }
    );
    
    // Filter out failed extractions
    const products = extractionResult.products || [];
    const failed = extractionResult.failed || [];
    
    this.logger.info(`Extraction complete`, {
      successful: products.length,
      failed: failed.length,
      total: urlsToProcess.length
    });
    
    return products;
  }


  /**
   * Phase 3: Validate products using intelligence services
   */
  async validateProducts(products, learnedPatterns) {
    this.logger.info(`Validating ${products.length} products using intelligence services`);
    
    const validatedProducts = [];
    
    for (const product of products) {
      if (!product) continue;
      
      // Basic validation
      if (product.title && (product.price || product.description)) {
        // Clean and enhance product data
        const enhanced = {
          ...product,
          title: this.cleanText(product.title),
          price: this.cleanPrice(product.price),
          description: this.cleanText(product.description),
          images: product.images?.filter(img => img) || [],
          extracted_at: new Date().toISOString()
        };
        
        validatedProducts.push(enhanced);
      }
    }
    
    this.logger.info(`Validated ${validatedProducts.length} products`);
    
    return validatedProducts;
  }

  /**
   * Clean text content
   */
  cleanText(text) {
    if (!text) return '';
    return text
      .replace(/\s+/g, ' ')
      .replace(/[\n\r\t]/g, ' ')
      .trim();
  }

  /**
   * Clean price text
   */
  cleanPrice(price) {
    if (!price) return null;
    // Extract numeric price
    const match = price.match(/[\d,]+\.?\d*/);
    return match ? match[0] : price;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.extractorPool) {
      await this.extractorPool.shutdown();
    }
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    
    this.logger.info('ExtractionPipeline cleaned up');
  }
}

module.exports = ExtractionPipeline;